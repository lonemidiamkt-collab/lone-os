export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole, type Papel } from "@/lib/api/require-role";
import { supabaseAdmin } from "@/lib/supabase/server";
import { faltaNoBanco } from "@/lib/trafego/anuncios-server";
import { compararEstados, orcamentoDiarioAtivo, type ClienteMudancas, type EstadoEntidade, type RespostaMudancas } from "@/lib/trafego/mudancas";

// GET /api/trafego/mudancas[?ate=AAAA-MM-DD] — Leva 7A (N2) "O que mudou". Compara o retrato diário
// `ate` (padrão: o mais recente) com o retrato anterior a ele. Com o retrato de hoje (00h10), responde
// "o que mexeram ontem". Só leitura — nenhuma chamada à Meta daqui (o job estado-campanhas lê).

const TRAFEGO: Papel[] = ["admin", "manager", "traffic"];
const COLS = "client_id, nivel, entity_id, entity_name, campaign_id, campaign_name, status, effective_status, daily_budget, lifetime_budget, updated_time";

async function diaDisponivel(filtro: { ate?: string; antesDe?: string }): Promise<string | null> {
  let q = supabaseAdmin.from("meta_campaign_estado").select("dia").order("dia", { ascending: false }).limit(1);
  if (filtro.ate) q = q.lte("dia", filtro.ate);
  if (filtro.antesDe) q = q.lt("dia", filtro.antesDe);
  const { data, error } = await q;
  if (error) throw error;
  return (data?.[0]?.dia as string | undefined) ?? null;
}

/** O retrato inteiro de um dia (paginado: a API devolve no máximo 1000 linhas por leitura). */
async function retrato(dia: string): Promise<EstadoEntidade[]> {
  const out: EstadoEntidade[] = [];
  for (let de = 0; de < 50_000; de += 1000) {
    const { data, error } = await supabaseAdmin.from("meta_campaign_estado").select(COLS)
      .eq("dia", dia).order("entity_id").range(de, de + 999);
    if (error) throw error;
    out.push(...((data ?? []) as unknown as EstadoEntidade[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export async function GET(req: NextRequest) {
  const gate = await requireRole(req, TRAFEGO);
  if (gate instanceof NextResponse) return gate;
  const ate = req.nextUrl.searchParams.get("ate") || undefined;
  if (ate && !/^\d{4}-\d{2}-\d{2}$/.test(ate)) return NextResponse.json({ error: "data inválida" }, { status: 400 });

  try {
    const depois = await diaDisponivel({ ate });
    if (!depois) return NextResponse.json({ disponivel: true, depois: null, antes: null, clientes: [], semMudanca: 0 } satisfies RespostaMudancas);
    const antes = await diaDisponivel({ antesDe: depois });
    if (!antes) return NextResponse.json({ disponivel: true, depois, antes: null, clientes: [], semMudanca: 0 } satisfies RespostaMudancas);

    const [rDepois, rAntes, { data: clientes }] = await Promise.all([
      retrato(depois), retrato(antes),
      supabaseAdmin.from("clients").select("id, name, nome_fantasia, assigned_traffic"),
    ]);
    const nomes = new Map((clientes ?? []).map((c) => [c.id as string, c]));
    const porCliente = (lista: EstadoEntidade[]) => {
      const m = new Map<string, EstadoEntidade[]>();
      for (const e of lista) { const l = m.get(e.client_id) ?? []; l.push(e); m.set(e.client_id, l); }
      return m;
    };
    const mA = porCliente(rAntes), mD = porCliente(rDepois);
    const out: ClienteMudancas[] = [];
    let semMudanca = 0;
    for (const [clientId, estadoDepois] of mD) {
      const estadoAntes = mA.get(clientId);
      if (!estadoAntes) continue; // sem retrato anterior deste cliente: não dá pra comparar
      const mudancas = compararEstados(estadoAntes, estadoDepois, antes);
      if (!mudancas.length) { semMudanca++; continue; }
      const c = nomes.get(clientId);
      out.push({
        clientId,
        nome: ((c?.nome_fantasia as string) || (c?.name as string) || "(sem nome)"),
        gestor: (c?.assigned_traffic as string) ?? null,
        mudancas,
        orcamentoAntes: orcamentoDiarioAtivo(estadoAntes),
        orcamentoDepois: orcamentoDiarioAtivo(estadoDepois),
      });
    }
    out.sort((a, b) => (b.mudancas[0]?.peso ?? 0) - (a.mudancas[0]?.peso ?? 0) || a.nome.localeCompare(b.nome));
    return NextResponse.json({ disponivel: true, depois, antes, clientes: out, semMudanca } satisfies RespostaMudancas);
  } catch (e) {
    const err = e as { code?: string; message?: string };
    if (faltaNoBanco(err)) {
      return NextResponse.json({ disponivel: false, depois: null, antes: null, clientes: [], semMudanca: 0 } satisfies RespostaMudancas);
    }
    console.error("[trafego/mudancas]", err?.message ?? e);
    return NextResponse.json({ error: "Não consegui comparar os retratos agora." }, { status: 500 });
  }
}
