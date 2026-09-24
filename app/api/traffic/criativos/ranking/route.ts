export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole, type Papel } from "@/lib/api/require-role";
import { supabaseAdmin } from "@/lib/supabase/server";
import { hojeSP } from "@/lib/clients/pausa";
import { normalizarNicho, ROTULO_NICHO } from "@/lib/cs/nicho";
import { faltaNoBanco } from "@/lib/trafego/anuncios-server";
import { agregarPorAnuncio, ranquear, adIdDe, type CriativoRank, type ItemRanking, type LinhaAnuncioDia, type RespostaRanking } from "@/lib/traffic/ranking-criativos";

// GET /api/traffic/criativos/ranking?dias=7&clientId=&nicho= — Leva 7A (N5). Ranking de criativos
// (miniatura, custo por resultado, frequência de 7 dias, dias no ar) por cliente ou por nicho.
// Só lê o que o meta-granular já gravou — nenhuma chamada à Meta.

const PAPEIS: Papel[] = ["admin", "manager", "traffic"];

const somarDias = (ymd: string, n: number) => {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export async function GET(req: NextRequest) {
  const gate = await requireRole(req, PAPEIS);
  if (gate instanceof NextResponse) return gate;
  const sp = req.nextUrl.searchParams;
  const dias = [7, 14, 30].includes(Number(sp.get("dias"))) ? Number(sp.get("dias")) : 7;
  const soCliente = sp.get("clientId") || "";
  const soNicho = sp.get("nicho") || "";

  const ate = somarDias(hojeSP(), -1); // dias fechados
  const desde = somarDias(ate, -(dias - 1));

  const { data: clientes, error: eCli } = await supabaseAdmin.from("clients").select("id, name, nome_fantasia, nicho, active, churned_at, meta_ad_account_id");
  if (eCli) return NextResponse.json({ error: eCli.message }, { status: 500 });
  const infoCli = new Map((clientes ?? []).map((c) => {
    const n = normalizarNicho(c.nicho as string | null);
    return [c.id as string, {
      nome: ((c.nome_fantasia as string) || (c.name as string) || "(sem nome)"), nicho: n && n !== "outro" ? n : null,
      ativo: c.active !== false && !c.churned_at, temConta: !!c.meta_ad_account_id,
    }];
  }));
  const idsNoFiltro = soCliente ? [soCliente]
    : soNicho ? [...infoCli.entries()].filter(([, v]) => v.nicho === soNicho).map(([id]) => id)
    : null;
  if (idsNoFiltro && !idsNoFiltro.length) {
    return NextResponse.json({ dias, desde, ate, ranqueados: [], semResultado: [], poucoGasto: 0, medianaCusto: null, clientes: [], nichos: [] } satisfies RespostaRanking);
  }

  // Anúncios que gastaram na janela (paginado; result_kind só existe depois da migração da leva).
  const ler = async (cols: string) => {
    const out: LinhaAnuncioDia[] = [];
    for (let de = 0; de < 60_000; de += 1000) {
      let q = supabaseAdmin.from("meta_entity_snapshots").select(cols)
        .eq("nivel", "ad").gte("metric_date", desde).lte("metric_date", ate).gt("spend", 0);
      if (idsNoFiltro) q = q.in("client_id", idsNoFiltro);
      const { data, error } = await q.order("metric_date").range(de, de + 999);
      if (error) return { out, error };
      out.push(...((data ?? []) as unknown as LinhaAnuncioDia[]));
      if (!data || data.length < 1000) break;
    }
    return { out, error: null };
  };
  let lidas = await ler("client_id, entity_id, entity_name, campaign_name, metric_date, spend, impressions, clicks, conversions, result_kind");
  if (lidas.error && faltaNoBanco(lidas.error)) lidas = await ler("client_id, entity_id, entity_name, campaign_name, metric_date, spend, impressions, clicks, conversions");
  if (lidas.error) return NextResponse.json({ error: lidas.error.message }, { status: 500 });

  const agregados = [...agregarPorAnuncio(lidas.out).values()];
  const adIds = agregados.map((a) => a.adId);

  // Frequência real de 7 dias (a leitura mais recente de cada anúncio) e "dias no ar" do motor de
  // saúde (olha 21 dias). Miniatura: a captura mais recente.
  // Lotes de 50 anúncios e só linhas recentes: cada leitura volta no máximo 1000 linhas.
  const lote = <T,>(ids: string[], f: (parte: string[]) => PromiseLike<{ data: T[] | null }>) =>
    Promise.all(Array.from({ length: Math.ceil(ids.length / 50) }, (_, i) => f(ids.slice(i * 50, i * 50 + 50))))
      .then((rs) => rs.flatMap((r) => r.data ?? []));
  const recente = somarDias(ate, -6);
  const [periodos, saude, criativos] = adIds.length ? await Promise.all([
    lote<{ ad_id: string; frequency: number | null; ate: string }>(adIds, (p) =>
      supabaseAdmin.from("meta_ad_period").select("ad_id, frequency, ate").in("ad_id", p).eq("dias", 7).gte("ate", recente).order("ate", { ascending: false })),
    lote<{ ad_id: string; amostra: { diasRodando?: number } | null; data: string }>(adIds, (p) =>
      supabaseAdmin.from("creative_health").select("ad_id, amostra, data").in("ad_id", p).gte("data", recente).order("data", { ascending: false })),
    lote<{ ad_id: string; thumb_url: string | null; image_url: string | null; tipo: string | null; effective_status: string | null; capturado_em: string }>(adIds, (p) =>
      supabaseAdmin.from("creative_snapshots").select("ad_id, thumb_url, image_url, tipo, effective_status, capturado_em").in("ad_id", p).order("capturado_em", { ascending: false })),
  ]) : [[], [], []];

  const frequencia = new Map<string, number>();
  for (const p of periodos) if (!frequencia.has(p.ad_id) && p.frequency != null) frequencia.set(p.ad_id, Number(p.frequency));
  const diasNoAr = new Map<string, number>();
  for (const s of saude) if (!diasNoAr.has(s.ad_id) && s.amostra?.diasRodando) diasNoAr.set(s.ad_id, Number(s.amostra.diasRodando));
  const criativo = new Map<string, (typeof criativos)[number]>();
  for (const c of criativos) if (!criativo.has(c.ad_id)) criativo.set(c.ad_id, c);

  const r = ranquear(agregados, { frequencia, diasNoAr, hoje: hojeSP() }, { gastoMinimo: dias >= 14 ? 50 : 30 });
  const completar = (c: CriativoRank): ItemRanking => {
    const info = c.clientId ? infoCli.get(c.clientId) : undefined;
    const cri = criativo.get(adIdDe(c.adId));
    return {
      ...c, cliente: info?.nome ?? "—", nicho: info?.nicho ? ROTULO_NICHO[info.nicho] : null,
      thumb: cri?.thumb_url ?? cri?.image_url ?? null, tipo: cri?.tipo ?? null, status: cri?.effective_status ?? null,
    };
  };

  const listaClientes = [...infoCli.entries()]
    .filter(([, v]) => v.ativo && v.temConta)
    .map(([id, v]) => ({ id, nome: v.nome, nicho: v.nicho ? ROTULO_NICHO[v.nicho] : null }))
    .sort((a, b) => a.nome.localeCompare(b.nome));
  const nichos = [...new Set([...infoCli.values()].filter((v) => v.ativo && v.nicho).map((v) => v.nicho!))]
    .map((n) => ({ chave: n, rotulo: ROTULO_NICHO[n] }))
    .sort((a, b) => a.rotulo.localeCompare(b.rotulo));

  return NextResponse.json({
    dias, desde, ate,
    ranqueados: r.ranqueados.slice(0, 60).map(completar),
    semResultado: r.semResultado.slice(0, 12).map(completar),
    poucoGasto: r.poucoGasto,
    medianaCusto: r.medianaCusto,
    clientes: listaClientes,
    nichos,
  } satisfies RespostaRanking);
}
