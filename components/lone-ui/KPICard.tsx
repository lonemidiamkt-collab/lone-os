import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// ── Variant definitions ───────────────────────────────────────

const toneValue = cva("", {
  variants: {
    tone: {
      default: "text-lone-text-primary",
      danger:  "text-lone-danger",
      warning: "text-lone-warning",
      success: "text-lone-success",
      info:    "text-lone-info",
    },
  },
  defaultVariants: { tone: "default" },
});

const toneAccent = cva("absolute inset-y-0 left-0 w-[3px] rounded-l-[10px]", {
  variants: {
    tone: {
      default: "bg-lone-brand",
      danger:  "bg-lone-danger",
      warning: "bg-lone-warning",
      success: "bg-lone-success",
      info:    "bg-lone-info",
    },
  },
  defaultVariants: { tone: "default" },
});

// ── Types ─────────────────────────────────────────────────────

export interface KPICardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof toneValue> {
  label: string;
  value: string | number;
  caption?: string;
  icon?: React.ReactNode;
  accent?: boolean;
  onClick?: () => void;
}

// ── Component ─────────────────────────────────────────────────

const KPICard = React.forwardRef<HTMLDivElement, KPICardProps>(
  (
    { label, value, caption, icon, tone, accent, onClick, className, ...props },
    ref,
  ) => {
    const isClickable = !!onClick;

    return (
      <div
        ref={ref}
        role={isClickable ? "button" : undefined}
        tabIndex={isClickable ? 0 : undefined}
        onClick={onClick}
        onKeyDown={isClickable ? (e) => e.key === "Enter" && onClick?.() : undefined}
        className={cn(
          // Base
          "relative flex flex-col gap-2 rounded-[10px] border p-[14px] transition-colors duration-150",
          "bg-lone-bg-card border-lone-border",
          // Clickable
          isClickable && "cursor-pointer hover:border-lone-border-strong hover:bg-lone-bg-elevated",
          className,
        )}
        {...props}
      >
        {/* Accent bar */}
        {accent && <span className={toneAccent({ tone })} aria-hidden />}

        {/* Label row */}
        <div className="flex items-center gap-1.5">
          {icon && (
            <span className={cn("shrink-0", toneValue({ tone }))} aria-hidden>
              {icon}
            </span>
          )}
          <span className="text-lone-eyebrow font-inter font-medium uppercase tracking-[1.5px] text-lone-text-tertiary leading-none">
            {label}
          </span>
        </div>

        {/* Value */}
        <p className={cn("font-inter font-medium leading-none tabular-nums", toneValue({ tone }))}
           style={{ fontSize: "27px" }}>
          {value}
        </p>

        {/* Caption */}
        {caption && (
          <p className="text-lone-caption font-inter text-lone-text-tertiary leading-none">
            {caption}
          </p>
        )}
      </div>
    );
  },
);

KPICard.displayName = "LoneUI.KPICard";

export { KPICard };
