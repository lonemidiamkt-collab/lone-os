export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 800;

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import { escolherProvider, type NivelEntidade } from "@/lib/meta/gateway";
import { guardarCriativos } from "@/lib/meta/criativos";
import { toBRTDateStr } from "@/lib/meta/timezone";

// POST /api/system/meta-granular — coleta desempenho por CAMPANHA, CONJUNTO e ANÚNCIO.
//
// O sistema só guardava métrica por conta. Isso responde "quanto o cliente gastou" e mais nada: qual
// conjunto queima verba, qual anúncio parou de entregar, qual criativo cansou — tudo invisível. O
// exemplo do Roberto (um conjunto com CPL de R$39 ao lado de outro com R$9, na mesma campanha) não
// tinha como aparecer.
//
// ?dias=N janela (padrão 3 — a Meta reatribui conversão por alguns dias, então reler o passado
// recente corrige número que já foi gravado) · ?clientId= um só · ?dry=1 não grava
// · ?criativos=0 não busca criativo (Fase 2: por padrão guarda miniatura/texto/tipo dos anúncios que gastaram)

const NIVEIS: NivelEntidade[] = ["campaign", "adset", "ad"];

export async function POST(req: NextRequest) {
  const denied = requireCron(req); if (denied) return denied;
  const dry = req.nextUrl.searchParams.get("dry") !== null;
  const soCliente = req.nextUrl.searchParams.get("clientId") || "";
  const dias = Math.min(30, Math.max(1, Number(req.nextUrl.searchParams.get("dias")) || 3));
  const comCriativos = req.nextUrl.searchParams.get("criativos") !== "0";

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
  const iso = (d: Date) => toBRTDateStr(d); // dia de São Paulo, não UTC

  // Quem responde é decidido pelo gateway, não escolhido aqui: hoje é a Marketing API porque o MCP
  // devolve 401 para esta conta, e no dia em que liberar esta rota não muda uma linha.
  const { provider, capacidade } = await escolherProvider(token);

  let linhas = 0, contasLidas = 0, criativos = 0, periodos = 0;
  // Falha por cliente/nível/etapa, para o log dizer exatamente o que ficou sem dado.
  const falhas: { clienteId: string; cliente: string; nivel: string; etapa: string; erro: string }[] = [];
  const falhou = (c: { id: unknown; name: unknown }, nivel: string, etapa: string, e: unknown) =>
    falhas.push({ clienteId: c.id as string, cliente: c.name as string, nivel, etapa, erro: (e instanceof Error ? e.message : String(e)).slice(0, 160) });

  for (const c of clientes ?? []) {
    const acc = c.meta_ad_account_id as string;
    const falhasAntes = falhas.length;

    for (const nivel of NIVEIS) {
      try {
        const insights = await provider.insightsPorEntidade({
          token, accountId: acc, nivel, desde: iso(desde), ate: iso(ate),
        });

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
          if (e) falhou(c, nivel, "gravar", e.message);
        }
        linhas += registros.length;

        // Fase 2: FREQUÊNCIA real dos últimos 7 dias por anúncio (leitura agregada: reach vem só
        // assim). É o sinal de saturação que a série diária não tem.
        if (nivel === "ad") {
          try {
            const sete = new Date(ate.getTime() - 6 * 864e5);
            const agg = await provider.insightsPorEntidade({ token, accountId: acc, nivel: "ad", desde: iso(sete), ate: iso(ate), agregado: true });
            const regs = agg.filter((r) => r.spend > 0).map((r) => ({
              ad_id: r.entityId, ate: iso(ate), dias: 7, client_id: c.id, reach: r.reach ?? null, impressions: r.impressions,
              frequency: r.frequency ?? (r.reach ? r.impressions / r.reach : null), spend: r.spend,
            }));
            if (regs.length && !dry) {
              const { error: e } = await supabaseAdmin.from("meta_ad_period").upsert(regs, { onConflict: "ad_id,ate,dias" });
              if (e) falhou(c, "ad", "periodo_gravar", e.message); else periodos += regs.length;
            }
          } catch (e) {
            falhou(c, "ad", "periodo", e);
          }
        }

        // Fase 2: o CRIATIVO dos anúncios que gastaram na janela (miniatura, texto, tipo, vídeo).
        // Falha aqui não derruba a métrica — é a base do "olhar o criativo", não o sync.
        if (nivel === "ad" && comCriativos) {
          const adIds = [...new Set(insights.filter((r) => r.spend > 0).map((r) => r.entityId))];
          try {
            const r = await guardarCriativos({ provider, token, clientId: c.id as string, accountId: acc, adIds, dry });
            criativos += r.gravados;
          } catch (e) {
            falhou(c, "ad", "criativos", e);
          }
        }
      } catch (e) {
        // Conta sem acesso não derruba as outras — foi o que já derrubou o digest inteiro antes.
        falhou(c, nivel, "ler", e);
      }
    }
    // Conta só é "lida" se TODOS os níveis vieram e foram gravados.
    if (falhas.length === falhasAntes) contasLidas++;
  }

  const total = clientes?.length ?? 0;
  const status = falhas.length === 0 ? "ok" : contasLidas > 0 ? "parcial" : "falhou";
  if (falhas.length) console.error(`[meta-granular] ${status}: ${falhas.length} falha(s) em ${total - contasLidas} conta(s)`);

  return NextResponse.json({
    ok: falhas.length === 0, status, dry,
    fonte: capacidade.fonte, fonte_detalhe: capacidade.detalhe,
    contas: total, contas_lidas: contasLidas, contas_com_falha: total - contasLidas,
    linhas, criativos, periodos, janela_dias: dias,
    falhas,
  }, { status: status === "falhou" && total > 0 ? 502 : 200 });
}
