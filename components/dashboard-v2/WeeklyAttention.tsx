"use client";

import React from "react";
import Link from "next/link";
import { Clock, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AttentionItem {
  id: string;
  tone: "warning" | "danger";
  text: string;
  actionLabel: string;
  href: string;
}

export interface WeeklyAttentionProps extends React.HTMLAttributes<HTMLDivElement> {
  items: AttentionItem[];
}

const WeeklyAttention = React.forwardRef<HTMLDivElement, WeeklyAttentionProps>(
  ({ items, className, ...props }, ref) => {
    if (items.length === 0) return null;

    return (
      <div
        ref={ref}
        className={cn("rounded-xl border border-lone-border bg-lone-bg-card overflow-hidden", className)}
        {...props}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-lone-border">
          <span className="text-lone-body font-inter font-semibold text-lone-text-primary">
            Atenção esta semana
          </span>
          <span className="text-lone-caption font-inter text-lone-text-tertiary">
            {items.length} {items.length === 1 ? "item" : "itens"}
          </span>
        </div>

        {items.map((item, i) => (
          <div
            key={item.id}
            className={cn(
              "flex items-center gap-3 px-4 py-3",
              i < items.length - 1 && "border-b border-lone-border"
            )}
          >
            {item.tone === "warning" ? (
              <Clock
                size={14}
                className="text-[var(--lone-warning)] shrink-0"
                aria-hidden="true"
              />
            ) : (
              <AlertTriangle
                size={14}
                className="text-[var(--lone-danger)] shrink-0"
                aria-hidden="true"
              />
            )}
            <p className="flex-1 text-lone-body font-inter text-lone-text-primary min-w-0">
              {item.text}
            </p>
            <Link
              href={item.href}
              className="text-lone-caption font-inter text-lone-brand hover:underline shrink-0 whitespace-nowrap"
            >
              {item.actionLabel} →
            </Link>
          </div>
        ))}
      </div>
    );
  }
);

WeeklyAttention.displayName = "DashboardV2.WeeklyAttention";

export default WeeklyAttention;
