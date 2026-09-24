"use client";

// components/portal/ui.tsx — peças visuais do portal do cliente (cartão, cabeçalho de seção,
// seletor segmentado). Uma família só, pra "Anúncios" e "Crescimento nas redes" parecerem a mesma
// página — antes cada bloco tinha o próprio título, raio e peso de fonte.

import { useId, type HTMLAttributes, type ReactNode } from "react";
import { motion, type Variants } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Mesma entrada do PainelComparativo do topo (sobe 8px e aparece). Com "reduzir movimento" o
 *  MotionConfig da página tira o deslocamento e fica só o fade. */
export const entrada: Variants = {
  oculto: { opacity: 0, y: 8 },
  visivel: (i: number = 0) => ({
    opacity: 1, y: 0,
    transition: { delay: Math.min(i, 6) * 0.05, duration: 0.4, ease: [0.16, 1, 0.3, 1] },
  }),
};

export function Cartao({ children, className, as: Tag = "div", ...resto }:
  { children: ReactNode; className?: string; as?: "div" | "section" } & Omit<HTMLAttributes<HTMLElement>, "className" | "children">) {
  return <Tag className={cn("rounded-xl border border-border bg-card", className)} {...resto}>{children}</Tag>;
}

export function CabecalhoSecao({ titulo, descricao, icone: Icone, acao, className, nivel = 2 }: {
  titulo: ReactNode;
  descricao?: ReactNode;
  icone?: LucideIcon;
  acao?: ReactNode;
  className?: string;
  nivel?: 2 | 3;
}) {
  const H = nivel === 2 ? "h2" : "h3";
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-x-4 gap-y-2", className)}>
      <div className="min-w-0">
        <H className="flex items-center gap-2 text-lone-h2 tracking-tight text-foreground">
          {Icone && <Icone size={16} className="shrink-0 text-muted-foreground" aria-hidden />}
          {titulo}
        </H>
        {descricao && <p className="mt-0.5 text-lone-caption text-muted-foreground">{descricao}</p>}
      </div>
      {acao}
    </div>
  );
}

export interface OpcaoSegmentada<T extends string> { valor: T; rotulo: string; icone?: LucideIcon }

/**
 * Seletor segmentado (abas de período, métrica, visão). O realce desliza entre as opções.
 *
 * Foco: o anel aparece só no teclado (focus-visible) e é fino — o CEO viu um anel grosso "preso"
 * na aba ativa (o contorno global de 2px + offset em volta do botão azul). Toque no celular não
 * deixa rastro (tap-highlight transparente).
 *
 * `destaque`: realce na cor da marca (visão principal); sem ele, realce neutro (filtros).
 */
export function Segmentado<T extends string>({
  opcoes, valor, onChange, rotulo, desabilitado = false, tamanho = "md", cheio = false, destaque = false, className,
}: {
  opcoes: readonly OpcaoSegmentada<T>[];
  valor: T;
  onChange: (v: T) => void;
  /** Nome do grupo para leitor de tela ("Período", "Métrica"…). */
  rotulo: string;
  desabilitado?: boolean;
  tamanho?: "md" | "sm";
  /** Ocupa a largura toda, opções do mesmo tamanho. */
  cheio?: boolean;
  destaque?: boolean;
  className?: string;
}) {
  const idRealce = `seg-${useId()}`;
  return (
    <div role="group" aria-label={rotulo}
      className={cn("max-w-full gap-1 overflow-x-auto rounded-xl bg-muted p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", cheio ? "flex w-full" : "inline-flex", className)}>
      {opcoes.map((o) => {
        const ativo = o.valor === valor;
        const Icone = o.icone;
        return (
          <button
            key={o.valor}
            type="button"
            aria-pressed={ativo}
            disabled={desabilitado}
            onClick={() => { if (!ativo) onChange(o.valor); }}
            className={cn(
              "relative flex min-w-0 shrink-0 items-center justify-center rounded-lg font-medium transition-colors duration-200",
              // focus-visible:outline-none vence o `button:focus-visible` global (especificidade maior).
              "[-webkit-tap-highlight-color:transparent] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
              "disabled:cursor-not-allowed disabled:opacity-60",
              // 13px no celular: "7 dias · 14 dias · Este mês · Mês passado" cabe inteiro em 375px sem cortar.
              tamanho === "md" ? "min-h-[44px] px-2.5 text-[13px] sm:px-3 sm:text-sm" : "min-h-[36px] px-2 text-xs sm:px-2.5 sm:text-[13px]",
              // flex-auto: cresce na proporção do rótulo ("Mês passado" precisa de mais que "7 dias").
              // Não encolhe abaixo do rótulo: se não couber (tela muito estreita), o grupo desliza pro
              // lado em vez de cortar o texto ("Mensage…", "Cliqu…" em 375px).
              cheio && "flex-auto",
              ativo
                ? destaque ? "text-primary-foreground" : "text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {ativo && (
              <motion.span
                layoutId={idRealce}
                aria-hidden
                className={cn(
                  "absolute inset-0 rounded-lg",
                  destaque ? "bg-primary" : "border border-border bg-card shadow-sm dark:bg-accent",
                )}
                transition={{ type: "spring", stiffness: 520, damping: 40 }}
              />
            )}
            <span className="relative flex min-w-0 items-center gap-1.5">
              {Icone && <Icone size={15} className="shrink-0" aria-hidden />}
              <span className="whitespace-nowrap">{o.rotulo}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Aviso em linha (erro, atualizando, dado antigo). */
export function Aviso({ tom, children, acao, role }: {
  tom: "atencao" | "info" | "neutro";
  children: ReactNode;
  acao?: ReactNode;
  role?: "status" | "alert";
}) {
  const cores = tom === "atencao"
    ? "border-lone-warning-border bg-lone-warning-bg text-lone-warning"
    : tom === "info"
      ? "border-lone-info-border bg-lone-info-bg text-lone-info"
      : "border-border bg-card text-muted-foreground";
  return (
    <div role={role} className={cn("flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 text-sm", cores)}>
      <span className="min-w-[200px] flex-1">{children}</span>
      {acao}
    </div>
  );
}
