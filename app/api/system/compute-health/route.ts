export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireCronOrUser } from "@/lib/api/cron-guard";
import { computeChurnRiskScore, type HealthSignals } from "@/lib/health/compute";

/**
 * POST /api/system/compute-health
 *
 * Cron endpoint. Deve rodar 1x por dia (06:00 BRT via cron no VPS).
 * Pra cada cliente não-onboarding:
 *   1. Agrega signals (tasks overdue, design overdue, onboarding stale, contract end, mood).
 *   2. Calcula score via computeChurnRiskScore().
 *   3. Persiste em client_health_scores (histórico) + atualiza clients.current_health_*.
 *   4. Se score >= 75 (critical):
 *      - Se nunca alertou OU último alerta foi há >= 7 dias: cria notification, atualiza client_health_alerts.
 *
 * Idempotente (unique constraint em (client_id, computed_for_date) previne duplicatas no mesmo dia).
 */

const SEVEN_DAYS_MS = 7 * 86400000;
const NEGATIVE_MOODS = new Set(["angry", "frustrated", "sad", "anxious", "disappointed"]);

async function buildSignalsFor(clientRow: Record<string, unknown>): Promise<HealthSignals> {
  const clientId = clientRow.id as string;
  const today = new Date().toISOString().slice(0, 10);
  const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000).toISOString();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();

  // Tarefas atrasadas
  const { count: overdueTasksCount } = await supabaseAdmin
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("client_id", clientId)
    .lt("due_date", today)
    .neq("status", "done");

  // Onboarding travado
  const { count: staleOnboardingCount } = await supabaseAdmin
    .from("onboarding_items")
    .select("id", { count: "exact", head: true })
    .eq("client_id", clientId)
    .eq("completed", false)
    .lt("created_at", thirtyDaysAgo);

  // Design atrasado
  const { count: overdueDesignCount } = await supabaseAdmin
    .from("design_requests")
    .select("id", { count: "exact", head: true })
    .eq("client_id", clientId)
    .lt("deadline", today)
    .neq("status", "done");

  // Contrato mais próximo do fim + renewal draft
  const { data: activeContracts } = await supabaseAdmin
    .from("contracts")
    .select("id, end_date")
    .eq("client_id", clientId)
    .eq("status", "active")
    .order("end_date", { ascending: true })
    .limit(1);

  let contractEndsInDays: number | null = null;
  let hasRenewalDraft = false;
  if (activeContracts && activeContracts.length > 0) {
    const nearest = activeContracts[0] as { id: string; end_date: string };
    const ms = new Date(nearest.end_date).getTime() - Date.now();
    contractEndsInDays = Math.ceil(ms / 86400000);

    const { count: draftCount } = await supabaseAdmin
      .from("contracts")
      .select("id", { count: "exact", head: true })
      .eq("renewal_draft_of", nearest.id);
    hasRenewalDraft = (draftCount ?? 0) > 0;
  }

  // Mood recente
  const { data: moods } = await supabaseAdmin
    .from("mood_entries")
    .select("mood")
    .eq("client_id", clientId)
    .gte("created_at", fourteenDaysAgo)
    .order("created_at", { ascending: false })
    .limit(5);
  const negativeMoodRecent = (moods ?? []).some((m) => NEGATIVE_MOODS.has((m.mood as string)?.toLowerCase()));

  // Posts goal: pega do social_report mais recente, default 12
  const { data: socialReport } = await supabaseAdmin
    .from("social_reports")
    .select("posts_goal")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const postsGoal = (socialReport?.posts_goal as number) ?? 12;

  return {
    status: (clientRow.status as string) ?? "average",
    attentionLevel: (clientRow.attention_level as string) ?? "medium",
    lastPostDate: (clientRow.last_post_date as string) ?? null,
    lastKanbanActivity: (clientRow.last_kanban_activity as string) ?? null,
    postsThisMonth: (clientRow.posts_this_month as number) ?? 0,
    postsGoal,
    overdueTasksCount: overdueTasksCount ?? 0,
    staleOnboardingCount: staleOnboardingCount ?? 0,
    overdueDesignCount: overdueDesignCount ?? 0,
    contractEndsInDays,
    hasRenewalDraft,
    negativeMoodRecent,
  };
}

export async function POST(req: NextRequest) {
  const denied = await requireCronOrUser(req);
  if (denied) return denied;

  try {
    const today = new Date();
    const todaySP = new Date(today.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    const computedForDate = todaySP.toISOString().slice(0, 10);

    // Pega todos clientes não-onboarding
    const { data: clients, error } = await supabaseAdmin
      .from("clients")
      .select("id, name, nome_fantasia, status, attention_level, last_post_date, last_kanban_activity, posts_this_month")
      .neq("status", "onboarding");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const results: Array<{ client: string; score: number; level: string; alerted: boolean }> = [];
    let alertsSent = 0;

    for (const c of (clients ?? []) as Record<string, unknown>[]) {
      const clientId = c.id as string;
      const clientName = (c.nome_fantasia as string) || (c.name as string) || "(sem nome)";

      const signals = await buildSignalsFor(c);
      const { score, level, breakdown } = computeChurnRiskScore(signals);

      // Upsert histórico (unique em client_id + computed_for_date)
      await supabaseAdmin.from("client_health_scores").upsert({
        client_id: clientId,
        score,
        level,
        breakdown,
        computed_for_date: computedForDate,
        computed_at: new Date().toISOString(),
      }, { onConflict: "client_id,computed_for_date" });

      // Cache no cliente
      await supabaseAdmin.from("clients").update({
        current_health_score: score,
        current_health_level: level,
        health_computed_at: new Date().toISOString(),
      }).eq("id", clientId);

      // Alerta crítico (re-dispara a cada 7 dias enquanto permanecer >= 75)
      let alerted = false;
      if (score >= 75) {
        const { data: lastAlert } = await supabaseAdmin
          .from("client_health_alerts")
          .select("last_alert_at")
          .eq("client_id", clientId)
          .maybeSingle();

        const shouldAlert =
          !lastAlert ||
          !lastAlert.last_alert_at ||
          Date.now() - new Date(lastAlert.last_alert_at as string).getTime() >= SEVEN_DAYS_MS;

        if (shouldAlert) {
          await supabaseAdmin.from("notifications").insert({
            type: "alert",
            title: `Risco de churn crítico — ${clientName}`,
            body: `Score ${score.toFixed(0)}/100. Sinais: ${Object.keys(breakdown).join(", ")}. Agir agora.`,
            client_id: clientId,
          });

          await supabaseAdmin.from("client_health_alerts").upsert({
            client_id: clientId,
            last_alert_at: new Date().toISOString(),
            last_alert_score: score,
            last_alert_level: level,
          }, { onConflict: "client_id" });

          alertsSent++;
          alerted = true;
        }
      }

      results.push({ client: clientName, score, level, alerted });
    }

    return NextResponse.json({
      success: true,
      computed_for_date: computedForDate,
      clients_processed: results.length,
      alerts_sent: alertsSent,
      results,
    });
  } catch (err) {
    console.error("[compute-health] unexpected:", err);
    return NextResponse.json({
      error: `Erro inesperado: ${err instanceof Error ? err.message : "unknown"}`,
    }, { status: 500 });
  }
}
