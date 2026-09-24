"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import { useRole } from "@/lib/context/RoleContext";
import { chamar } from "@/lib/api/chamar";
import {
  Thermometer, AlertTriangle, Shield, TrendingUp, TrendingDown, Minus,
  Loader2, ChevronRight, Clock, RefreshCcw,
} from "lucide-react";
import { ROTULO_NIVEL_SAUDE, type NivelSaude } from "@/lib/scores/health";

interface SparkPoint { date: string; score: number; level: string }
// breakdown gravado por /api/scores: componentes (0..100 ou null), motivos em frase e cobertura.
interface Breakdown { componentes?: Record<string, number | null>; motivos?: string[]; cobertura?: number }
interface Row {
  id: string;
  name: string;
  score: number | null;
  level: NivelSaude;
  computed_at: string | null;
  sparkline: SparkPoint[];
  breakdown: Breakdown | null;
}
interface Summary { total: number; risco: number; atencao: number; saudavel: number; sem_dado: number }

const LEVEL_CONFIG: Record<NivelSaude, { color: string; bg: string; border: string; bar: string }> = {
  saudavel: { color: "text-lone-success", bg: "bg-lone-success-bg", border: "border-lone-success-border", bar: "bg-lone-success" },
  atencao: { color: "text-lone-warning", bg: "bg-lone-warning-bg", border: "border-lone-warning-border", bar: "bg-lone-warning" },
  risco: { color: "text-lone-danger", bg: "bg-lone-danger-bg", border: "border-lone-danger-border", bar: "bg-destructive" },
  sem_dado: { color: "text-muted-foreground", bg: "bg-muted", border: "border-border", bar: "bg-muted-foreground" },
};

const NOME_COMPONENTE: Record<string, string> = {
  resultado: "Resultado", entrega: "Entregas e SLA", relacionamento: "Relacionamento",
  sentimento: "Sentimento", pendencias: "Pendências", engajamento: "Engajamento do cliente",
  financeiro: "Financeiro do cliente",
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
    const r = await chamar<{ clients: Row[]; summary: Summary }>("/api/health/clients");
    if (!r.ok || !r.data) setErr(r.erro ?? "Falha ao carregar");
    else { setClients(r.data.clients ?? []); setSummary(r.data.summary ?? null); }
    setLoading(false);
  };

  // Recalcula pelo escritor único (100 = saudável). O compute-health antigo foi desligado.
  const recompute = async () => {
    setRecomputing(true);
    setErr("");
    const r = await chamar("/api/scores?gravar=1");
    if (!r.ok) setErr(r.erro ?? "Falha ao recalcular");
    else await load();
    setRecomputing(false);
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
              <Thermometer size={22} className="text-primary" />
              Termômetro de Churn
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Saúde por cliente, de 0 a 100 — quanto MAIOR, mais saudável. Pior primeiro. Atualizada todo dia às 06:20.</p>
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
            <SummaryCard label={ROTULO_NIVEL_SAUDE.risco} value={summary.risco} color="text-lone-danger" />
            <SummaryCard label={ROTULO_NIVEL_SAUDE.atencao} value={summary.atencao} color="text-lone-warning" />
            <SummaryCard label={ROTULO_NIVEL_SAUDE.saudavel} value={summary.saudavel} color="text-lone-success" />
            <SummaryCard label="Sem dado" value={summary.sem_dado} color="text-muted-foreground" />
          </div>
        )}

        {err && (
          <div className="rounded-xl border border-lone-danger-border bg-lone-danger-bg p-3 flex items-start gap-2">
            <AlertTriangle size={14} className="text-lone-danger mt-0.5 shrink-0" />
            <p className="text-xs text-lone-danger">{err}</p>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 size={20} className="text-primary animate-spin" /></div>
        ) : clients.length === 0 ? (
          <div className="text-center py-16 space-y-2">
            <Shield size={32} className="text-lone-text-disabled mx-auto" />
            <p className="text-sm text-muted-foreground">Nenhum score calculado ainda.</p>
            <p className="text-xs text-lone-text-disabled">Clique em &quot;Recalcular agora&quot; pra rodar o cron manualmente.</p>
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
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{label}</p>
      <p className={`${color} font-bold mt-1 text-2xl`}>{value}</p>
    </div>
  );
}

function trendDirection(spark: SparkPoint[]): "up" | "down" | "flat" {
  if (spark.length < 2) return "flat";
  const first = spark[0].score;
  const last = spark[spark.length - 1].score;
  const diff = last - first;
  if (diff > 5) return "up";      // saúde subiu = melhorou
  if (diff < -5) return "down";   // saúde caiu = piorou
  return "flat";
}

function ClientHealthCard({ client: c }: { client: Row }) {
  const [expanded, setExpanded] = useState(false);
  const level: NivelSaude = c.level in LEVEL_CONFIG ? c.level : "sem_dado";
  const cfg = LEVEL_CONFIG[level];
  const score = c.score;
  const motivos = c.breakdown?.motivos ?? [];
  const componentes = Object.entries(c.breakdown?.componentes ?? {});
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
              style={{ height: `${score ?? 0}%` }}
            />
          </div>
          <p className={`${cfg.color} text-center text-lg font-bold mt-1`}>{score === null ? "—" : Math.round(score)}</p>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-foreground font-semibold truncate">{c.name}</h3>
            <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border ${cfg.bg} ${cfg.color} ${cfg.border}`}>
              {ROTULO_NIVEL_SAUDE[level]}
            </span>
            {trend === "down" && (
              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-lone-danger-bg text-lone-danger border border-lone-danger-border">
                <TrendingDown size={10} /> Piorando 14d
              </span>
            )}
            {trend === "up" && (
              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-lone-success-bg text-lone-success border border-lone-success-border">
                <TrendingUp size={10} /> Melhorando 14d
              </span>
            )}
            {trend === "flat" && c.sparkline.length >= 2 && (
              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-muted text-muted-foreground border border-border">
                <Minus size={10} /> Estável
              </span>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
            <Clock size={9} /> Atualizado {formatDate(c.computed_at)}
          </p>
        </div>

        {c.sparkline.length >= 2 && <Sparkline points={c.sparkline} />}
        <ChevronRight size={16} className={`text-muted-foreground shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`} />
      </button>

      {expanded && (
        <div className="border-t border-border p-4 bg-muted/20 space-y-3">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-2">Por quê</p>
            {motivos.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhum ponto fraco registrado.</p>
            ) : (
              <ul className="space-y-1">
                {motivos.map((m) => <li key={m} className="text-xs text-secondary-foreground">• {m}</li>)}
              </ul>
            )}
          </div>
          {componentes.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-2">
                Componentes{c.breakdown?.cobertura != null ? ` · ${c.breakdown.cobertura}% medido` : ""}
              </p>
              <div className="space-y-1.5">
                {componentes.map(([key, valor]) => (
                  <div key={key} className="flex items-center justify-between text-xs">
                    <span className="text-secondary-foreground">{NOME_COMPONENTE[key] ?? key}</span>
                    <span className={valor === null ? "text-muted-foreground" : "text-foreground tabular-nums"}>
                      {valor === null ? "sem fonte" : valor}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <Link
            href={`/clients/${c.id}`}
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
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
  const strokeColor = last.level === "risco" ? "var(--lone-danger)" : last.level === "atencao" ? "var(--lone-warning)" : last.level === "saudavel" ? "var(--lone-success)" : "var(--muted-foreground)";

  return (
    <svg width={w} height={h} className="shrink-0">
      <path d={d} fill="none" stroke={strokeColor} strokeWidth="1.5" />
    </svg>
  );
}
