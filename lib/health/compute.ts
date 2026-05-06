/**
 * Churn Risk Score (Termômetro de Churn) — pure computation engine.
 *
 * IMPORTANT: score semantics INVERTED vs lib/utils.ts calcHealthScore:
 *   - Here: 0-100 onde MAIOR = MAIS RISCO de churn
 *   - utils.calcHealthScore: 0-100 onde maior = mais saudável
 * Dois scores convivem por enquanto; novo sistema é o preditivo (este).
 *
 * Função pura: recebe sinais já agregados (sem I/O), retorna score + breakdown.
 * O endpoint /api/system/compute-health faz as queries e passa os sinais.
 */

export type HealthLevel = "safe" | "attention" | "high" | "critical";

export interface HealthSignals {
  // Sinais do cliente
  status: "onboarding" | "good" | "average" | "at_risk" | string;
  attentionLevel: "low" | "medium" | "high" | "critical" | string;
  lastPostDate: string | null;          // ISO date
  lastKanbanActivity: string | null;    // ISO timestamp
  postsThisMonth: number;
  postsGoal: number;                    // default 12 se não houver social_report recente

  // Sinais agregados (calculados fora e passados in)
  overdueTasksCount: number;            // tasks.due_date < hoje && status != done
  staleOnboardingCount: number;         // onboarding_items.completed = false && created_at > 30d
  overdueDesignCount: number;           // design_requests.deadline < hoje && status != done
  contractEndsInDays: number | null;    // menor distância em dias do end_date mais próximo; null se sem contrato ativo
  hasRenewalDraft: boolean;             // há draft de renovação?
  negativeMoodRecent: boolean;          // mood_entries últimos 14d tem sentiment ruim?
}

export interface HealthBreakdown {
  [signal: string]: number; // weight added by each signal
}

export interface HealthResult {
  score: number;          // 0-100, higher = more risk
  level: HealthLevel;
  breakdown: HealthBreakdown;
}

function dayOfMonth(): number {
  const now = new Date();
  const saoPaulo = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  return saoPaulo.getDate();
}

function daysSinceDate(iso: string | null): number | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  return Math.floor(ms / 86400000);
}

function levelFor(score: number): HealthLevel {
  if (score >= 75) return "critical";
  if (score >= 60) return "high";
  if (score >= 35) return "attention";
  return "safe";
}

export function computeChurnRiskScore(signals: HealthSignals): HealthResult {
  const b: HealthBreakdown = {};
  let score = 0;

  // 1. Status humano (sinal mais forte do time)
  if (signals.status === "at_risk") {
    b.status_at_risk = 30;
    score += 30;
  }

  // 2. Attention level
  if (signals.attentionLevel === "critical") {
    b.attention_critical = 20;
    score += 20;
  } else if (signals.attentionLevel === "high") {
    b.attention_high = 10;
    score += 10;
  }

  // 3. Inatividade do kanban (time não tá mexendo no cliente)
  const kanbanDays = daysSinceDate(signals.lastKanbanActivity);
  if (kanbanDays !== null) {
    if (kanbanDays > 7) {
      b.kanban_inactive_7d = 15;
      score += 15;
    } else if (kanbanDays > 3) {
      b.kanban_inactive_3d = 5;
      score += 5;
    }
  }

  // 4. Sem post recente (social delivery stale)
  const postDays = daysSinceDate(signals.lastPostDate);
  if (postDays !== null) {
    if (postDays > 14) {
      b.no_post_14d = 15;
      score += 15;
    } else if (postDays > 7) {
      b.no_post_7d = 5;
      score += 5;
    }
  } else {
    // Nunca postou: só penaliza se cliente não está em onboarding
    if (signals.status !== "onboarding") {
      b.no_post_ever = 10;
      score += 10;
    }
  }

  // 5. Entrega de posts (regra: "cliente deve ter todos os posts feitos")
  // Avalia com janela mensal: quanto mais perto do fim do mês sem atingir meta, maior o peso.
  const today = dayOfMonth();
  if (signals.postsGoal > 0) {
    const ratio = signals.postsThisMonth / signals.postsGoal;
    if (today >= 25 && ratio < 1.0) {
      // Fim do mês, ainda não bateu meta: crítico
      b.posts_shortfall_eom = 15;
      score += 15;
    } else if (today >= 15 && ratio < 0.5) {
      // Meio do mês, menos da metade: alerta
      b.posts_shortfall_mid = 8;
      score += 8;
    }
  }

  // 6. Tarefas overdue (backlog operacional)
  if (signals.overdueTasksCount >= 3) {
    b.overdue_tasks = 10;
    score += 10;
  } else if (signals.overdueTasksCount >= 1) {
    b.overdue_tasks = 4;
    score += 4;
  }

  // 7. Onboarding travado (>30d sem completar)
  if (signals.staleOnboardingCount > 0) {
    b.stale_onboarding = 10;
    score += 10;
  }

  // 8. Design queue atrasada
  if (signals.overdueDesignCount > 0) {
    b.overdue_design = 5;
    score += 5;
  }

  // 9. Contrato perto do fim sem renewal draft (sinal financeiro estrutural)
  if (signals.contractEndsInDays !== null && signals.contractEndsInDays <= 30 && !signals.hasRenewalDraft) {
    b.contract_expiring_no_draft = 10;
    score += 10;
  }

  // 10. Sentiment negativo recente
  if (signals.negativeMoodRecent) {
    b.mood_negative = 10;
    score += 10;
  }

  score = Math.max(0, Math.min(100, score));
  return { score, level: levelFor(score), breakdown: b };
}

export function signalLabel(key: string): string {
  const map: Record<string, string> = {
    status_at_risk: "Status em risco",
    attention_critical: "Atenção crítica",
    attention_high: "Atenção alta",
    kanban_inactive_7d: "Kanban parado há +7 dias",
    kanban_inactive_3d: "Kanban parado há +3 dias",
    no_post_14d: "Sem post há +14 dias",
    no_post_7d: "Sem post há +7 dias",
    no_post_ever: "Nunca postou",
    posts_shortfall_eom: "Não bateu meta de posts (fim do mês)",
    posts_shortfall_mid: "Atrás da meta de posts (meio do mês)",
    overdue_tasks: "Tarefas atrasadas",
    stale_onboarding: "Onboarding travado há +30 dias",
    overdue_design: "Fila de design atrasada",
    contract_expiring_no_draft: "Contrato vence em ≤30d sem renovação",
    mood_negative: "Sentiment negativo recente",
  };
  return map[key] ?? key;
}
