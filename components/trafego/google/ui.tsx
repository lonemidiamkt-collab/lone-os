"use client";

// Peças comuns das telas Tráfego › Google Ads e Tráfego › Google Meu Negócio (19/11/2026).

import { AlertTriangle, ArrowDownRight, ArrowUpRight, CheckCircle2, Info, Minus, OctagonAlert, type LucideIcon } from "lucide-react";
import type { Gravidade, Sinal } from "@/lib/google/carteira";
import { cn } from "@/lib/utils";

export const brl0 = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
export const brl2 = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const inteiro = (n: number | null | undefined) => (n == null ? "—" : Math.round(n).toLocaleString("pt-BR"));
export const pct0 = (n: number | null | undefined) => (n == null ? "—" : `${Math.round(n * 100)}%`);

export function quando(iso: string | null | undefined): string {
  if (!iso) return "nunca";
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export const GRAVIDADE: Record<Gravidade, { cls: string; borda: string; icone: LucideIcon; rotulo: string }> = {
  critico: { cls: "border-lone-danger-border bg-lone-danger-bg text-lone-danger", borda: "before:bg-destructive", icone: OctagonAlert, rotulo: "Crítico" },
  atencao: { cls: "border-lone-warning-border bg-lone-warning-bg text-lone-warning", borda: "before:bg-lone-warning", icone: AlertTriangle, rotulo: "Atenção" },
  info: { cls: "border-lone-info-border bg-lone-info-bg text-lone-info", borda: "before:bg-lone-info", icone: Info, rotulo: "Oportunidade" },
};

export function ChipSinal({ sinal, compacto = false }: { sinal: Sinal; compacto?: boolean }) {
  const g = GRAVIDADE[sinal.gravidade];
  const Icone = g.icone;
  return (
    <span title={sinal.detalhe} className={cn("inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium", g.cls)}>
      <Icone size={12} className="shrink-0" aria-hidden="true" />
      <span className={cn(compacto && "truncate")}>{sinal.titulo}</span>
    </span>
  );
}

export function SemSinais() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-lone-success-border bg-lone-success-bg px-2 py-0.5 text-[11px] font-medium text-lone-success">
      <CheckCircle2 size={12} aria-hidden="true" /> Tudo certo
    </span>
  );
}

/** Seta + % de variação. `bomQuandoSobe` decide a cor (custo subir é ruim). */
export function Variacao({ valor, bomQuandoSobe = true, className }: { valor: number | null; bomQuandoSobe?: boolean; className?: string }) {
  if (valor == null) return <span className={cn("text-[11px] text-muted-foreground", className)}>—</span>;
  const neutro = Math.abs(valor) < 3;
  const bom = neutro ? null : (valor > 0) === bomQuandoSobe;
  const Icone = neutro ? Minus : valor > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-[11px] font-medium tabular-nums",
      bom === null ? "text-muted-foreground" : bom ? "text-lone-success" : "text-lone-danger", className)}>
      <Icone size={12} aria-hidden="true" />{Math.abs(Math.round(valor))}%
    </span>
  );
}

/** Cartão de número do topo. Clicável vira filtro. */
export function CartaoNumero({ rotulo, valor, sub, icone: Icone, ativo, tom = "neutro", onClick }: {
  rotulo: string; valor: string; sub?: string; icone: LucideIcon; ativo?: boolean;
  tom?: "neutro" | "perigo" | "aviso" | "info"; onClick?: () => void;
}) {
  const corIcone = tom === "perigo" ? "text-lone-danger" : tom === "aviso" ? "text-lone-warning" : tom === "info" ? "text-lone-info" : "text-primary";
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      {...(onClick ? { type: "button" as const, onClick, "aria-pressed": !!ativo } : {})}
      className={cn("rounded-xl border bg-card p-4 text-left transition-colors",
        onClick && "hover:border-primary/40",
        ativo ? "border-primary ring-1 ring-primary/40" : "border-border")}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{rotulo}</span>
        <Icone size={15} className={corIcone} aria-hidden="true" />
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{valor}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </Tag>
  );
}

/** Barrinha horizontal de parcela (0–1) com rótulo. */
export function BarraParcela({ valor, cor, rotulo }: { valor: number | null; cor: string; rotulo: string }) {
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2 text-[11px]">
        <span className="text-muted-foreground">{rotulo}</span>
        <span className="font-medium tabular-nums text-foreground">{pct0(valor)}</span>
      </div>
      <div className="mt-1 h-1.5 w-full rounded-full bg-muted">
        {valor != null && <div className={cn("h-full rounded-full", cor)} style={{ width: `${Math.min(100, Math.max(2, valor * 100))}%` }} />}
      </div>
    </div>
  );
}

export function Aviso({ tom, children, acao }: { tom: "perigo" | "aviso" | "info"; children: React.ReactNode; acao?: React.ReactNode }) {
  const cls = tom === "perigo" ? "border-lone-danger-border bg-lone-danger-bg text-lone-danger"
    : tom === "aviso" ? "border-lone-warning-border bg-lone-warning-bg text-lone-warning"
      : "border-lone-info-border bg-lone-info-bg text-lone-info";
  return (
    <div role={tom === "perigo" ? "alert" : "status"} className={cn("flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2 text-xs", cls)}>
      <span className="min-w-0 flex-1">{children}</span>
      {acao}
    </div>
  );
}
