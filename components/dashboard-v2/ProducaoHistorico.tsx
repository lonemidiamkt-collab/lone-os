"use client";

import React, { useState } from "react";
import { BarChart3 } from "lucide-react";
import { SectionDivider } from "@/components/lone-ui";
import { cn } from "@/lib/utils";

// Produção de conteúdo com DUAS visões:
//   · Mês  → os últimos meses (janela móvel, se atualiza sozinha)
//   · Semana → todas as semanas do mês corrente (S1…S5), pra ver o ritmo DENTRO do mês
// Em ambas, o realizado é comparado com a META (soma do posts_goal dos clientes em operação):
// "67 de 396" responde direto "entregamos o que foi contratado?".
// A fonte é o histórico de publicação (content_card_transitions), não campo digitado.

export interface MesProducao { mes: string; label: string; total: number }
export interface SemanaProducao { label: string; inicio: string; total: number; corrente: boolean }

export interface ProducaoHistoricoProps extends React.HTMLAttributes<HTMLDivElement> {
  semana: number;
  mes: number;
  historico: MesProducao[];
  semanas?: SemanaProducao[];
  meta?: { meta: number; clientes: number };
}

const ProducaoHistorico = React.forwardRef<HTMLDivElement, ProducaoHistoricoProps>(
  ({ semana, mes, historico, semanas = [], meta, className, ...props }, ref) => {
    const [visao, setVisao] = useState<"mes" | "semana">("mes");

    const barras = visao === "mes"
      ? historico.map((h) => ({ chave: h.mes, label: h.label, total: h.total, destaque: h.mes === historico[historico.length - 1]?.mes }))
      : semanas.map((s) => ({ chave: s.inicio, label: s.label, total: s.total, destaque: s.corrente }));
    const pico = Math.max(1, ...barras.map((b) => b.total));

    // Variação só quando o mês anterior teve movimento REAL. Comparar 67 contra 2 dava "+3250%",
    // um número que impressiona e não informa (o histórico só começou a ser capturado agora).
    const anterior = historico[historico.length - 2]?.total ?? 0;
    const delta = anterior >= 5 ? Math.round(((mes - anterior) / anterior) * 100) : null;

    const pctMeta = meta?.meta ? Math.round((mes / meta.meta) * 100) : null;

    return (
      <div
        ref={ref}
        className={cn("rounded-xl border border-lone-border bg-lone-bg-card p-4", className)}
        {...props}
      >
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 size={13} className="text-lone-brand shrink-0" aria-hidden="true" />
          <SectionDivider label="Produção de conteúdo" className="flex-1" />
          <div className="flex shrink-0 rounded-lg border border-lone-border p-0.5">
            {(["mes", "semana"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setVisao(v)}
                className={cn(
                  "px-2.5 py-1 rounded-md text-lone-caption font-inter transition-colors",
                  visao === v ? "bg-lone-brand text-white" : "text-lone-text-tertiary hover:text-lone-text-primary",
                )}
              >
                {v === "mes" ? "Mês" : "Semana"}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-6 mb-4">
          <div>
            <p className="text-lone-h1 font-sans font-bold tabular-nums text-lone-text-primary leading-none">{semana}</p>
            <p className="text-lone-caption font-inter text-lone-text-tertiary mt-1">posts esta semana</p>
          </div>
          <div>
            <p className="text-lone-h1 font-sans font-bold tabular-nums text-lone-text-primary leading-none">
              {mes}
              {meta?.meta ? <span className="text-lone-body text-lone-text-tertiary font-normal"> / {meta.meta}</span> : null}
            </p>
            <p className="text-lone-caption font-inter text-lone-text-tertiary mt-1">
              este mês
              {pctMeta !== null && (
                <span className={pctMeta >= 80 ? "text-[var(--lone-success)]" : pctMeta >= 50 ? "text-[var(--lone-warning)]" : "text-[var(--lone-danger)]"}>
                  {" "}({pctMeta}% da meta{meta?.clientes ? ` de ${meta.clientes} clientes` : ""})
                </span>
              )}
              {delta !== null && (
                <span className={delta >= 0 ? "text-[var(--lone-success)]" : "text-[var(--lone-warning)]"}>
                  {" "}· {delta >= 0 ? "+" : ""}{delta}% vs mês passado
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-end gap-2 h-20">
          {barras.map((b) => {
            const alturaPct = Math.round((b.total / pico) * 100);
            return (
              <div key={b.chave} className="flex-1 flex flex-col items-center gap-1.5 min-w-0">
                <span className="text-lone-caption font-jetbrains text-lone-text-tertiary tabular-nums">
                  {b.total || ""}
                </span>
                <div
                  className={cn("w-full rounded-t transition-all", b.destaque ? "bg-lone-brand" : "bg-lone-bg-elevated")}
                  style={{ height: `${Math.max(alturaPct, b.total > 0 ? 8 : 2)}%`, minHeight: 2 }}
                  title={`${b.label}: ${b.total} posts`}
                />
                <span className={cn(
                  "text-lone-caption font-inter truncate w-full text-center",
                  b.destaque ? "text-lone-text-primary" : "text-lone-text-disabled",
                )}>
                  {b.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  },
);

ProducaoHistorico.displayName = "DashboardV2.ProducaoHistorico";

export default ProducaoHistorico;
