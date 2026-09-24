"use client";

// components/ui/painel-comparativo.tsx — resumo "período atual × anterior" reutilizável: gráfico de
// área (atual) sobre linha tracejada (anterior), card de meta, frase de destaque e fileira de KPIs.
// Contas puras em ./painel-comparativo-utils.ts.

import { useId } from "react";
import { motion, MotionConfig, useReducedMotion, type Variants } from "framer-motion";
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  AlertTriangle, ArrowDownRight, ArrowUpRight, Lightbulb, Minus, Target, TrendingDown, TrendingUp,
} from "lucide-react";
import Skeleton from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";
import { formatarVariacao, tomDaVariacao, variacao, type Natureza, type Tom } from "./painel-comparativo-utils";

export type { Natureza, Tom } from "./painel-comparativo-utils";

export interface PontoComparativo { rotulo: string; atual: number | null; anterior: number | null }

export interface MetaComparativa {
  rotulo: string;
  atual: number;
  alvo: number;
  formato?: (n: number) => string;
  /** Ex.: "até dez/26". */
  prazo?: string;
  /** Ainda sem veredito: mostra este texto no lugar do % e esconde a barra. */
  pendente?: string | null;
  nota?: string;
}

export interface DestaqueComparativo { texto: string; tom?: Tom; detalhe?: string }

export interface KpiComparativo {
  rotulo: string;
  valor: string;
  variacaoPct: number | null;
  natureza?: Natureza;
  dica?: string;
}

export interface PainelComparativoProps {
  titulo: string;
  subtitulo?: string;
  serie: PontoComparativo[];
  rotuloAtual?: string;
  rotuloAnterior?: string;
  formatarValor?: (n: number) => string;
  formatarEixo?: (n: number) => string;
  /** Largura do eixo Y em px (rótulo em R$ pede mais espaço). */
  larguraEixo?: number;
  meta?: MetaComparativa | null;
  destaque?: DestaqueComparativo | null;
  kpis: KpiComparativo[];
  /** Variação abaixo disto (em pontos %) é tratada como estável. */
  limiarNeutroPct?: number;
  /** "atencao" pinta piora em amarelo em vez de vermelho (tela do cliente). */
  tomRuim?: "perigo" | "atencao";
  carregando?: boolean;
  erro?: string | null;
  onTentarDeNovo?: () => void;
  vazio?: string;
  className?: string;
}

const numeroBR = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const compactoBR = (n: number) => n.toLocaleString("pt-BR", { notation: "compact", maximumFractionDigits: 1 });

const COLS_KPI: Record<number, string> = { 1: "lg:grid-cols-1", 2: "lg:grid-cols-2", 3: "lg:grid-cols-3", 4: "lg:grid-cols-4" };

const entrada: Variants = {
  oculto: { opacity: 0, y: 8, filter: "blur(4px)" },
  visivel: (i: number) => ({
    opacity: 1, y: 0, filter: "blur(0px)",
    transition: { delay: i * 0.06, duration: 0.45, ease: [0.16, 1, 0.3, 1] },
  }),
};

function classesDoTom(tom: Tom, tomRuim: "perigo" | "atencao"): string {
  if (tom === "bom") return "bg-lone-success-bg text-lone-success border-lone-success-border";
  if (tom === "ruim") {
    return tomRuim === "atencao"
      ? "bg-lone-warning-bg text-lone-warning border-lone-warning-border"
      : "bg-lone-danger-bg text-lone-danger border-lone-danger-border";
  }
  return "bg-muted text-muted-foreground border-border";
}

interface LinhaGrafico extends PontoComparativo { atualSolto: boolean; anteriorSolto: boolean }

// Ponto cercado de buracos não forma segmento: sem bolinha ele sumiria do gráfico.
function marcarSoltos(serie: PontoComparativo[]): LinhaGrafico[] {
  const solto = (i: number, k: "atual" | "anterior") =>
    serie[i][k] != null && serie[i - 1]?.[k] == null && serie[i + 1]?.[k] == null;
  return serie.map((p, i) => ({ ...p, atualSolto: solto(i, "atual"), anteriorSolto: solto(i, "anterior") }));
}

export function PainelComparativo({
  titulo, subtitulo, serie, rotuloAtual = "Período atual", rotuloAnterior = "Período anterior",
  formatarValor = numeroBR, formatarEixo = compactoBR, larguraEixo = 44, meta = null, destaque = null, kpis,
  limiarNeutroPct = 1, tomRuim = "perigo", carregando = false, erro = null, onTentarDeNovo,
  vazio = "Ainda não há dados para comparar.", className,
}: PainelComparativoProps) {
  const gradId = `pc-grad-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const reduzMovimento = useReducedMotion() ?? false;

  if (carregando) return <EsqueletoPainel className={className} />;

  if (erro) {
    return (
      <div role="alert" className={cn("flex flex-wrap items-start gap-3 rounded-xl border border-lone-danger-border bg-lone-danger-bg p-4", className)}>
        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-lone-danger" aria-hidden />
        <div className="min-w-[200px] flex-1">
          <p className="text-lone-h2 text-lone-danger">{titulo}</p>
          <p className="mt-0.5 text-lone-body text-lone-danger">{erro}</p>
        </div>
        {onTentarDeNovo && (
          <button type="button" onClick={onTentarDeNovo}
            className="h-9 rounded-lg bg-primary px-3.5 text-sm font-medium text-primary-foreground hover:opacity-90">
            Tentar de novo
          </button>
        )}
      </div>
    );
  }

  const temSerie = serie.some((p) => p.atual != null || p.anterior != null);
  const temAnterior = serie.some((p) => p.anterior != null);

  if (!temSerie && kpis.length === 0) {
    return (
      <div className={cn("rounded-xl border border-border bg-card p-5", className)}>
        <p className="text-lone-h2 text-foreground">{titulo}</p>
        <p className="mt-1 text-lone-body text-muted-foreground">{vazio}</p>
      </div>
    );
  }

  const dados = marcarSoltos(serie);
  const temLateral = !!meta || !!destaque;
  let ordem = 0;

  return (
    <MotionConfig reducedMotion="user">
      <motion.section initial="oculto" animate="visivel" aria-label={titulo} className={cn("space-y-4", className)}>
        <div className={cn("grid gap-4", temLateral && "lg:grid-cols-3")}>
          {/* Gráfico: atual (área) × anterior (tracejado) */}
          <motion.div variants={entrada} custom={ordem++}
            className={cn("flex min-w-0 flex-col rounded-xl border border-border bg-card p-4 sm:p-5", temLateral && "lg:col-span-2")}>
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
              <div className="min-w-0">
                <h3 className="text-lone-h2 tracking-tight text-foreground">{titulo}</h3>
                {subtitulo && <p className="mt-0.5 text-lone-caption text-muted-foreground">{subtitulo}</p>}
              </div>
              {temSerie && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-lone-caption text-muted-foreground" aria-hidden>
                  <span className="inline-flex items-center gap-1.5">
                    <svg width="16" height="6" className="text-primary"><line x1="0" y1="3" x2="16" y2="3" stroke="currentColor" strokeWidth="2" /></svg>
                    {rotuloAtual}
                  </span>
                  {temAnterior && (
                    <span className="inline-flex items-center gap-1.5">
                      <svg width="16" height="6" className="text-muted-foreground"><line x1="0" y1="3" x2="16" y2="3" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 3" /></svg>
                      {rotuloAnterior}
                    </span>
                  )}
                </div>
              )}
            </div>

            {temSerie ? (
              <div role="figure" aria-label={`${titulo}: ${rotuloAtual}${temAnterior ? ` comparado com ${rotuloAnterior}` : ""}`}
                className="relative mt-4 h-[200px] sm:h-[240px] lg:h-auto lg:min-h-[240px] lg:flex-1">
                {/* absolute: a altura vem do card (acompanha a coluna ao lado), nunca do próprio gráfico */}
                <div className="absolute inset-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={dados} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
                      <defs>
                        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.22} />
                          <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
                      <XAxis dataKey="rotulo" tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={12}
                        tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
                      <YAxis tickLine={false} axisLine={false} width={larguraEixo} tickFormatter={(v) => formatarEixo(Number(v))}
                        tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
                      <Tooltip
                        cursor={{ stroke: "var(--border)" }}
                        content={(p) => (
                          <DicaGrafico ativo={p.active} linha={p.payload?.[0]?.payload as LinhaGrafico | undefined}
                            rotuloAtual={rotuloAtual} rotuloAnterior={rotuloAnterior} temAnterior={temAnterior} formatar={formatarValor} />
                        )}
                      />
                      <Area type="monotone" dataKey="atual" name={rotuloAtual} stroke="var(--primary)" strokeWidth={2}
                        fill={`url(#${gradId})`} isAnimationActive={!reduzMovimento}
                        dot={(d) => (d.payload?.atualSolto
                          ? <circle key={`a${d.index}`} cx={d.cx} cy={d.cy} r={3} fill="var(--primary)" />
                          : null)}
                        activeDot={{ r: 4, fill: "var(--primary)", stroke: "var(--card)", strokeWidth: 2 }} />
                      {temAnterior && (
                        <Line type="monotone" dataKey="anterior" name={rotuloAnterior} stroke="var(--muted-foreground)"
                          strokeWidth={1.5} strokeDasharray="4 4" isAnimationActive={!reduzMovimento}
                          dot={(d) => (d.payload?.anteriorSolto
                            ? <circle key={`p${d.index}`} cx={d.cx} cy={d.cy} r={2.5} fill="var(--muted-foreground)" />
                            : null)}
                          activeDot={{ r: 3, fill: "var(--muted-foreground)", stroke: "var(--card)", strokeWidth: 2 }} />
                      )}
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ) : (
              <p className="flex min-h-[160px] flex-1 items-center justify-center text-center text-lone-body text-muted-foreground">{vazio}</p>
            )}
          </motion.div>

          {temLateral && (
            <div className="flex min-w-0 flex-col gap-4">
              {meta && (
                <motion.div variants={entrada} custom={ordem++}>
                  <CardMeta meta={meta} />
                </motion.div>
              )}
              {destaque && (
                <motion.div variants={entrada} custom={ordem++} className="flex flex-1">
                  <CardDestaque destaque={destaque} grande={!meta} tomRuim={tomRuim} />
                </motion.div>
              )}
            </div>
          )}
        </div>

        {kpis.length > 0 && (
          <div className={cn("grid grid-cols-2 gap-3 sm:gap-4", COLS_KPI[Math.min(kpis.length, 4)])}>
            {kpis.map((k) => (
              <motion.div key={k.rotulo} variants={entrada} custom={ordem++} className="min-w-0">
                <CardKpi kpi={k} limiar={limiarNeutroPct} tomRuim={tomRuim} />
              </motion.div>
            ))}
          </div>
        )}
      </motion.section>
    </MotionConfig>
  );
}

export default PainelComparativo;

function DicaGrafico({ ativo, linha, rotuloAtual, rotuloAnterior, temAnterior, formatar }: {
  ativo?: boolean; linha?: LinhaGrafico; rotuloAtual: string; rotuloAnterior: string; temAnterior: boolean;
  formatar: (n: number) => string;
}) {
  if (!ativo || !linha) return null;
  const pct = variacao(linha.atual, linha.anterior);
  const valor = (n: number | null) => (n == null ? "—" : formatar(n));
  return (
    <div className="min-w-[160px] rounded-lg border border-border bg-popover px-3 py-2 text-popover-foreground shadow-sm">
      <p className="mb-1.5 text-lone-caption font-medium text-muted-foreground">{linha.rotulo}</p>
      <div className="space-y-1 text-lone-body">
        <p className="flex items-center justify-between gap-4">
          <span className="inline-flex items-center gap-1.5 text-muted-foreground"><span className="h-0.5 w-3 rounded-full bg-primary" />{rotuloAtual}</span>
          <span className="font-medium tabular-nums text-foreground">{valor(linha.atual)}</span>
        </p>
        {temAnterior && (
          <p className="flex items-center justify-between gap-4">
            <span className="inline-flex items-center gap-1.5 text-muted-foreground"><span className="w-3 border-t border-dashed border-muted-foreground" />{rotuloAnterior}</span>
            <span className="tabular-nums text-muted-foreground">{valor(linha.anterior)}</span>
          </p>
        )}
      </div>
      {pct != null && <p className="mt-1.5 text-lone-caption tabular-nums text-muted-foreground">{formatarVariacao(pct)} no comparativo</p>}
    </div>
  );
}

function CardMeta({ meta }: { meta: MetaComparativa }) {
  const fmt = meta.formato ?? numeroBR;
  const pct = meta.alvo > 0 ? Math.round((meta.atual / meta.alvo) * 100) : null;
  const pendente = meta.pendente ?? null;
  const bateu = pct != null && pct >= 100;
  return (
    // Card grafite nos dois temas (pedido de design): .tema-escuro aplica a paleta escura só aqui.
    <div className="tema-escuro rounded-xl border border-border bg-lone-bg-elevated p-5 text-foreground">
      <p className="flex items-center gap-1.5 text-lone-eyebrow uppercase text-muted-foreground">
        <Target size={13} aria-hidden /> {meta.rotulo}
      </p>
      <p className="mt-3 text-lone-hero font-semibold tracking-tight tabular-nums">
        {pendente ?? (pct != null ? `${pct}%` : "—")}
      </p>
      <p className="mt-1 text-lone-body text-muted-foreground">
        Meta: <span className="text-foreground">{fmt(meta.alvo)}</span>{meta.prazo ? ` · ${meta.prazo}` : ""}
      </p>
      {!pendente && pct != null && (
        <div role="progressbar" aria-label={meta.rotulo} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, pct)}
          className="mt-4 h-1.5 overflow-hidden rounded-full bg-foreground/10">
          <div className={cn("h-full rounded-full transition-[width] duration-700", bateu ? "bg-lone-success" : "bg-primary")}
            style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
        </div>
      )}
      {meta.nota && <p className="mt-3 text-lone-caption text-muted-foreground">{meta.nota}</p>}
    </div>
  );
}

function CardDestaque({ destaque, grande, tomRuim }: { destaque: DestaqueComparativo; grande: boolean; tomRuim: "perigo" | "atencao" }) {
  const tom = destaque.tom ?? "neutro";
  const Icone = tom === "bom" ? TrendingUp : tom === "ruim" ? TrendingDown : Lightbulb;
  return (
    <div className="flex w-full flex-col rounded-xl border border-border bg-card p-5">
      <span className={cn("grid h-8 w-8 place-items-center rounded-lg border", classesDoTom(tom, tomRuim))}>
        <Icone size={16} aria-hidden />
      </span>
      <p className={cn("mt-4 tracking-tight text-foreground", grande ? "text-lone-h1" : "text-lone-h2")}>{destaque.texto}</p>
      {destaque.detalhe && <p className="mt-2 text-lone-caption text-muted-foreground">{destaque.detalhe}</p>}
    </div>
  );
}

function CardKpi({ kpi, limiar, tomRuim }: { kpi: KpiComparativo; limiar: number; tomRuim: "perigo" | "atencao" }) {
  const pct = kpi.variacaoPct;
  const temPct = pct != null && Number.isFinite(pct);
  const tom = tomDaVariacao(pct, kpi.natureza ?? "direta", limiar);
  const texto = temPct ? formatarVariacao(pct) : "";
  const Seta = !temPct || texto === "0%" ? Minus : pct > 0 ? ArrowUpRight : ArrowDownRight;
  const leitura = tom === "bom" ? "melhorou" : tom === "ruim" ? "piorou" : "estável";
  return (
    <div className="h-full rounded-xl border border-border bg-card p-4">
      <p className="truncate text-lone-caption text-muted-foreground" title={kpi.rotulo}>{kpi.rotulo}</p>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        <p className="break-words text-lone-h1 font-semibold tracking-tight tabular-nums text-foreground sm:text-lone-hero">{kpi.valor}</p>
        {temPct && (
          <span className={cn("inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-lone-caption font-medium tabular-nums", classesDoTom(tom, tomRuim))}>
            <Seta size={12} aria-hidden />
            {texto}
            <span className="sr-only"> ({leitura})</span>
          </span>
        )}
      </div>
      {kpi.dica && <p className="mt-1.5 text-lone-caption text-muted-foreground">{kpi.dica}</p>}
    </div>
  );
}

function EsqueletoPainel({ className }: { className?: string }) {
  return (
    <div className={cn("space-y-4", className)} aria-busy="true">
      <span className="sr-only">Carregando…</span>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4 sm:p-5 lg:col-span-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="mt-2 h-3 w-56 max-w-full" />
          <Skeleton className="mt-5 h-[200px] w-full sm:h-[240px]" />
        </div>
        <div className="flex flex-col gap-4">
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-32 flex-1 rounded-xl" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-4">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-3 h-7 w-24 max-w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
