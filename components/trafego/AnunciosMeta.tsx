"use client";

// Aba "Anúncios Meta" do Tráfego (Leva 4). Lê o que o SERVIDOR já leu da Meta — o navegador não tem
// token e não chama a Graph API. Antes: ~3 chamadas por campanha a cada visita, tudo zerava ao trocar
// de tela, e com o token vencido sobrava número velho com cara de novo.
//
// Fonte: GET /api/trafego/anuncios (tabela meta_campaign_cache). "Atualizar agora" pede ao servidor
// (POST, no máximo a cada 5 min por cliente+período). Dados e regras em ./anuncios/useAnuncios.ts e
// lib/trafego/anuncios.ts.

import { useState, useMemo, useEffect } from "react";
import { toast } from "sonner";
import {
  TrendingUp, AlertTriangle, CheckCircle, Users, Calendar, X, Search,
  MessageCircle, Star, ArrowUpRight, ArrowDownRight, Minus,
  Check, Megaphone, Eye, MousePointerClick, DollarSign, Target,
  Pause, AlertCircle, Download, ChevronDown, ChevronUp,
  Settings2, Zap, Activity, TrendingDown, RefreshCw,
  Brain, ShieldAlert, Sparkles, CircleDot, Bell, FolderDown, Loader2, Facebook, Info,
} from "lucide-react";
import { useRole } from "@/lib/context/RoleContext";
import { todaySP } from "@/lib/utils";
import { chamar } from "@/lib/api/chamar";
import type { Client, AdCampaign } from "@/lib/types";
import { SpendAreaChart, HealthScoreRing } from "@/components/AdCharts";
import type { DailyChartPoint } from "@/components/AdCharts";
import AdsInsightCard from "@/components/AdsInsightCard";
import { diasAntes } from "@/components/traffic/investimento";
import { exportTrafficReportPdf, exportClientReportPdf, buildTrafficReportData, exportAllTrafficReportsZip } from "@/lib/exportTrafficPdf";
import { analyzeCampaigns, generateAccountReport } from "@/lib/ai/campaignAnalyzer";
import type { PortfolioSummary } from "@/lib/ai/campaignAnalyzer";
import {
  chavePeriodo, lerPeriodo, diasDoPeriodo, rotuloPeriodo, rotuloAtualizado, conexaoRecusada,
  ERRO_TOKEN, PRESETS_DIAS, type Periodo, type EstadoConexao,
} from "@/lib/trafego/anuncios";
import AvisoConexaoMeta from "./AvisoConexaoMeta";
import ResumoCarteira from "./anuncios/ResumoCarteira";
import { useAnuncios } from "./anuncios/useAnuncios";

// ─── Formatação ──────────────────────────────────────────────────────────────

function formatNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return Math.round(n).toString();
}

function formatCurrency(n: number): string {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Campanha cujo insight a Meta não devolveu — mostrar "sem dados", nunca R$0. */
function insightFalhou(c: AdCampaign): boolean {
  return !!c.insightsFailed;
}

/** Custo zero sem dado vira "N/A" (não "R$ 0,00"). */
function fmtMetric(v: number, prefix?: string): string {
  if (v === 0 && prefix === "R$") return "N/A";
  return prefix ? `${prefix} ${formatCurrency(v)}` : formatNumber(v);
}

const fmtData = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}`;

type MetricKey = "spend" | "impressions" | "reach" | "clicks" | "conversions" | "leads" | "messages" | "ctr" | "cpc" | "cpm" | "costPerConv" | "costPerLead" | "costPerMessage" | "costPerResult";

const ALL_METRICS: { key: MetricKey; label: string; icon: typeof DollarSign; format: (v: number) => string }[] = [
  { key: "spend", label: "Gasto Total", icon: DollarSign, format: (v) => `R$ ${formatCurrency(v)}` },
  { key: "impressions", label: "Impressões", icon: Eye, format: (v) => formatNumber(v) },
  { key: "reach", label: "Alcance", icon: Users, format: (v) => formatNumber(v) },
  { key: "clicks", label: "Cliques", icon: MousePointerClick, format: (v) => formatNumber(v) },
  { key: "conversions", label: "Conversões", icon: Target, format: (v) => Math.round(v).toString() },
  { key: "leads", label: "Leads", icon: Target, format: (v) => v > 0 ? Math.round(v).toString() : "N/A" },
  { key: "messages", label: "Mensagens", icon: MessageCircle, format: (v) => v > 0 ? formatNumber(v) : "N/A" },
  { key: "ctr", label: "CTR Médio", icon: TrendingUp, format: (v) => `${v.toFixed(2)}%` },
  { key: "cpc", label: "CPC Médio", icon: MousePointerClick, format: (v) => fmtMetric(v, "R$") },
  { key: "cpm", label: "CPM Médio", icon: Eye, format: (v) => fmtMetric(v, "R$") },
  { key: "costPerConv", label: "Custo/Conversão", icon: Target, format: (v) => fmtMetric(v, "R$") },
  { key: "costPerLead", label: "Custo/Lead (CPL)", icon: Target, format: (v) => fmtMetric(v, "R$") },
  { key: "costPerMessage", label: "CPA (Melhor Conjunto)", icon: MessageCircle, format: (v) => v > 0 ? fmtMetric(v, "R$") : "—" },
  { key: "costPerResult", label: "Custo/Resultado", icon: Zap, format: (v) => fmtMetric(v, "R$") },
];

const DEFAULT_VISIBLE_METRICS: MetricKey[] = ["spend", "impressions", "clicks", "leads", "messages", "costPerLead", "costPerMessage", "ctr"];

const OBJECTIVE_LABELS: Record<string, string> = {
  messages: "Mensagens", traffic: "Tráfego", conversions: "Conversões",
  reach: "Alcance", engagement: "Engajamento", leads: "Leads",
};

const STATUS_LABELS: Record<string, { label: string; cls: string; icon: typeof CheckCircle }> = {
  active: { label: "Ativa", cls: "text-primary bg-primary/10 border-primary/20", icon: CheckCircle },
  paused: { label: "Pausada", cls: "text-muted-foreground bg-muted border-border", icon: Pause },
  completed: { label: "Finalizada", cls: "text-muted-foreground bg-muted border-border", icon: Check },
  error: { label: "Erro", cls: "text-destructive bg-destructive/10 border-destructive/20", icon: AlertCircle },
};

const SEVERITY_CONFIG: Record<string, { color: string; bg: string; border: string; icon: typeof AlertCircle }> = {
  critical: { color: "text-destructive", bg: "bg-destructive/5", border: "border-destructive/20", icon: AlertCircle },
  warning: { color: "text-primary", bg: "bg-primary/5", border: "border-primary/20", icon: AlertTriangle },
  info: { color: "text-primary", bg: "bg-primary/5", border: "border-primary/15", icon: CircleDot },
  success: { color: "text-primary", bg: "bg-primary/5", border: "border-primary/15", icon: Sparkles },
};

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// ─── Componente ──────────────────────────────────────────────────────────────

export default function AnunciosMeta({
  clients,
  currentUser,
  onRequestCreative,
}: {
  clients: Client[];
  currentUser: string;
  onRequestCreative?: (campaign: AdCampaign, client: Client) => void;
}) {
  const { role } = useRole();
  const isGestao = role === "admin" || role === "manager";

  // Contas ocultas (compartilhadas pelo time; a mesma lista que o Início e o Hoje respeitam).
  const [ocultas, setOcultas] = useState<Set<string>>(new Set());
  useEffect(() => {
    let vivo = true;
    chamar<{ ids?: string[] }>("/api/traffic/hidden-accounts").then((r) => {
      if (vivo && Array.isArray(r.data?.ids)) setOcultas(new Set(r.data!.ids));
    });
    return () => { vivo = false; };
  }, []);

  const linked = useMemo(
    () => clients.filter((c) => !!c.metaAdAccountId && !ocultas.has(c.metaAdAccountId)),
    [clients, ocultas],
  );
  const linkedIds = useMemo(() => linked.map((c) => c.id).sort(), [linked]);

  const [selectedClient, setSelectedClient] = useState<string>("all");
  // Workspace com um cliente só abre direto nele; trocar de workspace não deixa a aba num cliente fora da lista.
  useEffect(() => {
    if (selectedClient !== "all" && !linked.some((c) => c.id === selectedClient)) setSelectedClient("all");
    else if (selectedClient === "all" && linked.length === 1) setSelectedClient(linked[0].id);
  }, [linked, selectedClient]);

  const [clientSearch, setClientSearch] = useState("");
  const [expandedCampaign, setExpandedCampaign] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [visibleMetrics, setVisibleMetrics] = useState<MetricKey[]>(DEFAULT_VISIBLE_METRICS);
  const [showMetricConfig, setShowMetricConfig] = useState(false);
  const [chartMetrics, setChartMetrics] = useState<string[]>(["spend", "conversions"]);

  // Período
  const [periodo, setPeriodo] = useState<Periodo>({ tipo: "preset", dias: 7 });
  const [showCustomRange, setShowCustomRange] = useState(false);
  const [pendingFrom, setPendingFrom] = useState("");
  const [pendingTo, setPendingTo] = useState("");
  const chave = chavePeriodo(periodo);
  const hoje = todaySP();
  // Preset da Meta (last_Nd) = os N dias ANTES de hoje; intervalo = as datas escolhidas.
  const rangeStartStr = periodo.tipo === "preset" ? diasAntes(hoje, periodo.dias) : periodo.de;
  const rangeEndStr = periodo.tipo === "preset" ? diasAntes(hoje, 1) : periodo.ate;
  const actualPeriodDays = diasDoPeriodo(periodo);
  const periodLabel = `${fmtData(rangeStartStr)} – ${fmtData(rangeEndStr)}`;

  const aberto = selectedClient === "all" ? null : selectedClient;
  const dados = useAnuncios({ periodo: chave, clientesIds: linkedIds, selecionado: aberto });
  const { detalhe, conexao, agora } = dados;

  const campanhas: AdCampaign[] = useMemo(
    () => (detalhe && detalhe.clientId === aberto ? detalhe.campanhas ?? [] : []),
    [detalhe, aberto],
  );

  // Estado da conexão que a TELA mostra: token vencido/ausente, ou a Meta recusou na última tentativa.
  const estadoTela: EstadoConexao = useMemo(() => {
    if (!conexao) return "ok";
    if (conexao.estado !== "ok") return conexao.estado;
    const itens = [...dados.resumo.values(), ...(detalhe ? [detalhe] : [])];
    return conexaoRecusada(itens) ? "expirada" : "ok";
  }, [conexao, dados.resumo, detalhe]);

  const filteredCampaigns = campanhas.filter((c) => statusFilter === "all" || c.status === statusFilter);

  // ── Agregados (os números da Meta já vêm filtrados pelo período) ──────────
  const agg = filteredCampaigns.reduce((acc, c) => {
    if (insightFalhou(c)) return acc;
    acc.spend += c.spend;
    acc.impressions += c.impressions;
    acc.reach += c.reach;
    acc.clicks += c.clicks;
    acc.conversions += c.conversions;
    acc.messages += c.messages ?? 0;
    acc.leads += c.leads ?? 0;
    acc.results += c.results ?? 0;
    return acc;
  }, { spend: 0, impressions: 0, reach: 0, clicks: 0, conversions: 0, messages: 0, leads: 0, results: 0 });

  const totalSpend = agg.spend;
  // Média ponderada do ctr/cpc da Meta por campanha (cliques em link, não reações/comentários).
  const avgCtr = agg.impressions > 0 ? filteredCampaigns.reduce((s, c) => s + c.ctr * c.impressions, 0) / agg.impressions : 0;
  const avgCpc = agg.clicks > 0 ? filteredCampaigns.reduce((s, c) => s + c.cpc * c.clicks, 0) / agg.clicks : 0;
  const avgCpm = agg.impressions > 0 ? (totalSpend / agg.impressions) * 1000 : 0;

  // CPA campeão: o conjunto mais barato entre as campanhas filtradas (não a média da carteira).
  const championAdSet = (() => {
    const comCampeao = filteredCampaigns.filter((c) => c.cheapestAdSetCostPerMessage && c.cheapestAdSetCostPerMessage > 0);
    if (comCampeao.length === 0) return null;
    return comCampeao.reduce((best, c) => (c.cheapestAdSetCostPerMessage! < best.cheapestAdSetCostPerMessage! ? c : best));
  })();
  const championAdSetName = championAdSet?.cheapestAdSetName ?? null;

  const metricValues: Record<MetricKey, number> = {
    spend: totalSpend, impressions: agg.impressions, reach: agg.reach,
    clicks: agg.clicks, conversions: agg.conversions, messages: agg.messages,
    leads: agg.leads, ctr: avgCtr, cpc: avgCpc, cpm: avgCpm,
    costPerConv: agg.conversions > 0 ? totalSpend / agg.conversions : 0,
    costPerMessage: championAdSet?.cheapestAdSetCostPerMessage ?? 0,
    costPerLead: agg.leads > 0 ? totalSpend / agg.leads : 0,
    costPerResult: agg.results > 0 ? totalSpend / agg.results : 0,
  };

  const dailyChartData = useMemo((): DailyChartPoint[] => {
    const map = new Map<string, { spend: number; impressions: number; clicks: number; conversions: number }>();
    filteredCampaigns.forEach((c) => {
      c.dailyMetrics
        .filter((dm) => dm.date >= rangeStartStr && dm.date <= rangeEndStr)
        .forEach((dm) => {
          const e = map.get(dm.date) ?? { spend: 0, impressions: 0, clicks: 0, conversions: 0 };
          e.spend += dm.spend; e.impressions += dm.impressions; e.clicks += dm.clicks; e.conversions += dm.conversions;
          map.set(dm.date, e);
        });
    });
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, d]) => ({ date, label: `${date.slice(8)}/${date.slice(5, 7)}`, spend: Math.round(d.spend * 100) / 100, impressions: d.impressions, clicks: d.clicks, conversions: d.conversions }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campanhas, statusFilter, rangeStartStr, rangeEndStr]);

  const aiAnalysis = useMemo<PortfolioSummary | null>(() => {
    if (filteredCampaigns.length === 0) return null;
    return analyzeCampaigns(filteredCampaigns, actualPeriodDays);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campanhas, statusFilter, actualPeriodDays]);

  const [dismissedInsights, setDismissedInsights] = useState<Set<string>>(new Set());
  const [showAllInsights, setShowAllInsights] = useState(false);
  const activeInsights = aiAnalysis?.insights.filter((i) => !dismissedInsights.has(i.id)) ?? [];
  const criticalInsights = activeInsights.filter((i) => i.severity === "critical");
  const warningInsights = activeInsights.filter((i) => i.severity === "warning");

  const clienteAberto = aberto ? linked.find((c) => c.id === aberto) ?? null : null;
  const accountReport = useMemo(() => {
    if (!clienteAberto || filteredCampaigns.length === 0) return null;
    return generateAccountReport(filteredCampaigns, clienteAberto.name);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteAberto, campanhas, statusFilter]);

  // ── PDFs ────────────────────────────────────────────────────────────────
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingAll, setExportingAll] = useState(false);
  const [exportAllProgress, setExportAllProgress] = useState("");
  const [exportAllError, setExportAllError] = useState<string | null>(null);

  const exportarUm = async (tipo: "interno" | "cliente") => {
    if (exportingPdf || !clienteAberto) return;
    if (filteredCampaigns.some(insightFalhou)) {
      toast.error("Há campanha sem dados da Meta — o PDF sairia com número faltando. Clique em Atualizar agora e tente de novo.");
      return;
    }
    setExportingPdf(true);
    try {
      const reportData = buildTrafficReportData(
        clienteAberto.name, filteredCampaigns, periodLabel, undefined,
        detalhe?.demografia ?? undefined, undefined, actualPeriodDays,
      );
      await (tipo === "interno" ? exportTrafficReportPdf(reportData) : exportClientReportPdf(reportData));
    } finally {
      setExportingPdf(false);
    }
  };

  const handleExportAllPdf = async () => {
    setExportAllError(null);
    setExportingAll(true);
    try {
      if (linked.length === 0) {
        setExportAllError("Nenhum cliente com conta Meta vinculada neste workspace.");
        return;
      }
      setExportAllProgress("Lendo os anúncios guardados…");
      const { itens, erro } = await dados.lerCompletos(linked.map((c) => c.id));
      if (erro) { setExportAllError(erro); setExportAllProgress(""); return; }

      const foraDoZip: string[] = [];
      const reports: { clientName: string; data: import("@/lib/exportTrafficPdf").TrafficReportData }[] = [];
      for (const it of itens) {
        const client = linked.find((c) => c.id === it.clientId);
        if (!client) continue;
        const camps = it.campanhas ?? [];
        if (!it.sincronizadoEm) { foraDoZip.push(`${client.name}: sem leitura da Meta neste período`); continue; }
        // Relatório com campanha faltando mente pro cliente: fica fora do ZIP e é avisado.
        const falhas = camps.filter(insightFalhou).length;
        if (falhas > 0) { foraDoZip.push(`${client.name}: ${falhas} campanha(s) sem dados da Meta`); continue; }
        if (camps.length === 0) continue;
        try {
          reports.push({
            clientName: client.name,
            data: buildTrafficReportData(client.name, camps, periodLabel, undefined, it.demografia ?? undefined, { startStr: rangeStartStr, endStr: rangeEndStr }, actualPeriodDays),
          });
        } catch (err) {
          console.error(`[ZIP] Erro ao montar o relatório de ${client.name}:`, err);
          foraDoZip.push(`${client.name}: erro ao montar o relatório`);
        }
      }

      if (reports.length === 0) {
        setExportAllError(`Nenhum cliente com campanhas lidas no período.${foraDoZip.length ? ` ${foraDoZip.join("; ")}.` : ""} Use “Atualizar todos” na visão Todos e tente de novo.`);
        setExportAllProgress("");
        return;
      }
      setExportAllProgress(`Gerando PDFs… 0/${reports.length}`);
      await exportAllTrafficReportsZip(reports, (current, total, clientName) => {
        setExportAllProgress(`Gerando PDF ${current}/${total} — ${clientName}`);
      });
      setExportAllProgress("");
      if (foraDoZip.length) setExportAllError(`Ficaram fora do ZIP: ${foraDoZip.join("; ")}.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[ZIP] Erro inesperado ao gerar relatórios:", err);
      setExportAllError(`Erro ao gerar relatórios: ${msg}`);
      setExportAllProgress("");
    } finally {
      setExportingAll(false);
    }
  };

  const toggleMetric = (key: MetricKey) => setVisibleMetrics((prev) => prev.includes(key) ? prev.filter((m) => m !== key) : [...prev, key]);
  const toggleChartMetric = (key: string) => setChartMetrics((prev) => prev.includes(key) ? prev.filter((m) => m !== key) : [...prev, key]);

  const pills = linked.filter((c) => !clientSearch || norm(c.name).includes(norm(clientSearch)));
  const atualizandoAberto = !!aberto && (dados.atualizando.has(aberto) || !!detalhe?.atualizando);
  const temLeitura = !!detalhe?.sincronizadoEm;

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="animate-fade-in space-y-6">
      {estadoTela !== "ok" && <AvisoConexaoMeta estado={estadoTela} />}

      {dados.erroCarga && (
        <div className="flex items-center gap-3 rounded-xl border border-lone-danger-border bg-lone-danger-bg px-4 py-3 text-xs text-lone-danger">
          <AlertTriangle size={14} className="shrink-0" />
          <span className="flex-1">{dados.erroCarga}</span>
          <button onClick={() => dados.recarregar()} className="font-medium underline hover:no-underline">Tentar de novo</button>
        </div>
      )}

      {!dados.persistente && isGestao && (
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Info size={12} /> As leituras ficam só na memória do servidor até a migração 20260924160000 ser aplicada — somem no próximo deploy.
        </p>
      )}

      {/* ═══ FILTROS ═══ */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar cliente..."
            value={clientSearch}
            onChange={(e) => setClientSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter" || pills.length === 0) return;
              setSelectedClient(pills[0].id);
              setClientSearch("");
            }}
            className="w-[180px] rounded-lg border border-border bg-muted py-1.5 pl-8 pr-7 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
          />
          {clientSearch && (
            <button onClick={() => setClientSearch("")} aria-label="Limpar busca" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X size={11} />
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <button
            onClick={() => setSelectedClient("all")}
            className={`rounded-lg border px-2.5 py-1 text-xs transition-all ${selectedClient === "all" ? "border-primary/30 bg-primary/10 font-medium text-primary" : "border-transparent bg-muted text-muted-foreground hover:text-foreground"}`}
          >
            Todos
          </button>
          {pills.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedClient(c.id)}
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition-all ${selectedClient === c.id ? "border-primary/30 bg-primary/10 font-medium text-primary" : "border-transparent bg-muted text-muted-foreground hover:border-border/50 hover:text-foreground"}`}
            >
              <Facebook size={9} className={selectedClient === c.id ? "text-primary" : "text-primary opacity-70"} />
              <span className="max-w-[130px] truncate">{c.name}</span>
            </button>
          ))}
          {clientSearch && pills.length === 0 && <span className="px-1 text-xs italic text-muted-foreground">Nenhum cliente encontrado</span>}
        </div>
        {aberto && (
          <div className="flex items-center gap-1 rounded-lg bg-muted p-0.5">
            {[{ key: "all", label: "Todas" }, { key: "active", label: "Ativas" }, { key: "paused", label: "Pausadas" }, { key: "completed", label: "Finalizadas" }].map((s) => (
              <button
                key={s.key}
                onClick={() => setStatusFilter(s.key)}
                className={`rounded-md px-2.5 py-1.5 text-xs transition-colors ${statusFilter === s.key ? "bg-card text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2">
          <Calendar size={14} className="flex-shrink-0 text-muted-foreground" />
          <div className="flex items-center gap-1 rounded-lg bg-muted p-0.5">
            {PRESETS_DIAS.map((d) => (
              <button
                key={d}
                onClick={() => { setPeriodo({ tipo: "preset", dias: d }); setShowCustomRange(false); }}
                className={`rounded-md px-2.5 py-1.5 text-xs transition-colors ${periodo.tipo === "preset" && periodo.dias === d ? "bg-card font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                {d}d
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                if (showCustomRange) { setShowCustomRange(false); return; }
                setPendingFrom(rangeStartStr);
                setPendingTo(rangeEndStr);
                setShowCustomRange(true);
              }}
              className={`rounded-md px-2.5 py-1.5 text-xs transition-colors ${periodo.tipo === "intervalo" ? "bg-card font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {periodo.tipo === "intervalo" ? rotuloPeriodo(periodo) : "Personalizado"}
            </button>
          </div>
          {showCustomRange && (
            <div className="flex items-center gap-1.5 rounded-lg border border-border bg-muted px-2 py-1">
              <input type="date" value={pendingFrom} max={pendingTo || hoje} onChange={(e) => setPendingFrom(e.target.value)} className="w-[120px] cursor-pointer rounded border border-border bg-card px-1.5 py-1 text-xs text-foreground" />
              <span className="text-xs text-muted-foreground">–</span>
              <input type="date" value={pendingTo} min={pendingFrom || undefined} max={hoje} onChange={(e) => setPendingTo(e.target.value)} className="w-[120px] cursor-pointer rounded border border-border bg-card px-1.5 py-1 text-xs text-foreground" />
              <button
                type="button"
                disabled={!pendingFrom || !pendingTo}
                onClick={() => {
                  const p = lerPeriodo(`${pendingFrom}_${pendingTo}`, hoje);
                  if (!p) { toast.error("Intervalo inválido: até hoje e no máximo 400 dias."); return; }
                  setPeriodo(p);
                  setShowCustomRange(false);
                }}
                className="rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
              >
                OK
              </button>
            </div>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {aberto && (
            <>
              <button
                onClick={() => setShowMetricConfig(!showMetricConfig)}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-colors ${showMetricConfig ? "border-primary/30 bg-primary/10 text-primary" : "border-border bg-muted text-muted-foreground hover:text-foreground"}`}
              >
                <Settings2 size={13} /> Métricas
              </button>
              <button onClick={() => exportarUm("interno")} disabled={exportingPdf || campanhas.length === 0} className="flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/20 disabled:opacity-50">
                {exportingPdf ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} PDF Interno
              </button>
              <button onClick={() => exportarUm("cliente")} disabled={exportingPdf || campanhas.length === 0} className="flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/20 disabled:opacity-50">
                {exportingPdf ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} PDF Cliente
              </button>
            </>
          )}
          <button
            onClick={handleExportAllPdf}
            disabled={exportingAll}
            className="flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
          >
            {exportingAll ? <Loader2 size={13} className="animate-spin" /> : <FolderDown size={13} />}
            {exportingAll ? "Gerando PDFs..." : "Todos os Clientes"}
          </button>
        </div>
      </div>

      {exportAllProgress && (
        <div className="flex animate-fade-in items-center gap-2.5 rounded-xl border border-primary/20 bg-primary/10 px-4 py-3 text-xs text-primary">
          <Loader2 size={13} className="shrink-0 animate-spin" />
          <span className="flex-1">{exportAllProgress}</span>
        </div>
      )}
      {exportAllError && (
        <div className="flex animate-fade-in items-start gap-2.5 rounded-xl border border-lone-warning-border bg-lone-warning-bg px-4 py-3 text-xs text-lone-warning">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          <span className="flex-1">{exportAllError}</span>
          <button onClick={() => setExportAllError(null)} aria-label="Fechar aviso" className="text-lone-warning transition-opacity hover:opacity-80"><X size={13} /></button>
        </div>
      )}

      {/* ═══ VISÃO "TODOS" ═══ */}
      {!aberto && (
        dados.carregando && dados.resumo.size === 0 ? (
          <div className="flex items-center justify-center gap-2 py-16 text-xs text-muted-foreground">
            <Loader2 size={14} className="animate-spin" /> Lendo o que o servidor já guardou…
          </div>
        ) : (
          <ResumoCarteira
            clientes={linked}
            itens={dados.resumo}
            atualizando={dados.atualizando}
            agora={agora}
            rotuloPeriodo={rotuloPeriodo(periodo)}
            progresso={dados.progressoTodos}
            podeAtualizar={estadoTela === "ok"}
            onAbrir={(id) => setSelectedClient(id)}
            onAtualizarTodos={dados.atualizarTodos}
          />
        )
      )}

      {/* ═══ VISÃO DE UM CLIENTE ═══ */}
      {aberto && (
        <>
          {/* Frescor: de onde vem e quando foi lido */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border bg-card px-4 py-3">
            <Activity size={14} className="shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">
                {clienteAberto?.name ?? "Cliente"} · {rotuloPeriodo(periodo)}
              </p>
              <p className="text-xs text-muted-foreground">
                Lido da Meta pelo servidor · {atualizandoAberto && !temLeitura ? "primeira leitura em andamento" : rotuloAtualizado(detalhe?.sincronizadoEm, agora)}
                {detalhe?.erro && detalhe.erro !== ERRO_TOKEN && <span className="text-lone-warning"> · a última tentativa falhou ({detalhe.erro.slice(0, 90)})</span>}
                {detalhe?.erro === ERRO_TOKEN && <span className="text-lone-warning"> · a Meta recusou o token na última tentativa</span>}
              </p>
            </div>
            <button
              type="button"
              onClick={() => aberto && dados.atualizar(aberto)}
              disabled={atualizandoAberto || estadoTela !== "ok"}
              title={estadoTela !== "ok" ? "Reconecte a Meta para atualizar" : "Lê a Meta de novo no servidor (no máximo a cada 5 min)"}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-medium text-foreground transition-colors hover:border-primary/30 hover:text-primary disabled:opacity-50"
            >
              <RefreshCw size={13} className={atualizandoAberto ? "animate-spin" : ""} />
              {atualizandoAberto ? "Atualizando…" : "Atualizar agora"}
            </button>
          </div>

          {(dados.carregando && !detalhe) || (atualizandoAberto && !temLeitura) ? (
            <div className="card space-y-3 p-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center gap-3 border-t border-border/50 py-3 first:border-t-0">
                  <div className="h-3 w-3 shrink-0 animate-pulse rounded-full bg-muted" />
                  <div className="h-3 flex-1 animate-pulse rounded bg-muted" style={{ maxWidth: `${200 + i * 30}px` }} />
                  <div className="h-3 w-16 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-20 animate-pulse rounded bg-muted" />
                </div>
              ))}
              <p className="flex items-center justify-center gap-2 pt-2 text-xs text-muted-foreground">
                <Loader2 size={13} className="animate-spin" /> {atualizandoAberto ? "Lendo campanhas na Meta (no servidor)…" : "Carregando…"}
              </p>
            </div>
          ) : !temLeitura ? (
            <div className="card flex flex-col items-center gap-2 py-12 text-center">
              <Megaphone size={28} className="text-muted-foreground" />
              <p className="text-sm text-foreground">Ainda não há leitura deste cliente neste período.</p>
              <p className="max-w-md text-xs text-muted-foreground">
                {estadoTela !== "ok"
                  ? "Reconecte a Meta para o servidor conseguir ler as campanhas."
                  : detalhe?.erro
                    ? `A última tentativa falhou: ${detalhe.erro}`
                    : "Clique em Atualizar agora para o servidor ler as campanhas na Meta."}
              </p>
            </div>
          ) : (
            <>
              {campanhas.some(insightFalhou) && (
                <div className="flex items-center gap-2 rounded-xl border border-lone-warning-border bg-lone-warning-bg px-4 py-3 text-xs text-lone-warning">
                  <AlertTriangle size={14} className="shrink-0" />
                  {campanhas.filter(insightFalhou).length} campanha(s) sem dados — a Meta não respondeu. Os totais abaixo não incluem elas; clique em Atualizar agora.
                </div>
              )}

              {showMetricConfig && (
                <div className="card animate-fade-in border border-primary/20">
                  <div className="mb-3 flex items-center gap-2">
                    <Settings2 size={14} className="text-primary" />
                    <h3 className="text-sm font-semibold text-foreground">Métricas do Painel</h3>
                  </div>
                  <div className="grid grid-cols-3 gap-2 lg:grid-cols-5">
                    {ALL_METRICS.map((m) => {
                      const active = visibleMetrics.includes(m.key);
                      const MIcon = m.icon;
                      return (
                        <button
                          key={m.key}
                          onClick={() => toggleMetric(m.key)}
                          className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-xs font-medium transition-all ${active ? "border-primary/30 bg-primary/10 text-foreground" : "border-border bg-muted/50 text-muted-foreground hover:border-primary/20"}`}
                        >
                          <MIcon size={14} className={active ? "text-primary" : "text-muted-foreground"} />
                          {m.label}
                          {active && <Check size={12} className="ml-auto text-primary" />}
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
                    <button onClick={() => setVisibleMetrics(DEFAULT_VISIBLE_METRICS)} className="text-xs text-muted-foreground hover:text-foreground">Restaurar padrão</button>
                    <button onClick={() => setVisibleMetrics(ALL_METRICS.map((m) => m.key))} className="ml-2 text-xs text-muted-foreground hover:text-foreground">Selecionar todas</button>
                  </div>
                </div>
              )}

              {/* ═══ ANÁLISE INTELIGENTE ═══ */}
              {aiAnalysis && (
                <div className="overflow-hidden rounded-2xl border border-primary/20 bg-card">
                  <div className="p-6">
                    <div className="flex items-start gap-6">
                      <div className="shrink-0">
                        <HealthScoreRing score={aiAnalysis.healthScore} label={aiAnalysis.healthLabel} size={130} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="mb-2 flex items-center gap-2">
                          <Brain size={16} className="text-primary" />
                          <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground">Análise Inteligente</h3>
                        </div>
                        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
                          <div className="rounded-xl border border-border bg-muted/40 p-3">
                            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Campanhas</p>
                            <p className="text-lg font-semibold tabular-nums text-foreground">{aiAnalysis.activeCampaigns}<span className="text-xs font-normal text-muted-foreground">/{aiAnalysis.totalCampaigns}</span></p>
                            <p className="text-[10px] text-muted-foreground">ativas</p>
                          </div>
                          <div className="rounded-xl border border-border bg-muted/40 p-3">
                            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Tendência Gasto</p>
                            <div className="mt-1 flex items-center gap-1.5">
                              {aiAnalysis.spendTrend === "up" ? <ArrowUpRight size={16} className="text-destructive" /> : aiAnalysis.spendTrend === "down" ? <ArrowDownRight size={16} className="text-primary" /> : <Minus size={16} className="text-muted-foreground" />}
                              <span className={`text-lg font-semibold tabular-nums ${aiAnalysis.spendTrend === "up" ? "text-destructive" : aiAnalysis.spendTrend === "down" ? "text-primary" : "text-foreground"}`}>
                                {aiAnalysis.spendTrend === "up" ? "Alta" : aiAnalysis.spendTrend === "down" ? "Queda" : "Estável"}
                              </span>
                            </div>
                          </div>
                          <div className="rounded-xl border border-border bg-muted/40 p-3">
                            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Performance</p>
                            <div className="mt-1 flex items-center gap-1.5">
                              {aiAnalysis.performanceTrend === "improving" ? <TrendingUp size={16} className="text-primary" /> : aiAnalysis.performanceTrend === "declining" ? <TrendingDown size={16} className="text-destructive" /> : <Activity size={16} className="text-muted-foreground" />}
                              <span className={`text-lg font-semibold tabular-nums ${aiAnalysis.performanceTrend === "improving" ? "text-primary" : aiAnalysis.performanceTrend === "declining" ? "text-destructive" : "text-foreground"}`}>
                                {aiAnalysis.performanceTrend === "improving" ? "Melhorando" : aiAnalysis.performanceTrend === "declining" ? "Em Queda" : "Estável"}
                              </span>
                            </div>
                          </div>
                          <div className="rounded-xl border border-border bg-muted/40 p-3">
                            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Alertas</p>
                            <div className="mt-1 flex items-center gap-2">
                              {criticalInsights.length > 0 && <span className="text-lg font-semibold tabular-nums text-destructive">{criticalInsights.length}<span className="text-[10px] font-normal"> críticos</span></span>}
                              {warningInsights.length > 0 && <span className="text-lg font-semibold tabular-nums text-primary">{warningInsights.length}<span className="text-[10px] font-normal"> atenção</span></span>}
                              {criticalInsights.length === 0 && warningInsights.length === 0 && <span className="text-lg font-semibold text-primary">Nenhum</span>}
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-6 text-xs">
                          {aiAnalysis.topPerformer && (
                            <div className="flex items-center gap-2">
                              <Star size={12} className="text-primary" />
                              <span className="text-muted-foreground">Melhor:</span>
                              <span className="font-semibold text-foreground">{aiAnalysis.topPerformer.name}</span>
                              <span className="font-semibold text-primary">{aiAnalysis.topPerformer.value}</span>
                            </div>
                          )}
                          {aiAnalysis.worstPerformer && (
                            <div className="flex items-center gap-2">
                              <ShieldAlert size={12} className="text-destructive" />
                              <span className="text-muted-foreground">Revisar:</span>
                              <span className="font-semibold text-foreground">{aiAnalysis.worstPerformer.name}</span>
                              <span className="font-semibold text-destructive">{aiAnalysis.worstPerformer.value}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ═══ INSIGHTS & ALERTAS ═══ */}
              {activeInsights.length > 0 && (
                <div className="card border border-primary/10">
                  <div className="mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                        <Zap size={16} className="text-primary" />
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-foreground">Insights & Alertas</h3>
                        <p className="text-[10px] text-muted-foreground">{activeInsights.length} recomendações da análise</p>
                      </div>
                    </div>
                    {activeInsights.length > 4 && (
                      <button onClick={() => setShowAllInsights(!showAllInsights)} className="text-xs font-medium text-primary hover:text-primary/80">
                        {showAllInsights ? "Ver menos" : `Ver todos (${activeInsights.length})`}
                      </button>
                    )}
                  </div>
                  <div className="space-y-2">
                    {(showAllInsights ? activeInsights : activeInsights.slice(0, 4)).map((insight) => {
                      const config = SEVERITY_CONFIG[insight.severity] ?? SEVERITY_CONFIG.info;
                      const SIcon = config.icon;
                      return (
                        <div key={insight.id} className={`group flex items-start gap-3 rounded-xl border p-3.5 ${config.border} ${config.bg}`}>
                          <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${config.bg}`}>
                            <SIcon size={14} className={config.color} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="mb-0.5 flex flex-wrap items-center gap-2">
                              <p className="text-xs font-semibold text-foreground">{insight.title}</p>
                              {insight.campaignName && <span className="rounded border border-border bg-muted/50 px-1.5 py-0.5 text-[10px] text-muted-foreground">{insight.campaignName}</span>}
                              <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                                insight.priority === "critical" ? "border border-destructive/20 bg-destructive/10 text-destructive" :
                                insight.priority === "high" ? "border border-primary/20 bg-primary/10 text-primary" :
                                insight.priority === "medium" ? "border border-primary/15 bg-primary/10 text-primary" :
                                "border border-border bg-card text-muted-foreground"
                              }`}>
                                {insight.priority === "critical" ? "Crítico" : insight.priority === "high" ? "Alta" : insight.priority === "medium" ? "Média" : "Baixa"}
                              </span>
                            </div>
                            <p className="text-xs leading-relaxed text-muted-foreground">{insight.description}</p>
                            <div className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-primary">
                              <Sparkles size={11} /> {insight.action}
                            </div>
                          </div>
                          <button
                            onClick={() => setDismissedInsights((prev) => new Set([...prev, insight.id]))}
                            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-muted/50 hover:text-foreground group-hover:opacity-100"
                            title="Dispensar"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  {dismissedInsights.size > 0 && (
                    <button onClick={() => setDismissedInsights(new Set())} className="mt-3 flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
                      <Bell size={10} /> Mostrar {dismissedInsights.size} alerta(s) dispensado(s)
                    </button>
                  )}
                </div>
              )}

              {/* ═══ MÉTRICAS ═══ */}
              <div className={`grid gap-3 ${
                visibleMetrics.length <= 3 ? "grid-cols-3" :
                visibleMetrics.length <= 4 ? "grid-cols-2 lg:grid-cols-4" :
                visibleMetrics.length <= 6 ? "grid-cols-2 lg:grid-cols-3 xl:grid-cols-6" :
                "grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
              }`}>
                {ALL_METRICS.filter((m) => visibleMetrics.includes(m.key)).map((m) => {
                  const MIcon = m.icon;
                  const val = metricValues[m.key];
                  // Termômetro de KPI: custo menor é melhor; CTR maior é melhor.
                  const kpiClass = (() => {
                    if (val === 0) return "";
                    if (m.key === "costPerLead") return val <= 15 ? "kpi-good" : val <= 40 ? "kpi-warning" : "kpi-danger";
                    if (m.key === "costPerMessage") return val <= 5 ? "kpi-good" : val <= 15 ? "kpi-warning" : "kpi-danger";
                    if (m.key === "costPerConv") return val <= 30 ? "kpi-good" : val <= 80 ? "kpi-warning" : "kpi-danger";
                    if (m.key === "costPerResult") return val <= 20 ? "kpi-good" : val <= 50 ? "kpi-warning" : "kpi-danger";
                    if (m.key === "cpc") return val <= 2 ? "kpi-good" : val <= 5 ? "kpi-warning" : "kpi-danger";
                    if (m.key === "ctr") return val >= 2 ? "kpi-good" : val >= 0.8 ? "kpi-warning" : "kpi-danger";
                    return "";
                  })();
                  return (
                    <div key={m.key} className={`rounded-xl border border-border bg-card p-4 text-center transition-all ${kpiClass || "hover:border-primary/30"}`}>
                      <div className={`mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-lg ${
                        kpiClass === "kpi-danger" ? "border border-destructive/20 bg-destructive/10" :
                        kpiClass === "kpi-warning" ? "border border-lone-warning-border bg-lone-warning-bg" :
                        "border border-primary/15 bg-primary/10"
                      }`}>
                        <MIcon size={16} className={kpiClass === "kpi-danger" ? "text-destructive" : kpiClass === "kpi-warning" ? "text-lone-warning" : "text-primary"} />
                      </div>
                      <p className={`text-xl font-semibold tabular-nums ${kpiClass === "kpi-danger" ? "text-destructive" : kpiClass === "kpi-warning" ? "text-lone-warning" : "text-foreground"}`}>{m.format(val)}</p>
                      <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{m.label}</p>
                      {kpiClass && (
                        <p className={`mt-1 text-[9px] font-semibold uppercase tracking-wider ${kpiClass === "kpi-good" ? "text-primary" : kpiClass === "kpi-warning" ? "text-lone-warning" : "text-destructive"}`}>
                          {kpiClass === "kpi-good" ? "Saudável" : kpiClass === "kpi-warning" ? "Atenção" : "Crítico"}
                        </p>
                      )}
                      {m.key === "costPerMessage" && (
                        <p className="mt-1 truncate px-1 text-[9px] text-muted-foreground/50" title={championAdSetName ?? undefined}>
                          {championAdSetName ? championAdSetName.slice(0, 22) : "melhor conjunto ativo"}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* ═══ GRÁFICO ═══ */}
              {dailyChartData.length > 0 && (
                <div className="card border border-border">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-foreground">Performance diária — {rotuloPeriodo(periodo)}</h3>
                    <div className="flex items-center gap-1 rounded-lg bg-muted p-0.5">
                      {(["spend", "clicks", "conversions", "impressions"] as const).map((key) => (
                        <button
                          key={key}
                          onClick={() => toggleChartMetric(key)}
                          className={`rounded-md px-2.5 py-1 text-xs transition-colors ${chartMetrics.includes(key) ? "bg-card text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                        >
                          {{ spend: "Gasto", clicks: "Cliques", conversions: "Conv", impressions: "Impr" }[key]}
                        </button>
                      ))}
                    </div>
                  </div>
                  {chartMetrics.length > 0 ? (
                    <SpendAreaChart data={dailyChartData} visibleMetrics={chartMetrics} />
                  ) : (
                    <p className="py-10 text-center text-sm text-muted-foreground">Selecione ao menos uma métrica para ver o gráfico.</p>
                  )}
                  <div className="mt-3 flex flex-wrap items-center gap-6 border-t border-border pt-3 text-xs text-muted-foreground">
                    <span>Total período: <span className="font-semibold text-foreground">R$ {formatCurrency(dailyChartData.reduce((s, d) => s + d.spend, 0))}</span></span>
                    <span>Conversões: <span className="font-semibold text-foreground">{dailyChartData.reduce((s, d) => s + d.conversions, 0)}</span></span>
                    <span>Cliques: <span className="font-semibold text-foreground">{formatNumber(dailyChartData.reduce((s, d) => s + d.clicks, 0))}</span></span>
                  </div>
                </div>
              )}

              {/* ═══ LONE ADS SPECIALIST ═══ */}
              {clienteAberto && filteredCampaigns.length > 0 && (
                <AdsInsightCard
                  clientName={clienteAberto.name}
                  clientId={clienteAberto.id}
                  campaigns={filteredCampaigns}
                  period={rotuloPeriodo(periodo).toLowerCase()}
                  triggeredBy={currentUser}
                />
              )}

              {/* ═══ RELATÓRIO DA CONTA ═══ */}
              {accountReport && accountReport.activeCampaigns > 0 && (
                <div className={`overflow-hidden rounded-xl border ${accountReport.urgency === "critical" ? "border-destructive/20" : "border-primary/20"}`}>
                  <div className={`px-5 py-4 ${accountReport.urgency === "critical" ? "bg-destructive/[0.03]" : "bg-primary/[0.03]"}`}>
                    <div className="flex items-center gap-4">
                      <div className="shrink-0">
                        <HealthScoreRing score={accountReport.healthScore} label={accountReport.healthLabel} size={80} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <h4 className="text-sm font-semibold text-foreground">{accountReport.accountName}</h4>
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                            accountReport.urgency === "critical" ? "border border-destructive/20 bg-destructive/10 text-destructive" : "border border-primary/20 bg-primary/10 text-primary"
                          }`}>
                            {accountReport.urgency === "critical" ? "CRÍTICO" : accountReport.urgency === "warning" ? "ATENÇÃO" : "SAUDÁVEL"}
                          </span>
                          <span className="text-[10px] text-muted-foreground">{accountReport.activeCampaigns} campanhas ativas · R$ {formatCurrency(accountReport.totalSpend)} investidos</span>
                        </div>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <div>
                            <p className="mb-1.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-primary"><CheckCircle size={10} /> O que está bom</p>
                            <div className="space-y-1">
                              {accountReport.positives.slice(0, 3).map((p, i) => (
                                <p key={i} className="flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground"><span className="mt-0.5 shrink-0 text-primary">+</span> {p}</p>
                              ))}
                            </div>
                          </div>
                          <div>
                            <p className="mb-1.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-primary"><AlertTriangle size={10} /> O que melhorar</p>
                            <div className="space-y-1">
                              {accountReport.improvements.length === 0 ? (
                                <p className="text-xs text-muted-foreground">Nenhum ponto crítico encontrado</p>
                              ) : accountReport.improvements.slice(0, 3).map((imp, i) => (
                                <p key={i} className="flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground"><span className="mt-0.5 shrink-0 text-primary">!</span> {imp}</p>
                              ))}
                              {accountReport.improvements.length > 3 && <p className="text-[10px] text-muted-foreground">+ {accountReport.improvements.length - 3} pontos adicionais</p>}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ═══ CAMPANHAS ═══ */}
              <div className="card border border-border">
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Megaphone size={16} className="text-primary" />
                    <h3 className="text-sm font-semibold text-foreground">Campanhas ({filteredCampaigns.length})</h3>
                  </div>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <span className="h-2 w-2 rounded-full bg-primary" /> {campanhas.filter((c) => c.status === "active").length} ativas
                  </span>
                </div>
                <div className="space-y-2">
                  {filteredCampaigns.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma campanha encontrada com os filtros selecionados.</p>
                  ) : filteredCampaigns.map((camp) => {
                    const statusInfo = STATUS_LABELS[camp.status];
                    const Icon = statusInfo?.icon ?? CheckCircle;
                    const isExpanded = expandedCampaign === camp.id;
                    const budgetPct = camp.totalBudget > 0 ? (camp.spend / camp.totalBudget) * 100 : 0;
                    const falhou = insightFalhou(camp);
                    return (
                      <div key={camp.id} className={`overflow-hidden rounded-xl border transition-colors ${isExpanded ? "border-primary/30 bg-primary/[0.02]" : "border-border"}`}>
                        <button onClick={() => setExpandedCampaign(isExpanded ? null : camp.id)} className="flex w-full items-center gap-3 p-3.5 text-left transition-colors hover:bg-muted/50">
                          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${statusInfo?.cls}`}>
                            <Icon size={15} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate text-sm font-semibold text-foreground">{camp.name}</p>
                              <span className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${statusInfo?.cls}`}>{statusInfo?.label}</span>
                              {falhou ? (
                                <span className="rounded border border-lone-warning-border bg-lone-warning-bg px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-lone-warning" title="A Meta não respondeu os números desta campanha">Sem dados — falha na Meta</span>
                              ) : camp.hasData === false && <span className="rounded border border-border bg-muted px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Sem dados no período</span>}
                              {budgetPct > 90 && <span className="rounded border border-destructive/20 bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">Verba {budgetPct.toFixed(0)}%</span>}
                            </div>
                            <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
                              <span>{OBJECTIVE_LABELS[camp.objective] ?? camp.objective}</span>
                              <span className="text-border">|</span>
                              <span>R$ {formatCurrency(camp.dailyBudget)}/dia</span>
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-5 text-xs">
                            <div className="text-right">
                              <p className="font-semibold tabular-nums text-foreground">{falhou ? "—" : `R$ ${formatCurrency(camp.spend)}`}</p>
                              <p className="text-[10px] text-muted-foreground">Gasto</p>
                            </div>
                            <div className="hidden text-right sm:block">
                              <p className="font-semibold tabular-nums text-foreground">{falhou ? "—" : formatNumber(camp.impressions)}</p>
                              <p className="text-[10px] text-muted-foreground">Impr</p>
                            </div>
                            <div className="hidden text-right sm:block">
                              <p className="font-semibold tabular-nums text-foreground">{falhou ? "—" : Math.round(camp.conversions)}</p>
                              <p className="text-[10px] text-muted-foreground">Conv</p>
                            </div>
                            <div className="text-right">
                              <p className={`font-semibold tabular-nums ${falhou ? "text-foreground" : camp.ctr >= 2 ? "text-primary" : camp.ctr < 0.5 ? "text-destructive" : "text-foreground"}`}>{falhou ? "—" : `${camp.ctr.toFixed(2)}%`}</p>
                              <p className="text-[10px] text-muted-foreground">CTR</p>
                            </div>
                            {isExpanded ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
                          </div>
                        </button>

                        {isExpanded && (
                          <div className="animate-fade-in space-y-4 border-t border-border bg-muted/20 p-4">
                            {!falhou && (
                              <div className="grid grid-cols-3 gap-2 lg:grid-cols-6">
                                {[
                                  { label: "Alcance", value: formatNumber(camp.reach) },
                                  { label: "Cliques", value: formatNumber(camp.clicks) },
                                  { label: "CPC", value: fmtMetric(camp.cpc, "R$") },
                                  { label: "CPM", value: fmtMetric(camp.cpm, "R$") },
                                  { label: "Leads", value: camp.leads ? String(camp.leads) : "N/A" },
                                  { label: "CPL", value: camp.costPerLead ? fmtMetric(camp.costPerLead, "R$") : "N/A" },
                                  { label: "Msgs", value: camp.messages ? String(camp.messages) : "N/A" },
                                  { label: camp.cheapestAdSetName ? `Custo Campeão (${camp.cheapestAdSetName.slice(0, 16)})` : "Custo Campeão", value: camp.cheapestAdSetCostPerMessage ? fmtMetric(camp.cheapestAdSetCostPerMessage, "R$") : "—" },
                                  { label: "Resultado", value: camp.results ? String(camp.results) : "N/A" },
                                  { label: "Custo/Resultado", value: camp.costPerResult ? fmtMetric(camp.costPerResult, "R$") : "N/A" },
                                  { label: "Frequência", value: camp.frequency ? camp.frequency.toFixed(2) : "N/A" },
                                  { label: "Conversões", value: camp.conversions > 0 ? String(camp.conversions) : "N/A" },
                                ].map((item) => (
                                  <div key={item.label} className="rounded-lg border border-border bg-card p-2.5 text-center">
                                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{item.label}</p>
                                    <p className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">{item.value}</p>
                                  </div>
                                ))}
                              </div>
                            )}
                            {camp.totalBudget > 0 && !falhou && (
                              <div>
                                <div className="mb-1 flex items-center justify-between">
                                  <span className="text-xs text-muted-foreground">Consumo do orçamento</span>
                                  <span className="text-xs font-semibold tabular-nums text-foreground">R$ {formatCurrency(camp.spend)} / R$ {formatCurrency(camp.totalBudget)}</span>
                                </div>
                                <div className="h-2 overflow-hidden rounded-full bg-muted">
                                  <div className={`h-full rounded-full transition-all ${budgetPct > 90 ? "bg-destructive" : "bg-primary"}`} style={{ width: `${Math.min(budgetPct, 100)}%` }} />
                                </div>
                              </div>
                            )}
                            <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                              {camp.startDate && <span>Início: {camp.startDate}</span>}
                              {camp.endDate && <span>Fim: {camp.endDate}</span>}
                              {camp.totalBudget > 0 && !falhou && <span>{budgetPct.toFixed(0)}% do orçamento consumido</span>}
                            </div>
                            {camp.status === "active" && camp.dailyMetrics.some((d) => d.spend > 0) && (
                              <div>
                                <p className="mb-2 text-xs text-muted-foreground">Performance diária</p>
                                <SpendAreaChart
                                  data={camp.dailyMetrics.map((dm) => ({ date: dm.date, label: dm.date.slice(8), spend: Math.round(dm.spend * 100) / 100, impressions: dm.impressions, clicks: dm.clicks, conversions: dm.conversions }))}
                                  visibleMetrics={["spend"]}
                                />
                              </div>
                            )}
                            {/* O sistema só LÊ a Meta: pausar/orçamento é no Gerenciador. */}
                            <button
                              onClick={() => { if (clienteAberto && onRequestCreative) onRequestCreative(camp, clienteAberto); }}
                              className="btn-primary flex w-fit items-center gap-1.5 text-xs"
                            >
                              <Sparkles size={12} /> Solicitar Novo Criativo ao Designer
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

