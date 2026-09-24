"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  Target, TrendingUp, Users,
  Instagram, Palette, BarChart2, ArrowUp, ArrowDown, Minus,
  Download, Monitor, X, Clock, FileText,
  Minimize2, AlertTriangle,
  Activity, Settings, Pencil, Save, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { useClientsStore } from "@/stores/useClientsStore";
import { useTeamMembers } from "@/lib/hooks/useTeamMembers";
import { todaySP } from "@/lib/utils";
import { useOperationalStore } from "@/stores/useOperationalStore";
import { exportReportAsPdf } from "@/lib/exportPdf";
import { useOKRMetrics, type KPIValue } from "@/lib/hooks/useOKRMetrics";
import { useSnapshots, type Delta } from "@/lib/hooks/useSnapshots";
import { useOKRData } from "@/lib/hooks/useOKRData";
import { useCollaboratorScores } from "@/lib/hooks/useCollaboratorScores";
import FechamentoMensal from "@/components/FechamentoMensal";
import { chamar } from "@/lib/api/chamar";
import { useRole } from "@/lib/context/RoleContext";
import { useCockpit, valorOu, variacaoBoa } from "@/lib/hooks/useCockpit";

// ─── Types ──────────────────────────────────────────────────────────────────
interface OKR {
  id: string;
  title: string;
  target: number;
  current: number;
  unit: string;
  status: "on_track" | "at_risk" | "off_track" | "no_data";
  isReal?: boolean;
  source?: string;
  error?: string;
}

interface TeamOKRs {
  team: string;
  icon: typeof TrendingUp;
  color: string;
  okrs: OKR[];
}

const STATUS_CONFIG = {
  on_track: { label: "No ritmo", color: "text-lone-success bg-lone-success-bg border-lone-success-border", icon: ArrowUp },
  at_risk: { label: "Em risco", color: "text-lone-warning bg-lone-warning-bg border-lone-warning-border", icon: Minus },
  off_track: { label: "Atrasado", color: "text-destructive bg-destructive/10 border-destructive/20", icon: ArrowDown },
  no_data: { label: "Sem dado", color: "text-muted-foreground bg-muted border-border", icon: Minus },
};

// ─── Component ──────────────────────────────────────────────────────────────
// Helper to convert KPIValue to OKR
function kpiToOkr(id: string, title: string, kpi: KPIValue, inverted = false): OKR {
  // Meta "menor é melhor" com atual 0 dava 100% — é falta de dado, não meta batida.
  const semDado = (inverted && kpi.current <= 0) || (!kpi.isReal && kpi.current === 0);
  const pct = inverted
    ? (kpi.target / Math.max(kpi.current, 0.01)) * 100
    : (kpi.current / kpi.target) * 100;
  return {
    id, title, target: kpi.target, current: kpi.current, unit: kpi.unit,
    status: semDado ? "no_data" : pct >= 80 ? "on_track" : pct >= 60 ? "at_risk" : "off_track",
    isReal: kpi.isReal, source: kpi.source, error: kpi.error,
  };
}

// Simulated tag component
function SimTag({ isReal, source }: { isReal?: boolean; source?: string }) {
  if (isReal !== false) return null;
  return (
    <span
      className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-lone-warning-bg text-lone-warning border border-lone-warning-border ml-1.5 cursor-help"
      title={source ? `Fonte: ${source}` : "Dado simulado"}
    >
      Simulado
    </span>
  );
}

export default function GoalsPage() {
  const clients = useClientsStore((s) => s.clients);
  const { role } = useRole();
  const isAdmin = role === "admin" || role === "manager";
  const { members: teamMembers } = useTeamMembers();
  const okrData = useOKRData();
  const [showOKRManager, setShowOKRManager] = useState(false);
  const [editingTarget, setEditingTarget] = useState<{ id: string; value: string } | null>(null);

  // Build targets map from database
  const dbTargets = useMemo(() => {
    const map: Record<string, number> = {};
    for (const o of okrData.okrs) {
      if (o.metricKey) map[o.metricKey] = o.target;
    }
    return map;
  }, [okrData.okrs]);

  const metrics = useOKRMetrics(Object.keys(dbTargets).length > 0 ? dbTargets : undefined);
  const collaborators = useCollaboratorScores(teamMembers);
  const { currentSnapshot, previousSnapshot, saveCurrentSnapshot } = useSnapshots();
  // Cockpit REAL, do servidor. O useSnapshots acima ainda alimenta o resto da tela; a seção de
  // evolução passa a usar este, que compara com mês fechado de verdade (ver lib/hooks/useCockpit).
  const cockpit = useCockpit();
  const pageRef = useRef<HTMLDivElement>(null);
  const [activeLayer, setActiveLayer] = useState<"strategy" | "operations">("strategy");

  // Presentation mode
  const [presentationMode, setPresentationMode] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Métricas REAIS do servidor (/api/okr/traffic-metrics): tráfego (ad_accounts + metric_snapshots
  // deduplicado), churn real (churned_at), qualidade de tráfego e relacionamento. Substituem os
  // valores do hook. authedFetch (não fetch puro): a rota usa getServerUser e exige o token no
  // header — senão 401 e cai pro mock. Ver [[loneos-authedfetch-nao-autorizado]].
  type RealTraffic = {
    investmentExecutedPct: number; isReal: boolean; accountsWithinBudgetPct: number; accountsCounted: number;
    leadsMonth: number; cpl: number; leadsIsReal: boolean;
    ctrPct: number; impressionsMonth: number; trafficQualIsReal: boolean;
    engagementRate: number; engagementIsReal: boolean;
    activeClients: number; churnedMonth: number; churnRate: number; churnIsReal: boolean; staleContacts: number;
  };
  const [realTraffic, setRealTraffic] = useState<RealTraffic | null>(null);
  const [trafficErro, setTrafficErro] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    chamar<RealTraffic>("/api/okr/traffic-metrics").then((r) => {
      if (!alive) return;
      // Falha vira erro na tela — antes caía calada no número simulado do hook.
      if (r.ok && r.data) { setRealTraffic(r.data); setTrafficErro(null); }
      else setTrafficErro(r.erro ?? "Não consegui carregar as métricas de tráfego.");
    });
    return () => { alive = false; };
  }, []);

  const investmentKpi = useMemo<KPIValue>(() => (
    realTraffic?.isReal
      ? { ...metrics.traffic.investmentExecuted, current: realTraffic.investmentExecutedPct, isReal: true, source: "ad_accounts (gasto÷verba)" }
      : trafficErro
        ? { ...metrics.traffic.investmentExecuted, current: 0, isReal: false, error: trafficErro }
        : metrics.traffic.investmentExecuted
  ), [metrics.traffic.investmentExecuted, realTraffic, trafficErro]);

  // Custo por lead (substitui o "ROAS" — agência de geração de lead não tem receita por anúncio,
  // então ROAS é inmedível; CPL = gasto real ÷ leads reais é a métrica de eficiência que existe).
  const cplKpi = useMemo<KPIValue>(() => ({
    current: realTraffic?.leadsIsReal ? realTraffic.cpl : 0,
    target: dbTargets["cpl"] ?? 15, unit: "",
    isReal: !!realTraffic?.leadsIsReal, source: "metric_snapshots (dedup)", error: trafficErro ?? undefined,
  }), [realTraffic, dbTargets, trafficErro]);

  const leadsKpi = useMemo<KPIValue>(() => ({
    current: realTraffic?.leadsIsReal ? realTraffic.leadsMonth : 0,
    target: dbTargets["leads_month"] ?? 500, unit: " leads",
    isReal: !!realTraffic?.leadsIsReal, source: "metric_snapshots (dedup)", error: trafficErro ?? undefined,
  }), [realTraffic, dbTargets, trafficErro]);

  // Churn REAL (churned_at) — substitui o proxy "clientes em risco" do hook.
  const churnKpi = useMemo<KPIValue>(() => (
    realTraffic?.churnIsReal
      ? { ...metrics.company.churnRate, current: realTraffic.churnRate, isReal: true, source: `churned_at · ${realTraffic.churnedMonth} cancelado(s) no mês` }
      : metrics.company.churnRate
  ), [metrics.company.churnRate, realTraffic]);

  // Company OKRs (always from real data via hook)
  const companyOkrs = useMemo<OKR[]>(() => [
    kpiToOkr("co-1", "Reduzir churn para < 5%", churnKpi, true),
    kpiToOkr("co-2", "Saúde média dos clientes > 80", metrics.company.nps),
    kpiToOkr("co-3", "Clientes ativos", metrics.company.activeClients),
    kpiToOkr("co-4", "Novos clientes/mês", metrics.company.newClients),
  ], [metrics.company, churnKpi]);

  // Real team OKRs for "atual" view
  const realTeamOkrs = useMemo<TeamOKRs[]>(() => [
    { team: "Tráfego Pago", icon: TrendingUp, color: "var(--primary)", okrs: [
      kpiToOkr("tr-1", "Custo por lead < R$ 15", cplKpi, true),
      kpiToOkr("tr-2", "Investimento executado > 95%", investmentKpi),
      kpiToOkr("tr-3", "Novos leads/mês > 500", leadsKpi),
    ]},
    { team: "Social Media", icon: Instagram, color: "var(--primary)", okrs: [
      kpiToOkr("so-1", "Posts entregues/mes > 96", metrics.social.postsDelivered),
      kpiToOkr("so-3", "SLA de entrega < 48h", metrics.social.deliverySLA, true),
    ]},
    { team: "Design", icon: Palette, color: "var(--chart-4)", okrs: [
      kpiToOkr("de-1", "Pedidos no prazo > 90%", metrics.design.onTimeDelivery),
      kpiToOkr("de-2", "Tempo médio < 3 dias", metrics.design.avgDeliveryTime, true),
      kpiToOkr("de-3", "Satisfação > 4.5/5", metrics.design.satisfaction),
    ]},
  ], [metrics.social, metrics.design, investmentKpi, cplKpi, leadsKpi]);

  const snapshot = useMemo(() => ({ companyOkrs, teamOkrs: realTeamOkrs }), [companyOkrs, realTeamOkrs]);

  // null = sem dado: não entra na média (antes contava como 100% ou 0%).
  const getProgress = useCallback((okr: OKR): number | null => {
    if (okr.status === "no_data") return null;
    if (okr.title.includes("<")) return Math.min(100, Math.round((okr.target / Math.max(okr.current, 0.01)) * 100));
    return Math.min(100, Math.round((okr.current / okr.target) * 100));
  }, []);
  const media = (vals: (number | null)[]) => {
    const ok = vals.filter((v): v is number => v !== null);
    return ok.length ? Math.round(ok.reduce((a, b) => a + b, 0) / ok.length) : null;
  };

  const overallProgress = useMemo(
    () => media([...snapshot.companyOkrs, ...snapshot.teamOkrs.flatMap((t) => t.okrs)].map(getProgress)),
    [snapshot, getProgress],
  );

  // Rótulo do período: o mês corrente de verdade (SP).
  const periodLabel = useMemo(() => {
    const [a, m] = todaySP().split("-").map(Number);
    return new Date(a, m - 1, 15).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  }, []);

  // Export PDF
  const handleExportPDF = useCallback(async () => {
    setExporting(true);
    setShowExportMenu(false);
    try {
      const el = pageRef.current;
      if (!el) { setExporting(false); return; }
      const h2cModule = await import("html2canvas");
      const html2canvas = h2cModule.default ?? h2cModule;
      const jspdfModule = await import("jspdf");
      const JsPDF = jspdfModule.jsPDF ?? jspdfModule.default;
      const canvas = await html2canvas(el, { backgroundColor: getComputedStyle(document.documentElement).getPropertyValue("--background").trim() || null, scale: 2, useCORS: true, logging: false });
      const imgData = canvas.toDataURL("image/png");
      const w = canvas.width / 2;
      const h = canvas.height / 2;
      const pdf = new JsPDF({ orientation: w > h ? "landscape" : "portrait", unit: "px", format: [w, h] });
      pdf.addImage(imgData, "PNG", 0, 0, w, h);
      pdf.save(`OKRs_${periodLabel.replace(/\s/g, "_")}.pdf`);
    } catch (err) {
      console.error("[Lone OS] PDF export failed:", err);
      alert("Erro ao gerar PDF: " + (err instanceof Error ? err.message : "Erro desconhecido"));
    } finally {
      setExporting(false);
    }
  }, [periodLabel]);

  // Presentation mode: toggle fullscreen
  const togglePresentation = useCallback(() => {
    setPresentationMode((prev) => {
      const next = !prev;
      if (next) {
        document.documentElement.requestFullscreen?.();
      } else {
        document.exitFullscreen?.();
      }
      return next;
    });
    setShowExportMenu(false);
  }, []);

  // Exit presentation on Escape
  useEffect(() => {
    const handler = () => {
      if (!document.fullscreenElement) setPresentationMode(false);
    };
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const apagarOkr = useCallback(async (id: string, titulo: string) => {
    if (!confirm(`Excluir a meta "${titulo}"? Essa ação não tem volta.`)) return;
    try {
      await okrData.deleteOKR(id);
      toast.success("Meta excluída.");
    } catch {
      toast.error("Não consegui excluir a meta. Tenta de novo.");
    }
  }, [okrData]);

  const salvarMeta = useCallback(async (id: string, valor: string) => {
    const n = Number(valor);
    if (!Number.isFinite(n) || valor.trim() === "") { toast.error("Informe um número válido."); return; }
    try {
      await okrData.updateTarget(id, n);
      setEditingTarget(null);
      toast.success("Meta atualizada.");
    } catch {
      toast.error("Não consegui salvar a meta. Tenta de novo.");
    }
  }, [okrData]);

  return (
    <div
      ref={pageRef}
      className={`animate-fade-in ${
        presentationMode
          ? "fixed inset-0 z-[9999] bg-background overflow-auto p-8"
          : "p-6"
      }`}
    >
      <div className="space-y-6 max-w-[1400px] mx-auto">
        {trafficErro && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-lone-danger-bg border border-lone-danger-border text-lone-danger text-xs">
            <AlertTriangle size={13} className="shrink-0" />
            <span>Não consegui carregar as métricas de tráfego: {trafficErro} As metas de tráfego aparecem como &ldquo;sem dado&rdquo;.</span>
          </div>
        )}
        {/* ─── Banner de dados simulados ───────────────────────── */}
        {(() => {
          const allOkrs = [...snapshot.companyOkrs, ...snapshot.teamOkrs.flatMap((t) => t.okrs)];
          const simCount = allOkrs.filter((o) => o.isReal === false).length;
          if (simCount === 0) return null;
          return (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-lone-warning-bg border border-lone-warning-border text-lone-warning text-xs">
              <AlertTriangle size={13} className="shrink-0" />
              <span><strong>{simCount}</strong> {simCount === 1 ? "métrica usa dado simulado" : "métricas usam dados simulados"} — as demais são calculadas em tempo real. Passe o mouse sobre <span className="bg-lone-warning-bg px-1 rounded">Simulado</span> para ver a fonte.</span>
            </div>
          );
        })()}
        {/* ─── Header ──────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {!presentationMode && (
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Target size={20} className="text-primary" />
              </div>
            )}
            <div>
              <h1 className={`font-bold text-foreground ${presentationMode ? "text-3xl" : "text-xl"}`}>
                Metas & OKRs
              </h1>
              <p className={`text-muted-foreground mt-0.5 ${presentationMode ? "text-sm" : "text-xs"}`}>
                {periodLabel}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* OKR Manager */}
            {isAdmin && (
              <button onClick={() => setShowOKRManager(!showOKRManager)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                  showOKRManager ? "bg-primary/10 text-primary border-primary/20" : "border-border text-muted-foreground hover:text-foreground"
                }`}>
                <Settings size={12} /> Gerenciar Metas
              </button>
            )}
            {/* Export / Presentation */}
            <div className="relative">
              <button
                onClick={() => setShowExportMenu(!showExportMenu)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border border-border text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all"
              >
                <Download size={13} />
                Relatório
              </button>
              {showExportMenu && (
                <div className="absolute top-full right-0 mt-1 bg-card border border-border rounded-xl p-1.5 z-50 w-52 animate-fade-in shadow-lg">
                  <button
                    onClick={handleExportPDF}
                    disabled={exporting}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-all disabled:opacity-40"
                  >
                    <Download size={13} className="text-primary" />
                    {exporting ? "Gerando..." : "Exportar PDF"}
                  </button>
                  <button
                    onClick={togglePresentation}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-all"
                  >
                    <Monitor size={13} className="text-primary" />
                    Modo Apresentação
                  </button>
                </div>
              )}
            </div>

            {/* Exit presentation */}
            {presentationMode && (
              <button
                onClick={togglePresentation}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-destructive/10 text-destructive border border-destructive/20 hover:bg-destructive/20 transition-all"
              >
                <Minimize2 size={13} />
                Sair
              </button>
            )}
          </div>
        </div>

        {/* ─── Content (animated on period change) ─────────────── */}
        <div className="space-y-6">
          {/* Overall progress */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-foreground">
                Progresso Geral — {periodLabel}
              </h2>
              <span className="text-2xl font-bold text-primary tabular-nums">{overallProgress === null ? "—" : `${overallProgress}%`}</span>
            </div>
            <div className="w-full h-3 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all duration-700"
                style={{ width: `${overallProgress ?? 0}%` }}
              />
            </div>
          </div>

          {/* Company OKRs */}
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <BarChart2 size={14} className="text-primary" />
              OKRs da Empresa
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {snapshot.companyOkrs.map((okr) => {
                const progress = getProgress(okr);
                const cfg = STATUS_CONFIG[okr.status];
                const StatusIcon = cfg.icon;
                return (
                  <div key={okr.id} className="card p-4">
                    <div className="flex items-start justify-between mb-3">
                      <h3 className="text-xs font-semibold text-foreground leading-tight flex-1">{okr.title}</h3>
                      <span className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border ${cfg.color}`}>
                        <StatusIcon size={10} />
                        {cfg.label}
                      </span>
                    </div>
                    <div className="flex items-end gap-2 mb-2">
                      <span className="text-2xl font-bold text-foreground tabular-nums">{okr.current}{okr.unit}</span>
                      <span className="text-xs text-muted-foreground mb-1">/ {okr.target}{okr.unit}</span>
                      <SimTag isReal={okr.isReal} source={okr.source} />
                    </div>
                    {okr.error && (
                      <p className="text-[10px] text-lone-warning mb-1">{okr.error}</p>
                    )}
                    <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          progress === null ? "bg-muted" : progress >= 80 ? "bg-lone-success" : progress >= 60 ? "bg-lone-warning" : "bg-destructive"
                        }`}
                        style={{ width: `${progress ?? 0}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1 text-right">{progress === null ? "sem dado" : `${progress}%`}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Team OKRs */}
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Users size={14} className="text-primary" />
              OKRs por Equipe
            </h2>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {snapshot.teamOkrs.map((team) => {
                const TeamIcon = team.icon;
                const teamProgress = media(team.okrs.map(getProgress));
                return (
                  <div key={team.team} className="card p-4">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `color-mix(in srgb, ${team.color} 15%, transparent)` }}>
                        <TeamIcon size={16} style={{ color: team.color }} />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-sm font-semibold text-foreground">{team.team}</h3>
                        <p className="text-[10px] text-muted-foreground">Progresso: {teamProgress === null ? "sem dado" : `${teamProgress}%`}</p>
                      </div>
                    </div>
                    <div className="space-y-3">
                      {team.okrs.map((okr) => {
                        const progress = getProgress(okr);
                        const cfg = STATUS_CONFIG[okr.status];
                        return (
                          <div key={okr.id}>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[11px] text-foreground font-medium">
                                {okr.title}
                                <SimTag isReal={okr.isReal} source={okr.source} />
                              </span>
                              <span className={`text-[9px] ${cfg.color.split(" ")[0]}`}>{cfg.label}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${progress ?? 0}%`, backgroundColor: team.color }} />
                              </div>
                              <span className="text-[10px] text-muted-foreground w-12 text-right tabular-nums">{progress === null ? "—" : `${progress}%`}</span>
                            </div>
                            <div className="flex items-center justify-between mt-0.5">
                              <span className="text-[9px] text-muted-foreground">Atual: {okr.current}{okr.unit}</span>
                              <span className="text-[9px] text-muted-foreground">Meta: {okr.target}{okr.unit}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ─── Indicadores em tempo real (qualidade de tráfego + relacionamento) ─── */}
          {realTraffic && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {(() => {
                const staleRatio = realTraffic.activeClients > 0 ? realTraffic.staleContacts / realTraffic.activeClients : 0;
                const staleTone = staleRatio >= 0.5 ? "text-destructive" : staleRatio >= 0.25 ? "text-lone-warning" : "text-lone-success";
                const budgetTone = realTraffic.accountsWithinBudgetPct >= 90 ? "text-lone-success" : realTraffic.accountsWithinBudgetPct >= 70 ? "text-lone-warning" : "text-destructive";
                const tiles = [
                  { label: "CTR médio", value: realTraffic.trafficQualIsReal ? `${realTraffic.ctrPct}%` : "—", sub: "cliques ÷ impressões · mês", tone: "text-foreground" },
                  { label: "Alcance (impressões)", value: realTraffic.trafficQualIsReal ? realTraffic.impressionsMonth.toLocaleString("pt-BR") : "—", sub: "mês, deduplicado", tone: "text-foreground" },
                  { label: "Contas no orçamento", value: `${realTraffic.accountsWithinBudgetPct}%`, sub: `${realTraffic.accountsCounted} contas ativas`, tone: budgetTone },
                  { label: "Sem contato +15d", value: String(realTraffic.staleContacts), sub: `de ${realTraffic.activeClients} clientes ativos`, tone: staleTone },
                ];
                return tiles.map((t) => (
                  <div key={t.label} className="rounded-xl bg-surface border border-border p-3.5">
                    <p className="text-[10px] text-muted-foreground mb-1">{t.label}</p>
                    <p className={`text-xl font-bold tabular-nums ${t.tone}`}>{t.value}</p>
                    <p className="text-[9px] text-muted-foreground mt-0.5">{t.sub}</p>
                  </div>
                ));
              })()}
            </div>
          )}

          {/* ─── Fechamento do mês: os números concretos, com nome ───
              Roberto (02/09): "tem que mostrar se teve um cliente que não recebeu artes, quantos
              clientes teve arte, quantos não teve, quanto foi tempo de atraso". O bloco de
              "Produção dos Colaboradores" logo abaixo mostra SCORE; este mostra CONTAGEM, que é o
              que se usa para agir de manhã. */}
          <FechamentoMensal />

          {/* ─── Produção dos Colaboradores (real, por pessoa) ─── */}
          {collaborators.length > 0 && (
            <div className="card p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Users size={14} className="text-primary" /> Produção dos Colaboradores
                  <span className="text-[10px] text-muted-foreground font-normal">· mês atual</span>
                </h3>
                <span className="text-[10px] text-muted-foreground">Score = desempenho real</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {collaborators.map((p) => {
                  const ring = p.tone === "success" ? "text-lone-success" : p.tone === "warning" ? "text-lone-warning" : p.tone === "danger" ? "text-destructive" : "text-muted-foreground";
                  const barBg = p.tone === "success" ? "bg-lone-success" : p.tone === "warning" ? "bg-lone-warning" : p.tone === "danger" ? "bg-destructive" : "bg-muted";
                  return (
                    <div key={p.id} className="p-3.5 rounded-xl bg-surface border border-border">
                      <div className="flex items-center justify-between mb-2.5">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">{p.name}</p>
                          <span className="text-[10px] text-muted-foreground">{p.roleLabel}</span>
                        </div>
                        <div className="text-right shrink-0 ml-2" title={`Score: ${p.scoreBasis}`}>
                          <span className={`text-2xl font-bold tabular-nums ${ring}`}>{p.score == null ? "—" : p.score}</span>
                          {p.score != null && <span className="text-[10px] text-muted-foreground">/100</span>}
                        </div>
                      </div>
                      {p.score != null && (
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden mb-3">
                          <div className={`h-full rounded-full transition-all duration-500 ${barBg}`} style={{ width: `${Math.min(100, p.score)}%` }} />
                        </div>
                      )}
                      <div className="space-y-1">
                        {p.stats.map((s, i) => (
                          <div key={i} className="flex items-center justify-between text-[11px]">
                            <span className="text-muted-foreground">{s.label}</span>
                            <span className="text-foreground font-medium tabular-nums">{s.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="text-[10px] text-muted-foreground mt-3">
                Design: score = % de entregas no prazo. Social/Tráfego: score = saúde média da carteira —
                é uma leitura da CARTEIRA, não da pessoa: a satisfação do cliente também depende de tráfego,
                aprovação e do produto dele. Para desempenho por pessoa, use o Fechamento do mês acima.
              </p>
            </div>
          )}

          {isAdmin && <RelatoriosQuinzenais />}
        </div>

        {/* ─── INTELLIGENCE PANEL — AI Feedback + Deltas ───── */}
        <div className="space-y-6">
            {/* Layer switcher */}
            <div className="flex items-center gap-3">
              <div className="flex items-center bg-card rounded-xl p-0.5 border border-border">
                {([
                  { key: "strategy" as const, label: "Cockpit Estratégico", icon: Target },
                  { key: "operations" as const, label: "Chão de Fábrica", icon: Activity },
                ]).map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button key={tab.key} onClick={() => setActiveLayer(tab.key)}
                      className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-all duration-200 ${
                        activeLayer === tab.key
                          ? "bg-primary text-primary-foreground shadow-lg"
                          : "text-muted-foreground hover:text-muted-foreground"
                      }`}>
                      <Icon size={12} /> {tab.label}
                    </button>
                  );
                })}
              </div>
              <div className="h-5 w-px bg-border" />
              <button onClick={saveCurrentSnapshot}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-medium text-muted-foreground hover:text-foreground border border-border hover:border-border transition-all"
                title="Salvar snapshot do período atual">
                <Download size={11} /> Salvar Snapshot
              </button>
              {previousSnapshot && (
                <span className="text-[10px] text-muted-foreground">
                  Comparando com {previousSnapshot.period}
                </span>
              )}
            </div>

            {/* Evolução — números do servidor, comparação com mês REALMENTE fechado */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-foreground flex items-center gap-2">
                <TrendingUp size={12} className="text-primary" />
                Como estamos{cockpit.data?.atual?.periodo ? ` — ${cockpit.data.atual.periodo}` : ""}
              </h3>

              {cockpit.loading && <p className="text-xs text-muted-foreground">Calculando…</p>}
              {cockpit.erro && (
                <p className="text-xs text-destructive">Não consegui carregar os números: {cockpit.erro}</p>
              )}

              {/* Sem mês fechado, diz isso — em vez de desenhar seta contra número inventado. */}
              {cockpit.data && !cockpit.data.temComparacao && (
                <p className="text-[11px] text-muted-foreground bg-muted/40 border border-border rounded-lg px-3 py-2">
                  {cockpit.data.motivoSemComparacao}
                </p>
              )}

              {cockpit.data && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {cockpit.data.deltas.map((d) => {
                    const boa = variacaoBoa(d);
                    return (
                      <div key={d.chave} className="card p-4">
                        <p className="text-[10px] text-muted-foreground mb-1">{d.rotulo}</p>
                        <div className="flex items-end gap-2">
                          <span className="text-lg font-bold text-foreground tabular-nums">{valorOu(d.atual)}</span>
                          {d.variacaoPct !== null && (
                            <span className={`flex items-center gap-0.5 text-[11px] font-medium mb-0.5 ${
                              boa ? "text-lone-success" : "text-lone-warning"
                            }`}>
                              {d.variacaoPct > 0 ? <ArrowUp size={10} /> : <ArrowDown size={10} />}
                              {Math.abs(d.variacaoPct).toFixed(1)}%
                            </span>
                          )}
                        </div>
                        {/* Métrica sem fonte diz POR QUE não sabe, em vez de mostrar 0 ou -0,3. */}
                        {d.semFonte && (
                          <p className="text-[10px] text-muted-foreground/80 mt-1 leading-snug">{d.semFonte}</p>
                        )}
                        {d.variacaoPct === null && !d.semFonte && d.anterior === null && (
                          <p className="text-[10px] text-muted-foreground/60 mt-1">sem mês anterior pra comparar</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {cockpit.data && (
                <p className="text-[10px] text-muted-foreground/70">
                  Health calculado sobre {cockpit.data.atual.cobertura.health} de {cockpit.data.atual.clientes} clientes ·
                  silêncio sobre {cockpit.data.atual.cobertura.interacao} com conversa registrada
                </p>
              )}
            </div>

            {/* Operational KPIs (when Operations tab is active) */}
            {activeLayer === "operations" && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: "Posts Publicados", value: cockpit.data?.atual?.postsPublicados?.valor ?? 0, target: cockpit.data?.atual?.postsMeta ?? 0, unit: `/${cockpit.data?.atual?.postsMeta ?? "—"}`, icon: Instagram },
                  { label: "SLA Compliance", value: currentSnapshot.slaCompliancePct, target: 85, unit: "%", icon: Clock },
                  { label: "Design no Prazo", value: currentSnapshot.designOnTimePct, target: 90, unit: "%", icon: Palette },
                  { label: "Tasks Vencidas", value: currentSnapshot.tasksOverdue, target: 0, unit: "", icon: AlertTriangle },
                ].map((kpi) => {
                  const Icon = kpi.icon;
                  const isGood = kpi.label === "Tasks Vencidas" ? kpi.value <= kpi.target : kpi.value >= kpi.target;
                  return (
                    <div key={kpi.label} className={`card p-5 ${!isGood ? "border-lone-warning-border" : ""}`}>
                      <div className="flex items-center gap-2 mb-3">
                        <Icon size={14} className={isGood ? "text-primary" : "text-lone-warning"} />
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{kpi.label}</span>
                      </div>
                      <div className="flex items-end gap-1.5">
                        <span className={`text-2xl font-bold tabular-nums ${isGood ? "text-foreground" : "text-lone-warning"}`}>
                          {kpi.value}
                        </span>
                        <span className="text-xs text-muted-foreground mb-0.5">{kpi.unit}</span>
                      </div>
                      {kpi.label !== "Tasks Vencidas" && (
                        <div className="mt-3 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div className={`h-full rounded-full transition-all duration-700 ${
                            isGood ? "bg-primary" : "bg-lone-warning"
                          }`} style={{ width: `${Math.min(100, (kpi.value / kpi.target) * 100)}%` }} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
        </div>
      </div>

      {showExportMenu && (
        <div className="fixed inset-0 z-40" onClick={() => setShowExportMenu(false)} />
      )}

      {/* OKR Manager Panel */}
      {showOKRManager && isAdmin && (
        <div className="fixed inset-0 z-50 bg-overlay flex justify-end" onClick={() => setShowOKRManager(false)}>
          <div className="bg-card border-l border-border w-full max-w-md h-full overflow-auto animate-slide-in-right" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-card border-b border-border p-5 flex items-center justify-between z-10">
              <div>
                <h2 className="font-semibold text-foreground text-sm">Gerenciar Metas</h2>
                <p className="text-[10px] text-muted-foreground">{okrData.quarter} — {okrData.okrs.length} OKRs</p>
              </div>
              <div className="flex items-center gap-2">
                <select value={okrData.quarter} onChange={(e) => okrData.setQuarter(e.target.value)}
                  className="bg-surface border border-border rounded-lg px-2 py-1 text-xs text-foreground outline-none">
                  <option value="2026-Q1">2026 Q1</option>
                  <option value="2026-Q2">2026 Q2</option>
                  <option value="2026-Q3">2026 Q3</option>
                  <option value="2026-Q4">2026 Q4</option>
                </select>
                <button onClick={() => setShowOKRManager(false)} className="text-muted-foreground hover:text-foreground"><X size={16} /></button>
              </div>
            </div>

            <div className="p-5 space-y-6">
              {["company", "traffic", "social", "design"].map((team) => {
                const teamOkrs = okrData.byTeam(team);
                const teamLabel = team === "company" ? "Empresa" : team === "traffic" ? "Tráfego Pago" : team === "social" ? "Social Media" : "Design";
                return (
                  <div key={team} className="space-y-3">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{teamLabel}</p>
                    {teamOkrs.map((okr) => (
                      <div key={okr.id} className="rounded-xl border border-border bg-surface p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-medium text-foreground flex-1">{okr.title}</p>
                          <button onClick={() => apagarOkr(okr.id, okr.title)} aria-label="Excluir meta"
                            className="text-muted-foreground hover:text-destructive transition-colors p-1"><Trash2 size={10} /></button>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-muted-foreground">Meta:</span>
                          {editingTarget?.id === okr.id ? (
                            <div className="flex items-center gap-1">
                              <input type="number" value={editingTarget.value}
                                onChange={(e) => setEditingTarget({ ...editingTarget, value: e.target.value })}
                                className="w-20 bg-card border border-border rounded px-2 py-0.5 text-xs text-foreground outline-none focus:border-primary/50"
                                autoFocus onKeyDown={(e) => {
                                  if (e.key === "Enter") salvarMeta(okr.id, editingTarget.value);
                                  if (e.key === "Escape") setEditingTarget(null);
                                }} />
                              <span className="text-[10px] text-muted-foreground">{okr.unit}</span>
                              <button onClick={() => salvarMeta(okr.id, editingTarget.value)}
                                className="text-lone-success hover:text-lone-success"><Save size={10} /></button>
                            </div>
                          ) : (
                            <button onClick={() => setEditingTarget({ id: okr.id, value: String(okr.target) })}
                              className="text-xs text-foreground hover:text-primary flex items-center gap-1 transition-colors">
                              {okr.target} {okr.unit} <Pencil size={8} className="text-muted-foreground" />
                            </button>
                          )}
                          <span className="text-[10px] text-muted-foreground ml-auto">
                            Atual: <span className={`font-medium ${okr.status === "on_track" ? "text-lone-success" : okr.status === "at_risk" ? "text-lone-warning" : "text-destructive"}`}>
                              {okr.currentValue} {okr.unit}
                            </span>
                          </span>
                        </div>
                        {/* Progress bar */}
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${
                            okr.status === "on_track" ? "bg-lone-success" : okr.status === "at_risk" ? "bg-lone-warning" : "bg-destructive"
                          }`} style={{ width: `${Math.min(100, okr.target > 0 ? (okr.currentValue / okr.target) * 100 : 0)}%` }} />
                        </div>
                        {okr.autoCalculated && <p className="text-[9px] text-muted-foreground">Auto-calculado do sistema</p>}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Relatórios quinzenais da equipe (vieram da Área CEO). Visão da diretoria.
function RelatoriosQuinzenais() {
  const quinzReports = useOperationalStore((s) => s.quinzReports);
  const pronto = useOperationalStore((s) => s.initialized);
  return (
    <div className="card p-4 space-y-3">
      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
        <FileText size={14} className="text-primary" /> Relatórios quinzenais
      </h3>
      {!pronto ? (
        <p className="text-xs text-muted-foreground">Carregando…</p>
      ) : quinzReports.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhum relatório quinzenal preenchido ainda.</p>
      ) : quinzReports.map((report) => {
        const isGood = report.communicationHealth >= 4;
        const isBad = report.communicationHealth <= 2;
        return (
          <div key={report.id} className={`rounded-xl border p-4 ${isBad ? "border-lone-danger-border" : isGood ? "border-primary/20" : "border-border"}`}>
            <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
              <div>
                <h4 className="font-semibold text-foreground">{report.clientName}</h4>
                <p className="text-xs text-muted-foreground mt-0.5">Período: {report.period} · por {report.createdBy}</p>
              </div>
              <div className="flex items-start gap-4 text-center">
                <button
                  onClick={() => exportReportAsPdf({
                    title: "Relatório Quinzenal",
                    subtitle: report.period,
                    clientName: report.clientName,
                    period: report.period,
                    createdBy: report.createdBy,
                    createdAt: report.createdAt,
                    sections: [
                      { label: "Saúde da Comunicação", value: report.communicationHealth, type: "score" },
                      { label: "Engajamento do Cliente", value: report.clientEngagement, type: "score" },
                      { label: "Destaques", value: report.highlights, type: "text" },
                      { label: "Desafios", value: report.challenges, type: "text" },
                      { label: "Próximos Passos", value: report.nextSteps, type: "text" },
                    ],
                  })}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                  title="Exportar PDF"
                  aria-label="Exportar PDF"
                >
                  <Download size={14} />
                </button>
                <div>
                  <div className="flex gap-1 justify-center">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <span key={n} className={`w-4 h-4 rounded-sm ${n <= report.communicationHealth ? (isBad ? "bg-destructive" : "bg-primary") : "bg-muted"}`} />
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Saúde da Comunicação</p>
                </div>
                <div>
                  <div className="flex gap-1 justify-center">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <span key={n} className={`w-4 h-4 rounded-sm ${n <= report.clientEngagement ? "bg-primary" : "bg-muted"}`} />
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Engajamento do Cliente</p>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-xs text-primary font-medium mb-1">Destaques</p>
                <p className="text-muted-foreground leading-relaxed">{report.highlights}</p>
              </div>
              <div>
                <p className="text-xs text-lone-danger font-medium mb-1">Desafios</p>
                <p className="text-muted-foreground leading-relaxed">{report.challenges}</p>
              </div>
              <div>
                <p className="text-xs text-primary font-medium mb-1">Próximos Passos</p>
                <p className="text-muted-foreground leading-relaxed">{report.nextSteps}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
