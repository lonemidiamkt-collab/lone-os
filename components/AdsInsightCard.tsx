"use client";

import { useState, useCallback } from "react";
import {
  Brain, RefreshCw, AlertTriangle, CheckCircle, Zap, TrendingUp,
  Loader2, AlertCircle, Sparkles,
} from "lucide-react";
import type { AdCampaign } from "@/lib/types";

interface Insight {
  type: "positivo" | "alerta" | "critico" | "sugestao";
  title: string;
  body: string;
  action?: string;
}

interface AnalysisResult {
  score: number;
  status: "otimo" | "bom" | "atencao" | "critico";
  insights: Insight[];
  summary: string;
  tokens?: number;
}

const STATUS_CONFIG = {
  otimo:   { color: "text-lone-success", bg: "bg-lone-success-bg/[0.08]", border: "border-lone-success-border/[0.15]", label: "Otimo" },
  bom:     { color: "text-primary", bg: "bg-primary/[0.08]", border: "border-primary/[0.15]", label: "Bom" },
  atencao: { color: "text-lone-warning", bg: "bg-lone-warning-bg/[0.08]", border: "border-lone-warning-border/[0.15]", label: "Atencao" },
  critico: { color: "text-destructive", bg: "bg-destructive/[0.08]", border: "border-destructive/[0.15]", label: "Critico" },
};

const INSIGHT_ICONS = {
  positivo: CheckCircle,
  alerta: AlertTriangle,
  critico: AlertCircle,
  sugestao: Sparkles,
};

const INSIGHT_COLORS = {
  positivo: "text-lone-success",
  alerta: "text-lone-warning",
  critico: "text-destructive",
  sugestao: "text-primary",
};

interface Props {
  clientName: string;
  clientId?: string;
  campaigns: AdCampaign[];
  period?: string;
  triggeredBy?: string;
}

export default function AdsInsightCard({ clientName, clientId, campaigns, period, triggeredBy }: Props) {
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analyze = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/analyze-ads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientName, clientId, campaigns, period: period ?? "ultimos 30 dias", triggeredBy }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Erro desconhecido" }));
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao analisar");
    } finally {
      setLoading(false);
    }
  }, [clientName, clientId, campaigns, period, triggeredBy]);

  // Not analyzed yet — show CTA
  if (!result && !loading && !error) {
    return (
      <div className="card-glow p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <Brain size={18} className="text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Consultor IA</h3>
              <p className="text-[10px] text-muted-foreground">{campaigns.length} campanha(s) para analisar</p>
            </div>
          </div>
          <button
            onClick={analyze}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/80 transition-all"
          >
            <Zap size={12} /> Analisar
          </button>
        </div>
      </div>
    );
  }

  // Loading
  if (loading) {
    return (
      <div className="card-glow p-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <Loader2 size={18} className="text-primary animate-spin" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Analisando campanhas...</h3>
            <p className="text-[10px] text-muted-foreground">O Lone Ads Specialist esta processando os dados de {clientName}</p>
          </div>
        </div>
      </div>
    );
  }

  // Error
  if (error) {
    return (
      <div className="card p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-destructive/10 flex items-center justify-center">
              <AlertCircle size={18} className="text-destructive" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Erro na analise</h3>
              <p className="text-[10px] text-destructive">{error}</p>
            </div>
          </div>
          <button onClick={analyze}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground border border-border hover:border-border transition-all">
            <RefreshCw size={11} /> Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  // Result
  if (!result) return null;
  const statusCfg = STATUS_CONFIG[result.status] ?? STATUS_CONFIG.atencao;

  return (
    <div className="card-glow p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <Brain size={18} className="text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              Insights do Consultor IA
              <span className={`text-[10px] px-2 py-0.5 rounded-full border ${statusCfg.bg} ${statusCfg.border} ${statusCfg.color} font-medium`}>
                {statusCfg.label} · {result.score}/100
              </span>
            </h3>
            <p className="text-[10px] text-muted-foreground">{clientName} · {campaigns.length} campanha(s)</p>
          </div>
        </div>
        <button onClick={analyze} disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground border border-border hover:border-primary/30 transition-all disabled:opacity-30">
          <RefreshCw size={11} className={loading ? "animate-spin" : ""} /> Nova Analise
        </button>
      </div>

      {/* Summary */}
      <p className="text-xs text-muted-foreground leading-relaxed">{result.summary}</p>

      {/* Insights */}
      <div className="space-y-2">
        {result.insights.map((insight, i) => {
          const Icon = INSIGHT_ICONS[insight.type] ?? Sparkles;
          const color = INSIGHT_COLORS[insight.type] ?? "text-muted-foreground";
          return (
            <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-card/[0.02] border border-border">
              <Icon size={14} className={`${color} mt-0.5 shrink-0`} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground">{insight.title}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{insight.body}</p>
                {insight.action && (
                  <p className="text-[10px] text-primary mt-1 font-medium flex items-center gap-1">
                    <TrendingUp size={9} /> {insight.action}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      {result.tokens && (
        <p className="text-[9px] text-muted-foreground text-right">
          {result.tokens} tokens · gpt-4o-mini
        </p>
      )}
    </div>
  );
}
