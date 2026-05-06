"use client";

import { useEffect, useState } from "react";
import {
  Brain, Sparkles, AlertTriangle, AlertCircle, CheckCircle,
  Loader2, Clock, TrendingUp, RefreshCw,
} from "lucide-react";

interface Insight {
  type: "positivo" | "alerta" | "critico" | "sugestao";
  title: string;
  body: string;
  action?: string;
}

interface Audit {
  id: string;
  type: string;
  score: number | null;
  status: "otimo" | "bom" | "atencao" | "critico" | null;
  summary: string | null;
  insights: Insight[] | null;
  triggered_by: string | null;
  visible_to_client: boolean;
  created_at: string;
}

const STATUS_CONFIG = {
  otimo:   { color: "text-emerald-400", bg: "bg-emerald-500/[0.08]", border: "border-emerald-500/30", label: "Ótimo" },
  bom:     { color: "text-[#0d4af5]", bg: "bg-[#0d4af5]/[0.08]", border: "border-[#0d4af5]/30", label: "Bom" },
  atencao: { color: "text-amber-400", bg: "bg-amber-500/[0.08]", border: "border-amber-500/30", label: "Atenção" },
  critico: { color: "text-red-400", bg: "bg-red-500/[0.08]", border: "border-red-500/30", label: "Crítico" },
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
  clientId: string;
  isAdmin: boolean;
}

export default function AIAuditsTab({ clientId, isAdmin }: Props) {
  const [audits, setAudits] = useState<Audit[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadAudits = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/ai/audits?clientId=${clientId}&limit=20`);
      const data = await res.json();
      if (res.ok) {
        const list: Audit[] = data.audits ?? [];
        setAudits(list);
        if (list.length > 0) setExpandedId(list[0].id);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAudits(); }, [clientId]);

  const latest = audits[0];
  const previous = audits.slice(1);

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
  };

  const daysAgo = (iso: string) => {
    const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
    if (days === 0) return "hoje";
    if (days === 1) return "ontem";
    return `há ${days} dias`;
  };

  if (loading) {
    return (
      <div className="card flex items-center justify-center py-12 animate-fade-in">
        <Loader2 size={20} className="text-primary animate-spin" />
      </div>
    );
  }

  if (audits.length === 0) {
    return (
      <div className="card text-center py-16 animate-fade-in">
        <div className="w-12 h-12 mx-auto rounded-xl bg-primary/10 flex items-center justify-center mb-3">
          <Brain size={22} className="text-primary" />
        </div>
        <p className="text-sm font-medium text-foreground">Nenhuma análise gerada ainda</p>
        <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
          {isAdmin
            ? "O gestor de tráfego precisa rodar a análise pela primeira vez em /traffic."
            : "A equipe da Lone está preparando a primeira análise da sua conta."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* ── Header explicativo ── */}
      <div className="rounded-xl border border-primary/20 bg-gradient-to-br from-primary/[0.05] to-transparent p-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
            <Brain size={18} className="text-primary" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground">Lone AI — Análise de Performance</p>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Nossa IA analisa suas campanhas continuamente para identificar oportunidades de escala, alertas de performance
              e sugerir ações que maximizem resultados. Últimas {audits.length} análise{audits.length > 1 ? "s" : ""}:
            </p>
          </div>
          {isAdmin && (
            <button
              onClick={loadAudits}
              className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 shrink-0"
              title="Recarregar"
            >
              <RefreshCw size={11} /> Atualizar
            </button>
          )}
        </div>
      </div>

      {/* ── Última análise em destaque ── */}
      {latest && latest.status && (
        <LatestAuditCard audit={latest} daysAgo={daysAgo(latest.created_at)} />
      )}

      {/* ── Histórico colapsável ── */}
      {previous.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1">
            Histórico ({previous.length} anterior{previous.length > 1 ? "es" : ""})
          </p>
          {previous.map((audit) => (
            <button
              key={audit.id}
              onClick={() => setExpandedId(expandedId === audit.id ? null : audit.id)}
              className="w-full text-left"
            >
              <div className="card hover:border-primary/30 transition-colors">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${audit.status ? STATUS_CONFIG[audit.status].bg : "bg-muted"}`}>
                    <Brain size={14} className={audit.status ? STATUS_CONFIG[audit.status].color : "text-muted-foreground"} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">{audit.summary || "Análise da conta"}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Clock size={10} className="text-muted-foreground" />
                      <span className="text-[10px] text-muted-foreground">{formatDate(audit.created_at)}</span>
                      {audit.score !== null && (
                        <>
                          <span className="text-[10px] text-muted-foreground">·</span>
                          <span className={`text-[10px] font-semibold ${audit.status ? STATUS_CONFIG[audit.status].color : "text-muted-foreground"}`}>
                            Score {audit.score}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                {expandedId === audit.id && audit.insights && audit.insights.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-border space-y-2">
                    {audit.insights.map((i, idx) => (
                      <InsightRow key={idx} insight={i} />
                    ))}
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function LatestAuditCard({ audit, daysAgo }: { audit: Audit; daysAgo: string }) {
  const statusKey = audit.status || "bom";
  const cfg = STATUS_CONFIG[statusKey];

  return (
    <div className={`rounded-xl border ${cfg.border} ${cfg.bg} p-5`}>
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp size={14} className={cfg.color} />
            <p className={`text-xs font-semibold uppercase tracking-wider ${cfg.color}`}>Última análise · {daysAgo}</p>
          </div>
          {audit.summary && (
            <p className="text-sm text-foreground leading-relaxed mt-2">{audit.summary}</p>
          )}
        </div>
        {audit.score !== null && (
          <div className="text-center shrink-0">
            <p className={`text-3xl font-bold ${cfg.color} leading-none`}>{audit.score}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">de 100</p>
            <span className={`inline-block mt-1.5 text-[10px] font-semibold px-2 py-0.5 rounded border ${cfg.border} ${cfg.color}`}>
              {cfg.label}
            </span>
          </div>
        )}
      </div>

      {audit.insights && audit.insights.length > 0 && (
        <div className="space-y-2 border-t border-border/50 pt-4">
          {audit.insights.map((insight, idx) => (
            <InsightRow key={idx} insight={insight} />
          ))}
        </div>
      )}
    </div>
  );
}

function InsightRow({ insight }: { insight: Insight }) {
  const Icon = INSIGHT_ICONS[insight.type] ?? Sparkles;
  const color = INSIGHT_COLORS[insight.type] ?? "text-[#0d4af5]";

  return (
    <div className="flex items-start gap-3 p-3 rounded-lg bg-background/40 border border-border/50">
      <Icon size={14} className={`${color} shrink-0 mt-0.5`} />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-foreground">{insight.title}</p>
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{insight.body}</p>
        {insight.action && (
          <p className={`text-xs ${color} mt-1.5 font-medium`}>→ {insight.action}</p>
        )}
      </div>
    </div>
  );
}
