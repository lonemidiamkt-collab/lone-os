"use client";

// Evolução diária do portal do cliente — mesma linguagem do PainelComparativo do topo: área com
// degradê suave (período atual) sobre linha tracejada (mesmo dia do período anterior), eixo limpo e
// dica em português com o valor formatado. Antes era uma linha solta com a dica "messages : 29".

import { useId, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import Skeleton from "@/components/ui/Skeleton";
// clsx (não cn) onde o tamanho de fonte "lone" encontra uma cor de texto: o twMerge acha que os dois são cor
// e apaga o tamanho.
import { clsx } from "clsx";
import { cn } from "@/lib/utils";
import { formatarVariacao, tomDaVariacao, variacao, type Natureza } from "@/components/ui/painel-comparativo-utils";
import {
  ROTULO_METRICA, formatarEixo, formatarMetrica, melhorDia, rotuloDia, rotuloDiaLongo, type MetricaDiaria,
} from "@/lib/portal/formatos";
import { Cartao, CabecalhoSecao, Segmentado } from "./ui";

const METRICAS: readonly MetricaDiaria[] = ["messages", "clicks", "spend", "reach"];
// Investimento subir não é bom nem ruim por si; o resto, subir é bom.
const NATUREZA: Record<MetricaDiaria, Natureza> = { messages: "direta", clicks: "direta", spend: "neutra", reach: "direta" };

interface Linha { dia: string; rotulo: string; atual: number; anterior: number | null; anteriorSolto: boolean }

export interface EvolucaoDiariaProps {
  /** Dias do período (YYYY-MM-DD), na ordem. */
  dias: string[];
  series: Record<MetricaDiaria, number[]>;
  /** Mesmo dia relativo do período anterior, alinhado com `dias`. null/ausente = sem comparação. */
  anteriores: Partial<Record<MetricaDiaria, (number | null)[] | null | undefined>>;
  carregando?: boolean;
  /** Texto quando não há série (sem dado no período, ou números ainda chegando). */
  vazio: string;
  className?: string;
}

const soma = (v: readonly (number | null)[]) => v.reduce<number>((s, n) => s + (n ?? 0), 0);

export default function EvolucaoDiaria({ dias, series, anteriores, carregando = false, vazio, className }: EvolucaoDiariaProps) {
  const [metrica, setMetrica] = useState<MetricaDiaria>("messages");
  const gradId = `evo-grad-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const reduzMovimento = useReducedMotion() ?? false;

  const atual = series[metrica] ?? [];
  const anterior = anteriores[metrica] ?? null;
  const temAnterior = !!anterior && anterior.some((v) => v != null);
  const dados: Linha[] = dias.map((dia, i) => {
    const prev = temAnterior ? anterior![i] ?? null : null;
    const solto = prev != null && (anterior![i - 1] ?? null) == null && (anterior![i + 1] ?? null) == null;
    return { dia, rotulo: rotuloDia(dia), atual: atual[i] ?? 0, anterior: prev, anteriorSolto: solto };
  });
  const temSerie = dados.length > 0;

  // Resumo da aba: total (ou média por dia, no alcance — somar alcance diário conta a mesma pessoa
  // várias vezes) e o melhor dia.
  const ehAlcance = metrica === "reach";
  const totalAtual = ehAlcance ? (atual.length ? soma(atual) / atual.length : 0) : soma(atual);
  const valoresAnteriores = temAnterior ? anterior!.filter((v): v is number => v != null) : [];
  const totalAnterior = !temAnterior ? null : ehAlcance
    ? (valoresAnteriores.length ? soma(valoresAnteriores) / valoresAnteriores.length : null)
    : soma(valoresAnteriores);
  const pct = variacao(totalAtual, totalAnterior);
  const pico = melhorDia(dias, atual);

  return (
    <Cartao as="section" className={cn("p-4 sm:p-5", className)}>
      <CabecalhoSecao
        titulo="Evolução diária"
        descricao={temAnterior ? "Dia a dia do período, comparado com o mesmo dia do período anterior" : "Dia a dia do período"}
        acao={temSerie && !carregando ? <Legenda temAnterior={temAnterior} /> : undefined}
      />

      <Segmentado
        className="mt-4"
        rotulo="Métrica do gráfico"
        tamanho="sm"
        cheio
        opcoes={METRICAS.map((m) => ({ valor: m, rotulo: ROTULO_METRICA[m] }))}
        valor={metrica}
        onChange={setMetrica}
      />

      {carregando ? (
        <div className="mt-4 space-y-3" aria-busy="true">
          <span className="sr-only">Carregando…</span>
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="h-[200px] w-full sm:h-[240px]" />
        </div>
      ) : !temSerie ? (
        <p className="flex min-h-[200px] items-center justify-center text-center text-lone-body text-muted-foreground">{vazio}</p>
      ) : (
        <>
          <dl className="mt-4 grid grid-cols-2 gap-3">
            <div className="min-w-0">
              <dt className="text-lone-caption text-muted-foreground">{ehAlcance ? "Média por dia" : "Total no período"}</dt>
              <dd className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-lone-h2 font-semibold tabular-nums text-foreground">{formatarMetrica(metrica, totalAtual)}</span>
                <SeloVariacao pct={pct} natureza={NATUREZA[metrica]} />
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-lone-caption text-muted-foreground">{metrica === "spend" ? "Dia de maior investimento" : "Melhor dia"}</dt>
              <dd className="mt-0.5 text-lone-body text-foreground">
                {pico ? (
                  <><span className="font-medium">{rotuloDiaLongo(pico.dia)}</span>
                    <span className="text-muted-foreground"> · {formatarMetrica(metrica, pico.valor)}</span></>
                ) : "—"}
              </dd>
            </div>
          </dl>

          <div role="figure" aria-label={`${ROTULO_METRICA[metrica]} por dia${temAnterior ? ", comparado com o período anterior" : ""}`}
            className="relative mt-3 h-[200px] sm:h-[240px] lg:h-[260px]">
            <div className="absolute inset-0">
              <ResponsiveContainer width="100%" height="100%">
                {/* right: 16 — o rótulo do último dia ("23 set") é centrado no ponto e cortava na borda. */}
                <ComposedChart data={dados} margin={{ top: 6, right: 16, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.22} />
                      <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
                  <XAxis dataKey="rotulo" tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={16}
                    tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
                  <YAxis tickLine={false} axisLine={false} allowDecimals={metrica === "spend"}
                    width={metrica === "spend" ? 58 : 40}
                    tickFormatter={(v) => formatarEixo(metrica, Number(v))}
                    tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
                  <Tooltip
                    cursor={{ stroke: "var(--border)" }}
                    content={(p) => (
                      <DicaDiaria ativo={p.active} linha={p.payload?.[0]?.payload as Linha | undefined}
                        metrica={metrica} temAnterior={temAnterior} />
                    )}
                  />
                  <Area key={`a-${metrica}`} type="monotone" dataKey="atual" stroke="var(--primary)" strokeWidth={2}
                    fill={`url(#${gradId})`} isAnimationActive={!reduzMovimento} animationDuration={500}
                    dot={dados.length === 1 ? { r: 3, fill: "var(--primary)", strokeWidth: 0 } : false}
                    activeDot={{ r: 4, fill: "var(--primary)", stroke: "var(--card)", strokeWidth: 2 }} />
                  {temAnterior && (
                    <Line key={`p-${metrica}`} type="monotone" dataKey="anterior" stroke="var(--muted-foreground)"
                      strokeWidth={1.5} strokeDasharray="4 4" isAnimationActive={!reduzMovimento} animationDuration={500}
                      dot={(d) => (d.payload?.anteriorSolto
                        ? <circle key={`p${d.index}`} cx={d.cx} cy={d.cy} r={2.5} fill="var(--muted-foreground)" />
                        : null)}
                      activeDot={{ r: 3, fill: "var(--muted-foreground)", stroke: "var(--card)", strokeWidth: 2 }} />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </Cartao>
  );
}

function Legenda({ temAnterior }: { temAnterior: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-lone-caption text-muted-foreground" aria-hidden>
      <span className="inline-flex items-center gap-1.5">
        <svg width="16" height="6" className="text-primary"><line x1="0" y1="3" x2="16" y2="3" stroke="currentColor" strokeWidth="2" /></svg>
        Este período
      </span>
      {temAnterior && (
        <span className="inline-flex items-center gap-1.5">
          <svg width="16" height="6" className="text-muted-foreground"><line x1="0" y1="3" x2="16" y2="3" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 3" /></svg>
          Período anterior
        </span>
      )}
    </div>
  );
}

function SeloVariacao({ pct, natureza }: { pct: number | null; natureza: Natureza }) {
  if (pct == null || !Number.isFinite(pct)) return null;
  const tom = tomDaVariacao(pct, natureza, 5);
  const texto = formatarVariacao(pct);
  const Seta = texto === "0%" ? Minus : pct > 0 ? ArrowUpRight : ArrowDownRight;
  const cores = tom === "bom"
    ? "border-lone-success-border bg-lone-success-bg text-lone-success"
    : tom === "ruim"
      ? "border-lone-warning-border bg-lone-warning-bg text-lone-warning"
      : "border-border bg-muted text-muted-foreground";
  return (
    <span className={clsx("inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-lone-caption font-medium tabular-nums", cores)}>
      <Seta size={12} aria-hidden />
      {texto}
      <span className="sr-only"> em relação ao período anterior</span>
    </span>
  );
}

function DicaDiaria({ ativo, linha, metrica, temAnterior }: {
  ativo?: boolean; linha?: Linha; metrica: MetricaDiaria; temAnterior: boolean;
}) {
  if (!ativo || !linha) return null;
  const pct = variacao(linha.atual, linha.anterior);
  return (
    <div className="min-w-[180px] max-w-[260px] rounded-lg border border-border bg-popover px-3 py-2 text-popover-foreground shadow-sm">
      <p className="mb-1.5 text-lone-caption font-medium text-muted-foreground">{rotuloDiaLongo(linha.dia)}</p>
      <div className="space-y-1 text-lone-body">
        <p className="flex items-center justify-between gap-4">
          <span className="inline-flex items-center gap-1.5 text-muted-foreground"><span className="h-0.5 w-3 rounded-full bg-primary" />Este período</span>
          <span className="font-medium tabular-nums text-foreground">{formatarMetrica(metrica, linha.atual)}</span>
        </p>
        {temAnterior && (
          <p className="flex items-center justify-between gap-4">
            <span className="inline-flex items-center gap-1.5 text-muted-foreground"><span className="w-3 border-t border-dashed border-muted-foreground" />Período anterior</span>
            <span className="tabular-nums text-muted-foreground">{linha.anterior == null ? "—" : formatarMetrica(metrica, linha.anterior)}</span>
          </p>
        )}
      </div>
      {pct != null && <p className="mt-1.5 text-lone-caption tabular-nums text-muted-foreground">{formatarVariacao(pct)} em relação ao mesmo dia do período anterior</p>}
    </div>
  );
}
