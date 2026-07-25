"use client";

import React from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { SectionDivider, PillBadge } from "@/components/lone-ui";
import { cn } from "@/lib/utils";
import type { ClientStatus } from "@/lib/types";

export type StatusFilterValue = ClientStatus | "all";

const STATUS_FILTER_OPTIONS: { key: StatusFilterValue; label: string }[] = [
  { key: "all",        label: "Todos" },
  { key: "good",       label: "On Fire" },
  { key: "average",    label: "Atenção" },
  { key: "at_risk",    label: "Crítico" },
  { key: "onboarding", label: "Onboarding" },
];

const STATUS_TONE: Record<ClientStatus, "success" | "warning" | "danger" | "info"> = {
  good:       "success",
  average:    "warning",
  at_risk:    "danger",
  onboarding: "info",
};

const STATUS_LABEL: Record<ClientStatus, string> = {
  good:       "On Fire",
  average:    "Atenção",
  at_risk:    "Crítico",
  onboarding: "Onboarding",
};

export interface ClientRowData {
  id: string;
  name: string;
  status: ClientStatus;
  postsThisMonth: number;
  postsGoal: number;
  assignedTraffic?: string;
  assignedSocial?: string;
}

export interface ClientStatusListProps extends React.HTMLAttributes<HTMLDivElement> {
  clients: ClientRowData[];
  totalCount: number;
  statusFilter: StatusFilterValue;
  onFilterChange: (filter: StatusFilterValue) => void;
}

const ClientStatusList = React.forwardRef<HTMLDivElement, ClientStatusListProps>(
  ({ clients, totalCount, statusFilter, onFilterChange, className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn("rounded-xl border border-lone-border bg-lone-bg-card p-4", className)}
        {...props}
      >
        {/* Header + filter */}
        <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
          <SectionDivider label="Status dos Clientes" />
          <div className="flex items-center gap-1 flex-wrap">
            {STATUS_FILTER_OPTIONS.map((f) => {
              const count =
                f.key === "all"
                  ? totalCount
                  : clients.filter((c) => c.status === f.key).length;
              const isActive = statusFilter === f.key;
              return (
                <button
                  key={f.key}
                  onClick={() => onFilterChange(f.key)}
                  aria-pressed={isActive}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-lone-caption font-inter font-medium transition-colors",
                    isActive
                      ? "bg-lone-brand/15 text-lone-brand border border-lone-brand/25"
                      : "text-lone-text-tertiary hover:text-lone-text-primary hover:bg-lone-bg-elevated"
                  )}
                >
                  {f.label}
                  <span className="ml-1 text-lone-text-disabled">({count})</span>
                </button>
              );
            })}
            <Link
              href="/clients"
              className="text-lone-caption font-inter text-lone-brand hover:underline ml-1"
            >
              Ver todos
            </Link>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full" role="table" aria-label="Lista de clientes por status">
            <thead>
              <tr className="border-b border-lone-border">
                <th className="text-left py-2 px-3 text-lone-eyebrow font-inter text-lone-text-disabled tracking-[1px]">
                  Cliente
                </th>
                <th className="text-left py-2 px-3 text-lone-eyebrow font-inter text-lone-text-disabled tracking-[1px]">
                  Status
                </th>
                <th className="text-left py-2 px-3 text-lone-eyebrow font-inter text-lone-text-disabled tracking-[1px]">
                  Posts/Mês
                </th>
                <th className="text-left py-2 px-3 text-lone-eyebrow font-inter text-lone-text-disabled tracking-[1px]">
                  Responsáveis
                </th>
              </tr>
            </thead>
            <tbody>
              {clients.map((client) => {
                const posts = client.postsThisMonth ?? 0;
                const goal = client.postsGoal ?? 12;
                const pct = Math.min(100, Math.round((posts / goal) * 100));

                return (
                  <tr
                    key={client.id}
                    className="border-b border-lone-border/50 hover:bg-lone-bg-elevated transition-colors group"
                  >
                    <td className="py-3 px-3">
                      <Link
                        href={`/clients/${client.id}`}
                        className="inline-flex items-center gap-2 text-lone-body font-inter font-medium text-lone-text-primary hover:text-lone-brand transition-colors"
                      >
                        <span
                          className={cn(
                            "w-1.5 h-1.5 rounded-full shrink-0",
                            client.status === "good"       && "bg-[var(--lone-success)]",
                            client.status === "average"    && "bg-[var(--lone-warning)]",
                            client.status === "at_risk"    && "bg-[var(--lone-danger)]",
                            client.status === "onboarding" && "bg-[var(--lone-info)]"
                          )}
                          aria-hidden="true"
                        />
                        {client.name}
                        <ChevronRight
                          size={10}
                          className="text-lone-text-disabled opacity-0 group-hover:opacity-100 transition-opacity"
                          aria-hidden="true"
                        />
                      </Link>
                    </td>
                    <td className="py-3 px-3">
                      <PillBadge tone={STATUS_TONE[client.status]} size="sm">
                        {STATUS_LABEL[client.status]}
                      </PillBadge>
                    </td>
                    <td className="py-3 px-3">
                      {client.status !== "onboarding" && (
                        <div className="flex items-center gap-2">
                          <div
                            className="w-14 h-1 bg-lone-bg-elevated rounded-full overflow-hidden"
                            role="progressbar"
                            aria-valuenow={posts}
                            aria-valuemax={goal}
                            aria-label={`${posts} de ${goal} posts`}
                          >
                            <div
                              className="h-full rounded-full bg-lone-brand"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-lone-caption font-jetbrains text-lone-text-tertiary">
                            {posts}/{goal}
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-3 text-lone-caption font-inter text-lone-text-tertiary">
                      {[client.assignedTraffic, client.assignedSocial].filter(Boolean).join(", ")}
                    </td>
                  </tr>
                );
              })}
              {clients.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-lone-body font-inter text-lone-text-disabled">
                    Nenhum cliente nesta categoria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }
);

ClientStatusList.displayName = "DashboardV2.ClientStatusList";

export default ClientStatusList;
