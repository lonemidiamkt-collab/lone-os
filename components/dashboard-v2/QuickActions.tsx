"use client";

import React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export interface QuickAction {
  id: string;
  label: string;
  icon?: React.ReactNode;
  href?: string;
  onClick?: () => void;
  variant?: "primary" | "secondary";
}

export interface QuickActionsProps extends React.HTMLAttributes<HTMLDivElement> {
  actions: QuickAction[];
  label?: string;
}

const QuickActions = React.forwardRef<HTMLDivElement, QuickActionsProps>(
  ({ actions, label = "Ações rápidas", className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn("flex items-center gap-2 flex-wrap", className)}
        {...props}
      >
        {label && (
          <span className="text-lone-caption font-inter text-lone-text-tertiary mr-1">
            {label}
          </span>
        )}

        {actions.map((action) => {
          const isPrimary = action.variant === "primary";
          const baseClass = cn(
            "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg",
            "text-lone-caption font-inter font-medium transition-colors",
            isPrimary
              ? "bg-lone-brand/10 text-lone-brand border border-lone-brand/20 hover:bg-lone-brand/20"
              : "bg-lone-bg-elevated text-lone-text-primary border border-lone-border hover:bg-lone-bg-elevated/70"
          );

          if (action.href) {
            return (
              <Link key={action.id} href={action.href} className={baseClass}>
                {action.icon && (
                  <span aria-hidden="true" className="shrink-0">
                    {action.icon}
                  </span>
                )}
                {action.label}
              </Link>
            );
          }

          return (
            <button key={action.id} onClick={action.onClick} className={baseClass}>
              {action.icon && (
                <span aria-hidden="true" className="shrink-0">
                  {action.icon}
                </span>
              )}
              {action.label}
            </button>
          );
        })}
      </div>
    );
  }
);

QuickActions.displayName = "DashboardV2.QuickActions";

export default QuickActions;
