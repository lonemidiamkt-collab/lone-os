"use client";

// Gráficos do Comercial (redesign de out/2026, Leva D1): ANEL de progresso, ROSCA de composição, BARRA da
// meta e selo de VARIAÇÃO. SVG próprio com tokens do tema (claro e escuro funcionam sem cor literal) — como
// o Âncora faz, sem biblioteca de gráfico. A matemática mora em lib/crm/graficos.ts (testada).

import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { arcoDoAnel, type FatiaDesenhada, type Tom } from "@/lib/crm/graficos";
import type { Variacao } from "@/lib/crm/painel";

// Classes escritas por extenso: o Tailwind lê o código-fonte, string montada não gera CSS.
const TRACO: Record<Tom, string> = {
  primary: "stroke-primary", success: "stroke-lone-success", warning: "stroke-lone-warning",
  danger: "stroke-lone-danger", muted: "stroke-muted-foreground/40",
};
export const TEXTO_TOM: Record<Tom, string> = {
  primary: "text-primary", success: "text-lone-success", warning: "text-lone-warning",
  danger: "text-lone-danger", muted: "text-muted-foreground",
};
const TAMANHO = {
  xs: { caixa: "h-7 w-7", traco: 14, num: "text-[9px]" },
  sm: { caixa: "h-12 w-12", traco: 12, num: "text-[11px]" },
  md: { caixa: "h-24 w-24", traco: 10, num: "text-lg" },
  lg: { caixa: "h-36 w-36", traco: 9, num: "text-[28px]" },
} as const;

/** Anel de progresso: trilho cinza + arco arredondado a partir das 12h. Passou de 100%: selo, não estoura. */
export function Anel({ pct, tom = "primary", tamanho = "md", rotulo, centro, rotuloAcessivel }: {
  pct: number | null;
  tom?: Tom;
  tamanho?: keyof typeof TAMANHO;
  rotulo?: string;
  centro?: ReactNode;
  rotuloAcessivel: string;
}) {
  const t = TAMANHO[tamanho];
  const a = arcoDoAnel(pct);
  const raio = 50 - t.traco / 2;
  return (
    <div className={`relative grid shrink-0 place-items-center ${t.caixa}`} role="img" aria-label={rotuloAcessivel}>
      <svg viewBox="0 0 100 100" className="h-full w-full" fill="none" aria-hidden="true" shapeRendering="geometricPrecision">
        <circle cx="50" cy="50" r={raio} strokeWidth={t.traco} className="stroke-muted-foreground/15"
          strokeDasharray={pct == null ? "1.5 2.5" : undefined} pathLength={pct == null ? 100 : undefined} />
        {a.pintar > 0 && (
          <circle cx="50" cy="50" r={raio} strokeWidth={t.traco} strokeLinecap="round" pathLength={100}
            transform="rotate(-90 50 50)" className={`cc-anel-arco ${TRACO[tom]}`}
            style={{ strokeDasharray: `${a.pintar} 100` }} />
        )}
      </svg>
      {tamanho !== "sm" && tamanho !== "xs" && (
        <span className="absolute inset-0 grid place-content-center text-center leading-none">
          {centro ?? (
            <>
              <span className={`font-semibold tabular-nums tracking-tight text-foreground ${t.num}`}>{a.texto}</span>
              {rotulo && <span className="mt-1 text-lone-caption text-muted-foreground">{rotulo}</span>}
            </>
          )}
        </span>
      )}
      {a.passou && (tamanho === "md" || tamanho === "lg") && (
        <span className="absolute -right-1 -top-1 rounded-full bg-lone-success-bg px-1.5 py-0.5 text-[10px] font-semibold text-lone-success">bateu</span>
      )}
    </div>
  );
}

// Rosca na família da cor de marca (pesquisa: uma cor para os dados; verde/âmbar/vermelho só para estado).
// Cores SÓLIDAS dos tokens de gráfico — transparência sobre o cartão lavava o tom no escuro.
const TOM_FATIA = ["stroke-primary", "stroke-chart-2", "stroke-chart-4", "stroke-chart-3", "stroke-chart-5"];
const QUADRADO_FATIA = ["bg-primary", "bg-chart-2", "bg-chart-4", "bg-chart-3", "bg-chart-5"];

/** Rosca de composição: até 5 fatias em ordem decrescente a partir das 12h; legenda com valor E %. */
export function Rosca({ fatias, centroValor, centroRotulo, formatar, rotuloAcessivel, aoClicar }: {
  fatias: FatiaDesenhada[];
  centroValor: string;
  centroRotulo: string;
  formatar: (f: FatiaDesenhada) => string;
  rotuloAcessivel: string;
  aoClicar?: (f: FatiaDesenhada) => void;
}) {
  const varias = fatias.length > 1;
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 sm:flex-row">
      <div className="relative grid h-40 w-40 shrink-0 place-items-center" role="img" aria-label={rotuloAcessivel}>
        <svg viewBox="0 0 100 100" className="group/rosca h-full w-full" fill="none" aria-hidden="true" shapeRendering="geometricPrecision">
          <circle cx="50" cy="50" r="40" strokeWidth="14" className="stroke-muted-foreground/10" />
          {fatias.map((f, i) => (
            <circle key={f.chave} cx="50" cy="50" r="40" strokeWidth="14" pathLength={100} transform="rotate(-90 50 50)"
              className={`cc-anel-arco cursor-default transition-opacity duration-150 group-hover/rosca:opacity-40 hover:!opacity-100 ${f.outros ? "stroke-muted-foreground/35" : TOM_FATIA[i] ?? TOM_FATIA[4]}`}
              // 1,2 de folga entre fatias (a "lacuna da superfície" em vez de contorno).
              style={{ strokeDasharray: `${Math.max(0.5, f.tamanho - (varias ? 1.2 : 0))} 100`, strokeDashoffset: -f.inicio }}>
              <title>{`${f.rotulo}: ${formatar(f)} · ${f.pct}%`}</title>
            </circle>
          ))}
        </svg>
        <span className="absolute inset-0 grid place-content-center text-center leading-none">
          <span className="text-[15px] font-semibold tabular-nums tracking-tight text-foreground">{centroValor}</span>
          <span className="mt-1 text-lone-caption text-muted-foreground">{centroRotulo}</span>
        </span>
      </div>
      <ul className="w-full min-w-0 space-y-2">
        {fatias.map((f, i) => {
          const conteudo = (
            <>
              <span className={`h-2.5 w-2.5 shrink-0 rounded-sm ${f.outros ? "bg-muted-foreground/35" : QUADRADO_FATIA[i] ?? QUADRADO_FATIA[4]}`} aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-lone-body text-foreground">{f.rotulo}</span>
              <span className="shrink-0 text-lone-caption tabular-nums text-muted-foreground">{formatar(f)}</span>
              <span className="w-9 shrink-0 text-right text-lone-body font-medium tabular-nums text-foreground">{f.pct}%</span>
            </>
          );
          return (
            <li key={f.chave}>
              {aoClicar && !f.outros ? (
                <button onClick={() => aoClicar(f)} className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-2 rounded-md px-2 py-1 text-left transition-colors hover:bg-accent">{conteudo}</button>
              ) : (
                <div className="flex items-center gap-2 py-1">{conteudo}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Barra da meta com o tique de quanto do mês (em dias úteis) já passou. */
export function BarraMeta({ progresso, fracaoDoMes, tom }: { progresso: number; fracaoDoMes: number; tom: Tom }) {
  const FUNDO: Record<Tom, string> = { primary: "bg-primary", success: "bg-lone-success", warning: "bg-lone-warning", danger: "bg-lone-danger", muted: "bg-muted-foreground/40" };
  return (
    <div className="relative h-2 overflow-hidden rounded-full bg-muted-foreground/15" role="presentation">
      <div className={`h-full rounded-full ${FUNDO[tom]}`} style={{ width: `${Math.min(100, Math.max(progresso > 0 ? 2 : 0, progresso * 100))}%` }} />
      <div className="absolute inset-y-0 w-0.5 bg-foreground/50" style={{ left: `${Math.min(100, fracaoDoMes * 100)}%` }} title="Quanto do mês já passou" />
    </div>
  );
}

/** Selo de variação: seta + % e "vs. setembro". Verde quando melhora, vermelho quando piora, neutro sem base. */
export function SeloVariacao({ v, rotulo, melhorQuandoDesce = false }: { v: Variacao; rotulo: string; melhorQuandoDesce?: boolean }) {
  if (v.direcao === "sem_base") return <span className="text-lone-caption text-muted-foreground">sem período anterior para comparar</span>;
  if (v.direcao === "igual") return <span className="inline-flex items-center gap-1 text-lone-caption text-muted-foreground"><Minus size={12} aria-hidden="true" /> igual · {rotulo}</span>;
  const bom = (v.direcao === "sobe") !== melhorQuandoDesce;
  const Icone = v.direcao === "sobe" ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="inline-flex flex-wrap items-center gap-1 text-lone-caption">
      <span className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-semibold ${bom ? "bg-lone-success-bg text-lone-success" : "bg-lone-danger-bg text-lone-danger"}`}>
        <Icone size={12} aria-hidden="true" />{v.pct! > 0 ? "+" : ""}{v.pct}%
      </span>
      <span className="text-muted-foreground">{rotulo}</span>
    </span>
  );
}

/** Cartão base do comercial: branco com borda visível e sombra mínima no claro; contraste no escuro. */
export function Cartao({ children, className = "", destaque = false, semMargem = false }: { children: ReactNode; className?: string; destaque?: boolean; semMargem?: boolean }) {
  return (
    <section className={`flex flex-col rounded-2xl border bg-card shadow-sm dark:shadow-none ${semMargem ? "" : "p-5"} ${destaque ? "border-primary/30" : "border-border"} ${className}`}>
      {children}
    </section>
  );
}

/** Título de bloco: nome + linha de apoio + ação à direita. */
export function TituloBloco({ titulo, apoio, acao }: { titulo: string; apoio?: string; acao?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
      <div>
        <h2 className="text-lone-h2 text-foreground">{titulo}</h2>
        {apoio && <p className="mt-0.5 text-lone-caption text-muted-foreground">{apoio}</p>}
      </div>
      {acao}
    </div>
  );
}
