import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// ── Variants ──────────────────────────────────────────────────

const pillBadge = cva(
  "inline-flex items-center gap-1 rounded-full font-inter font-medium leading-none",
  {
    variants: {
      tone: {
        default: "bg-[var(--lone-bg-elevated)] text-[var(--lone-text-secondary)]",
        brand:   "bg-[var(--lone-brand-bg-soft)] text-[var(--lone-brand-soft)]",
        danger:  "bg-[var(--lone-danger-bg)]  text-[var(--lone-danger)]",
        warning: "bg-[var(--lone-warning-bg)] text-[var(--lone-warning)]",
        success: "bg-[var(--lone-success-bg)] text-[var(--lone-success)]",
        info:    "bg-[var(--lone-info-bg)]    text-[var(--lone-info)]",
      },
      size: {
        sm: "text-[10px] px-2 py-[3px]",
        md: "text-[11px] px-3 py-[5px]",
      },
    },
    defaultVariants: { tone: "default", size: "sm" },
  },
);

// ── Types ─────────────────────────────────────────────────────

export interface PillBadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof pillBadge> {
  icon?: React.ReactNode;
}

// ── Component ─────────────────────────────────────────────────

const PillBadge = React.forwardRef<HTMLSpanElement, PillBadgeProps>(
  ({ tone, size, icon, className, children, ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={cn(pillBadge({ tone, size }), className)}
        {...props}
      >
        {icon && <span className="shrink-0" aria-hidden>{icon}</span>}
        {children}
      </span>
    );
  },
);

PillBadge.displayName = "LoneUI.PillBadge";

export { PillBadge };
