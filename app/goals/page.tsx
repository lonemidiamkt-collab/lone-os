"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  Target, TrendingUp, Users, ChevronDown,
  Instagram, Palette, BarChart2, ArrowUp, ArrowDown, Minus,
  Download, Monitor, X, Calendar, Clock,
  Maximize2, Minimize2, Brain, AlertTriangle, Zap,
  Activity, CheckCircle, TrendingDown, Shield, Settings, Pencil, Save, Trash2,
} from "lucide-react";
import { useClientsStore } from "@/stores/useClientsStore";
import { useTeamMembers } from "@/lib/hooks/useTeamMembers";
import { calcHealthScore } from "@/lib/utils";
import { useOKRMetrics, type KPIValue } from "@/lib/hooks/useOKRMetrics";
import { useSnapshots, type Delta } from "@/lib/hooks/useSnapshots";
import { useOKRData } from "@/lib/hooks/useOKRData";
import { useRole } from "@/lib/context/RoleContext";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

// ─── Types ──────────────────────────────────────────────────────────────────
interface OKR {
  id: string;
  title: string;
  target: number;
  current: number;
  unit: string;
  status: "on_track" | "at_risk" | "off_track";
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

interface PeriodSnapshot {
  companyOkrs: OKR[];
  teamOkrs: TeamOKRs[];
  individualGoals: Array<{ name: string; role: string; goal: string; progress: number; status: "on_track" | "at_risk" | "off_track" }>;
  trendData: { label: string; trafego: number; social: number; design: number }[];
  overallProgress: number;
}

type TimeView = "atual" | "mensal" | "trimestral" | "ytd";

const STATUS_CONFIG = {
  on_track: { label: "No ritmo", color: "text-lone-success bg-lone-success-bg border-lone-success-border", icon: ArrowUp },
  at_risk: { label: "Em risco", color: "text-lone-warning bg-lone-warning-bg border-lone-warning-border", icon: Minus },
  off_track: { label: "Atrasado", color: "text-destructive bg-destructive/10 border-destructive/20", icon: ArrowDown },
};

const MONTHS = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

// ─── Current Data ───────────────────────────────────────────────────────────
// Goals are dynamically generated from real team members
const ROLE_LABELS: Record<string, string> = { traffic: "Trafego", social: "Social", designer: "Design", manager: "Gerente", admin: "Admin" };
const ROLE_GOALS: Record<string, string> = {
  traffic: "Otimizar ROAS e reduzir CPA",
  social: "Meta de posts entregues no prazo",
  designer: "Todas entregas em < 48h",
  manager: "Gestao operacional eficiente",
  admin: "Supervisao geral",
};

// (removido: TEAM_OKRS_CURRENT era mock não utilizado — o render usa realTeamOkrs + generateSnapshot)

// ─── Historical Snapshot Generator (called inside component with real team data) ──
function generateSnapshot(month: number, variance: number, teamMembersList: Array<{ name: string; role: string }>): Omit<PeriodSnapshot, "companyOkrs"> {
  const v = variance;
  const status = (current: number, target: number, inverted = false): "on_track" | "at_risk" | "off_track" => {
    const pct = inverted ? (target / Math.max(current, 0.01)) * 100 : (current / target) * 100;
    return pct >= 80 ? "on_track" : pct >= 60 ? "at_risk" : "off_track";
  };

  const teamOkrs: TeamOKRs[] = [
    { team: "Trafego Pago", icon: TrendingUp, color: "var(--primary)", okrs: [
      { id: "tr-1", title: "ROAS medio > 4.0", target: 4.0, current: +(3.2 + v * 0.5).toFixed(1), unit: "x", status: status(3.2 + v * 0.5, 4.0) },
      { id: "tr-2", title: "Investimento executado > 95%", target: 95, current: Math.round(78 + v * 10), unit: "%", status: status(78 + v * 10, 95) },
      { id: "tr-3", title: "Novos leads/mes > 500", target: 500, current: Math.round(320 + v * 100), unit: "leads", status: status(320 + v * 100, 500) },
    ]},
    { team: "Social Media", icon: Instagram, color: "var(--primary)", okrs: [
      { id: "so-1", title: "Posts entregues/mes > 96", target: 96, current: Math.round(60 + v * 18), unit: "posts", status: status(60 + v * 18, 96) },
      { id: "so-2", title: "Engajamento medio > 3.5%", target: 3.5, current: +(2.6 + v * 0.5).toFixed(1), unit: "%", status: status(2.6 + v * 0.5, 3.5) },
      { id: "so-3", title: "SLA de entrega < 48h", target: 48, current: Math.round(55 - v * 13), unit: "horas", status: status(55 - v * 13, 48, true) },
    ]},
    { team: "Design", icon: Palette, color: "var(--chart-4)", okrs: [
      { id: "de-1", title: "Pedidos no prazo > 90%", target: 90, current: Math.round(75 + v * 10), unit: "%", status: status(75 + v * 10, 90) },
      { id: "de-2", title: "Tempo medio < 3 dias", target: 3, current: +(3.5 - v * 0.7).toFixed(1), unit: "dias", status: status(3.5 - v * 0.7, 3, true) },
      { id: "de-3", title: "Satisfacao > 4.5/5", target: 4.5, current: +(3.8 + v * 0.4).toFixed(1), unit: "/5", status: status(3.8 + v * 0.4, 4.5) },
    ]},
  ];

  const individualGoals = teamMembersList.filter((m) => m.role !== "admin").map((m) => {
    const baseProgress = 60 + v * 20 + Math.round(m.name.length * 2.3) % 20;
    const progress = Math.min(100, Math.max(10, Math.round(baseProgress)));
    return {
      name: m.name,
      role: ROLE_LABELS[m.role] ?? m.role,
      goal: ROLE_GOALS[m.role] ?? "Meta operacional",
      progress,
      status: progress >= 80 ? "on_track" as const : "at_risk" as const,
    };
  });

  const weeks = 4;
  const trendData = Array.from({ length: weeks }, (_, i) => {
    const w = i + 1;
    const base = 50 + v * 25;
    return {
      label: `S${w}`,
      trafego: Math.round(base + w * 3 + (month + i) * 1.3 % 5),
      social: Math.round(base - 5 + w * 3 + (month + i) * 1.7 % 5),
      design: Math.round(base + 8 + w * 2 + (month + i) * 1.1 % 5),
    };
  });

  const allOkrs = teamOkrs.flatMap((t) => t.okrs);
  const overallProgress = Math.round(allOkrs.reduce((sum, o) => {
    const pct = o.title.includes("<") ? (o.target / Math.max(o.current, 0.01)) * 100 : (o.current / o.target) * 100;
    return sum + Math.min(100, pct);
  }, 0) / allOkrs.length);

  return { teamOkrs, individualGoals, trendData, overallProgress };
}

// Quarterly/YTD helpers moved inside component (need teamMembers)

// ─── Component ──────────────────────────────────────────────────────────────
// Helper to convert KPIValue to OKR
function kpiToOkr(id: string, title: string, kpi: KPIValue, inverted = false): OKR {
  const pct = inverted
    ? (kpi.target / Math.max(kpi.current, 0.01)) * 100
    : (kpi.current / kpi.target) * 100;
  return {
    id, title, target: kpi.target, current: kpi.current, unit: kpi.unit,
    status: pct >= 80 ? "on_track" : pct >= 60 ? "at_risk" : "off_track",
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
  const { currentSnapshot, previousSnapshot, deltas, feedback, churnAlerts, saveCurrentSnapshot } = useSnapshots();
  const pageRef = useRef<HTMLDivElement>(null);
  const [activeLayer, setActiveLayer] = useState<"strategy" | "operations">("strategy");

  // Time controls
  const [timeView, setTimeView] = useState<TimeView>("atual");
  const [selectedMonth, setSelectedMonth] = useState(3); // April (0-indexed)
  const [selectedQuarter, setSelectedQuarter] = useState(1); // Q2 (0-indexed)
  const [showMonthPicker, setShowMonthPicker] = useState(false);

  // Presentation mode
  const [presentationMode, setPresentationMode] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Animated transition key
  const [transitionKey, setTransitionKey] = useState(0);

  // Company OKRs (always from real data via hook)
  const companyOkrs = useMemo<OKR[]>(() => [
    kpiToOkr("co-1", "Reduzir churn para < 5%", metrics.company.churnRate, true),
    kpiToOkr("co-2", "Atingir NPS > 8.5", metrics.company.nps),
    kpiToOkr("co-3", "Clientes ativos", metrics.company.activeClients),
    kpiToOkr("co-4", "Novos clientes/mes", metrics.company.newClients),
  ], [metrics.company]);

  // Generate monthly snapshots using real team data
  const MONTHLY_SNAPSHOTS = useMemo(() => {
    const snaps: Record<number, Omit<PeriodSnapshot, "companyOkrs">> = {};
    for (let m = 0; m < 12; m++) {
      snaps[m] = generateSnapshot(m, m / 11, teamMembers);
    }
    return snaps;
  }, [teamMembers]);

  const getQuarterSnapshot = useCallback((q: number): Omit<PeriodSnapshot, "companyOkrs"> => {
    const endMonth = Math.min(q * 3 + 2, 11);
    const snap = MONTHLY_SNAPSHOTS[endMonth];
    const trendData: { label: string; trafego: number; social: number; design: number }[] = [];
    for (let m = q * 3; m <= endMonth; m++) {
      const ms = MONTHLY_SNAPSHOTS[m];
      ms.trendData.forEach((w, i) => {
        trendData.push({ ...w, label: `${MONTHS[m]} S${i + 1}` });
      });
    }
    return { ...snap, trendData };
  }, [MONTHLY_SNAPSHOTS]);

  const getYTDSnapshot = useCallback((currentMonth: number): Omit<PeriodSnapshot, "companyOkrs"> => {
    const snap = MONTHLY_SNAPSHOTS[currentMonth];
    const trendData: { label: string; trafego: number; social: number; design: number }[] = [];
    for (let m = 0; m <= currentMonth; m++) {
      const ms = MONTHLY_SNAPSHOTS[m];
      const lastWeek = ms.trendData[ms.trendData.length - 1];
      trendData.push({ ...lastWeek, label: MONTHS[m] });
    }
    return { ...snap, trendData };
  }, [MONTHLY_SNAPSHOTS]);

  // Investimento Executado REAL (ad_accounts: gasto ÷ verba dos clientes em operação)
  // sobrescreve o valor mock do hook quando há dado real de spend
  const [realInvestPct, setRealInvestPct] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/okr/traffic-metrics")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d?.isReal && typeof d.investmentExecutedPct === "number") setRealInvestPct(d.investmentExecutedPct); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const investmentKpi = useMemo<KPIValue>(() => (
    realInvestPct != null
      ? { ...metrics.traffic.investmentExecuted, current: realInvestPct, isReal: true, source: "ad_accounts" }
      : metrics.traffic.investmentExecuted
  ), [metrics.traffic.investmentExecuted, realInvestPct]);

  // Real team OKRs for "atual" view
  const realTeamOkrs = useMemo<TeamOKRs[]>(() => [
    { team: "Trafego Pago", icon: TrendingUp, color: "var(--primary)", okrs: [
      kpiToOkr("tr-1", "ROAS medio > 4.0", metrics.traffic.roas),
      kpiToOkr("tr-2", "Investimento executado > 95%", investmentKpi),
      kpiToOkr("tr-3", "Novos leads/mes > 500", metrics.traffic.leadsPerMonth),
    ]},
    { team: "Social Media", icon: Instagram, color: "var(--primary)", okrs: [
      kpiToOkr("so-1", "Posts entregues/mes > 96", metrics.social.postsDelivered),
      kpiToOkr("so-2", "Engajamento medio > 3.5%", metrics.social.engagementRate),
      kpiToOkr("so-3", "SLA de entrega < 48h", metrics.social.deliverySLA, true),
    ]},
    { team: "Design", icon: Palette, color: "var(--chart-4)", okrs: [
      kpiToOkr("de-1", "Pedidos no prazo > 90%", metrics.design.onTimeDelivery),
      kpiToOkr("de-2", "Tempo medio < 3 dias", metrics.design.avgDeliveryTime, true),
      kpiToOkr("de-3", "Satisfacao > 4.5/5", metrics.design.satisfaction),
    ]},
  ], [metrics.traffic, metrics.social, metrics.design, investmentKpi]);

  // Resolve snapshot based on selected time view
  const snapshot = useMemo<PeriodSnapshot>(() => {
    let base: Omit<PeriodSnapshot, "companyOkrs">;
    switch (timeView) {
      case "mensal":
        base = MONTHLY_SNAPSHOTS[selectedMonth];
        break;
      case "trimestral":
        base = getQuarterSnapshot(selectedQuarter);
        break;
      case "ytd":
        base = getYTDSnapshot(selectedMonth);
        break;
      default: { // atual
        const currentGoals = teamMembers.filter((m) => m.role !== "admin").map((m) => ({
          name: m.name,
          role: ROLE_LABELS[m.role] ?? m.role,
          goal: ROLE_GOALS[m.role] ?? "Meta operacional",
          progress: 0,
          status: "on_track" as const,
        }));
        base = {
          teamOkrs: realTeamOkrs,
          individualGoals: currentGoals,
          trendData: [
            { label: "S1", trafego: 62, social: 55, design: 70 },
            { label: "S2", trafego: 68, social: 60, design: 72 },
            { label: "S3", trafego: 72, social: 65, design: 78 },
            { label: "S4", trafego: 75, social: 68, design: 80 },
            { label: "S5", trafego: 78, social: 72, design: 82 },
            { label: "S6", trafego: 80, social: 75, design: 85 },
            { label: "S7", trafego: 82, social: 78, design: 88 },
            { label: "S8", trafego: 85, social: 81, design: 90 },
          ],
          overallProgress: 0,
        };
      }
    }
    return { ...base, companyOkrs };
  }, [timeView, selectedMonth, selectedQuarter, companyOkrs, realTeamOkrs, teamMembers, MONTHLY_SNAPSHOTS, getQuarterSnapshot, getYTDSnapshot]);

  const getProgress = useCallback((okr: OKR) => {
    if (okr.title.includes("<")) return Math.min(100, Math.round((okr.target / Math.max(okr.current, 0.01)) * 100));
    return Math.min(100, Math.round((okr.current / okr.target) * 100));
  }, []);

  const overallProgress = useMemo(() => {
    if (timeView !== "atual" && snapshot.overallProgress) return snapshot.overallProgress;
    const allOkrs = [...snapshot.companyOkrs, ...snapshot.teamOkrs.flatMap((t) => t.okrs)];
    return Math.round(allOkrs.reduce((sum, o) => sum + getProgress(o), 0) / allOkrs.length);
  }, [snapshot, getProgress, timeView]);

  // Period label
  const periodLabel = useMemo(() => {
    switch (timeView) {
      case "mensal": return `${MONTHS[selectedMonth]} 2026`;
      case "trimestral": return `Q${selectedQuarter + 1} 2026`;
      case "ytd": return "Jan — Abr 2026";
      default: return "Visao Atual";
    }
  }, [timeView, selectedMonth, selectedQuarter]);

  // Switch period with animation
  const switchPeriod = useCallback((view: TimeView, month?: number, quarter?: number) => {
    setTimeView(view);
    if (month !== undefined) setSelectedMonth(month);
    if (quarter !== undefined) setSelectedQuarter(quarter);
    setTransitionKey((k) => k + 1);
    setShowMonthPicker(false);
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
      const canvas = await html2canvas(el, { backgroundColor: "#000000", scale: 2, useCORS: true, logging: false });
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

  const TIME_VIEWS: { key: TimeView; label: string; icon: typeof Clock }[] = [
    { key: "atual", label: "Atual", icon: Target },
    { key: "mensal", label: "Mensal", icon: Calendar },
    { key: "trimestral", label: "Trimestral", icon: BarChart2 },
    { key: "ytd", label: "YTD", icon: TrendingUp },
  ];

  return (
    <div
      ref={pageRef}
      className={`animate-fade-in ${
        presentationMode
          ? "fixed inset-0 z-[9999] bg-black overflow-auto p-8"
          : "p-6"
      }`}
    >
      <div className="space-y-6 max-w-[1400px] mx-auto">
        {/* ─── Banner de dados simulados ───────────────────────── */}
        {timeView === "atual" && (() => {
          const allOkrs = [...snapshot.companyOkrs, ...snapshot.teamOkrs.flatMap((t) => t.okrs)];
          const simCount = allOkrs.filter((o) => o.isReal === false).length;
          if (simCount === 0) return null;
          return (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-lone-warning-bg border border-lone-warning-border text-lone-warning text-xs">
              <span className="text-lone-warning">⚠</span>
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
            {/* Time View Selector */}
            <div className="flex items-center bg-card rounded-xl p-0.5 border border-border">
              {TIME_VIEWS.map((tv) => {
                const Icon = tv.icon;
                const active = timeView === tv.key;
                return (
                  <button
                    key={tv.key}
                    onClick={() => switchPeriod(tv.key)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                      active
                        ? "bg-primary text-primary-foreground shadow-lg"
                        : "text-muted-foreground hover:text-muted-foreground"
                    }`}
                  >
                    <Icon size={12} />
                    {tv.label}
                  </button>
                );
              })}
            </div>

            {/* Month/Quarter sub-selector */}
            {timeView === "mensal" && (
              <div className="relative">
                <button
                  onClick={() => setShowMonthPicker(!showMonthPicker)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-card border border-border text-foreground hover:border-border transition-all"
                >
                  {MONTHS[selectedMonth]}
                  <ChevronDown size={12} className="text-muted-foreground" />
                </button>
                {showMonthPicker && (
                  <div className="absolute top-full right-0 mt-1 bg-card border border-border rounded-xl p-2 z-50 grid grid-cols-3 gap-1 animate-fade-in shadow-lg">
                    {MONTHS.map((m, i) => (
                      <button
                        key={m}
                        onClick={() => switchPeriod("mensal", i)}
                        className={`px-3 py-1.5 rounded-lg text-xs transition-all ${
                          i === selectedMonth
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:text-foreground hover:bg-muted"
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {timeView === "trimestral" && (
              <div className="flex items-center gap-1">
                {[0, 1, 2, 3].map((q) => (
                  <button
                    key={q}
                    onClick={() => switchPeriod("trimestral", undefined, q)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      q === selectedQuarter
                        ? "bg-primary text-primary-foreground shadow-lg"
                        : "text-muted-foreground hover:text-muted-foreground"
                    }`}
                  >
                    Q{q + 1}
                  </button>
                ))}
              </div>
            )}

            {/* Divider */}
            <div className="w-px h-6 bg-muted mx-1" />

            {/* Export / Presentation */}
            <div className="relative">
              <button
                onClick={() => setShowExportMenu(!showExportMenu)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border border-border text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all"
              >
                <Download size={13} />
                Relatorio
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
                    Modo Apresentacao
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
        <div key={transitionKey} className="space-y-6 animate-fade-in">
          {/* Overall progress */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-foreground">
                Progresso Geral — {periodLabel}
              </h2>
              <span className="text-2xl font-bold text-primary tabular-nums">{overallProgress}%</span>
            </div>
            <div className="w-full h-3 rounded-full bg-card overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary to-primary transition-all duration-700"
                style={{ width: `${overallProgress}%` }}
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
                    <div className="w-full h-2 rounded-full bg-card overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          progress >= 80 ? "bg-lone-success-bg" : progress >= 60 ? "bg-lone-warning-bg" : "bg-destructive"
                        }`}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1 text-right">{progress}%</p>
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
                const teamProgress = Math.round(team.okrs.reduce((sum, o) => sum + getProgress(o), 0) / team.okrs.length);
                return (
                  <div key={team.team} className="card p-4">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${team.color}15` }}>
                        <TeamIcon size={16} style={{ color: team.color }} />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-sm font-semibold text-foreground">{team.team}</h3>
                        <p className="text-[10px] text-muted-foreground">Progresso: {teamProgress}%</p>
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
                              <div className="flex-1 h-1.5 rounded-full bg-card overflow-hidden">
                                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${progress}%`, backgroundColor: team.color }} />
                              </div>
                              <span className="text-[10px] text-muted-foreground w-8 text-right tabular-nums">{progress}%</span>
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

          {/* Trend Chart + Individual Goals */}
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_400px] gap-6">
            <div className="card p-4">
              <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                <TrendingUp size={14} className="text-primary" />
                Evolucao de OKRs (%) — {periodLabel}
              </h3>
              <div className={presentationMode ? "h-[350px]" : "h-[250px]"}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={snapshot.trendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="label" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={false} />
                    <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={false} domain={[40, 100]} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: "12px", fontSize: "12px" }}
                      labelStyle={{ color: "var(--foreground)" }}
                    />
                    <Line type="monotone" dataKey="trafego" stroke="var(--primary)" strokeWidth={2} dot={{ r: 3 }} name="Trafego" />
                    <Line type="monotone" dataKey="social" stroke="var(--primary)" strokeWidth={2} dot={{ r: 3 }} name="Social" />
                    <Line type="monotone" dataKey="design" stroke="var(--chart-4)" strokeWidth={2} dot={{ r: 3 }} name="Design" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="flex items-center justify-center gap-6 mt-2">
                {[
                  { key: "trafego", color: "var(--primary)", label: "Trafego" },
                  { key: "social", color: "var(--primary)", label: "Social" },
                  { key: "design", color: "var(--chart-4)", label: "Design" },
                ].map((l) => (
                  <div key={l.key} className="flex items-center gap-1.5">
                    <span className="w-3 h-0.5 rounded" style={{ backgroundColor: l.color }} />
                    <span className="text-[10px] text-muted-foreground">{l.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="card p-4">
              <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                <Users size={14} className="text-primary" />
                Metas Individuais
              </h3>
              <div className="space-y-3">
                {snapshot.individualGoals.map((person) => {
                  const cfg = STATUS_CONFIG[person.status];
                  const StatusIcon = cfg.icon;
                  return (
                    <div key={person.name} className="p-3 rounded-xl bg-card border border-border">
                      <div className="flex items-center justify-between mb-1.5">
                        <div>
                          <span className="text-xs font-semibold text-foreground">{person.name}</span>
                          <span className="text-[10px] text-muted-foreground ml-2">{person.role}</span>
                        </div>
                        <span className={`flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full border ${cfg.color}`}>
                          <StatusIcon size={8} />
                          {cfg.label}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mb-2">{person.goal}</p>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-card overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              person.progress >= 80 ? "bg-lone-success-bg" : person.progress >= 60 ? "bg-lone-warning-bg" : "bg-destructive"
                            }`}
                            style={{ width: `${person.progress}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-muted-foreground w-8 text-right tabular-nums">{person.progress}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* ─── INTELLIGENCE PANEL — AI Feedback + Deltas ───── */}
        {timeView === "atual" && (
          <div className="space-y-6 animate-fade-in">
            {/* Layer switcher */}
            <div className="flex items-center gap-3">
              <div className="flex items-center bg-card rounded-xl p-0.5 border border-border">
                {([
                  { key: "strategy" as const, label: "Cockpit Estrategico", icon: Target },
                  { key: "operations" as const, label: "Chao de Fabrica", icon: Activity },
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
              <div className="h-5 w-px bg-card/[0.06]" />
              <button onClick={saveCurrentSnapshot}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-medium text-muted-foreground hover:text-foreground border border-border hover:border-border transition-all"
                title="Salvar snapshot do periodo atual">
                <Download size={11} /> Salvar Snapshot
              </button>
              {previousSnapshot && (
                <span className="text-[10px] text-muted-foreground">
                  Comparando com {previousSnapshot.period}
                </span>
              )}
            </div>

            {/* AI Feedback Card */}
            <div className="card-glow p-6">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Brain size={18} className="text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-sm font-semibold text-foreground">Analista Virtual</h3>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium tabular-nums ${
                      feedback.score >= 80 ? "text-lone-success bg-lone-success-bg border-lone-success-border" :
                      feedback.score >= 60 ? "text-lone-warning bg-lone-warning-bg border-lone-warning-border" :
                      "text-destructive bg-destructive/10 border-destructive/20"
                    }`}>
                      Score: {feedback.score}/100
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed mb-3">{feedback.summary}</p>

                  {/* Highlights + Bottlenecks */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {feedback.highlights.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-[10px] text-lone-success uppercase tracking-wider font-semibold flex items-center gap-1">
                          <CheckCircle size={10} /> Destaques
                        </p>
                        {feedback.highlights.map((h, i) => (
                          <p key={i} className="text-[11px] text-muted-foreground pl-4">+ {h}</p>
                        ))}
                      </div>
                    )}
                    {feedback.bottlenecks.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-[10px] text-destructive/70 uppercase tracking-wider font-semibold flex items-center gap-1">
                          <AlertTriangle size={10} /> Gargalos
                        </p>
                        {feedback.bottlenecks.map((b, i) => (
                          <p key={i} className="text-[11px] text-muted-foreground pl-4">- {b}</p>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Suggestion */}
                  <div className="mt-3 p-3 rounded-xl bg-primary/[0.04] border border-primary/[0.08]">
                    <p className="text-[10px] text-primary uppercase tracking-wider font-semibold mb-1 flex items-center gap-1">
                      <Zap size={10} /> Recomendacao
                    </p>
                    <p className="text-xs text-muted-foreground">{feedback.suggestion}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Churn Alerts */}
            {churnAlerts.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-foreground flex items-center gap-2">
                  <Shield size={12} className="text-destructive" />
                  Alertas Preditivos de Churn
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                  {churnAlerts.map((alert) => (
                    <div key={alert.metric}
                      className={`p-3 rounded-xl border ${
                        alert.severity === "critical"
                          ? "bg-destructive/[0.04] border-destructive/[0.12]"
                          : "bg-lone-warning-bg/[0.04] border-lone-warning-border/[0.12]"
                      }`}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          alert.severity === "critical" ? "bg-destructive" : "bg-lone-warning-bg"
                        }`} />
                        <span className={`text-[10px] font-semibold ${
                          alert.severity === "critical" ? "text-destructive" : "text-lone-warning"
                        }`}>
                          {alert.label}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">{alert.message}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Delta Grid */}
            {deltas.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-xs font-semibold text-foreground flex items-center gap-2">
                  <TrendingUp size={12} className="text-primary" />
                  Evolucao vs Periodo Anterior ({previousSnapshot?.period ?? "—"})
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {deltas.map((d) => (
                    <div key={d.metric} className="card p-4">
                      <p className="text-[10px] text-muted-foreground mb-1">{d.label}</p>
                      <div className="flex items-end gap-2">
                        <span className="text-lg font-bold text-foreground tabular-nums">
                          {d.current}{d.unit !== "pts" ? d.unit : ""}
                        </span>
                        {d.direction !== "stable" && (
                          <span className={`flex items-center gap-0.5 text-[11px] font-medium mb-0.5 ${
                            d.isGood ? "text-lone-success" : d.severity === "critical" ? "text-destructive" : "text-lone-warning"
                          }`}>
                            {d.direction === "up" ? <ArrowUp size={10} /> : <ArrowDown size={10} />}
                            {Math.abs(d.delta).toFixed(1)}%
                          </span>
                        )}
                        {d.direction === "stable" && (
                          <span className="text-[11px] text-muted-foreground mb-0.5">estavel</span>
                        )}
                      </div>
                      <div className="mt-2 h-1 rounded-full bg-card overflow-hidden">
                        <div className={`h-full rounded-full transition-all duration-700 ${
                          d.isGood ? "bg-lone-success-bg" : d.severity === "critical" ? "bg-destructive" : "bg-lone-warning-bg"
                        }`} style={{ width: `${Math.min(100, Math.max(5, 50 + d.delta))}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Operational KPIs (when Operations tab is active) */}
            {activeLayer === "operations" && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: "Posts Publicados", value: currentSnapshot.postsPublished, target: currentSnapshot.postsTarget, unit: `/${currentSnapshot.postsTarget}`, icon: Instagram },
                  { label: "SLA Compliance", value: currentSnapshot.slaCompliancePct, target: 85, unit: "%", icon: Clock },
                  { label: "Design no Prazo", value: currentSnapshot.designOnTimePct, target: 90, unit: "%", icon: Palette },
                  { label: "Tasks Vencidas", value: currentSnapshot.tasksOverdue, target: 0, unit: "", icon: AlertTriangle },
                ].map((kpi) => {
                  const Icon = kpi.icon;
                  const isGood = kpi.label === "Tasks Vencidas" ? kpi.value <= kpi.target : kpi.value >= kpi.target;
                  return (
                    <div key={kpi.label} className={`card p-5 ${!isGood ? "border-lone-warning-border/[0.15]" : ""}`}>
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
                        <div className="mt-3 h-1.5 rounded-full bg-card overflow-hidden">
                          <div className={`h-full rounded-full transition-all duration-700 ${
                            isGood ? "bg-primary" : "bg-lone-warning-bg"
                          }`} style={{ width: `${Math.min(100, (kpi.value / kpi.target) * 100)}%` }} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Close month picker on outside click */}
      {showMonthPicker && (
        <div className="fixed inset-0 z-40" onClick={() => setShowMonthPicker(false)} />
      )}
      {showExportMenu && (
        <div className="fixed inset-0 z-40" onClick={() => setShowExportMenu(false)} />
      )}

      {/* OKR Manager Panel */}
      {showOKRManager && isAdmin && (
        <div className="fixed inset-0 z-50 bg-black/60 flex justify-end" onClick={() => setShowOKRManager(false)}>
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
                const teamLabel = team === "company" ? "Empresa" : team === "traffic" ? "Trafego Pago" : team === "social" ? "Social Media" : "Design";
                return (
                  <div key={team} className="space-y-3">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{teamLabel}</p>
                    {teamOkrs.map((okr) => (
                      <div key={okr.id} className="rounded-xl border border-border bg-surface p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-medium text-foreground flex-1">{okr.title}</p>
                          <button onClick={async () => { await okrData.deleteOKR(okr.id); }}
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
                                  if (e.key === "Enter") { okrData.updateTarget(okr.id, Number(editingTarget.value)); setEditingTarget(null); }
                                  if (e.key === "Escape") setEditingTarget(null);
                                }} />
                              <span className="text-[10px] text-muted-foreground">{okr.unit}</span>
                              <button onClick={() => { okrData.updateTarget(okr.id, Number(editingTarget.value)); setEditingTarget(null); }}
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
                            okr.status === "on_track" ? "bg-lone-success-bg" : okr.status === "at_risk" ? "bg-lone-warning-bg" : "bg-destructive"
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
