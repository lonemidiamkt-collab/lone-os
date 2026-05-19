import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// ── Variants ──────────────────────────────────────────────────

const bannerRoot = cva(
  "flex items-start gap-3 rounded-[8px] border px-[14px] py-3",
  {
    variants: {
      tone: {
        danger:  "bg-[var(--lone-danger-bg)]  border-[var(--lone-danger-border)]",
        warning: "bg-[var(--lone-warning-bg)] border-[var(--lone-warning-border)]",
        success: "bg-[var(--lone-success-bg)] border-[var(--lone-success-border)]",
        info:    "bg-[var(--lone-info-bg)]    border-[var(--lone-info-border)]",
      },
    },
  },
);

const bannerIconWrap = cva(
  "shrink-0 w-[28px] h-[28px] rounded-[6px] flex items-center justify-center",
  {
    variants: {
      tone: {
        danger:  "bg-[var(--lone-danger-icon-bg)]",
        warning: "bg-[var(--lone-warning-icon-bg)]",
        success: "bg-[var(--lone-success-icon-bg)]",
        info:    "bg-[var(--lone-info-icon-bg)]",
      },
    },
  },
);

const bannerTitle = cva("text-lone-body font-inter font-medium leading-tight", {
  variants: {
    tone: {
      danger:  "text-lone-danger",
      warning: "text-lone-warning",
      success: "text-lone-success",
      info:    "text-lone-info",
    },
  },
});

// ── Types ─────────────────────────────────────────────────────

export interface AlertBannerProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof bannerRoot> {
  tone: NonNullable<VariantProps<typeof bannerRoot>["tone"]>;
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: { label: string; onClick: () => void };
}

// ── Component ─────────────────────────────────────────────────

const AlertBanner = React.forwardRef<HTMLDivElement, AlertBannerProps>(
  ({ tone, title, description, icon, action, className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        role="alert"
        className={cn(bannerRoot({ tone }), className)}
        {...props}
      >
        {/* Icon */}
        {icon && (
          <div className={bannerIconWrap({ tone })} aria-hidden>
            {icon}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className={bannerTitle({ tone })}>{title}</p>
          {description && (
            <p className="text-lone-caption font-inter text-lone-text-secondary leading-snug mt-0.5">
              {description}
            </p>
          )}
        </div>

        {/* Action */}
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            className={cn(
              "shrink-0 flex items-center gap-1 text-lone-caption font-inter font-medium transition-opacity hover:opacity-70",
              bannerTitle({ tone }),
            )}
            aria-label={action.label}
          >
            {action.label}
            <span aria-hidden>→</span>
          </button>
        )}
      </div>
    );
  },
);

AlertBanner.displayName = "LoneUI.AlertBanner";

export { AlertBanner };
