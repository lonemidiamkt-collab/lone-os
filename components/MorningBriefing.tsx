"use client";

import { useState, useCallback, useEffect } from "react";
import {
  Brain, RefreshCw, AlertTriangle, TrendingUp, CheckCircle,
  Loader2, Zap, Shield, Sun, ChevronDown, ChevronUp,
} from "lucide-react";

interface UrgentItem {
  client: string;
  severity: "critico" | "atencao";
  title: string;
  detail: string;
  action: string;
}

interface OpportunityItem {
  client: string;
  metric: string;
  suggestion: string;
}

interface BriefingResult {
  greeting: string;
  urgent: UrgentItem[];
  opportunities: OpportunityItem[];
  stable: string[];
  summary: string;
  tokens?: number;
}

interface CriticalAlert {
  id: string;
  severity: "critico" | "alerta";
  client: string;
  title: string;
  detail: string;
  action: string;
}

interface AlertsResult {
  alerts: CriticalAlert[];
  total: number;
}

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  clients: {
    id: string;
    name: string;
    campaigns: any[];
    totalSpend: number;
    totalBudget: number;
  }[];
}

const BRIEFING_CACHE_KEY = "lone-os-morning-briefing";
const BRIEFING_CACHE_TTL = 4 * 60 * 60 * 1000; // 4 hours

export default function MorningBriefing({ clients }: Props) {
  const [briefing, setBriefing] = useState<BriefingResult | null>(null);
  const [alerts, setAlerts] = useState<AlertsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load cached briefing
  useEffect(() => {
    try {
      const cached = localStorage.getItem(BRIEFING_CACHE_KEY);
      if (cached) {
        const { data, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < BRIEFING_CACHE_TTL) {
          setBriefing(data);
        }
      }
    } catch {}
  }, []);

  // Auto-fetch critical alerts (rule-based, 0 tokens)
  useEffect(() => {
    if (clients.length === 0) return;
    fetch("/api/ai/critical-alerts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clients }),
    })
      .then((r) => r.json())
      .then((data) => { if (!data.error) setAlerts(data); })
      .catch(() => {});
  }, [clients]);

  const fetchBriefing = useCallback(async () => {
    if (clients.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/morning-briefing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clients }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Erro" }));
        throw new Error(data.error);
      }
      const data = await res.json();
      setBriefing(data);
      // Cache it
      localStorage.setItem(BRIEFING_CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao gerar briefing");
    } finally {
      setLoading(false);
    }
  }, [clients]);

  const criticalCount = (alerts?.alerts.filter((a) => a.severity === "critico").length ?? 0);
  const alertCount = (alerts?.alerts.length ?? 0);

  return (
    <div className="space-y-3">
      {/* ─── Critical Alerts (rule-based, always visible) ─── */}
      {alerts && alerts.alerts.length > 0 && (
        <div className="card p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Shield size={14} className={criticalCount > 0 ? "text-destructive" : "text-lone-warning"} />
            <h3 className="text-xs font-semibold text-foreground">
              Alertas Criticos
              {criticalCount > 0 && (
                <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-destructive/10 text-destructive border border-destructive/20 font-bold">
                  {criticalCount} critico(s)
                </span>
              )}
            </h3>
            <span className="text-[10px] text-muted-foreground ml-auto">{alertCount} alerta(s) · 0 tokens</span>
          </div>
          <div className="space-y-1.5">
            {alerts.alerts.slice(0, 5).map((alert) => (
              <div key={alert.id}
                className={`flex items-start gap-2.5 p-2.5 rounded-lg ${
                  alert.severity === "critico"
                    ? "bg-destructive/[0.04] border border-destructive/[0.1]"
                    : "bg-lone-warning-bg/[0.04] border border-lone-warning-border/[0.1]"
                }`}>
                <AlertTriangle size={12} className={`mt-0.5 shrink-0 ${
                  alert.severity === "critico" ? "text-destructive" : "text-lone-warning"
                }`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-muted-foreground">{alert.client}</span>
                    <span className="text-[10px] text-muted-foreground">·</span>
                    <span className="text-[11px] font-medium text-foreground">{alert.title}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{alert.detail}</p>
                  <a href="/traffic" className="text-[10px] text-primary mt-0.5 font-medium flex items-center gap-1 hover:underline cursor-pointer">
                    <Zap size={8} /> {alert.action} →
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Morning Briefing (AI-powered) ─── */}
      <div className="card-glow p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              {loading ? <Loader2 size={18} className="text-primary animate-spin" /> : <Brain size={18} className="text-primary" />}
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Sun size={12} className="text-lone-warning" />
                Briefing do Dia
              </h3>
              <p className="text-[10px] text-muted-foreground">
                {briefing ? "Gerado pela IA" : `${clients.length} cliente(s) para analisar`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {briefing && (
              <button onClick={() => setExpanded(!expanded)}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-card/[0.04] transition-all">
                {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
            )}
            <button onClick={fetchBriefing} disabled={loading}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                briefing
                  ? "text-muted-foreground border border-border hover:text-foreground hover:border-primary/30"
                  : "bg-primary text-primary-foreground hover:bg-primary/80"
              } disabled:opacity-30`}>
              {loading ? <Loader2 size={11} className="animate-spin" /> : briefing ? <RefreshCw size={11} /> : <Zap size={11} />}
              {loading ? "Analisando..." : briefing ? "Atualizar" : "Gerar Briefing"}
            </button>
          </div>
        </div>

        {error && (
          <p className="text-[11px] text-destructive mt-2">{error}</p>
        )}

        {briefing && expanded && (
          <div className="mt-4 space-y-4 animate-fade-in">
            {/* Greeting */}
            <p className="text-xs text-muted-foreground font-medium">{briefing.greeting}</p>

            {/* Urgent */}
            {briefing.urgent.length > 0 && (
              <div className="space-y-1.5">
                {briefing.urgent.map((item, i) => (
                  <div key={i} className={`flex items-start gap-2.5 p-3 rounded-xl ${
                    item.severity === "critico"
                      ? "bg-destructive/[0.04] border border-destructive/[0.1]"
                      : "bg-lone-warning-bg/[0.04] border border-lone-warning-border/[0.1]"
                  }`}>
                    <AlertTriangle size={13} className={`mt-0.5 shrink-0 ${
                      item.severity === "critico" ? "text-destructive" : "text-lone-warning"
                    }`} />
                    <div className="flex-1">
                      <p className="text-[11px] font-semibold text-foreground">
                        <span className="text-muted-foreground font-normal">{item.client} — </span>
                        {item.title}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{item.detail}</p>
                      <a href="/traffic" className="text-[10px] text-primary mt-1 font-medium flex items-center gap-1 hover:underline cursor-pointer">
                        <Zap size={8} /> {item.action} →
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Opportunities */}
            {briefing.opportunities.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] text-lone-success uppercase tracking-wider font-semibold flex items-center gap-1">
                  <TrendingUp size={10} /> Oportunidades
                </p>
                {briefing.opportunities.map((item, i) => (
                  <div key={i} className="flex items-start gap-2.5 p-3 rounded-xl bg-lone-success-bg/[0.03] border border-lone-success-border/[0.08]">
                    <TrendingUp size={12} className="text-lone-success mt-0.5 shrink-0" />
                    <div>
                      <p className="text-[11px] font-medium text-foreground">
                        {item.client}
                        <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-lone-success-bg text-lone-success font-bold">{item.metric}</span>
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{item.suggestion}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Stable */}
            {briefing.stable.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <CheckCircle size={10} className="text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground">Estavel:</span>
                {briefing.stable.map((name, i) => (
                  <span key={i} className="text-[10px] px-2 py-0.5 rounded-md bg-card/[0.03] text-muted-foreground border border-border">
                    {name}
                  </span>
                ))}
              </div>
            )}

            {/* Summary */}
            <p className="text-[11px] text-muted-foreground italic border-t border-border pt-3">
              {briefing.summary}
            </p>

            {briefing.tokens && (
              <p className="text-[9px] text-muted-foreground text-right">{briefing.tokens} tokens · gpt-4o-mini</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
