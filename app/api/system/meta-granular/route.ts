export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 800;

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import { escolherProvider, type NivelEntidade } from "@/lib/meta/gateway";

// POST /api/system/meta-granular — coleta desempenho por CAMPANHA, CONJUNTO e ANÚNCIO.
//
// O sistema só guardava métrica por conta. Isso responde "quanto o cliente gastou" e mais nada: qual
// conjunto queima verba, qual anúncio parou de entregar, qual criativo cansou — tudo invisível. O
// exemplo do Roberto (um conjunto com CPL de R$39 ao lado de outro com R$9, na mesma campanha) não
// tinha como aparecer.
//
// ?dias=N janela (padrão 3 — a Meta reatribui conversão por alguns dias, então reler o passado
// recente corrige número que já foi gravado) · ?clientId= um só · ?dry=1 não grava

const NIVEIS: NivelEntidade[] = ["campaign", "adset", "ad"];

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

  // Quem responde é decidido pelo gateway, não escolhido aqui: hoje é a Marketing API porque o MCP
  // devolve 401 para esta conta, e no dia em que liberar esta rota não muda uma linha.
  const { provider, capacidade } = await escolherProvider(token);

  let linhas = 0, contasLidas = 0;
  const erros: string[] = [];

  for (const c of clientes ?? []) {
    const acc = c.meta_ad_account_id as string;
    let algumNivelOk = false;

    for (const nivel of NIVEIS) {
      try {
        const insights = await provider.insightsPorEntidade({
          token, accountId: acc, nivel, desde: iso(desde), ate: iso(ate),
        });
        algumNivelOk = true;

        const registros = insights.map((r) => ({
          client_id: c.id, meta_ad_account_id: acc, nivel,
          entity_id: `${r.entityId}_${r.date}`,   // único por entidade+dia
          entity_name: r.entityName ?? null,
          campaign_name: r.campaignName ?? null,
          adset_name: r.adsetName ?? null,
          metric_date: r.date,
          spend: r.spend, impressions: r.impressions, clicks: r.clicks,
          ctr: r.ctr ?? null, cpm: r.cpm ?? null, frequency: r.frequency ?? null,
          conversions: r.conversions,
          // Sem conversa, o custo por conversa é INDEFINIDO, não zero. Gravar zero faria o anúncio
          // que não converteu nada parecer o mais barato da conta.
          cost_per_conversion: r.conversions > 0 ? r.spend / r.conversions : null,
        }));

        if (registros.length && !dry) {
          // upsert: reler o passado recente CORRIGE o número, porque a Meta reatribui conversão por
          // alguns dias depois do clique.
          const { error: e } = await supabaseAdmin.from("meta_entity_snapshots")
            .upsert(registros, { onConflict: "entity_id,metric_date" });
          if (e) erros.push(`${c.name} [${nivel}] gravar: ${e.message.slice(0, 60)}`);
        }
        linhas += registros.length;
      } catch (e) {
        // Conta sem acesso não derruba as outras — foi o que já derrubou o digest inteiro antes.
        erros.push(`${c.name} [${nivel}]: ${String(e).slice(0, 70)}`);
      }
    }
    if (algumNivelOk) contasLidas++;
  }

  return NextResponse.json({
    ok: erros.length === 0, dry,
    fonte: capacidade.fonte, fonte_detalhe: capacidade.detalhe,
    contas: clientes?.length ?? 0, contas_lidas: contasLidas,
    linhas, janela_dias: dias,
    erros: erros.slice(0, 8),
  });
}
