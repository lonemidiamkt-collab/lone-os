"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import { useRole } from "@/lib/context/RoleContext";
import {
  Thermometer, AlertTriangle, Shield, TrendingUp, TrendingDown, Minus,
  Loader2, ChevronRight, Clock, RefreshCcw,
} from "lucide-react";
import { signalLabel } from "@/lib/health/compute";

interface SparkPoint { date: string; score: number; level: string }
interface Row {
  id: string;
  name: string;
  score: number | null;
  level: "safe" | "attention" | "high" | "critical" | null;
  computed_at: string | null;
  sparkline: SparkPoint[];
  breakdown: Record<string, number>;
}
interface Summary { total: number; critical: number; high: number; attention: number; safe: number }

const LEVEL_CONFIG = {
  safe: { label: "Seguro", color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20", bar: "bg-emerald-500" },
  attention: { label: "Atenção", color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20", bar: "bg-amber-500" },
  high: { label: "Alto", color: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/20", bar: "bg-orange-500" },
  critical: { label: "Crítico", color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/20", bar: "bg-red-500" },
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export default function ChurnRiskPage() {
  const { role } = useRole();
  const isAdmin = role === "admin" || role === "manager";

  const [clients, setClients] = useState<Row[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [recomputing, setRecomputing] = useState(false);
  const [err, setErr] = useState("");

  const load = async () => {
    setLoading(true);
    setErr("");
    try {
      const res = await fetch("/api/health");
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Erro desconhecido" }));
        setErr(data.error || "Falha ao carregar");
        return;
      }
      const data = await res.json();
      setClients(data.clients ?? []);
      setSummary(data.summary ?? null);
    } catch {
      setErr("Falha de conexão");
    } finally {
      setLoading(false);
    }
  };

  const recompute = async () => {
    setRecomputing(true);
    setErr("");
    try {
      const res = await fetch("/api/system/compute-health", { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Erro" }));
        setErr(data.error || "Falha ao recalcular");
        return;
      }
      await load();
    } catch {
      setErr("Falha de conexão no recálculo");
    } finally {
      setRecomputing(false);
    }
  };

  useEffect(() => { if (isAdmin) load(); }, [isAdmin]);

  if (!isAdmin) {
    return (
      <div className="flex-1 min-w-0 overflow-auto">
        <Header title="Termômetro de Churn" />
        <div className="p-6"><p className="text-sm text-muted-foreground">Restrito a administradores.</p></div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-w-0 overflow-auto">
      <Header title="Termômetro de Churn" />
      <div className="p-6 space-y-6 animate-fade-in">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Thermometer size={22} className="text-[#0d4af5]" />
              Termômetro de Churn
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Score preditivo de risco por cliente. Quanto maior, maior a chance de churn. Atualizado diariamente às 06:00 BRT.</p>
          </div>
          <button
            onClick={recompute}
            disabled={recomputing}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-card hover:bg-muted text-sm text-foreground transition-colors disabled:opacity-50"
          >
            {recomputing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCcw size={14} />}
            {recomputing ? "Recalculando..." : "Recalcular agora"}
          </button>
        </div>

        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <SummaryCard label="Total" value={summary.total} color="text-foreground" />
            <SummaryCard label="Crítico" value={summary.critical} color="text-red-400" />
            <SummaryCard label="Alto" value={summary.high} color="text-orange-400" />
            <SummaryCard label="Atenção" value={summary.attention} color="text-amber-400" />
            <SummaryCard label="Seguro" value={summary.safe} color="text-emerald-400" />
          </div>
        )}

        {err && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 flex items-start gap-2">
            <AlertTriangle size={14} className="text-red-400 mt-0.5 shrink-0" />
            <p className="text-xs text-red-400">{err}</p>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 size={20} className="text-[#0d4af5] animate-spin" /></div>
        ) : clients.length === 0 ? (
          <div className="text-center py-16 space-y-2">
            <Shield size={32} className="text-zinc-700 mx-auto" />
            <p className="text-sm text-muted-foreground">Nenhum score calculado ainda.</p>
            <p className="text-xs text-zinc-600">Clique em &quot;Recalcular agora&quot; pra rodar o cron manualmente.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {clients.map((c) => <ClientHealthCard key={c.id} client={c} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">{label}</p>
      <p className={`${color} font-bold mt-1 text-2xl`}>{value}</p>
    </div>
  );
}

function trendDirection(spark: SparkPoint[]): "up" | "down" | "flat" {
  if (spark.length < 2) return "flat";
  const first = spark[0].score;
  const last = spark[spark.length - 1].score;
  const diff = last - first;
  if (diff > 5) return "up";      // score subiu = piorou
  if (diff < -5) return "down";   // score caiu = melhorou
  return "flat";
}

function ClientHealthCard({ client: c }: { client: Row }) {
  const [expanded, setExpanded] = useState(false);
  const level = c.level ?? "safe";
  const cfg = LEVEL_CONFIG[level];
  const score = c.score ?? 0;
  const trend = trendDirection(c.sparkline);

  return (
    <div className={`rounded-xl border ${cfg.border} bg-card overflow-hidden`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 flex items-center gap-4 hover:bg-muted/30 transition-colors text-left"
      >
        {/* Termômetro */}
        <div className="w-16 shrink-0">
          <div className="relative h-20 w-4 mx-auto rounded-full border border-border bg-surface overflow-hidden">
            <div
              className={`absolute bottom-0 left-0 right-0 ${cfg.bar} transition-all`}
              style={{ height: `${score}%` }}
            />
          </div>
          <p className={`${cfg.color} text-center text-lg font-bold mt-1`}>{Math.round(score)}</p>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-foreground font-semibold truncate">{c.name}</h3>
            <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border ${cfg.bg} ${cfg.color} ${cfg.border}`}>
              {cfg.label}
            </span>
            {trend === "up" && (
              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">
                <TrendingUp size={10} /> Piorando 14d
              </span>
            )}
            {trend === "down" && (
              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <TrendingDown size={10} /> Melhorando 14d
              </span>
            )}
            {trend === "flat" && c.sparkline.length >= 2 && (
              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-zinc-500/10 text-zinc-400 border border-zinc-500/20">
                <Minus size={10} /> Estável
              </span>
            )}
          </div>
          <p className="text-[10px] text-zinc-500 mt-1 flex items-center gap-1">
            <Clock size={9} /> Atualizado {formatDate(c.computed_at)}
          </p>
        </div>

        {c.sparkline.length >= 2 && <Sparkline points={c.sparkline} />}
        <ChevronRight size={16} className={`text-zinc-500 shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`} />
      </button>

      {expanded && (
        <div className="border-t border-border p-4 bg-muted/20 space-y-3">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium mb-2">Sinais que compõem o score</p>
            {Object.keys(c.breakdown).length === 0 ? (
              <p className="text-xs text-zinc-500">Nenhum sinal de risco ativo.</p>
            ) : (
              <div className="space-y-1.5">
                {Object.entries(c.breakdown).sort(([, a], [, b]) => b - a).map(([key, weight]) => (
                  <div key={key} className="flex items-center justify-between text-xs">
                    <span className="text-zinc-300">{signalLabel(key)}</span>
                    <span className={cfg.color}>+{weight}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <Link
            href={`/clients/${c.id}`}
            className="inline-flex items-center gap-1 text-xs text-[#0d4af5] hover:underline"
          >
            Abrir cliente <ChevronRight size={12} />
          </Link>
        </div>
      )}
    </div>
  );
}

function Sparkline({ points }: { points: SparkPoint[] }) {
  if (points.length < 2) return null;
  const w = 80, h = 28;
  const scores = points.map((p) => p.score);
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const range = Math.max(max - min, 1);
  const step = w / (points.length - 1);
  const d = points.map((p, i) => {
    const x = i * step;
    const y = h - ((p.score - min) / range) * h;
    return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const last = points[points.length - 1];
  const strokeColor = last.level === "critical" ? "#ef4444" : last.level === "high" ? "#f97316" : last.level === "attention" ? "#f59e0b" : "#10b981";

  return (
    <svg width={w} height={h} className="shrink-0">
      <path d={d} fill="none" stroke={strokeColor} strokeWidth="1.5" />
    </svg>
  );
}
