"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { useAppState } from "@/lib/context/AppStateContext";
import { useOKRMetrics } from "@/lib/hooks/useOKRMetrics";
import { calcHealthScore } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface Snapshot {
  id: string;
  period: string;         // "2026-04"
  periodType: "monthly";
  createdAt: string;

  // Company
  totalClients: number;
  activeClients: number;
  atRiskClients: number;
  churnRate: number;
  avgHealthScore: number;

  // Social
  postsPublished: number;
  postsTarget: number;
  avgDeliverySLAHours: number;
  slaCompliancePct: number;

  // Design
  designCompleted: number;
  designAvgDays: number;
  designOnTimePct: number;

  // Tasks
  tasksCompleted: number;
  tasksOverdue: number;

  // Onboarding
  avgOnboardingDays: number;
  onboardingCompleted: number;

  // Client engagement
  avgDaysSinceLastInteraction: number;
}

export interface Delta {
  metric: string;
  label: string;
  current: number;
  previous: number;
  delta: number;          // percentage change
  direction: "up" | "down" | "stable";
  isGood: boolean;        // is this direction good?
  severity: "normal" | "warning" | "critical";
  unit: string;
}

export interface AIFeedback {
  summary: string;
  score: number;          // 0-100 overall performance
  highlights: string[];
  bottlenecks: string[];
  suggestion: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const STORAGE_KEY = "lone-os-snapshots";
const MAX_SNAPSHOTS = 24;

function getCurrentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function loadSnapshots(): Snapshot[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveSnapshots(snapshots: Snapshot[]) {
  try {
    // Keep only last MAX_SNAPSHOTS
    const trimmed = snapshots.slice(0, MAX_SNAPSHOTS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {}
}

// ─── Delta Calculation ──────────────────────────────────────────────────────

function calcDelta(
  metric: string, label: string, current: number, previous: number,
  unit: string, lowerIsBetter = false
): Delta {
  const raw = previous > 0 ? ((current - previous) / previous) * 100 : 0;
  const delta = Math.round(raw * 10) / 10;
  const direction: Delta["direction"] = Math.abs(delta) < 1 ? "stable" : delta > 0 ? "up" : "down";
  const isGood = lowerIsBetter ? direction === "down" || direction === "stable" : direction === "up" || direction === "stable";

  let severity: Delta["severity"] = "normal";
  if (!isGood && Math.abs(delta) > 20) severity = "critical";
  else if (!isGood && Math.abs(delta) > 10) severity = "warning";

  return { metric, label, current, previous, delta, direction, isGood, severity, unit };
}

// ─── AI Feedback Generator ──────────────────────────────────────────────────

function generateFeedback(deltas: Delta[], currentSnapshot: Snapshot, previousSnapshot?: Snapshot): AIFeedback {
  const positives = deltas.filter((d) => d.isGood && d.direction !== "stable");
  const negatives = deltas.filter((d) => !d.isGood);
  const criticals = negatives.filter((d) => d.severity === "critical");

  // Score: start at 70, add for positives, subtract for negatives
  let score = 70;
  score += positives.length * 5;
  score -= negatives.length * 8;
  score -= criticals.length * 10;
  score = Math.max(0, Math.min(100, score));

  // Summary
  const period = currentSnapshot.period;
  const prevPeriod = previousSnapshot?.period ?? "anterior";
  const pctBatidas = deltas.length > 0 ? Math.round((positives.length / deltas.length) * 100) : 0;

  const summary = `Desempenho ${period}: ${pctBatidas}% das metricas em evolucao positiva${
    criticals.length > 0 ? `. ${criticals.length} indicador(es) critico(s) detectado(s).` : "."
  }`;

  // Highlights
  const highlights = positives.slice(0, 3).map((d) =>
    `${d.label}: ${d.direction === "up" ? "subiu" : "melhorou"} ${Math.abs(d.delta).toFixed(1)}% vs ${prevPeriod}`
  );

  // Bottlenecks
  const bottlenecks = negatives.slice(0, 3).map((d) =>
    `${d.label}: ${d.direction === "down" ? "caiu" : "piorou"} ${Math.abs(d.delta).toFixed(1)}% vs ${prevPeriod}`
  );

  // Suggestion
  let suggestion = "Operacao estavel. Manter ritmo atual.";
  if (criticals.length > 0) {
    const worst = criticals[0];
    if (worst.metric === "slaCompliance") {
      suggestion = `Gargalo critico: SLA de entrega caiu ${Math.abs(worst.delta).toFixed(0)}%. Redistribuir carga entre membros do time ou revisar prazos.`;
    } else if (worst.metric === "designOnTime") {
      suggestion = `Design atrasado: entregas no prazo cairam ${Math.abs(worst.delta).toFixed(0)}%. Considerar designer adicional ou repriorizar fila.`;
    } else if (worst.metric === "churnRate") {
      suggestion = `Risco de churn subiu ${Math.abs(worst.delta).toFixed(0)}%. Acionar CS para contato proativo com clientes at_risk.`;
    } else if (worst.metric === "postsPublished") {
      suggestion = `Producao de conteudo caiu ${Math.abs(worst.delta).toFixed(0)}%. Verificar gargalo no pipeline Social → Design → Publicacao.`;
    } else {
      suggestion = `Atencao em ${worst.label}: queda de ${Math.abs(worst.delta).toFixed(0)}%. Investigar causa raiz.`;
    }
  } else if (negatives.length > 0) {
    suggestion = `Pontos de atencao: ${negatives.map((d) => d.label).join(", ")}. Monitorar na proxima semana.`;
  } else if (positives.length >= 4) {
    suggestion = "Excelente performance! Considerar expandir metas para o proximo trimestre.";
  }

  return { summary, score, highlights, bottlenecks, suggestion };
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useSnapshots() {
  const {
    clients, contentCards, designRequests, tasks, onboarding,
    clientChats, timeline,
  } = useAppState();

  const [snapshots, setSnapshots] = useState<Snapshot[]>(loadSnapshots);

  // Build current period snapshot from live data
  const currentSnapshot = useMemo<Snapshot>(() => {
    const now = new Date();
    const period = getCurrentPeriod();
    const monthStart = `${period}-01`;
    const active = clients.filter((c) => c.status !== "onboarding");
    const atRisk = clients.filter((c) => c.status === "at_risk");

    // Posts published this month
    const published = contentCards.filter((c) =>
      c.status === "published" && c.statusChangedAt && c.statusChangedAt.slice(0, 7) === period
    );

    // SLA: average hours from start to publish
    const slaCards = contentCards.filter((c) =>
      c.status === "published" && c.workStartedAt && c.publishVerifiedAt
    );
    const avgSLA = slaCards.length > 0
      ? slaCards.reduce((sum, c) => {
          const start = new Date(c.workStartedAt!).getTime();
          const end = new Date(c.publishVerifiedAt!).getTime();
          return sum + (end - start) / 3600000;
        }, 0) / slaCards.length
      : 0;

    // SLA compliance: % of cards delivered within 48h
    const slaCompliant = slaCards.filter((c) => {
      const hours = (new Date(c.publishVerifiedAt!).getTime() - new Date(c.workStartedAt!).getTime()) / 3600000;
      return hours <= 48;
    });
    const slaCompliancePct = slaCards.length > 0 ? (slaCompliant.length / slaCards.length) * 100 : 100;

    // Design
    const delivered = contentCards.filter((c) => c.designerDeliveredAt);
    const onTime = delivered.filter((c) => c.dueDate && c.designerDeliveredAt && c.designerDeliveredAt.slice(0, 10) <= c.dueDate);
    const designAvgDays = delivered.length > 0
      ? delivered.reduce((sum, c) => {
          const start = c.workStartedAt ?? c.statusChangedAt;
          if (!start || !c.designerDeliveredAt) return sum;
          return sum + (new Date(c.designerDeliveredAt).getTime() - new Date(start).getTime()) / 86400000;
        }, 0) / delivered.length
      : 0;

    // Tasks
    const todayStr = now.toISOString().slice(0, 10);
    const completed = tasks.filter((t) => t.status === "done");
    const overdue = tasks.filter((t) => t.status !== "done" && t.dueDate && t.dueDate < todayStr);

    // Onboarding
    const onboardingClients = clients.filter((c) => c.status === "onboarding");
    const completedOnboarding = clients.filter((c) => c.status !== "onboarding" && c.joinDate);
    const avgOnboardingDays = completedOnboarding.length > 0
      ? completedOnboarding.reduce((sum, c) => {
          if (!c.joinDate) return sum;
          return sum + (now.getTime() - new Date(c.joinDate).getTime()) / 86400000;
        }, 0) / completedOnboarding.length
      : 0;

    // Client engagement: avg days since last chat/timeline activity
    const avgEngagement = clients.length > 0
      ? clients.reduce((sum, c) => {
          const chats = clientChats[c.id] ?? [];
          const entries = timeline[c.id] ?? [];
          const lastChat = chats.length > 0 ? new Date(chats[chats.length - 1].timestamp).getTime() : 0;
          const lastEntry = entries.length > 0 ? new Date(entries[entries.length - 1].timestamp).getTime() : 0;
          const lastInteraction = Math.max(lastChat, lastEntry);
          if (lastInteraction === 0) return sum + 30;
          return sum + (now.getTime() - lastInteraction) / 86400000;
        }, 0) / clients.length
      : 0;

    return {
      id: `snap-${period}`,
      period,
      periodType: "monthly" as const,
      createdAt: now.toISOString(),
      totalClients: clients.length,
      activeClients: active.length,
      atRiskClients: atRisk.length,
      churnRate: clients.length > 0 ? (atRisk.length / clients.length) * 100 : 0,
      avgHealthScore: clients.length > 0
        ? clients.reduce((sum, c) => sum + calcHealthScore(c), 0) / clients.length
        : 0,
      postsPublished: published.length,
      postsTarget: 96,
      avgDeliverySLAHours: Math.round(avgSLA * 10) / 10,
      slaCompliancePct: Math.round(slaCompliancePct),
      designCompleted: delivered.length,
      designAvgDays: Math.round(designAvgDays * 10) / 10,
      designOnTimePct: delivered.length > 0 ? Math.round((onTime.length / delivered.length) * 100) : 100,
      tasksCompleted: completed.length,
      tasksOverdue: overdue.length,
      avgOnboardingDays: Math.round(avgOnboardingDays),
      onboardingCompleted: completedOnboarding.length,
      avgDaysSinceLastInteraction: Math.round(avgEngagement * 10) / 10,
    };
  }, [clients, contentCards, tasks, designRequests, onboarding, clientChats, timeline]);

  // Auto-save snapshot on first access of new month
  useEffect(() => {
    const period = getCurrentPeriod();
    const existing = snapshots.find((s) => s.period === period);
    if (!existing && clients.length > 0) {
      const updated = [currentSnapshot, ...snapshots].slice(0, MAX_SNAPSHOTS);
      setSnapshots(updated);
      saveSnapshots(updated);
    }
  }, [currentSnapshot.period]); // eslint-disable-line react-hooks/exhaustive-deps

  // Save current period (overwrite)
  const saveCurrentSnapshot = useCallback(() => {
    const updated = [
      currentSnapshot,
      ...snapshots.filter((s) => s.period !== currentSnapshot.period),
    ].slice(0, MAX_SNAPSHOTS);
    setSnapshots(updated);
    saveSnapshots(updated);
  }, [currentSnapshot, snapshots]);

  // Get previous period snapshot
  const previousSnapshot = useMemo(() => {
    const sorted = [...snapshots].sort((a, b) => b.period.localeCompare(a.period));
    return sorted.find((s) => s.period < currentSnapshot.period) ?? null;
  }, [snapshots, currentSnapshot.period]);

  // Calculate deltas
  const deltas = useMemo<Delta[]>(() => {
    if (!previousSnapshot) return [];
    const prev = previousSnapshot;
    const curr = currentSnapshot;

    return [
      calcDelta("healthScore", "Health Score Medio", curr.avgHealthScore, prev.avgHealthScore, "pts"),
      calcDelta("churnRate", "Taxa de Churn", curr.churnRate, prev.churnRate, "%", true),
      calcDelta("postsPublished", "Posts Publicados", curr.postsPublished, prev.postsPublished, "posts"),
      calcDelta("slaCompliance", "SLA Compliance", curr.slaCompliancePct, prev.slaCompliancePct, "%"),
      calcDelta("deliverySLA", "SLA de Entrega", curr.avgDeliverySLAHours, prev.avgDeliverySLAHours, "h", true),
      calcDelta("designOnTime", "Design no Prazo", curr.designOnTimePct, prev.designOnTimePct, "%"),
      calcDelta("designSpeed", "Velocidade Design", curr.designAvgDays, prev.designAvgDays, "dias", true),
      calcDelta("tasksOverdue", "Tasks Vencidas", curr.tasksOverdue, prev.tasksOverdue, "tasks", true),
      calcDelta("engagement", "Engajamento Cliente", curr.avgDaysSinceLastInteraction, prev.avgDaysSinceLastInteraction, "dias", true),
    ];
  }, [currentSnapshot, previousSnapshot]);

  // AI Feedback
  const feedback = useMemo<AIFeedback>(() => {
    return generateFeedback(deltas, currentSnapshot, previousSnapshot ?? undefined);
  }, [deltas, currentSnapshot, previousSnapshot]);

  // Churn risk alerts
  const churnAlerts = useMemo(() => {
    const alerts: { metric: string; label: string; severity: "warning" | "critical"; message: string }[] = [];
    const now = new Date();
    const dayOfMonth = now.getDate();

    // Velocity check
    if (dayOfMonth >= 20) {
      const pct = currentSnapshot.postsTarget > 0 ? (currentSnapshot.postsPublished / currentSnapshot.postsTarget) * 100 : 100;
      if (pct < 50) alerts.push({ metric: "velocity", label: "Velocidade de Entrega", severity: "critical", message: `Apenas ${Math.round(pct)}% da meta no dia ${dayOfMonth}` });
      else if (pct < 70) alerts.push({ metric: "velocity", label: "Velocidade de Entrega", severity: "warning", message: `${Math.round(pct)}% da meta no dia ${dayOfMonth}` });
    }

    // SLA
    if (currentSnapshot.slaCompliancePct < 70) alerts.push({ metric: "sla", label: "SLA Compliance", severity: "critical", message: `${currentSnapshot.slaCompliancePct}% (meta: >85%)` });
    else if (currentSnapshot.slaCompliancePct < 85) alerts.push({ metric: "sla", label: "SLA Compliance", severity: "warning", message: `${currentSnapshot.slaCompliancePct}% (meta: >85%)` });

    // Design
    if (currentSnapshot.designOnTimePct < 70) alerts.push({ metric: "design", label: "Design no Prazo", severity: "critical", message: `${currentSnapshot.designOnTimePct}% no prazo` });
    else if (currentSnapshot.designOnTimePct < 85) alerts.push({ metric: "design", label: "Design no Prazo", severity: "warning", message: `${currentSnapshot.designOnTimePct}% no prazo` });

    // Engagement
    if (currentSnapshot.avgDaysSinceLastInteraction > 14) alerts.push({ metric: "engagement", label: "Engajamento", severity: "critical", message: `Media ${currentSnapshot.avgDaysSinceLastInteraction.toFixed(0)} dias sem interacao` });
    else if (currentSnapshot.avgDaysSinceLastInteraction > 7) alerts.push({ metric: "engagement", label: "Engajamento", severity: "warning", message: `Media ${currentSnapshot.avgDaysSinceLastInteraction.toFixed(0)} dias sem interacao` });

    // Health trend
    if (previousSnapshot) {
      const healthDelta = currentSnapshot.avgHealthScore - previousSnapshot.avgHealthScore;
      if (healthDelta < -20) alerts.push({ metric: "health", label: "Health Score", severity: "critical", message: `Caiu ${Math.abs(Math.round(healthDelta))} pts vs mes anterior` });
      else if (healthDelta < -10) alerts.push({ metric: "health", label: "Health Score", severity: "warning", message: `Caiu ${Math.abs(Math.round(healthDelta))} pts vs mes anterior` });
    }

    return alerts;
  }, [currentSnapshot, previousSnapshot]);

  return {
    snapshots,
    currentSnapshot,
    previousSnapshot,
    deltas,
    feedback,
    churnAlerts,
    saveCurrentSnapshot,
  };
}
