"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  Target, TrendingUp, Users, ChevronDown,
  Instagram, Palette, BarChart2, ArrowUp, ArrowDown, Minus,
  Download, Monitor, X, Calendar, Clock,
  Maximize2, Minimize2, Brain, AlertTriangle, Zap,
  Activity, CheckCircle, TrendingDown, Shield,
} from "lucide-react";
import { useAppState } from "@/lib/context/AppStateContext";
import { calcHealthScore } from "@/lib/utils";
import { useOKRMetrics, type KPIValue } from "@/lib/hooks/useOKRMetrics";
import { useSnapshots, type Delta } from "@/lib/hooks/useSnapshots";
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
  individualGoals: typeof INDIVIDUAL_GOALS_CURRENT;
  trendData: { label: string; trafego: number; social: number; design: number }[];
  overallProgress: number;
}

type TimeView = "atual" | "mensal" | "trimestral" | "ytd";

const STATUS_CONFIG = {
  on_track: { label: "No ritmo", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20", icon: ArrowUp },
  at_risk: { label: "Em risco", color: "text-amber-400 bg-amber-500/10 border-amber-500/20", icon: Minus },
  off_track: { label: "Atrasado", color: "text-red-400 bg-red-500/10 border-red-500/20", icon: ArrowDown },
};

const MONTHS = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

// ─── Current Data ───────────────────────────────────────────────────────────
const INDIVIDUAL_GOALS_CURRENT = [
  { name: "Ana Lima", role: "Trafego", goal: "ROAS > 4.0 em 3 clientes", progress: 67, status: "at_risk" as const },
  { name: "Pedro Alves", role: "Trafego", goal: "Reduzir CPA em 15%", progress: 82, status: "on_track" as const },
  { name: "Carlos Melo", role: "Social", goal: "12 posts/semana entregues", progress: 75, status: "at_risk" as const },
  { name: "Mariana Costa", role: "Social", goal: "Engajamento > 4% em 2 clientes", progress: 90, status: "on_track" as const },
  { name: "Rafael Designer", role: "Design", goal: "Todas entregas em < 48h", progress: 93, status: "on_track" as const },
];

const TEAM_OKRS_CURRENT: TeamOKRs[] = [
  { team: "Trafego Pago", icon: TrendingUp, color: "#0d4af5", okrs: [
    { id: "tr-1", title: "ROAS medio > 4.0", target: 4.0, current: 3.7, unit: "x", status: "at_risk" },
    { id: "tr-2", title: "Investimento executado > 95%", target: 95, current: 88, unit: "%", status: "at_risk" },
    { id: "tr-3", title: "Novos leads/mes > 500", target: 500, current: 420, unit: "leads", status: "at_risk" },
  ]},
  { team: "Social Media", icon: Instagram, color: "#3b6ff5", okrs: [
    { id: "so-1", title: "Posts entregues/mes > 96", target: 96, current: 78, unit: "posts", status: "off_track" },
    { id: "so-2", title: "Engajamento medio > 3.5%", target: 3.5, current: 3.1, unit: "%", status: "at_risk" },
    { id: "so-3", title: "SLA de entrega < 48h", target: 48, current: 42, unit: "horas", status: "on_track" },
  ]},
  { team: "Design", icon: Palette, color: "#8b5cf6", okrs: [
    { id: "de-1", title: "Pedidos no prazo > 90%", target: 90, current: 85, unit: "%", status: "at_risk" },
    { id: "de-2", title: "Tempo medio < 3 dias", target: 3, current: 2.8, unit: "dias", status: "on_track" },
    { id: "de-3", title: "Satisfacao > 4.5/5", target: 4.5, current: 4.2, unit: "/5", status: "on_track" },
  ]},
];

// ─── Mock Historical Snapshots ──────────────────────────────────────────────
function generateSnapshot(month: number, variance: number): Omit<PeriodSnapshot, "companyOkrs"> {
  const v = variance;
  const status = (current: number, target: number, inverted = false): "on_track" | "at_risk" | "off_track" => {
    const pct = inverted ? (target / Math.max(current, 0.01)) * 100 : (current / target) * 100;
    return pct >= 80 ? "on_track" : pct >= 60 ? "at_risk" : "off_track";
  };

  const teamOkrs: TeamOKRs[] = [
    { team: "Trafego Pago", icon: TrendingUp, color: "#0d4af5", okrs: [
      { id: "tr-1", title: "ROAS medio > 4.0", target: 4.0, current: +(3.2 + v * 0.5).toFixed(1), unit: "x", status: status(3.2 + v * 0.5, 4.0) },
      { id: "tr-2", title: "Investimento executado > 95%", target: 95, current: Math.round(78 + v * 10), unit: "%", status: status(78 + v * 10, 95) },
      { id: "tr-3", title: "Novos leads/mes > 500", target: 500, current: Math.round(320 + v * 100), unit: "leads", status: status(320 + v * 100, 500) },
    ]},
    { team: "Social Media", icon: Instagram, color: "#3b6ff5", okrs: [
      { id: "so-1", title: "Posts entregues/mes > 96", target: 96, current: Math.round(60 + v * 18), unit: "posts", status: status(60 + v * 18, 96) },
      { id: "so-2", title: "Engajamento medio > 3.5%", target: 3.5, current: +(2.6 + v * 0.5).toFixed(1), unit: "%", status: status(2.6 + v * 0.5, 3.5) },
      { id: "so-3", title: "SLA de entrega < 48h", target: 48, current: Math.round(55 - v * 13), unit: "horas", status: status(55 - v * 13, 48, true) },
    ]},
    { team: "Design", icon: Palette, color: "#8b5cf6", okrs: [
      { id: "de-1", title: "Pedidos no prazo > 90%", target: 90, current: Math.round(75 + v * 10), unit: "%", status: status(75 + v * 10, 90) },
      { id: "de-2", title: "Tempo medio < 3 dias", target: 3, current: +(3.5 - v * 0.7).toFixed(1), unit: "dias", status: status(3.5 - v * 0.7, 3, true) },
      { id: "de-3", title: "Satisfacao > 4.5/5", target: 4.5, current: +(3.8 + v * 0.4).toFixed(1), unit: "/5", status: status(3.8 + v * 0.4, 4.5) },
    ]},
  ];

  const individualGoals = INDIVIDUAL_GOALS_CURRENT.map((g) => ({
    ...g,
    progress: Math.min(100, Math.max(10, Math.round(g.progress - 25 + v * 25))),
    status: (g.progress - 25 + v * 25) >= 80 ? "on_track" as const : "at_risk" as const,
  }));

  // Generate weekly trend data for the period
  const weeks = 4;
  const trendData = Array.from({ length: weeks }, (_, i) => {
    const w = i + 1;
    const base = 50 + v * 25;
    return {
      label: `S${w}`,
      trafego: Math.round(base + w * 3 + Math.random() * 5),
      social: Math.round(base - 5 + w * 3 + Math.random() * 5),
      design: Math.round(base + 8 + w * 2 + Math.random() * 5),
    };
  });

  const allOkrs = teamOkrs.flatMap((t) => t.okrs);
  const overallProgress = Math.round(allOkrs.reduce((sum, o) => {
    const pct = o.title.includes("<") ? (o.target / Math.max(o.current, 0.01)) * 100 : (o.current / o.target) * 100;
    return sum + Math.min(100, pct);
  }, 0) / allOkrs.length);

  return { teamOkrs, individualGoals, trendData, overallProgress };
}

// Monthly snapshots: Jan(0) to current month
const MONTHLY_SNAPSHOTS: Record<number, Omit<PeriodSnapshot, "companyOkrs">> = {};
for (let m = 0; m < 12; m++) {
  MONTHLY_SNAPSHOTS[m] = generateSnapshot(m, m / 11);
}

// Quarterly: aggregate 3 months of trend data
function getQuarterSnapshot(q: number): Omit<PeriodSnapshot, "companyOkrs"> {
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
}

// YTD: all months up to current
function getYTDSnapshot(currentMonth: number): Omit<PeriodSnapshot, "companyOkrs"> {
  const snap = MONTHLY_SNAPSHOTS[currentMonth];
  const trendData: { label: string; trafego: number; social: number; design: number }[] = [];
  for (let m = 0; m <= currentMonth; m++) {
    const ms = MONTHLY_SNAPSHOTS[m];
    // Just use last week of each month for YTD view
    const lastWeek = ms.trendData[ms.trendData.length - 1];
    trendData.push({ ...lastWeek, label: MONTHS[m] });
  }
  return { ...snap, trendData };
}

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
      className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400/80 border border-amber-500/15 ml-1.5 cursor-help"
      title={source ? `Fonte: ${source}` : "Dado simulado"}
    >
      Simulado
    </span>
  );
}

export default function GoalsPage() {
  const { clients } = useAppState();
  const metrics = useOKRMetrics();
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
  ], [metrics.company]);

  // Real team OKRs for "atual" view
  const realTeamOkrs = useMemo<TeamOKRs[]>(() => [
    { team: "Trafego Pago", icon: TrendingUp, color: "#0d4af5", okrs: [
      kpiToOkr("tr-1", "ROAS medio > 4.0", metrics.traffic.roas),
      kpiToOkr("tr-2", "Investimento executado > 95%", metrics.traffic.investmentExecuted),
      kpiToOkr("tr-3", "Novos leads/mes > 500", metrics.traffic.leadsPerMonth),
    ]},
    { team: "Social Media", icon: Instagram, color: "#3b6ff5", okrs: [
      kpiToOkr("so-1", "Posts entregues/mes > 96", metrics.social.postsDelivered),
      kpiToOkr("so-2", "Engajamento medio > 3.5%", metrics.social.engagementRate),
      kpiToOkr("so-3", "SLA de entrega < 48h", metrics.social.deliverySLA, true),
    ]},
    { team: "Design", icon: Palette, color: "#8b5cf6", okrs: [
      kpiToOkr("de-1", "Pedidos no prazo > 90%", metrics.design.onTimeDelivery),
      kpiToOkr("de-2", "Tempo medio < 3 dias", metrics.design.avgDeliveryTime, true),
      kpiToOkr("de-3", "Satisfacao > 4.5/5", metrics.design.satisfaction),
    ]},
  ], [metrics.traffic, metrics.social, metrics.design]);

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
      default: // atual
        base = {
          teamOkrs: realTeamOkrs,
          individualGoals: INDIVIDUAL_GOALS_CURRENT,
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
    return { ...base, companyOkrs };
  }, [timeView, selectedMonth, selectedQuarter, companyOkrs, realTeamOkrs]);

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
      if (!el) return;
      const html2canvas = (await import("html2canvas")).default;
      const jsPDF = (await import("jspdf")).default;
      const canvas = await html2canvas(el, { backgroundColor: "#000000", scale: 2 });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: [canvas.width / 2, canvas.height / 2] });
      pdf.addImage(imgData, "PNG", 0, 0, canvas.width / 2, canvas.height / 2);
      pdf.save(`OKRs_${periodLabel.replace(/\s/g, "_")}.pdf`);
    } catch {
      alert("Erro ao gerar PDF. Verifique se as dependencias estao instaladas (html2canvas, jspdf).");
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
        {/* ─── Header ──────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {!presentationMode && (
              <div className="w-10 h-10 rounded-xl bg-[#0d4af5]/10 flex items-center justify-center">
                <Target size={20} className="text-[#0d4af5]" />
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
            {/* Time View Selector */}
            <div className="flex items-center bg-zinc-900/50 rounded-xl p-0.5 border border-zinc-800/50">
              {TIME_VIEWS.map((tv) => {
                const Icon = tv.icon;
                const active = timeView === tv.key;
                return (
                  <button
                    key={tv.key}
                    onClick={() => switchPeriod(tv.key)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                      active
                        ? "bg-[#0d4af5] text-white shadow-[0_2px_8px_rgba(10,52,245,0.25)]"
                        : "text-zinc-500 hover:text-zinc-300"
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
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-900/50 border border-zinc-800/50 text-foreground hover:border-zinc-700 transition-all"
                >
                  {MONTHS[selectedMonth]}
                  <ChevronDown size={12} className="text-zinc-500" />
                </button>
                {showMonthPicker && (
                  <div className="absolute top-full right-0 mt-1 bg-[#111118] border border-zinc-800 rounded-xl p-2 z-50 grid grid-cols-3 gap-1 animate-fade-in shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
                    {MONTHS.map((m, i) => (
                      <button
                        key={m}
                        onClick={() => switchPeriod("mensal", i)}
                        className={`px-3 py-1.5 rounded-lg text-xs transition-all ${
                          i === selectedMonth
                            ? "bg-[#0d4af5] text-white"
                            : "text-zinc-400 hover:text-white hover:bg-zinc-800"
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
                        ? "bg-[#0d4af5] text-white shadow-[0_2px_8px_rgba(10,52,245,0.25)]"
                        : "text-zinc-500 hover:text-zinc-300"
                    }`}
                  >
                    Q{q + 1}
                  </button>
                ))}
              </div>
            )}

            {/* Divider */}
            <div className="w-px h-6 bg-zinc-800 mx-1" />

            {/* Export / Presentation */}
            <div className="relative">
              <button
                onClick={() => setShowExportMenu(!showExportMenu)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border border-zinc-800 text-zinc-400 hover:text-foreground hover:border-[#0d4af5]/30 transition-all"
              >
                <Download size={13} />
                Relatorio
              </button>
              {showExportMenu && (
                <div className="absolute top-full right-0 mt-1 bg-[#111118] border border-zinc-800 rounded-xl p-1.5 z-50 w-52 animate-fade-in shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
                  <button
                    onClick={handleExportPDF}
                    disabled={exporting}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-zinc-300 hover:bg-zinc-800 hover:text-white transition-all disabled:opacity-40"
                  >
                    <Download size={13} className="text-[#0d4af5]" />
                    {exporting ? "Gerando..." : "Exportar PDF"}
                  </button>
                  <button
                    onClick={togglePresentation}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-zinc-300 hover:bg-zinc-800 hover:text-white transition-all"
                  >
                    <Monitor size={13} className="text-[#0d4af5]" />
                    Modo Apresentacao
                  </button>
                </div>
              )}
            </div>

            {/* Exit presentation */}
            {presentationMode && (
              <button
                onClick={togglePresentation}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-all"
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
              <span className="text-2xl font-bold text-[#0d4af5] tabular-nums">{overallProgress}%</span>
            </div>
            <div className="w-full h-3 rounded-full bg-zinc-900 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#0d4af5] to-[#3b6ff5] transition-all duration-700"
                style={{ width: `${overallProgress}%` }}
              />
            </div>
          </div>

          {/* Company OKRs */}
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <BarChart2 size={14} className="text-[#0d4af5]" />
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
                      <p className="text-[10px] text-amber-400/70 mb-1">{okr.error}</p>
                    )}
                    <div className="w-full h-2 rounded-full bg-zinc-900 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          progress >= 80 ? "bg-emerald-500" : progress >= 60 ? "bg-amber-500" : "bg-red-500"
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
              <Users size={14} className="text-[#0d4af5]" />
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
                              <div className="flex-1 h-1.5 rounded-full bg-zinc-900 overflow-hidden">
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
                <TrendingUp size={14} className="text-[#0d4af5]" />
                Evolucao de OKRs (%) — {periodLabel}
              </h3>
              <div className={presentationMode ? "h-[350px]" : "h-[250px]"}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={snapshot.trendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
                    <XAxis dataKey="label" tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} />
                    <YAxis tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} domain={[40, 100]} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#111118", border: "1px solid #1e1e1e", borderRadius: "12px", fontSize: "12px" }}
                      labelStyle={{ color: "#e8e8ec" }}
                    />
                    <Line type="monotone" dataKey="trafego" stroke="#0d4af5" strokeWidth={2} dot={{ r: 3 }} name="Trafego" />
                    <Line type="monotone" dataKey="social" stroke="#3b6ff5" strokeWidth={2} dot={{ r: 3 }} name="Social" />
                    <Line type="monotone" dataKey="design" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} name="Design" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="flex items-center justify-center gap-6 mt-2">
                {[
                  { key: "trafego", color: "#0d4af5", label: "Trafego" },
                  { key: "social", color: "#3b6ff5", label: "Social" },
                  { key: "design", color: "#8b5cf6", label: "Design" },
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
                <Users size={14} className="text-[#0d4af5]" />
                Metas Individuais
              </h3>
              <div className="space-y-3">
                {snapshot.individualGoals.map((person) => {
                  const cfg = STATUS_CONFIG[person.status];
                  const StatusIcon = cfg.icon;
                  return (
                    <div key={person.name} className="p-3 rounded-xl bg-zinc-900/30 border border-zinc-800/30">
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
                        <div className="flex-1 h-1.5 rounded-full bg-zinc-900 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              person.progress >= 80 ? "bg-emerald-500" : person.progress >= 60 ? "bg-amber-500" : "bg-red-500"
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
              <div className="flex items-center bg-zinc-900/30 rounded-xl p-0.5 border border-white/[0.04]">
                {([
                  { key: "strategy" as const, label: "Estrategia", icon: Target },
                  { key: "operations" as const, label: "Operacoes", icon: Activity },
                ]).map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button key={tab.key} onClick={() => setActiveLayer(tab.key)}
                      className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-all duration-200 ${
                        activeLayer === tab.key
                          ? "bg-[#0d4af5] text-white shadow-[0_2px_8px_rgba(13,74,245,0.25)]"
                          : "text-zinc-500 hover:text-zinc-300"
                      }`}>
                      <Icon size={12} /> {tab.label}
                    </button>
                  );
                })}
              </div>
              <div className="h-5 w-px bg-white/[0.06]" />
              <button onClick={saveCurrentSnapshot}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-medium text-zinc-500 hover:text-foreground border border-white/[0.06] hover:border-white/[0.1] transition-all"
                title="Salvar snapshot do periodo atual">
                <Download size={11} /> Salvar Snapshot
              </button>
              {previousSnapshot && (
                <span className="text-[10px] text-zinc-600">
                  Comparando com {previousSnapshot.period}
                </span>
              )}
            </div>

            {/* AI Feedback Card */}
            <div className="card-glow p-6">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-[#0d4af5]/10 flex items-center justify-center shrink-0">
                  <Brain size={18} className="text-[#0d4af5]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-sm font-semibold text-foreground">Analista Virtual</h3>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium tabular-nums ${
                      feedback.score >= 80 ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" :
                      feedback.score >= 60 ? "text-amber-400 bg-amber-500/10 border-amber-500/20" :
                      "text-red-400 bg-red-500/10 border-red-500/20"
                    }`}>
                      Score: {feedback.score}/100
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 leading-relaxed mb-3">{feedback.summary}</p>

                  {/* Highlights + Bottlenecks */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {feedback.highlights.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-[10px] text-emerald-400/70 uppercase tracking-wider font-semibold flex items-center gap-1">
                          <CheckCircle size={10} /> Destaques
                        </p>
                        {feedback.highlights.map((h, i) => (
                          <p key={i} className="text-[11px] text-zinc-400 pl-4">+ {h}</p>
                        ))}
                      </div>
                    )}
                    {feedback.bottlenecks.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-[10px] text-red-400/70 uppercase tracking-wider font-semibold flex items-center gap-1">
                          <AlertTriangle size={10} /> Gargalos
                        </p>
                        {feedback.bottlenecks.map((b, i) => (
                          <p key={i} className="text-[11px] text-zinc-400 pl-4">- {b}</p>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Suggestion */}
                  <div className="mt-3 p-3 rounded-xl bg-[#0d4af5]/[0.04] border border-[#0d4af5]/[0.08]">
                    <p className="text-[10px] text-[#3b6ff5] uppercase tracking-wider font-semibold mb-1 flex items-center gap-1">
                      <Zap size={10} /> Recomendacao
                    </p>
                    <p className="text-xs text-zinc-300">{feedback.suggestion}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Churn Alerts */}
            {churnAlerts.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-foreground flex items-center gap-2">
                  <Shield size={12} className="text-red-400" />
                  Alertas Preditivos de Churn
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                  {churnAlerts.map((alert) => (
                    <div key={alert.metric}
                      className={`p-3 rounded-xl border ${
                        alert.severity === "critical"
                          ? "bg-red-500/[0.04] border-red-500/[0.12]"
                          : "bg-amber-500/[0.04] border-amber-500/[0.12]"
                      }`}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          alert.severity === "critical" ? "bg-red-400" : "bg-amber-400"
                        }`} />
                        <span className={`text-[10px] font-semibold ${
                          alert.severity === "critical" ? "text-red-400" : "text-amber-400"
                        }`}>
                          {alert.label}
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-400">{alert.message}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Delta Grid */}
            {deltas.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-xs font-semibold text-foreground flex items-center gap-2">
                  <TrendingUp size={12} className="text-[#0d4af5]" />
                  Evolucao vs Periodo Anterior ({previousSnapshot?.period ?? "—"})
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {deltas.map((d) => (
                    <div key={d.metric} className="card p-4">
                      <p className="text-[10px] text-zinc-500 mb-1">{d.label}</p>
                      <div className="flex items-end gap-2">
                        <span className="text-lg font-bold text-foreground tabular-nums">
                          {d.current}{d.unit !== "pts" ? d.unit : ""}
                        </span>
                        {d.direction !== "stable" && (
                          <span className={`flex items-center gap-0.5 text-[11px] font-medium mb-0.5 ${
                            d.isGood ? "text-emerald-400" : d.severity === "critical" ? "text-red-400" : "text-amber-400"
                          }`}>
                            {d.direction === "up" ? <ArrowUp size={10} /> : <ArrowDown size={10} />}
                            {Math.abs(d.delta).toFixed(1)}%
                          </span>
                        )}
                        {d.direction === "stable" && (
                          <span className="text-[11px] text-zinc-600 mb-0.5">estavel</span>
                        )}
                      </div>
                      <div className="mt-2 h-1 rounded-full bg-zinc-900 overflow-hidden">
                        <div className={`h-full rounded-full transition-all duration-700 ${
                          d.isGood ? "bg-emerald-500" : d.severity === "critical" ? "bg-red-500" : "bg-amber-500"
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
                    <div key={kpi.label} className={`card p-5 ${!isGood ? "border-amber-500/[0.15]" : ""}`}>
                      <div className="flex items-center gap-2 mb-3">
                        <Icon size={14} className={isGood ? "text-[#0d4af5]" : "text-amber-400"} />
                        <span className="text-[10px] text-zinc-500 uppercase tracking-wider">{kpi.label}</span>
                      </div>
                      <div className="flex items-end gap-1.5">
                        <span className={`text-2xl font-bold tabular-nums ${isGood ? "text-foreground" : "text-amber-400"}`}>
                          {kpi.value}
                        </span>
                        <span className="text-xs text-zinc-600 mb-0.5">{kpi.unit}</span>
                      </div>
                      {kpi.label !== "Tasks Vencidas" && (
                        <div className="mt-3 h-1.5 rounded-full bg-zinc-900 overflow-hidden">
                          <div className={`h-full rounded-full transition-all duration-700 ${
                            isGood ? "bg-[#0d4af5]" : "bg-amber-500"
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
    </div>
  );
}
