"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import { useRole } from "@/lib/context/RoleContext";
import { authedFetch } from "@/lib/supabase/authed-fetch";
import {
  ShieldAlert, AlertTriangle, CheckCircle, TrendingDown, TrendingUp,
  Loader2, Check, RefreshCcw, ChevronRight, Clock,
} from "lucide-react";
import { metricLabel } from "@/lib/defense/detect";

interface Alert {
  id: string;
  client_id: string;
  meta_ad_account_id: string;
  metric: string;
  severity: "critical" | "high" | "medium";
  current_value: number;
  baseline_value: number;
  percent_change: number;
  description: string;
  metric_date: string;
  detected_at: string;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  clients: { name?: string; nome_fantasia?: string } | null;
}

interface Summary {
  unack_total: number;
  unack_critical: number;
  unack_high: number;
  unack_medium: number;
  ack_total: number;
}

type FilterStatus = "unack" | "ack" | "all";

const SEVERITY_CONFIG = {
  critical: { label: "Crítico", color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/30", icon: ShieldAlert },
  high: { label: "Alto", color: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/30", icon: AlertTriangle },
  medium: { label: "Médio", color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/30", icon: AlertTriangle },
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function formatValue(metric: string, value: number): string {
  if (metric === "spend") return `R$ ${value.toFixed(2)}`;
  if (metric === "cpl") return `R$ ${value.toFixed(2)}`;
  if (metric === "ctr") return `${value.toFixed(2)}%`;
  if (metric === "impressions") return value.toLocaleString("pt-BR");
  return String(value);
}

export default function DefesaAtivaPage() {
  const { role } = useRole();
  const canView = role === "admin" || role === "manager" || role === "traffic";

  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [err, setErr] = useState("");
  const [filter, setFilter] = useState<FilterStatus>("unack");
  const [ackingId, setAckingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setErr("");
    try {
      const res = await fetch(`/api/defense/alerts?status=${filter}`);
      if (!res.ok) {
        const d = await res.json().catch(() => ({ error: "Erro" }));
        setErr(d.error || "Falha ao carregar");
        return;
      }
      const data = await res.json();
      setAlerts(data.alerts ?? []);
      setSummary(data.summary ?? null);
    } catch {
      setErr("Falha de conexão");
    } finally {
      setLoading(false);
    }
  };

  const scan = async () => {
    setScanning(true);
    setErr("");
    try {
      const res = await authedFetch("/api/system/defense-scan", { method: "POST" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({ error: "Falha no scan" }));
        setErr(d.error || "Falha no scan");
        return;
      }
      await load();
    } catch {
      setErr("Falha no scan");
    } finally {
      setScanning(false);
    }
  };

  const acknowledge = async (id: string) => {
    setAckingId(id);
    try {
      const res = await fetch(`/api/defense/alerts/${id}/acknowledge`, { method: "POST" });
      if (res.ok) await load();
    } finally {
      setAckingId(null);
    }
  };

  useEffect(() => { if (canView) load(); }, [canView, filter]);

  if (!canView) {
    return (
      <div className="flex-1 min-w-0 overflow-auto">
        <Header title="Defesa Ativa" />
        <div className="p-6"><p className="text-sm text-muted-foreground">Acesso restrito ao time de tráfego e gestão.</p></div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-w-0 overflow-auto">
      <Header title="Defesa Ativa" />
      <div className="p-6 space-y-6 animate-fade-in">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <ShieldAlert size={22} className="text-[#0d4af5]" />
              Defesa Ativa
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Monitoramento contínuo de anomalias em Meta Ads. Scan automático a cada 15min.
            </p>
          </div>
          <button
            onClick={scan}
            disabled={scanning}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-card hover:bg-muted text-sm text-foreground transition-colors disabled:opacity-50"
          >
            {scanning ? <Loader2 size={14} className="animate-spin" /> : <RefreshCcw size={14} />}
            {scanning ? "Escaneando..." : "Scan agora"}
          </button>
        </div>

        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <SumCard label="Ativos" value={summary.unack_total} color="text-foreground" />
            <SumCard label="Crítico" value={summary.unack_critical} color="text-red-400" />
            <SumCard label="Alto" value={summary.unack_high} color="text-orange-400" />
            <SumCard label="Resolvidos" value={summary.ack_total} color="text-emerald-400" />
          </div>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          {(["unack", "ack", "all"] as FilterStatus[]).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg border text-xs transition-colors ${filter === f ? "border-[#0d4af5]/50 bg-[#0d4af5]/10 text-[#0d4af5]" : "border-border text-zinc-400 hover:text-foreground"}`}>
              {f === "unack" ? "Ativos" : f === "ack" ? "Resolvidos" : "Todos"}
            </button>
          ))}
        </div>

        {err && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3">
            <p className="text-xs text-red-400">{err}</p>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 size={20} className="text-[#0d4af5] animate-spin" /></div>
        ) : alerts.length === 0 ? (
          <div className="text-center py-16 space-y-2">
            <CheckCircle size={32} className="text-emerald-500/60 mx-auto" />
            <p className="text-sm text-foreground">Nenhum alerta {filter === "unack" ? "ativo" : filter === "ack" ? "resolvido" : ""}.</p>
            <p className="text-xs text-zinc-500">Todas as contas estão dentro do esperado.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {alerts.map((a) => {
              const cfg = SEVERITY_CONFIG[a.severity] ?? SEVERITY_CONFIG.medium;
              const Icon = cfg.icon;
              const clientName = a.clients?.nome_fantasia || a.clients?.name || "(sem nome)";
              const trendDown = a.percent_change < 0;

              return (
                <div key={a.id} className={`rounded-xl border ${cfg.border} ${cfg.bg} p-4 ${a.acknowledged_at ? "opacity-60" : ""}`}>
                  <div className="flex items-start gap-3">
                    <div className={`${cfg.color} mt-0.5 shrink-0`}><Icon size={18} /></div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-foreground font-semibold">{clientName}</h3>
                        <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border ${cfg.border} ${cfg.color}`}>
                          {cfg.label}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-500/10 text-zinc-400 border border-zinc-500/20">
                          {metricLabel(a.metric)}
                        </span>
                        <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded ${trendDown ? "bg-red-500/10 text-red-400" : "bg-orange-500/10 text-orange-400"} border ${trendDown ? "border-red-500/20" : "border-orange-500/20"}`}>
                          {trendDown ? <TrendingDown size={10} /> : <TrendingUp size={10} />}
                          {a.percent_change >= 0 ? "+" : ""}{a.percent_change.toFixed(0)}%
                        </span>
                      </div>
                      <p className="text-sm text-foreground mt-2">{a.description}</p>
                      <div className="flex items-center gap-4 mt-2 text-[11px] text-zinc-500 flex-wrap">
                        <span>Atual: <strong className="text-foreground">{formatValue(a.metric, a.current_value)}</strong></span>
                        <span>Baseline 7d: <strong className="text-foreground">{formatValue(a.metric, a.baseline_value)}</strong></span>
                        <span className="flex items-center gap-1"><Clock size={10} /> {formatDate(a.detected_at)}</span>
                      </div>
                      {a.acknowledged_at && (
                        <p className="text-[10px] text-emerald-500 mt-1">
                          ✓ Resolvido por {a.acknowledged_by} em {formatDate(a.acknowledged_at)}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <Link href={`/clients/${a.client_id}`}
                        className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-foreground">
                        Ver cliente <ChevronRight size={12} />
                      </Link>
                      {!a.acknowledged_at && (
                        <button onClick={() => acknowledge(a.id)} disabled={ackingId === a.id}
                          className="flex items-center gap-1 px-3 py-1 rounded bg-emerald-500/10 text-emerald-400 text-[11px] hover:bg-emerald-500/20 border border-emerald-500/20 disabled:opacity-50">
                          {ackingId === a.id ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />}
                          Marcar resolvido
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function SumCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">{label}</p>
      <p className={`${color} font-bold mt-1 text-2xl`}>{value}</p>
    </div>
  );
}
