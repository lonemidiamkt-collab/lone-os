"use client";

import React from "react";
import Link from "next/link";
import { Clock } from "lucide-react";
import { SectionDivider, PillBadge } from "@/components/lone-ui";
import { cn } from "@/lib/utils";

export type InactivityReason = "no_kanban_7d" | "no_posts" | "both";

const REASON_LABELS: Record<InactivityReason, string> = {
  no_kanban_7d: "sem kanban",
  no_posts:     "sem posts",
  both:         "inativo",
};

export interface InactiveClientEntry {
  id: string;
  name: string;
  industry?: string;
  reason: InactivityReason;
}

export interface WeeklyAttentionProps extends React.HTMLAttributes<HTMLDivElement> {
  clients: InactiveClientEntry[];
}

const WeeklyAttention = React.forwardRef<HTMLDivElement, WeeklyAttentionProps>(
  ({ clients, className, ...props }, ref) => {
    if (clients.length === 0) return null;

    return (
      <div
        ref={ref}
        className={cn("rounded-xl border border-lone-border bg-lone-bg-card p-4", className)}
        {...props}
      >
        <div className="flex items-center gap-2 mb-3">
          <Clock size={13} className="text-[var(--lone-warning)] shrink-0" aria-hidden="true" />
          <SectionDivider
            label="Atenção — 7 dias"
            badge={`${clients.length} cliente${clients.length !== 1 ? "s" : ""}`}
            className="flex-1"
          />
        </div>

        <div className="flex flex-wrap gap-2" role="list" aria-label="Clientes sem interação nos últimos 7 dias">
          {clients.map((client) => (
            <Link
              key={client.id}
              href={`/clients/${client.id}`}
              role="listitem"
              className={cn(
                "inline-flex items-center gap-2",
                "px-3 py-1.5 rounded-lg",
                "bg-lone-bg-elevated border border-lone-border",
                "hover:border-[var(--lone-warning)]/40 transition-colors group"
              )}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--lone-warning)] shrink-0" aria-hidden="true" />
              <span className="text-lone-body font-inter text-lone-text-primary group-hover:text-lone-text-primary">
                {client.name}
              </span>
              {client.industry && (
                <span className="text-lone-caption font-inter text-lone-text-tertiary hidden sm:inline">
                  {client.industry}
                </span>
              )}
              <PillBadge tone="warning" size="sm">
                {REASON_LABELS[client.reason]}
              </PillBadge>
            </Link>
          ))}
        </div>
      </div>
    );
  }
);

WeeklyAttention.displayName = "DashboardV2.WeeklyAttention";

export default WeeklyAttention;
