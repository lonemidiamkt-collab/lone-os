"use client";

import React from "react";
import { BarChart3 } from "lucide-react";
import { SectionDivider } from "@/components/lone-ui";
import { cn } from "@/lib/utils";

// Produção de conteúdo: semana, mês e o histórico mês a mês — que se atualiza sozinho, porque a
// fonte é o histórico de transições (content_card_transitions), não um campo digitado à mão.

export interface MesProducao { mes: string; label: string; total: number }

export interface ProducaoHistoricoProps extends React.HTMLAttributes<HTMLDivElement> {
  semana: number;
  mes: number;
  historico: MesProducao[];
}

const ProducaoHistorico = React.forwardRef<HTMLDivElement, ProducaoHistoricoProps>(
  ({ semana, mes, historico, className, ...props }, ref) => {
    const pico = Math.max(1, ...historico.map((h) => h.total));
    const mesAtual = historico[historico.length - 1]?.mes;
    // Compara com o mês anterior só quando ele existe e teve movimento (senão a variação mente).
    const anterior = historico[historico.length - 2]?.total ?? 0;
    const delta = anterior > 0 ? Math.round(((mes - anterior) / anterior) * 100) : null;

    return (
      <div
        ref={ref}
        className={cn("rounded-xl border border-lone-border bg-lone-bg-card p-4", className)}
        {...props}
      >
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 size={13} className="text-lone-brand shrink-0" aria-hidden="true" />
          <SectionDivider label="Produção de conteúdo" className="flex-1" />
        </div>

        <div className="flex items-end gap-6 mb-4">
          <div>
            <p className="text-lone-h1 font-sans font-bold tabular-nums text-lone-text-primary leading-none">{semana}</p>
            <p className="text-lone-caption font-inter text-lone-text-tertiary mt-1">posts esta semana</p>
          </div>
          <div>
            <p className="text-lone-h1 font-sans font-bold tabular-nums text-lone-text-primary leading-none">{mes}</p>
            <p className="text-lone-caption font-inter text-lone-text-tertiary mt-1">
              este mês
              {delta !== null && (
                <span className={delta >= 0 ? "text-[var(--lone-success)]" : "text-[var(--lone-warning)]"}>
                  {" "}({delta >= 0 ? "+" : ""}{delta}% vs mês passado)
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Histórico mês a mês — some sozinho conforme o tempo passa (janela móvel). */}
        <div className="flex items-end gap-2 h-20">
          {historico.map((h) => {
            const alturaPct = Math.round((h.total / pico) * 100);
            const atual = h.mes === mesAtual;
            return (
              <div key={h.mes} className="flex-1 flex flex-col items-center gap-1.5 min-w-0">
                <span className="text-lone-caption font-jetbrains text-lone-text-tertiary tabular-nums">
                  {h.total || ""}
                </span>
                <div
                  className={cn("w-full rounded-t transition-all", atual ? "bg-lone-brand" : "bg-lone-bg-elevated")}
                  style={{ height: `${Math.max(alturaPct, h.total > 0 ? 8 : 2)}%`, minHeight: 2 }}
                  title={`${h.label}: ${h.total} posts`}
                />
                <span className={cn(
                  "text-lone-caption font-inter truncate w-full text-center",
                  atual ? "text-lone-text-primary" : "text-lone-text-disabled",
                )}>
                  {h.label}
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
