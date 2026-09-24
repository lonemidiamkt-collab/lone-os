export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireCronOrUser } from "@/lib/api/cron-guard";
import { getAccountInsights } from "@/lib/meta/api";
import { countMessagesFromActions } from "@/lib/meta/messages";
import {
  detectAnomalies, escolherDiaCorrente, metricaZerada,
  type HistoricalMetric, type CurrentMetric, type DetectionContext,
} from "@/lib/defense/detect";
import { buscarInsightHoje } from "@/lib/defense/insights-hoje";
import { podeReceber } from "@/lib/clients/pausa";

/**
 * POST /api/system/defense-scan
 *
 * Cron endpoint (15min). Fluxo:
 *  1. Pega o token Meta global de agency_settings.
 *  2. Pra cada cliente com meta_ad_account_id:
 *     a. Fetch insights dos últimos 8 dias no Meta.
 *     b. Grava os dias fechados em metric_snapshots (1 linha por cliente/dia); hoje só p/ detecção.
 *     c. Compare com histórico 7d → detectAnomalies.
 *     d. Pra cada anomalia, upsert em anomaly_alerts (unique por client+metric+data).
 *        Se for primeira detecção do dia: também cria notification.
 *  3. Retorna summary.
 *
 * Rate limit: ~2 API calls/cliente × 35 × 4/hr = ~280/hr (seguro vs limite Meta).
 */

async function getMetaToken(): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("agency_settings")
    .select("key, value")
    .in("key", ["meta_token", "meta_token_expires_at"]);
  const map = new Map((data ?? []).map((r) => [r.key as string, r.value as string]));
  const token = map.get("meta_token");
  const expiresAt = map.get("meta_token_expires_at") ? parseInt(map.get("meta_token_expires_at")!, 10) : null;
  if (!token) return null;
  if (expiresAt && expiresAt < Date.now()) return null;
  return token;
}

function asNumber(v: string | undefined | null): number {
  if (!v) return 0;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

export async function POST(req: NextRequest) {
  const denied = await requireCronOrUser(req);
  if (denied) return denied;

  // Padrão 8: o suficiente pra baseline de 7 dias. Sobe pra recuperar histórico de conta nova.
  const diasHistorico = Math.min(90, Math.max(2, Number(req.nextUrl.searchParams.get("dias")) || 8));

  try {
    const token = await getMetaToken();
    if (!token) {
      return NextResponse.json({ error: "Meta token não configurado ou expirado" }, { status: 400 });
    }

    const { data: clients, error: cErr } = await supabaseAdmin
      .from("clients")
      .select("id, name, nome_fantasia, meta_ad_account_id, active, churned_at, paused_at, paused_until")
      .not("meta_ad_account_id", "is", null);

    if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });

    // Status da conta do último sync de saldo: só conta ATIVA transforma "sem linha hoje" em gasto zero.
    const { data: contas, error: aErr } = await supabaseAdmin
      .from("ad_accounts").select("meta_account_id, account_status");
    if (aErr) return NextResponse.json({ error: aErr.message }, { status: 500 });
    const statusPorConta = new Map((contas ?? []).map((a) => [a.meta_account_id as string, a.account_status as number | null]));

    const today = new Date();
    const todayStr = today.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

    // Fração do dia decorrida em BRT (usada pra pro-ratear baselines de volume)
    const nowSP = new Date(today.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    const elapsedHours = nowSP.getHours() + nowSP.getMinutes() / 60;
    const elapsedFraction = elapsedHours / 24;

    const results: Array<{ client: string; snapshot: boolean; anomalies: number; error?: string }> = [];
    let totalAnomalies = 0;
    let totalAlertsNew = 0;

    // Ex-cliente e cliente pausado não são vigiados — pausado não gasta de propósito.
    const vigiados = ((clients ?? []) as Record<string, unknown>[]).filter((c) => podeReceber(c));

    for (const c of vigiados) {
      const clientId = c.id as string;
      const clientName = (c.nome_fantasia as string) || (c.name as string) || "(sem nome)";
      const accountId = c.meta_ad_account_id as string;

      try {
        // 1. Fetch do histórico. `?dias=` permite puxar mais fundo — é como uma conta recém
        // vinculada ganha passado (ver o bloco de persistência abaixo).
        // A janela do getAccountInsights termina ontem; a linha de hoje vem à parte.
        const [passado, todayInsight] = await Promise.all([
          getAccountInsights(accountId, token, diasHistorico),
          buscarInsightHoje(accountId, token, todayStr),
        ]);
        const insights = todayInsight ? [...passado, todayInsight] : passado;

        // 2. Monta current (hoje) + history
        const contaAtiva = statusPorConta.get(accountId) === 1;
        const dia = escolherDiaCorrente(!!todayInsight, contaAtiva, nowSP.getHours());
        if (dia.tipo === "ultimo_dia" && insights.length === 0) {
          results.push({ client: clientName, snapshot: false, anomalies: 0, error: "no insights" });
          continue;
        }

        const buildMetric = (i: typeof insights[0]): HistoricalMetric => {
          const spend = asNumber(i.spend);
          const clicks = parseInt(i.clicks || "0", 10);
          const impressions = parseInt(i.impressions || "0", 10);
          const conversions = countMessagesFromActions(i.actions);
          return {
            metric_date: i.date_start,
            spend,
            impressions,
            clicks,
            conversions,
            ctr: asNumber(i.ctr),
            cpm: asNumber(i.cpm),
            cpc: asNumber(i.cpc),
            cpl: conversions > 0 ? spend / conversions : null,
          };
        };

        const history: HistoricalMetric[] = insights.map(buildMetric);
        const current: CurrentMetric =
          dia.tipo === "hoje" ? buildMetric(todayInsight!)
          : dia.tipo === "zero_hoje" ? metricaZerada(todayStr)
          : buildMetric(insights[insights.length - 1]);
        const currentDate = current.metric_date;
        // Dia já fechado compara inteiro; só hoje pro-rateia pela hora.
        const detectionCtx: DetectionContext = { elapsedFraction: currentDate === todayStr ? elapsedFraction : 1 };

        // 3a. Persiste TODO o histórico que já veio na mesma chamada.
        //
        // O scan sempre buscou 8 dias pra calcular a baseline e gravava só o dia corrente — os
        // outros 7 eram baixados e jogados fora. Isso custava duas coisas: dia em que o scan falhou
        // ficava sem registro PARA SEMPRE (o relatório do mês some com ele), e conta recém-vinculada
        // nascia sem passado nenhum. O ACM Distribuidora acabou de entrar assim: conta rodando desde
        // agosto, R$ 210 na Meta, zero no relatório.
        //
        // Só dias FECHADOS vão pro metric_snapshots (hoje parcial serve só pra detecção). O último dia
        // fechado é regravado a cada scan porque a Meta ainda ajusta a atribuição dele.
        const fechados = passado.map(buildMetric);
        const ultimoFechado = fechados[fechados.length - 1] ?? null;
        const linha = (h: HistoricalMetric) => ({
          client_id: clientId, meta_ad_account_id: accountId, metric_date: h.metric_date,
          spend: h.spend, impressions: h.impressions, clicks: h.clicks,
          conversions: h.conversions, ctr: h.ctr, cpm: h.cpm, cpc: h.cpc, cpl: h.cpl,
        });

        if (fechados.length) {
          const { data: jaTem, error: jaTemErr } = await supabaseAdmin.from("metric_snapshots")
            .select("metric_date").eq("client_id", clientId)
            .gte("metric_date", fechados[0].metric_date);
          if (jaTemErr) throw new Error(`leitura de metric_snapshots: ${jaTemErr.message}`);
          const datasGravadas = new Set((jaTem ?? []).map((r) => r.metric_date as string));

          const faltando = fechados
            .filter((h) => h.metric_date !== ultimoFechado?.metric_date && !datasGravadas.has(h.metric_date))
            .map(linha);
          if (faltando.length) {
            const { error: insErr } = await supabaseAdmin.from("metric_snapshots").insert(faltando);
            if (insErr) throw new Error(`histórico em metric_snapshots: ${insErr.message}`);
          }
        }

        // 3b. UMA linha por cliente/dia, sobrescrita a cada scan (o insert cru já gerou 98 cópias do
        // mesmo número). Atualiza no lugar e só insere se não havia linha: nunca apaga antes de ter
        // gravado, e funciona com ou sem índice único.
        if (ultimoFechado) {
          const { data: atualizadas, error: updErr } = await supabaseAdmin.from("metric_snapshots")
            .update(linha(ultimoFechado))
            .eq("client_id", clientId)
            .eq("metric_date", ultimoFechado.metric_date)
            .select("id");
          if (updErr) throw new Error(`snapshot do dia: ${updErr.message}`);
          if (!atualizadas?.length) {
            const { error: insErr } = await supabaseAdmin.from("metric_snapshots").insert(linha(ultimoFechado));
            if (insErr) throw new Error(`snapshot do dia: ${insErr.message}`);
          }
        }

        // 4. Detecta anomalias (baselines pro-rateadas pela fração do dia decorrida)
        const anomalies = detectAnomalies(current, history, detectionCtx);
        totalAnomalies += anomalies.length;

        for (const a of anomalies) {
          // Upsert (unique per client + metric + date — dedup natural)
          const { data: existing, error: exErr } = await supabaseAdmin
            .from("anomaly_alerts")
            .select("id, acknowledged_at")
            .eq("client_id", clientId)
            .eq("metric", a.metric)
            .eq("metric_date", currentDate)
            .maybeSingle();
          if (exErr) throw new Error(`anomaly_alerts (leitura): ${exErr.message}`);

          if (!existing) {
            // Primeira detecção — cria alerta + notificação
            const { error: alertErr } = await supabaseAdmin.from("anomaly_alerts").insert({
              client_id: clientId,
              meta_ad_account_id: accountId,
              metric: a.metric,
              severity: a.severity,
              current_value: a.currentValue,
              baseline_value: a.baselineValue,
              percent_change: a.percentChange,
              description: a.description,
              metric_date: currentDate,
            });
            if (alertErr) throw new Error(`anomaly_alerts: ${alertErr.message}`);

            await supabaseAdmin.from("notifications").insert({
              type: "alert",
              title: `${a.severity === "critical" ? "🚨 CRÍTICO" : "⚠️ Alerta"}: ${clientName}`,
              body: a.description,
              client_id: clientId,
            });

            totalAlertsNew++;
          }
          // Se já existe e ainda não foi acknowledged, não re-notifica (anti-spam).
          // Se ack'd mas voltou a anomalizar outro dia, entra como nova row (UNIQUE inclui metric_date).
        }

        results.push({ client: clientName, snapshot: !!ultimoFechado, anomalies: anomalies.length });
      } catch (err) {
        console.error(`[defense-scan] ${clientName}:`, err);
        results.push({
          client: clientName,
          snapshot: false,
          anomalies: 0,
          error: err instanceof Error ? err.message : "unknown",
        });
      }
    }

    return NextResponse.json({
      success: true,
      elapsed_fraction: elapsedFraction,
      clients_scanned: results.length,
      total_anomalies_detected: totalAnomalies,
      new_alerts_created: totalAlertsNew,
      results,
    });
  } catch (err) {
    console.error("[defense-scan] unexpected:", err);
    return NextResponse.json({
      error: `Erro inesperado: ${err instanceof Error ? err.message : "unknown"}`,
    }, { status: 500 });
  }
}
