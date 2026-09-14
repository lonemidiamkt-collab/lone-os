export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import { requireCronOrUser } from "@/lib/api/cron-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import { comExecucao, anotar } from "@/lib/obs/correlacao";
import { medirFilhoContraPai, type JanelaMedida } from "@/lib/traffic/medir";

// POST /api/system/creative-medir — para cada variação NO AR (child_ad_id) ainda sem veredito
// definitivo: compara o filho com o pai na MESMA janela de calendário (desde o primeiro dia de
// gasto do filho, até 14 dias). Validada/refutada viram creative_learnings (memória do cliente);
// inconclusiva fica registrada e segue medindo no dia seguinte. Cron diário 07:45.
export async function POST(req: NextRequest) {
  const gate = await requireCronOrUser(req);
  if (gate) return gate;
  return comExecucao({ origem: "cron:creative-medir", ator: "cron" }, async () => {
    const { data: lins, error } = await supabaseAdmin.from("creative_lineage")
      .select("id, client_id, parent_ad_id, child_ad_id, variavel, hipotese, resultado")
      .not("child_ad_id", "is", null);
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
    const pendentes = (lins ?? []).filter((l) => !(l.resultado as { veredito?: string } | null)?.veredito || (l.resultado as { veredito?: string }).veredito === "inconclusiva");
    if (!pendentes.length) return NextResponse.json({ ok: true, medidos: 0 });
    const { data: pols } = await supabaseAdmin.from("client_traffic_policy").select("client_id, cpl_alerta, conversas_minimas");
    const pol = new Map((pols ?? []).map((p) => [p.client_id as string, p]));
    const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    const soma = (rows: { spend: unknown; conversions: unknown; impressions: unknown; clicks: unknown }[]): JanelaMedida =>
      rows.reduce<JanelaMedida>((a, r) => ({ spend: a.spend + Number(r.spend ?? 0), conversions: a.conversions + Number(r.conversions ?? 0), impressions: a.impressions + Number(r.impressions ?? 0), clicks: a.clicks + Number(r.clicks ?? 0) }), { spend: 0, conversions: 0, impressions: 0, clicks: 0 });

    let medidos = 0, vereditos = 0; const erros: string[] = [];
    for (const l of pendentes) {
      const { data: filhoRows } = await supabaseAdmin.from("meta_entity_snapshots").select("metric_date, spend, conversions, impressions, clicks")
        .eq("nivel", "ad").like("entity_id", `${l.child_ad_id}_%`).gt("spend", 0).order("metric_date", { ascending: true });
      if (!filhoRows?.length) continue;
      const inicio = filhoRows[0].metric_date as string;
      const fim = new Date(Math.min(Date.parse(`${hoje}T12:00:00Z`), Date.parse(`${inicio}T12:00:00Z`) + 13 * 864e5)).toISOString().slice(0, 10);
      const { data: paiRows } = await supabaseAdmin.from("meta_entity_snapshots").select("metric_date, spend, conversions, impressions, clicks")
        .eq("nivel", "ad").like("entity_id", `${l.parent_ad_id}_%`).gte("metric_date", inicio).lte("metric_date", fim);
      let pai = soma(paiRows ?? []);
      let janelaPai = "concorrente";
      if (pai.spend < 20) {
        // pai já não roda junto: usa os 14 dias dele antes do filho começar
        const antes = new Date(Date.parse(`${inicio}T12:00:00Z`) - 14 * 864e5).toISOString().slice(0, 10);
        const { data: paiAntes } = await supabaseAdmin.from("meta_entity_snapshots").select("metric_date, spend, conversions, impressions, clicks")
          .eq("nivel", "ad").like("entity_id", `${l.parent_ad_id}_%`).gte("metric_date", antes).lt("metric_date", inicio);
        pai = soma(paiAntes ?? []); janelaPai = "anterior";
      }
      const filho = soma(filhoRows.filter((r) => (r.metric_date as string) <= fim));
      const p = pol.get(l.client_id as string);
      const v = medirFilhoContraPai({ pai, filho, cplMeta: (p?.cpl_alerta as number) ?? null, convMin: (p?.conversas_minimas as number) ?? null });
      const resultado = { ...v, janela: { inicio, fim, pai: janelaPai }, medidoEm: new Date().toISOString() };
      const { error: e } = await supabaseAdmin.from("creative_lineage").update({ resultado, medido_em: new Date().toISOString() }).eq("id", l.id);
      if (e) { erros.push(`${l.id}: ${e.message.slice(0, 50)}`); continue; }
      medidos++;
      if (v.veredito !== "inconclusiva") {
        const { data: cli } = await supabaseAdmin.from("clients").select("nicho, industry").eq("id", l.client_id as string).maybeSingle();
        const { error: e2 } = await supabaseAdmin.from("creative_learnings").insert({
          client_id: l.client_id, nicho: (cli?.nicho as string) || (cli?.industry as string) || null, lineage_id: l.id,
          variavel: l.variavel, hipotese: l.hipotese, veredito: v.veredito, evidencia: resultado,
        });
        if (e2) erros.push(`learning ${l.id}: ${e2.message.slice(0, 50)}`); else vereditos++;
      }
    }
    anotar(`medir: ${medidos} variações, ${vereditos} vereditos`);
    return NextResponse.json({ ok: erros.length === 0, pendentes: pendentes.length, medidos, vereditos, erros: erros.slice(0, 8) });
  });
}
export const GET = POST;
