"use client";

import React from "react";
import Link from "next/link";
import { Clock } from "lucide-react";
import { SectionDivider, PillBadge } from "@/components/lone-ui";
import { cn } from "@/lib/utils";

// Antes: badge "inativo" hardcoded para TODA a carteira (o cálculo lia dois campos mortos), com o
// tipo de serviço ao lado fingindo ser o nicho. Não dizia o que estava errado nem em quem olhar.
// Agora: o motivo DOMINANTE por cliente ("12d sem post nosso", "cliente sumiu há 9d"), ordenado
// por gravidade, e quem não tem sinal suficiente sai do alerta e vai pro rodapé.

export type MotivoPulso = "cliente_sumiu" | "paramos_de_postar" | "producao_travada" | "anuncio_parado";

export interface AttentionEntry {
  clientId: string;
  nome: string;
  nivel: "saudavel" | "atencao" | "risco" | "critico" | "sem_sinal";
  motivoDominante: MotivoPulso | null;
  motivoLabel: string | null;
}

const TOM: Record<string, "danger" | "warning" | "info"> = {
  critico: "danger", risco: "danger", atencao: "warning", saudavel: "info",
};
const PONTO: Record<string, string> = {
  critico: "var(--lone-danger)", risco: "var(--lone-danger)",
  atencao: "var(--lone-warning)", saudavel: "var(--lone-success)",
};

export interface WeeklyAttentionProps extends React.HTMLAttributes<HTMLDivElement> {
  clients: AttentionEntry[];
  semSinal?: { clientId: string; nome: string }[];
}

const WeeklyAttention = React.forwardRef<HTMLDivElement, WeeklyAttentionProps>(
  ({ clients, semSinal = [], className, ...props }, ref) => {
    if (clients.length === 0 && semSinal.length === 0) return null;

    return (
      <div
        ref={ref}
        className={cn("rounded-xl border border-lone-border bg-lone-bg-card p-4", className)}
        {...props}
      >
        <div className="flex items-center gap-2 mb-3">
          <Clock size={13} className="text-[var(--lone-warning)] shrink-0" aria-hidden="true" />
          <SectionDivider
            label="Precisa de atenção"
            badge={`${clients.length} cliente${clients.length !== 1 ? "s" : ""}`}
            className="flex-1"
          />
        </div>

        {clients.length > 0 ? (
          <div className="flex flex-wrap gap-2" role="list" aria-label="Clientes que precisam de atenção">
            {clients.map((c) => (
              <Link
                key={c.clientId}
                href={`/clients/${c.clientId}`}
                role="listitem"
                className={cn(
                  "inline-flex items-center gap-2 px-3 py-1.5 rounded-lg",
                  "bg-lone-bg-elevated border border-lone-border",
                  "hover:border-[var(--lone-warning)]/40 transition-colors group",
                )}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: PONTO[c.nivel] ?? "var(--lone-warning)" }}
                  aria-hidden="true"
                />
                <span className="text-lone-body font-inter text-lone-text-primary">{c.nome}</span>
                {c.motivoLabel && (
                  <PillBadge tone={TOM[c.nivel] ?? "warning"} size="sm">
                    {c.motivoLabel}
                  </PillBadge>
                )}
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-lone-caption font-inter text-lone-text-tertiary">
            Ninguém precisando de atenção agora — carteira em dia.
          </p>
        )}

        {semSinal.length > 0 && (
          <p className="mt-3 text-lone-caption font-inter text-lone-text-disabled">
            {semSinal.length} cliente{semSinal.length !== 1 ? "s" : ""} sem sinal suficiente pra avaliar
            (sem grupo mapeado ou sem responsável).
          </p>
        )}
      </div>
    );
  },
);

WeeklyAttention.displayName = "DashboardV2.WeeklyAttention";

export default WeeklyAttention;
