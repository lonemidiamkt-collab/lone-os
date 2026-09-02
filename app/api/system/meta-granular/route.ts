export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 800;

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import { countMessagesFromActions } from "@/lib/meta/messages";

// POST /api/system/meta-granular — coleta desempenho por CAMPANHA, CONJUNTO e ANÚNCIO.
//
// O sistema só guardava métrica por conta. Isso responde "quanto o cliente gastou" e mais nada: qual
// conjunto queima verba, qual anúncio parou de entregar, qual criativo cansou — tudo invisível. O
// exemplo do Roberto (um conjunto com CPL de R$39 ao lado de outro com R$9, na mesma campanha) não
// tinha como aparecer.
//
// ?dias=N janela (padrão 3 — a Meta reatribui conversão por alguns dias, então reler o passado
// recente corrige número que já foi gravado) · ?clientId= um só · ?dry=1 não grava

const GRAPH = "https://graph.facebook.com/v21.0";
const NIVEIS = ["campaign", "adset", "ad"] as const;

interface LinhaInsight {
  campaign_id?: string; campaign_name?: string;
  adset_id?: string; adset_name?: string;
  ad_id?: string; ad_name?: string;
  spend?: string; impressions?: string; clicks?: string;
  ctr?: string; cpm?: string; frequency?: string;
  actions?: { action_type: string; value: string }[];
  date_start?: string;
}

export async function POST(req: NextRequest) {
  const denied = requireCron(req); if (denied) return denied;
  const dry = req.nextUrl.searchParams.get("dry") !== null;
  const soCliente = req.nextUrl.searchParams.get("clientId") || "";
  const dias = Math.min(30, Math.max(1, Number(req.nextUrl.searchParams.get("dias")) || 3));

  const { data: cfg } = await supabaseAdmin.from("agency_settings").select("value").eq("key", "meta_token").single();
  const token = cfg?.value as string | undefined;
  if (!token) return NextResponse.json({ error: "meta_token ausente" }, { status: 500 });

  let q = supabaseAdmin.from("clients")
    .select("id, name, meta_ad_account_id")
    .not("meta_ad_account_id", "is", null).neq("meta_ad_account_id", "")
    .or("active.is.null,active.eq.true");
  if (soCliente) q = q.eq("id", soCliente);
  const { data: clientes, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ate = new Date();
  const desde = new Date(ate.getTime() - dias * 864e5);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const timeRange = encodeURIComponent(JSON.stringify({ since: iso(desde), until: iso(ate) }));

  let linhas = 0, contasLidas = 0;
  const erros: string[] = [];

  for (const c of clientes ?? []) {
    const acc = c.meta_ad_account_id as string;
    let algumNivelOk = false;

    for (const nivel of NIVEIS) {
      const campos = [
        "campaign_id", "campaign_name", "adset_id", "adset_name", "ad_id", "ad_name",
        "spend", "impressions", "clicks", "ctr", "cpm", "frequency", "actions",
      ].join(",");
      // time_increment=1 → uma linha POR DIA. Sem isso a Meta devolve o período agregado, e aí não
      // dá pra ver quando o problema começou — que é metade do diagnóstico.
      const url = `${GRAPH}/${acc}/insights?access_token=${encodeURIComponent(token)}` +
        `&level=${nivel}&time_range=${timeRange}&time_increment=1&fields=${campos}&limit=500`;

      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
        const json = await res.json().catch(() => null) as { data?: LinhaInsight[]; error?: { message?: string } } | null;
        if (json?.error) {
          // Conta sem acesso não derruba as outras — foi o que já derrubou o digest inteiro antes.
          erros.push(`${c.name} [${nivel}]: ${String(json.error.message).slice(0, 70)}`);
          continue;
        }
        algumNivelOk = true;

        const registros = (json?.data ?? []).map((r) => {
          const entityId = nivel === "campaign" ? r.campaign_id : nivel === "adset" ? r.adset_id : r.ad_id;
          const entityName = nivel === "campaign" ? r.campaign_name : nivel === "adset" ? r.adset_name : r.ad_name;
          const spend = Number(r.spend ?? 0);
          const conversions = countMessagesFromActions(r.actions);
          return {
            client_id: c.id, meta_ad_account_id: acc, nivel,
            entity_id: `${entityId}_${r.date_start}`,   // único por entidade+dia
            entity_name: entityName ?? null,
            campaign_name: r.campaign_name ?? null,
            adset_name: r.adset_name ?? null,
            metric_date: r.date_start,
            spend, impressions: Number(r.impressions ?? 0), clicks: Number(r.clicks ?? 0),
            ctr: r.ctr ? Number(r.ctr) : null,
            cpm: r.cpm ? Number(r.cpm) : null,
            frequency: r.frequency ? Number(r.frequency) : null,
            conversions,
            // Sem conversa, o custo por conversa é INDEFINIDO, não zero. Gravar zero aqui faria o
            // anúncio que não converteu nada parecer o mais barato da conta.
            cost_per_conversion: conversions > 0 ? spend / conversions : null,
          };
        }).filter((r) => r.entity_id && r.metric_date);

        if (registros.length && !dry) {
          // upsert: reler o passado recente CORRIGE o número, porque a Meta reatribui conversão por
          // alguns dias depois do clique.
          const { error: e } = await supabaseAdmin.from("meta_entity_snapshots")
            .upsert(registros, { onConflict: "entity_id,metric_date" });
          if (e) erros.push(`${c.name} [${nivel}] gravar: ${e.message.slice(0, 60)}`);
        }
        linhas += registros.length;
      } catch (e) {
        erros.push(`${c.name} [${nivel}]: ${String(e).slice(0, 60)}`);
      }
    }
    if (algumNivelOk) contasLidas++;
  }

  return NextResponse.json({
    ok: erros.length === 0, dry,
    contas: clientes?.length ?? 0, contas_lidas: contasLidas,
    linhas, janela_dias: dias,
    erros: erros.slice(0, 8),
  });
}
