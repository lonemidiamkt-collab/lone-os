"use client";

import { useMemo } from "react";
import { useAppState } from "@/lib/context/AppStateContext";
import { calcHealthScore, spDateStr } from "@/lib/utils";
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
    activeClients: KPIValue;
    newClients: KPIValue;
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

    // Active clients: em operacao (good/average/at_risk) — exclui onboarding/draft
    const activeClientsCount = clients.filter((c) => c.status === "good" || c.status === "average" || c.status === "at_risk").length;
    audit.push({ metric: "Clientes Ativos", source: "Clients (status)", status: "ok", detail: `${activeClientsCount} em operacao de ${clients.length}` });

    // New clients this month (por created_at — fonte confiavel de entrada)
    const newClientsCount = clients.filter((c) => isInCurrentMonth((c.createdAt ?? "").slice(0, 10))).length;
    audit.push({ metric: "Novos Clientes/mes", source: "Clients (created_at)", status: "ok", detail: `${newClientsCount} entradas no mes` });

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
    let cardsComInicio = 0;
    let onTimeCount = 0;
    let totalDelivered = deliveredCards.length;

    if (totalDelivered > 0) {
      // ── O INÍCIO TEM QUE SER UM INÍCIO ──────────────────────────────
      //
      // A versão anterior caía em `req?.deadline` quando não havia marcação de início — ou seja,
      // usava o PRAZO como data de começo. Como o prazo costuma ser depois da entrega, a conta
      // dava negativo, o Math.max(0, …) transformava em zero, e a tela exibia "tempo médio 0,0
      // dias" como se o designer entregasse instantaneamente.
      //
      // Medido em 02/09: de 69 artes entregues, ZERO têm `work_started_at` e só 10 têm
      // `column_entered_at.in_production`. As outras 59 não têm início nenhum — e a resposta certa
      // para elas é não saber, não inventar.
      const comInicio = deliveredCards.filter((c) => {
        const ini = c.workStartedAt ?? c.columnEnteredAt?.in_production;
        return !!ini && !!c.designerDeliveredAt && new Date(ini) <= new Date(c.designerDeliveredAt);
      });
      const totalDays = comInicio.reduce((sum, c) => {
        const ini = (c.workStartedAt ?? c.columnEnteredAt?.in_production)!;
        return sum + daysBetween(ini, c.designerDeliveredAt!);
      }, 0);
      avgDeliveryDays = comInicio.length > 0 ? totalDays / comInicio.length : 0;
      cardsComInicio = comInicio.length;

      // On-time: delivered before dueDate
      onTimeCount = deliveredCards.filter((c) => {
        if (!c.dueDate || !c.designerDeliveredAt) return false;
        return spDateStr(c.designerDeliveredAt) <= c.dueDate;
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

    const tempoIsReal = cardsComInicio > 0;
    audit.push({
      metric: "Tempo medio entrega",
      source: "ContentCards (workStartedAt/in_production → designerDeliveredAt)",
      status: tempoIsReal ? "ok" : "simulated",
      detail: tempoIsReal
        ? `${avgDeliveryDays.toFixed(1)} dias de ${cardsComInicio} artes COM início marcado (de ${totalDelivered} entregues)`
        : `nenhuma das ${totalDelivered} artes tem início marcado — ninguém usa "iniciar" no board`,
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
        // Saúde média na escala 0–100 (antes vinha 0–10 contra meta 80 → parecia quebrado)
        // Não é NPS: ninguém foi perguntado "de 0 a 10, o quanto você recomendaria". É a saúde
        // média em escala 0–100. O título do OKR já foi trocado para "Saúde média dos clientes";
        // a fonte reforça, para o número não ser lido como pesquisa.
        nps: { current: Math.round(avgHealth * 10), target: t("nps", 80), unit: "pts", isReal: true, source: "DERIVADO da saúde média (não é NPS: não há pesquisa)" },
        activeClients: { current: activeClientsCount, target: t("active_clients", 40), unit: "", isReal: true, source: "Clients" },
        newClients: { current: newClientsCount, target: t("new_clients", 3), unit: "", isReal: true, source: "Clients" },
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
        // Conta cards marcados como publicados NO BOARD — que fica atrás do que foi ao ar. Em
        // agosto o board registrou 34 e o Instagram teve 349. O número não é inventado, mas mede
        // registro, não publicação, e o nome não deixava isso claro.
        postsDelivered: { current: postsDelivered, target: t("posts_delivered", 96), unit: "posts", isReal: true, source: "ContentCards (cards marcados como publicados — o board fica atrás do Instagram; veja o Fechamento do mês)" },
        // ENGAJAMENTO NÃO É SAÚDE DO CLIENTE. A versão anterior punha `npsAvg` — a saúde média
        // da carteira — no lugar da taxa de engajamento e marcava como REAL, com fonte "Client
        // NPS". São coisas sem relação: engajamento é curtida e comentário no Instagram; saúde é
        // o quanto o relacionamento vai bem. Um cliente satisfeito com post de 0,5% de
        // engajamento existe, e o contrário também.
        //
        // Os dados de engajamento EXISTEM em client_ig_posts (like_count, comments_count), mas
        // ainda não são agregados aqui. Até isso ser feito, o honesto é dizer que não há dado.
        engagementRate: { current: 0, target: t("engagement_rate", 3.5), unit: "%", isReal: false, source: "Sem dado: curtidas/comentários existem em client_ig_posts mas ainda não são agregados aqui" },
        deliverySLA: {
          // O 42 fixo era um número escolhido para caber abaixo da meta de 48h — o painel ficava
          // verde sem nada ter sido medido. Zero com a fonte explicando é pior de olhar e melhor
          // de confiar.
          current: slaIsReal ? Math.round(avgSLAHours) : 0,
          target: t("delivery_sla", 48), unit: "horas",
          isReal: slaIsReal,
          source: slaIsReal ? "ContentCards" : 'Sem dado: exige work_started_at, que nunca é preenchido (0 de 631 cards)',
        },
      },
      design: {
        onTimeDelivery: {
          // Sem entrega registrada não há pontualidade — 85 era um número plausível inventado.
          current: designIsReal ? Math.round(onTimePct) : 0,
          target: t("on_time_pct", 90), unit: "%",
          isReal: designIsReal, source: designIsReal ? "DesignRequests" : "Simulado",
        },
        avgDeliveryTime: {
          // current está em DIAS — o target/unit também precisam ser em dias, senão comparava 2.8
          // dias contra "48h" e o KPI ficava sempre verde.
          // Sem início marcado não há tempo de produção: 0 seria mentira, e o antigo 2.8 fixo
          // também. Vale o que dá para medir, e a fonte diz de quantas artes.
          current: tempoIsReal ? Math.round(avgDeliveryDays * 10) / 10 : 0,
          target: t("delivery_time", 3), unit: "dias",
          isReal: tempoIsReal,
          source: tempoIsReal
            ? `ContentCards — ${cardsComInicio} de ${totalDelivered} artes têm início marcado`
            : 'Sem dado: nenhuma arte tem início marcado no board ("iniciar" nunca é usado)',
        },
        // Satisfação real derivada da saúde dos clientes (0–5). Sem pesquisa dedicada, a saúde
        // média é o proxy real disponível — nunca mais o placeholder 4.2.
        // PROXY declarado, não pesquisa. Não existe pesquisa de satisfação no sistema; o número é
        // a saúde média convertida para escala 0–5. Continua "real" (vem de dado medido), mas a
        // fonte precisa dizer que é derivado — senão "4,5/5" passa por resposta de cliente.
        satisfaction: { current: Math.round((avgHealth / 2) * 10) / 10, target: t("satisfaction", 4.5), unit: "/5", isReal: true, source: "DERIVADO da saúde média dos clientes (não há pesquisa de satisfação)" },
      },
      audit,
    };
  }, [clients, contentCards, designRequests, tasks, dbTargets]);
}
