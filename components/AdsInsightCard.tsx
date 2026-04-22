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
  otimo:   { color: "text-emerald-400", bg: "bg-emerald-500/[0.08]", border: "border-emerald-500/[0.15]", label: "Otimo" },
  bom:     { color: "text-[#0d4af5]", bg: "bg-[#0d4af5]/[0.08]", border: "border-[#0d4af5]/[0.15]", label: "Bom" },
  atencao: { color: "text-amber-400", bg: "bg-amber-500/[0.08]", border: "border-amber-500/[0.15]", label: "Atencao" },
  critico: { color: "text-red-400", bg: "bg-red-500/[0.08]", border: "border-red-500/[0.15]", label: "Critico" },
};

const INSIGHT_ICONS = {
  positivo: CheckCircle,
  alerta: AlertTriangle,
  critico: AlertCircle,
  sugestao: Sparkles,
};

const INSIGHT_COLORS = {
  positivo: "text-emerald-400",
  alerta: "text-amber-400",
  critico: "text-red-400",
  sugestao: "text-[#0d4af5]",
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
            <div className="w-9 h-9 rounded-xl bg-[#0d4af5]/10 flex items-center justify-center">
              <Brain size={18} className="text-[#0d4af5]" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Consultor IA</h3>
              <p className="text-[10px] text-zinc-500">{campaigns.length} campanha(s) para analisar</p>
            </div>
          </div>
          <button
            onClick={analyze}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0d4af5] text-white text-xs font-semibold hover:bg-[#0d4af5]/80 transition-all"
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
          <div className="w-9 h-9 rounded-xl bg-[#0d4af5]/10 flex items-center justify-center">
            <Loader2 size={18} className="text-[#0d4af5] animate-spin" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Analisando campanhas...</h3>
            <p className="text-[10px] text-zinc-500">O Lone Ads Specialist esta processando os dados de {clientName}</p>
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
            <div className="w-9 h-9 rounded-xl bg-red-500/10 flex items-center justify-center">
              <AlertCircle size={18} className="text-red-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Erro na analise</h3>
              <p className="text-[10px] text-red-400">{error}</p>
            </div>
          </div>
          <button onClick={analyze}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-foreground border border-white/[0.06] hover:border-white/[0.1] transition-all">
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
          <div className="w-9 h-9 rounded-xl bg-[#0d4af5]/10 flex items-center justify-center">
            <Brain size={18} className="text-[#0d4af5]" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              Insights do Consultor IA
              <span className={`text-[10px] px-2 py-0.5 rounded-full border ${statusCfg.bg} ${statusCfg.border} ${statusCfg.color} font-medium`}>
                {statusCfg.label} · {result.score}/100
              </span>
            </h3>
            <p className="text-[10px] text-zinc-500">{clientName} · {campaigns.length} campanha(s)</p>
          </div>
        </div>
        <button onClick={analyze} disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-foreground border border-white/[0.06] hover:border-[#0d4af5]/30 transition-all disabled:opacity-30">
          <RefreshCw size={11} className={loading ? "animate-spin" : ""} /> Nova Analise
        </button>
      </div>

      {/* Summary */}
      <p className="text-xs text-zinc-400 leading-relaxed">{result.summary}</p>

      {/* Insights */}
      <div className="space-y-2">
        {result.insights.map((insight, i) => {
          const Icon = INSIGHT_ICONS[insight.type] ?? Sparkles;
          const color = INSIGHT_COLORS[insight.type] ?? "text-zinc-400";
          return (
            <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
              <Icon size={14} className={`${color} mt-0.5 shrink-0`} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground">{insight.title}</p>
                <p className="text-[11px] text-zinc-500 mt-0.5 leading-relaxed">{insight.body}</p>
                {insight.action && (
                  <p className="text-[10px] text-[#0d4af5] mt-1 font-medium flex items-center gap-1">
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
        <p className="text-[9px] text-zinc-700 text-right">
          {result.tokens} tokens · gpt-4o-mini
        </p>
      )}
    </div>
  );
}
