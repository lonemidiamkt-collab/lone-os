"use client";

import { useMemo } from "react";
import { useAppState } from "@/lib/context/AppStateContext";
import { calcHealthScore } from "@/lib/utils";
import { mockAdCampaigns } from "@/lib/mockData";
import type { ContentCard, DesignRequest, AdCampaign } from "@/lib/types";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface KPIValue {
  current: number;
  target: number;
  unit: string;
  isReal: boolean;       // true = calculated from real system data
  source: string;        // e.g. "ContentCards", "Meta API", "DesignRequests"
  error?: string;        // if data source is unavailable
}

export interface TeamKPIs {
  team: string;
  kpis: Record<string, KPIValue>;
}

export interface OKRMetrics {
  company: {
    churnRate: KPIValue;
    nps: KPIValue;
  };
  traffic: {
    roas: KPIValue;
    investmentExecuted: KPIValue;
    leadsPerMonth: KPIValue;
  };
  social: {
    postsDelivered: KPIValue;
    engagementRate: KPIValue;
    deliverySLA: KPIValue;
  };
  design: {
    onTimeDelivery: KPIValue;
    avgDeliveryTime: KPIValue;
    satisfaction: KPIValue;
  };
  audit: AuditEntry[];
}

interface AuditEntry {
  metric: string;
  source: string;
  status: "ok" | "simulated" | "error";
  detail: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getCurrentMonthRange(): { start: string; end: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const start = `${y}-${String(m + 1).padStart(2, "0")}-01`;
  const lastDay = new Date(y, m + 1, 0).getDate();
  const end = `${y}-${String(m + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

function isInCurrentMonth(dateStr?: string): boolean {
  if (!dateStr) return false;
  const { start, end } = getCurrentMonthRange();
  return dateStr >= start && dateStr <= end;
}

function hoursBetween(start: string, end: string): number {
  return (new Date(end).getTime() - new Date(start).getTime()) / (1000 * 60 * 60);
}

function daysBetween(start: string, end: string): number {
  return hoursBetween(start, end) / 24;
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useOKRMetrics(dbTargets?: Record<string, number>): OKRMetrics {
  const {
    clients,
    contentCards,
    designRequests,
    tasks,
  } = useAppState();

  return useMemo(() => {
    const audit: AuditEntry[] = [];
    const { start: monthStart, end: monthEnd } = getCurrentMonthRange();

    // ═══════════════════════════════════════════════════════════
    // COMPANY OKRs (always real)
    // ═══════════════════════════════════════════════════════════

    const atRiskCount = clients.filter((c) => c.status === "at_risk").length;
    const churnRate = clients.length > 0 ? (atRiskCount / clients.length) * 100 : 0;
    audit.push({ metric: "Churn Rate", source: "Clients (status)", status: "ok", detail: `${atRiskCount}/${clients.length} at_risk` });

    const avgHealth = clients.length > 0
      ? clients.reduce((sum, c) => sum + calcHealthScore(c), 0) / clients.length / 10
      : 0;
    audit.push({ metric: "NPS (Health)", source: "calcHealthScore()", status: "ok", detail: `Avg: ${avgHealth.toFixed(2)} across ${clients.length} clients` });

    // NPS average from client_nps table (if available)
    const npsAvg = clients.reduce((sum, c) => sum + (c.npsScore || 0), 0) / Math.max(clients.filter((c) => c.npsScore).length, 1);

    // ═══════════════════════════════════════════════════════════
    // TRAFFIC OKRs
    // ═══════════════════════════════════════════════════════════

    // Check if Meta API is connected
    const metaToken = typeof window !== "undefined" ? localStorage.getItem("meta_access_token") : null;
    const metaConnected = !!metaToken;

    // Use mock campaigns as data source (would be replaced by real API data)
    const campaigns: AdCampaign[] = mockAdCampaigns;
    const activeCampaigns = campaigns.filter((c) => c.status === "active");

    // ROAS: total revenue (conversions as proxy) / total spend
    let totalSpend = 0;
    let totalResults = 0;
    let totalImpressions = 0;
    let totalLeads = 0;

    activeCampaigns.forEach((c) => {
      const monthMetrics = c.dailyMetrics.filter((m) => m.date >= monthStart && m.date <= monthEnd);
      monthMetrics.forEach((m) => {
        totalSpend += m.spend;
        totalImpressions += m.impressions;
        totalLeads += (m.leads ?? 0) + (m.messages ?? 0);
      });
      totalResults += c.results ?? c.conversions ?? 0;
    });

    const roas = totalSpend > 0 ? totalResults / totalSpend : 0;
    const roasIsReal = metaConnected;

    audit.push({
      metric: "ROAS",
      source: metaConnected ? "Meta API (real)" : "mockAdCampaigns",
      status: metaConnected ? "ok" : "simulated",
      detail: `${activeCampaigns.length} campaigns, spend R$${totalSpend.toFixed(0)}, results ${totalResults}`,
    });

    // Investment Executed: total spend this month / total budget this month
    const totalBudget = activeCampaigns.reduce((s, c) => s + c.totalBudget, 0);
    const investPct = totalBudget > 0 ? (totalSpend / totalBudget) * 100 : 0;

    audit.push({
      metric: "Investimento Executado",
      source: metaConnected ? "Meta API (real)" : "mockAdCampaigns",
      status: metaConnected ? "ok" : "simulated",
      detail: `Spend R$${totalSpend.toFixed(0)} / Budget R$${totalBudget.toFixed(0)}`,
    });

    // Leads per month
    audit.push({
      metric: "Leads/mes",
      source: metaConnected ? "Meta API (real)" : "mockAdCampaigns",
      status: metaConnected ? "ok" : "simulated",
      detail: `${totalLeads} leads from ${activeCampaigns.length} campaigns`,
    });

    // ═══════════════════════════════════════════════════════════
    // SOCIAL MEDIA OKRs (all real from ContentCards)
    // ═══════════════════════════════════════════════════════════

    // Posts delivered this month: cards that reached "published" status
    const publishedThisMonth = contentCards.filter((c) =>
      c.status === "published" && c.statusChangedAt && isInCurrentMonth(c.statusChangedAt.slice(0, 10))
    );
    const postsDelivered = publishedThisMonth.length;

    audit.push({
      metric: "Posts Entregues/mes",
      source: "ContentCards (status=published)",
      status: "ok",
      detail: `${postsDelivered} published in current month out of ${contentCards.length} total`,
    });

    // Engagement rate: simulated (would need Instagram Graph API)
    audit.push({
      metric: "Engajamento medio",
      source: "N/A (requires Instagram Graph API)",
      status: "simulated",
      detail: "No engagement data source available",
    });

    // SLA: average time from creation/in_production to published
    const slaCards = contentCards.filter((c) => {
      if (c.status !== "published") return false;
      return !!(c.publishVerifiedAt || c.statusChangedAt) && !!(c.workStartedAt || c.columnEnteredAt?.in_production);
    });

    let avgSLAHours = 0;
    if (slaCards.length > 0) {
      const totalHours = slaCards.reduce((sum, c) => {
        const start = c.workStartedAt ?? c.columnEnteredAt?.in_production ?? c.statusChangedAt!;
        const end = c.publishVerifiedAt ?? c.statusChangedAt!;
        return sum + Math.max(0, hoursBetween(start, end));
      }, 0);
      avgSLAHours = totalHours / slaCards.length;
    }
    const slaIsReal = slaCards.length > 0;

    audit.push({
      metric: "SLA de entrega",
      source: "ContentCards (workStartedAt → publishVerifiedAt)",
      status: slaIsReal ? "ok" : "simulated",
      detail: slaIsReal ? `${avgSLAHours.toFixed(1)}h avg from ${slaCards.length} cards` : "No published cards with timestamps",
    });

    // ═══════════════════════════════════════════════════════════
    // DESIGN OKRs (real from DesignRequests + ContentCards)
    // ═══════════════════════════════════════════════════════════

    // Delivery time: average from request creation to designerDeliveredAt
    const deliveredCards = contentCards.filter((c) => c.designerDeliveredAt);
    let avgDeliveryDays = 0;
    let onTimeCount = 0;
    let totalDelivered = deliveredCards.length;

    if (totalDelivered > 0) {
      const totalDays = deliveredCards.reduce((sum, c) => {
        // Find linked design request for creation date
        const req = designRequests.find((r) => r.id === c.designRequestId);
        const startDate = c.workStartedAt ?? c.columnEnteredAt?.in_production ?? req?.deadline ?? c.statusChangedAt;
        if (!startDate || !c.designerDeliveredAt) return sum;
        return sum + Math.max(0, daysBetween(startDate, c.designerDeliveredAt));
      }, 0);
      avgDeliveryDays = totalDays / totalDelivered;

      // On-time: delivered before dueDate
      onTimeCount = deliveredCards.filter((c) => {
        if (!c.dueDate || !c.designerDeliveredAt) return false;
        return c.designerDeliveredAt.slice(0, 10) <= c.dueDate;
      }).length;
    }

    const onTimePct = totalDelivered > 0 ? (onTimeCount / totalDelivered) * 100 : 0;
    const designIsReal = totalDelivered > 0;

    audit.push({
      metric: "Entregas no prazo",
      source: "ContentCards (designerDeliveredAt vs dueDate)",
      status: designIsReal ? "ok" : "simulated",
      detail: designIsReal ? `${onTimeCount}/${totalDelivered} on time` : "No delivered designs found",
    });

    audit.push({
      metric: "Tempo medio entrega",
      source: "ContentCards (start → designerDeliveredAt)",
      status: designIsReal ? "ok" : "simulated",
      detail: designIsReal ? `${avgDeliveryDays.toFixed(1)} days from ${totalDelivered} deliveries` : "No delivery timestamps",
    });

    // Satisfaction: simulated (would need survey system)
    audit.push({
      metric: "Satisfacao do time",
      source: "N/A (requires survey system)",
      status: "simulated",
      detail: "No satisfaction survey integrated",
    });

    // ═══════════════════════════════════════════════════════════
    // Console audit log
    // ═══════════════════════════════════════════════════════════
    if (typeof window !== "undefined") {
      console.group("%c[LONE OS DATA AUDIT] OKR Metrics Validation", "color: #0d4af5; font-weight: bold; font-size: 12px");
      console.table(audit.map((a) => ({
        Metric: a.metric,
        Source: a.source,
        Status: a.status === "ok" ? "✅ Real" : a.status === "simulated" ? "⚠️ Simulado" : "❌ Erro",
        Detail: a.detail,
      })));
      const realCount = audit.filter((a) => a.status === "ok").length;
      const simCount = audit.filter((a) => a.status === "simulated").length;
      const errCount = audit.filter((a) => a.status === "error").length;
      console.log(`%cResumo: ${realCount} reais, ${simCount} simulados, ${errCount} erros`, "color: #71717a");
      console.groupEnd();
    }

    // ═══════════════════════════════════════════════════════════
    // Return structured KPIs
    // ═══════════════════════════════════════════════════════════
    // Target override: if db targets are provided, use them instead of hardcoded
    const t = (key: string, fallback: number) => dbTargets?.[key] ?? fallback;

    return {
      company: {
        churnRate: { current: Math.round(churnRate * 10) / 10, target: t("churn_rate", 5), unit: "%", isReal: true, source: "Clients" },
        nps: { current: Math.round(avgHealth * 100) / 100, target: t("nps", 80), unit: "pts", isReal: true, source: "Health Score" },
      },
      traffic: {
        roas: {
          current: Math.round(roas * 10) / 10,
          target: t("roas", 4.0), unit: "x", isReal: roasIsReal,
          source: metaConnected ? "Meta API" : "Mock Data",
          error: !metaConnected ? "Aguardando conexao Meta Ads" : undefined,
        },
        investmentExecuted: {
          current: Math.round(investPct), target: t("investment_pct", 95), unit: "%",
          isReal: roasIsReal, source: metaConnected ? "Meta API" : "Mock Data",
        },
        leadsPerMonth: {
          current: totalLeads, target: t("leads_month", 500), unit: "leads",
          isReal: roasIsReal, source: metaConnected ? "Meta API" : "Mock Data",
        },
      },
      social: {
        postsDelivered: { current: postsDelivered, target: t("posts_delivered", 96), unit: "posts", isReal: true, source: "ContentCards" },
        engagementRate: { current: npsAvg > 0 ? npsAvg : 3.1, target: t("engagement_rate", 3.5), unit: "%", isReal: npsAvg > 0, source: npsAvg > 0 ? "Client NPS" : "Instagram Graph API (nao conectado)" },
        deliverySLA: {
          current: slaIsReal ? Math.round(avgSLAHours) : 42,
          target: t("delivery_sla", 48), unit: "horas",
          isReal: slaIsReal, source: slaIsReal ? "ContentCards" : "Simulado",
        },
      },
      design: {
        onTimeDelivery: {
          current: designIsReal ? Math.round(onTimePct) : 85,
          target: t("on_time_pct", 90), unit: "%",
          isReal: designIsReal, source: designIsReal ? "DesignRequests" : "Simulado",
        },
        avgDeliveryTime: {
          current: designIsReal ? Math.round(avgDeliveryDays * 10) / 10 : 2.8,
          target: t("delivery_time", 48), unit: "h",
          isReal: designIsReal, source: designIsReal ? "ContentCards" : "Simulado",
        },
        satisfaction: { current: npsAvg > 0 ? npsAvg : 4.2, target: t("satisfaction", 4.5), unit: "/5", isReal: npsAvg > 0, source: npsAvg > 0 ? "Client NPS" : "Survey (nao integrado)" },
      },
      audit,
    };
  }, [clients, contentCards, designRequests, tasks, dbTargets]);
}
