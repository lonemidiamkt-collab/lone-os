"use client";

import React from "react";
import Link from "next/link";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type AlertItemType =
  | "clients_at_risk"
  | "stuck_cards"
  | "urgent_tasks"
  | "expiring_contracts"
  | "pending_approval";

const ALERT_LABELS: Record<AlertItemType, { singular: string; plural: string; sub: string }> = {
  clients_at_risk:      { singular: "cliente em risco",     plural: "clientes em risco",     sub: "atenção imediata" },
  stuck_cards:          { singular: "card parado 48h+",     plural: "cards parados 48h+",    sub: "SLA violado" },
  urgent_tasks:         { singular: "tarefa crítica",       plural: "tarefas críticas",       sub: "prioridade máxima" },
  expiring_contracts:   { singular: "contrato vencendo",   plural: "contratos vencendo",    sub: "em até 30 dias" },
  pending_approval:     { singular: "post aguardando",      plural: "posts aguardando",       sub: "aprovação pendente" },
};

export interface CriticalAlertItem {
  type: AlertItemType;
  count: number;
  href?: string;
  onClick?: () => void;
}

export interface CriticalAlertBannerProps extends React.HTMLAttributes<HTMLDivElement> {
  alerts: CriticalAlertItem[];
}

const CriticalAlertBanner = React.forwardRef<HTMLDivElement, CriticalAlertBannerProps>(
  ({ alerts, className, ...props }, ref) => {
    const visible = alerts.filter((a) => a.count > 0);
    if (visible.length === 0) return null;

    return (
      <div
        ref={ref}
        role="alert"
        aria-label="Alertas críticos da operação"
        className={cn(
          "rounded-xl border border-[var(--lone-danger)]/20 bg-[var(--lone-danger)]/[0.04] p-4",
          className
        )}
        {...props}
      >
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle
            size={14}
            className="text-[var(--lone-danger)] shrink-0"
            aria-hidden="true"
          />
          <span className="text-lone-h2 font-inter font-medium text-lone-text-primary">
            Urgências do dia
          </span>
          <span className="ml-auto text-lone-caption font-inter text-lone-text-tertiary">
            {visible.length} {visible.length === 1 ? "alerta" : "alertas"}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {visible.map((item) => {
            const meta = ALERT_LABELS[item.type];
            const label = item.count === 1 ? meta.singular : meta.plural;
            const inner = (
              <div className="flex items-center gap-2.5 p-2.5 rounded-lg bg-[var(--lone-danger)]/[0.06] border border-[var(--lone-danger)]/15 hover:border-[var(--lone-danger)]/30 transition-colors w-full text-left">
                <div className="flex-1 min-w-0">
                  <p className="text-lone-body font-inter font-medium text-lone-text-primary truncate">
                    {item.count} {label}
                  </p>
                  <p className="text-lone-caption font-inter text-lone-text-tertiary">
                    {meta.sub}
                  </p>
                </div>
                <ChevronRight
                  size={12}
                  className="text-lone-text-disabled shrink-0"
                  aria-hidden="true"
                />
              </div>
            );

            if (item.href) {
              return (
                <Link key={item.type} href={item.href} className="block">
                  {inner}
                </Link>
              );
            }
            if (item.onClick) {
              return (
                <button key={item.type} onClick={item.onClick} className="block w-full">
                  {inner}
                </button>
              );
            }
            return <div key={item.type}>{inner}</div>;
          })}
        </div>
      </div>
    );
  }
);

CriticalAlertBanner.displayName = "DashboardV2.CriticalAlertBanner";

export default CriticalAlertBanner;
