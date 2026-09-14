export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { requireCronOrUser } from "@/lib/api/cron-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import { comExecucao, anotar } from "@/lib/obs/correlacao";
import { temTrafego } from "@/lib/clients/servico";
import { avaliarCriativo, baselineDaConta, type DiaCriativo } from "@/lib/traffic/creative-health";

// POST /api/system/creative-health — avalia a saúde de cada criativo que gastou nos últimos 21
// dias e grava creative_health (uma linha por anúncio por dia). SHADOW: não gera recomendação,
// não avisa ninguém. Cron diário depois do meta-granular. ?dia=YYYY-MM-DD reavalia um dia
// (útil para preencher o histórico); ?clientId= um só.

export async function POST(req: NextRequest) {
  const gate = await requireCronOrUser(req);
  if (gate) return gate;
  return comExecucao({ origem: "cron:creative-health", ator: "cron" }, async () => {
    const hoje = req.nextUrl.searchParams.get("dia") || new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    const soCliente = req.nextUrl.searchParams.get("clientId") || "";
    const desde = new Date(Date.parse(`${hoje}T12:00:00Z`) - 21 * 864e5).toISOString().slice(0, 10);

    let qc = supabaseAdmin.from("clients").select("id, name, nome_fantasia, meta_ad_account_id, service_type")
      .not("meta_ad_account_id", "is", null).neq("meta_ad_account_id", "").or("active.is.null,active.eq.true").is("churned_at", null);
    if (soCliente) qc = qc.eq("id", soCliente);
    const { data: clientes, error: ec } = await qc;
    if (ec) return NextResponse.json({ ok: false, erro: ec.message }, { status: 500 });

    const { data: politicas } = await supabaseAdmin.from("client_traffic_policy").select("client_id, cpl_alerta, cpl_critico, conversas_minimas");
    const politica = new Map((politicas ?? []).map((p) => [p.client_id as string, { cplAlerta: p.cpl_alerta as number | null, cplCritico: p.cpl_critico as number | null, convMin: p.conversas_minimas as number | null }]));

    const porEstado: Record<string, number> = {};
    let anuncios = 0, vencedores = 0, contas = 0;
    const erros: string[] = [];

    for (const c of clientes ?? []) {
      if (!temTrafego({ service_type: c.service_type as string | null })) continue;
      const { data: linhas, error } = await supabaseAdmin.from("meta_entity_snapshots")
        .select("entity_id, entity_name, metric_date, spend, impressions, clicks, conversions")
        .eq("client_id", c.id).eq("nivel", "ad").gte("metric_date", desde).lte("metric_date", hoje);
      if (error) { erros.push(`${c.name}: ${error.message.slice(0, 60)}`); continue; }
      if (!linhas?.length) continue;
      contas++;

      const porAd = new Map<string, { nome: string | null; serie: DiaCriativo[] }>();
      for (const l of linhas) {
        const adId = String(l.entity_id).split("_")[0];
        const g = porAd.get(adId) ?? { nome: (l.entity_name as string) ?? null, serie: [] };
        g.serie.push({ data: l.metric_date as string, spend: Number(l.spend ?? 0), impressions: Number(l.impressions ?? 0), clicks: Number(l.clicks ?? 0), conversions: Number(l.conversions ?? 0) });
        porAd.set(adId, g);
      }
      const baseline = baselineDaConta([...porAd.values()], hoje);
      // Frequência real dos últimos 7 dias (meta_ad_period), quando o sync já trouxe.
      const { data: per } = await supabaseAdmin.from("meta_ad_period").select("ad_id, frequency, ate")
        .eq("client_id", c.id).eq("dias", 7).lte("ate", hoje).gte("ate", new Date(Date.parse(`${hoje}T12:00:00Z`) - 3 * 864e5).toISOString().slice(0, 10))
        .order("ate", { ascending: false });
      const freq = new Map<string, number>();
      for (const p of per ?? []) if (!freq.has(p.ad_id as string) && p.frequency != null) freq.set(p.ad_id as string, Number(p.frequency));
      const registros = [];
      for (const [adId, g] of porAd) {
        if (!g.serie.some((d) => d.spend > 0 && d.data >= new Date(Date.parse(`${hoje}T12:00:00Z`) - 7 * 864e5).toISOString().slice(0, 10))) continue; // sem gasto na semana: fora
        const r = avaliarCriativo({ adId, nome: g.nome, serie: g.serie, hoje, baseline, politica: politica.get(c.id as string) ?? null, freq7d: freq.get(adId) ?? null });
        registros.push({
          ad_id: adId, data: hoje, client_id: c.id, meta_ad_account_id: c.meta_ad_account_id, ad_name: g.nome,
          estado: r.estado, severidade: r.severidade, confianca: r.confianca, sinais: r.sinais, evidencias: r.evidencias,
          amostra: r.amostra, baseline, vencedor: r.vencedor.sim, vencedor_evidencias: r.vencedor.sim ? r.vencedor.evidencias : null,
        });
        porEstado[r.estado] = (porEstado[r.estado] ?? 0) + 1;
        if (r.vencedor.sim) vencedores++;
      }
      if (registros.length) {
        const { error: e } = await supabaseAdmin.from("creative_health").upsert(registros, { onConflict: "ad_id,data" });
        if (e) erros.push(`${c.name} gravar: ${e.message.slice(0, 60)}`);
        else anuncios += registros.length;
      }
    }
    anotar(`creative-health ${hoje}: ${anuncios} anúncios em ${contas} contas, ${vencedores} vencedores`);
    return NextResponse.json({ ok: erros.length === 0, dia: hoje, contas, anuncios, vencedores, porEstado, erros: erros.slice(0, 8) });
  });
}

export const GET = POST;
