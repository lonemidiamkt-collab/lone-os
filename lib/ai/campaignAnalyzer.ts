/**
 * AI Campaign Analyzer — Lone OS
 * Analyzes ad campaigns and generates actionable insights,
 * alerts, and task suggestions for traffic managers.
 */

import type { AdCampaign } from "@/lib/types";

export type InsightSeverity = "critical" | "warning" | "info" | "success";
export type InsightCategory = "budget" | "performance" | "delivery" | "optimization" | "opportunity";

export interface CampaignInsight {
  id: string;
  severity: InsightSeverity;
  category: InsightCategory;
  title: string;
  description: string;
  campaignId?: string;
  campaignName?: string;
  metric?: string;
  value?: number;
  threshold?: number;
  action: string; // suggested action
  taskTitle?: string; // auto-create task with this title
  priority: "low" | "medium" | "high" | "critical";
}

export interface PortfolioSummary {
  healthScore: number; // 0-100
  healthLabel: string;
  totalCampaigns: number;
  activeCampaigns: number;
  pausedCampaigns: number;
  totalSpend: number;
  avgCpc: number;
  avgCtr: number;
  avgCostPerConv: number;
  topPerformer: { name: string; metric: string; value: string } | null;
  worstPerformer: { name: string; metric: string; value: string } | null;
  insights: CampaignInsight[];
  spendTrend: "up" | "down" | "stable";
  performanceTrend: "improving" | "declining" | "stable";
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * Analyze a set of campaigns and produce insights + health score
 */
export function analyzeCampaigns(campaigns: AdCampaign[], dateRange: number): PortfolioSummary {
  const insights: CampaignInsight[] = [];
  const active = campaigns.filter((c) => c.status === "active");
  const paused = campaigns.filter((c) => c.status === "paused");

  const totalSpend = campaigns.reduce((s, c) => s + c.spend, 0);
  const totalClicks = campaigns.reduce((s, c) => s + c.clicks, 0);
  const totalImpressions = campaigns.reduce((s, c) => s + c.impressions, 0);
  const totalConversions = campaigns.reduce((s, c) => s + c.conversions, 0);
  const totalMessages = campaigns.reduce((s, c) => s + (c.messages ?? 0), 0);

  const avgCpc = totalClicks > 0 ? totalSpend / totalClicks : 0;
  const avgCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
  const avgCostPerConv = totalConversions > 0 ? totalSpend / totalConversions : 0;

  let healthScore = 70; // start at 70

  // ============ CRITICAL CHECKS ============

  // Budget exhaustion
  campaigns.forEach((c) => {
    if (c.totalBudget > 0 && c.spend / c.totalBudget > 0.95) {
      insights.push({
        id: uid(), severity: "critical", category: "budget",
        title: "Verba Esgotada",
        description: `A campanha "${c.name}" consumiu ${((c.spend / c.totalBudget) * 100).toFixed(0)}% do orçamento total. Os anúncios podem parar a qualquer momento.`,
        campaignId: c.id, campaignName: c.name,
        metric: "budget_consumed", value: (c.spend / c.totalBudget) * 100, threshold: 95,
        action: "Aumentar orçamento ou pausar campanha para redistribuir verba",
        taskTitle: `URGENTE: Repor verba — ${c.name}`,
        priority: "critical",
      });
      healthScore -= 15;
    } else if (c.totalBudget > 0 && c.spend / c.totalBudget > 0.85) {
      insights.push({
        id: uid(), severity: "warning", category: "budget",
        title: "Verba Acabando",
        description: `"${c.name}" já consumiu ${((c.spend / c.totalBudget) * 100).toFixed(0)}% do orçamento. Restam poucos dias de veiculação.`,
        campaignId: c.id, campaignName: c.name,
        metric: "budget_consumed", value: (c.spend / c.totalBudget) * 100, threshold: 85,
        action: "Avaliar se o orçamento restante é suficiente para o período",
        taskTitle: `Avaliar verba restante — ${c.name}`,
        priority: "high",
      });
      healthScore -= 5;
    }
  });

  // Zero delivery on active campaigns
  active.forEach((c) => {
    if (c.impressions === 0 && c.spend === 0) {
      insights.push({
        id: uid(), severity: "critical", category: "delivery",
        title: "Campanha Travada",
        description: `"${c.name}" está ativa mas não está entregando. Possível problema de aprovação, pagamento ou configuração.`,
        campaignId: c.id, campaignName: c.name,
        metric: "impressions", value: 0,
        action: "Verificar status de aprovação dos anúncios, método de pagamento e configurações de público",
        taskTitle: `VERIFICAR: Campanha travada — ${c.name}`,
        priority: "critical",
      });
      healthScore -= 20;
    }
  });

  // ============ PERFORMANCE CHECKS ============

  // High CPC
  campaigns.forEach((c) => {
    if (c.clicks > 20 && c.cpc > 8) {
      insights.push({
        id: uid(), severity: "warning", category: "performance",
        title: "CPC Muito Alto",
        description: `"${c.name}" com CPC de R$ ${c.cpc.toFixed(2)}. O custo por clique está acima do ideal para a maioria dos segmentos.`,
        campaignId: c.id, campaignName: c.name,
        metric: "cpc", value: c.cpc, threshold: 8,
        action: "Testar novos criativos, refinar segmentação ou ajustar lances",
        taskTitle: `Otimizar CPC — ${c.name}`,
        priority: "high",
      });
      healthScore -= 5;
    } else if (c.clicks > 20 && c.cpc > 5) {
      insights.push({
        id: uid(), severity: "info", category: "optimization",
        title: "CPC Acima da Média",
        description: `"${c.name}" com CPC de R$ ${c.cpc.toFixed(2)}. Há espaço para otimização.`,
        campaignId: c.id, campaignName: c.name,
        metric: "cpc", value: c.cpc, threshold: 5,
        action: "Revisar criativos e testar novos públicos para reduzir CPC",
        priority: "medium",
      });
    }
  });

  // Low CTR
  campaigns.forEach((c) => {
    if (c.impressions > 2000 && c.ctr < 0.5) {
      insights.push({
        id: uid(), severity: "warning", category: "performance",
        title: "CTR Crítico",
        description: `"${c.name}" com CTR de ${c.ctr.toFixed(2)}%. Criativos não estão gerando cliques suficientes.`,
        campaignId: c.id, campaignName: c.name,
        metric: "ctr", value: c.ctr, threshold: 0.5,
        action: "Trocar criativos, testar novos copies e verificar se o público é adequado",
        taskTitle: `Revisar criativos — ${c.name}`,
        priority: "high",
      });
      healthScore -= 5;
    } else if (c.impressions > 2000 && c.ctr < 1) {
      insights.push({
        id: uid(), severity: "info", category: "optimization",
        title: "CTR Abaixo do Ideal",
        description: `"${c.name}" com CTR de ${c.ctr.toFixed(2)}%. Benchmark recomendado: >1%.`,
        campaignId: c.id, campaignName: c.name,
        metric: "ctr", value: c.ctr, threshold: 1,
        action: "Testar variações de criativos para melhorar engajamento",
        priority: "medium",
      });
    }
  });

  // High cost per conversion
  campaigns.forEach((c) => {
    if (c.conversions > 0 && c.costPerConversion > 80) {
      insights.push({
        id: uid(), severity: "warning", category: "performance",
        title: "Custo por Conversão Alto",
        description: `"${c.name}" com custo de R$ ${c.costPerConversion.toFixed(2)} por conversão. Acima do aceitável para o segmento.`,
        campaignId: c.id, campaignName: c.name,
        metric: "costPerConversion", value: c.costPerConversion, threshold: 80,
        action: "Revisar funil de conversão, landing page e segmentação",
        taskTitle: `Reduzir custo/conversão — ${c.name}`,
        priority: "high",
      });
      healthScore -= 5;
    }
  });

  // ============ OPPORTUNITY CHECKS ============

  // High performing campaigns that could scale
  campaigns.forEach((c) => {
    if (c.status === "active" && c.ctr > 2 && c.cpc < 3 && c.spend > 50) {
      insights.push({
        id: uid(), severity: "success", category: "opportunity",
        title: "Oportunidade de Escalar",
        description: `"${c.name}" está com ótimo desempenho (CTR ${c.ctr.toFixed(1)}%, CPC R$ ${c.cpc.toFixed(2)}). Considere aumentar o orçamento para maximizar resultados.`,
        campaignId: c.id, campaignName: c.name,
        action: "Aumentar orçamento gradualmente (20-30%) e monitorar métricas",
        taskTitle: `Escalar campanha — ${c.name}`,
        priority: "medium",
      });
      healthScore += 5;
    }
  });

  // Good cost per message
  campaigns.forEach((c) => {
    const msgs = c.messages ?? 0;
    if (msgs > 10 && c.spend > 0) {
      const costPerMsg = c.spend / msgs;
      if (costPerMsg < 3) {
        insights.push({
          id: uid(), severity: "success", category: "opportunity",
          title: "Custo por Mensagem Excelente",
          description: `"${c.name}" com custo de R$ ${costPerMsg.toFixed(2)} por mensagem. Performance acima da média.`,
          campaignId: c.id, campaignName: c.name,
          metric: "costPerMessage", value: costPerMsg,
          action: "Manter estratégia e considerar replicar para outros clientes",
          priority: "low",
        });
        healthScore += 3;
      }
    }
  });

  // ============ TREND ANALYSIS ============

  // Analyze daily metrics trends
  let spendTrend: "up" | "down" | "stable" = "stable";
  let performanceTrend: "improving" | "declining" | "stable" = "stable";

  const allDailyMetrics = active.flatMap((c) => c.dailyMetrics);
  if (allDailyMetrics.length >= 4) {
    const midpoint = Math.floor(allDailyMetrics.length / 2);
    const firstHalf = allDailyMetrics.slice(0, midpoint);
    const secondHalf = allDailyMetrics.slice(midpoint);

    const firstSpend = firstHalf.reduce((s, d) => s + d.spend, 0);
    const secondSpend = secondHalf.reduce((s, d) => s + d.spend, 0);
    if (secondSpend > firstSpend * 1.15) spendTrend = "up";
    else if (secondSpend < firstSpend * 0.85) spendTrend = "down";

    const firstClicks = firstHalf.reduce((s, d) => s + d.clicks, 0);
    const secondClicks = secondHalf.reduce((s, d) => s + d.clicks, 0);
    const firstImpr = firstHalf.reduce((s, d) => s + d.impressions, 0);
    const secondImpr = secondHalf.reduce((s, d) => s + d.impressions, 0);
    const firstCtr = firstImpr > 0 ? (firstClicks / firstImpr) * 100 : 0;
    const secondCtr = secondImpr > 0 ? (secondClicks / secondImpr) * 100 : 0;
    if (secondCtr > firstCtr * 1.1) performanceTrend = "improving";
    else if (secondCtr < firstCtr * 0.9) performanceTrend = "declining";
  }

  if (performanceTrend === "declining") healthScore -= 5;
  if (performanceTrend === "improving") healthScore += 5;

  // ============ FIND TOP/WORST PERFORMERS ============

  let topPerformer: PortfolioSummary["topPerformer"] = null;
  let worstPerformer: PortfolioSummary["worstPerformer"] = null;

  const activeCampaignsWithData = active.filter((c) => c.impressions > 100);
  if (activeCampaignsWithData.length > 0) {
    const sorted = [...activeCampaignsWithData].sort((a, b) => b.ctr - a.ctr);
    const best = sorted[0];
    topPerformer = { name: best.name, metric: "CTR", value: `${best.ctr.toFixed(2)}%` };
    if (sorted.length > 1) {
      const worst = sorted[sorted.length - 1];
      worstPerformer = { name: worst.name, metric: "CTR", value: `${worst.ctr.toFixed(2)}%` };
    }
  }

  // Clamp health score
  healthScore = Math.max(0, Math.min(100, healthScore));
  const healthLabel = healthScore >= 80 ? "Saudável" : healthScore >= 60 ? "Atenção" : healthScore >= 40 ? "Crítico" : "Emergência";

  // Sort insights by severity
  const severityOrder: Record<InsightSeverity, number> = { critical: 0, warning: 1, info: 2, success: 3 };
  insights.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return {
    healthScore,
    healthLabel,
    totalCampaigns: campaigns.length,
    activeCampaigns: active.length,
    pausedCampaigns: paused.length,
    totalSpend,
    avgCpc,
    avgCtr,
    avgCostPerConv,
    topPerformer,
    worstPerformer,
    insights,
    spendTrend,
    performanceTrend,
  };
}

/**
 * Generate a text summary for PDF reports
 */
export function generateAnalysisSummary(summary: PortfolioSummary): string {
  const lines: string[] = [];

  lines.push(`Score de Saúde: ${summary.healthScore}/100 (${summary.healthLabel})`);
  lines.push(`${summary.activeCampaigns} campanhas ativas, ${summary.pausedCampaigns} pausadas`);

  if (summary.performanceTrend === "improving") lines.push("Tendência de performance: MELHORANDO");
  else if (summary.performanceTrend === "declining") lines.push("Tendência de performance: EM QUEDA — ação necessária");

  if (summary.topPerformer) lines.push(`Melhor campanha: ${summary.topPerformer.name} (${summary.topPerformer.metric}: ${summary.topPerformer.value})`);
  if (summary.worstPerformer) lines.push(`Campanha a revisar: ${summary.worstPerformer.name} (${summary.worstPerformer.metric}: ${summary.worstPerformer.value})`);

  const criticalCount = summary.insights.filter((i) => i.severity === "critical").length;
  const warningCount = summary.insights.filter((i) => i.severity === "warning").length;
  if (criticalCount > 0) lines.push(`${criticalCount} alerta(s) CRÍTICO(s) requerem ação imediata`);
  if (warningCount > 0) lines.push(`${warningCount} ponto(s) de atenção identificados`);

  return lines.join("\n");
}

// ═══════════════════════════════════════════════════════════
// Account-level AI Report — focused traffic manager analysis
// ═══════════════════════════════════════════════════════════

export interface AccountAIReport {
  accountName: string;
  healthScore: number;
  healthLabel: string;
  activeCampaigns: number;
  totalSpend: number;
  positives: string[];   // what's going well
  improvements: string[]; // what needs attention
  urgency: "critical" | "warning" | "ok";
}

/**
 * Generate a focused AI report per ad account — written like a traffic manager briefing.
 * Only considers ACTIVE campaigns (paused/completed are ignored).
 */
export function generateAccountReport(campaigns: AdCampaign[], accountName: string): AccountAIReport {
  const active = campaigns.filter((c) => c.status === "active");
  const positives: string[] = [];
  const improvements: string[] = [];

  if (active.length === 0) {
    return {
      accountName,
      healthScore: 50,
      healthLabel: "Sem campanhas ativas",
      activeCampaigns: 0,
      totalSpend: 0,
      positives: ["Nenhuma campanha ativa no momento"],
      improvements: [],
      urgency: "ok",
    };
  }

  const totalSpend = active.reduce((s, c) => s + c.spend, 0);
  const totalClicks = active.reduce((s, c) => s + c.clicks, 0);
  const totalImpressions = active.reduce((s, c) => s + c.impressions, 0);
  const totalConversions = active.reduce((s, c) => s + c.conversions, 0);
  const totalMessages = active.reduce((s, c) => s + (c.messages ?? 0), 0);

  const avgCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
  const avgCpc = totalClicks > 0 ? totalSpend / totalClicks : 0;
  const avgCostPerConv = totalConversions > 0 ? totalSpend / totalConversions : 0;

  let healthScore = 70;
  let hasCritical = false;

  // ── POSITIVES ──
  if (avgCtr >= 2) positives.push(`CTR excelente (${avgCtr.toFixed(2)}%) — criativos engajando bem`);
  else if (avgCtr >= 1) positives.push(`CTR saudável (${avgCtr.toFixed(2)}%) — dentro do esperado`);

  if (avgCpc < 2) positives.push(`CPC baixo (R$ ${avgCpc.toFixed(2)}) — boa eficiência de cliques`);
  else if (avgCpc < 4) positives.push(`CPC controlado (R$ ${avgCpc.toFixed(2)})`);

  if (totalConversions > 0 && avgCostPerConv < 15) positives.push(`Custo/conversão ótimo (R$ ${avgCostPerConv.toFixed(2)})`);
  else if (totalConversions > 0 && avgCostPerConv < 40) positives.push(`Custo/conversão aceitável (R$ ${avgCostPerConv.toFixed(2)})`);

  if (totalMessages > 0) {
    const costPerMsg = totalSpend / totalMessages;
    if (costPerMsg < 3) positives.push(`Custo/mensagem excelente (R$ ${costPerMsg.toFixed(2)})`);
  }

  active.forEach((c) => {
    if (c.ctr > 2.5 && c.cpc < 2) positives.push(`"${c.name}" com performance destaque — considere escalar`);
  });

  if (positives.length === 0) positives.push("Campanhas rodando normalmente");

  // ── IMPROVEMENTS ──
  active.forEach((c) => {
    if (c.totalBudget > 0 && c.spend / c.totalBudget > 0.95) {
      improvements.push(`"${c.name}" — verba esgotada (${((c.spend / c.totalBudget) * 100).toFixed(0)}%). Repor urgente!`);
      healthScore -= 15;
      hasCritical = true;
    } else if (c.totalBudget > 0 && c.spend / c.totalBudget > 0.85) {
      improvements.push(`"${c.name}" — verba acabando (${((c.spend / c.totalBudget) * 100).toFixed(0)}%). Avaliar reposição.`);
      healthScore -= 5;
    }

    if (c.impressions === 0 && c.spend === 0) {
      improvements.push(`"${c.name}" — campanha travada, sem entrega. Checar aprovação e pagamento.`);
      healthScore -= 20;
      hasCritical = true;
    }

    if (c.clicks > 20 && c.cpc > 8) {
      improvements.push(`"${c.name}" — CPC muito alto (R$ ${c.cpc.toFixed(2)}). Testar novos criativos.`);
      healthScore -= 5;
    } else if (c.clicks > 20 && c.cpc > 5) {
      improvements.push(`"${c.name}" — CPC acima do ideal (R$ ${c.cpc.toFixed(2)}). Revisar segmentação.`);
    }

    if (c.impressions > 2000 && c.ctr < 0.5) {
      improvements.push(`"${c.name}" — CTR crítico (${c.ctr.toFixed(2)}%). Trocar criativos com urgência.`);
      healthScore -= 5;
    } else if (c.impressions > 2000 && c.ctr < 1) {
      improvements.push(`"${c.name}" — CTR abaixo de 1%. Testar variações de copy/criativo.`);
    }

    if (c.conversions > 0 && c.costPerConversion > 80) {
      improvements.push(`"${c.name}" — custo/conversão alto (R$ ${c.costPerConversion.toFixed(2)}). Revisar funil.`);
      healthScore -= 5;
    }
  });

  // Trend check
  const allDaily = active.flatMap((c) => c.dailyMetrics);
  if (allDaily.length >= 4) {
    const mid = Math.floor(allDaily.length / 2);
    const firstClicks = allDaily.slice(0, mid).reduce((s, d) => s + d.clicks, 0);
    const secondClicks = allDaily.slice(mid).reduce((s, d) => s + d.clicks, 0);
    const firstImpr = allDaily.slice(0, mid).reduce((s, d) => s + d.impressions, 0);
    const secondImpr = allDaily.slice(mid).reduce((s, d) => s + d.impressions, 0);
    const firstCtr = firstImpr > 0 ? (firstClicks / firstImpr) * 100 : 0;
    const secondCtr = secondImpr > 0 ? (secondClicks / secondImpr) * 100 : 0;
    if (secondCtr < firstCtr * 0.85) {
      improvements.push("Tendência de queda no CTR geral — atenção redobrada nos criativos");
      healthScore -= 5;
    } else if (secondCtr > firstCtr * 1.15) {
      positives.push("Tendência de melhora no CTR — manter estratégia atual");
      healthScore += 5;
    }
  }

  healthScore = Math.max(0, Math.min(100, healthScore));
  const healthLabel = healthScore >= 80 ? "Saudável" : healthScore >= 60 ? "Atenção" : healthScore >= 40 ? "Crítico" : "Emergência";

  return {
    accountName,
    healthScore,
    healthLabel,
    activeCampaigns: active.length,
    totalSpend,
    positives,
    improvements,
    urgency: hasCritical ? "critical" : improvements.length > 0 ? "warning" : "ok",
  };
}

// ═══════════════════════════════════════════════════════════
// Daily Routine Alerts — top 5 most urgent accounts
// ═══════════════════════════════════════════════════════════

export interface DailyRoutineAlert {
  clientName: string;
  clientId: string;
  urgency: "critical" | "warning";
  summary: string; // one-line AI summary
  topIssue: string; // most important action
  healthScore: number;
}

/**
 * Generate max 5 daily routine alerts — prioritized by urgency.
 * Designed for the "Rotina Diária" tab in the traffic page.
 */
export function generateDailyRoutineAlerts(
  campaignsByClient: { clientId: string; clientName: string; campaigns: AdCampaign[] }[],
  maxAlerts: number = 5,
): DailyRoutineAlert[] {
  const alerts: DailyRoutineAlert[] = [];

  for (const { clientId, clientName, campaigns } of campaignsByClient) {
    const active = campaigns.filter((c) => c.status === "active");
    if (active.length === 0) continue;

    const report = generateAccountReport(active, clientName);
    if (report.urgency === "ok") continue;

    const topIssue = report.improvements[0] ?? "Revisar métricas gerais";

    // Build a concise one-line summary
    const parts: string[] = [];
    if (report.urgency === "critical") parts.push("AÇÃO URGENTE");
    parts.push(`Score ${report.healthScore}/100`);
    if (report.improvements.length > 1) parts.push(`${report.improvements.length} pontos de atenção`);

    alerts.push({
      clientName,
      clientId,
      urgency: report.urgency as "critical" | "warning",
      summary: parts.join(" · "),
      topIssue,
      healthScore: report.healthScore,
    });
  }

  // Sort: critical first, then by lowest health score
  alerts.sort((a, b) => {
    if (a.urgency !== b.urgency) return a.urgency === "critical" ? -1 : 1;
    return a.healthScore - b.healthScore;
  });

  return alerts.slice(0, maxAlerts);
}
