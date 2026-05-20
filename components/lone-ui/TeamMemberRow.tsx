import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// ── Variant: metric tone ──────────────────────────────────────

const metricTone = cva("font-jetbrains font-medium tabular-nums leading-none", {
  variants: {
    tone: {
      default: "text-lone-text-primary",
      warning: "text-lone-warning",
      danger:  "text-lone-danger",
    },
  },
  defaultVariants: { tone: "default" },
});

// ── Types ─────────────────────────────────────────────────────

export interface TeamMemberRowProps extends React.HTMLAttributes<HTMLDivElement> {
  name: string;
  role?: string;
  initials: string;
  metric?: {
    label: string;
    value: string;
    tone?: VariantProps<typeof metricTone>["tone"];
  };
  /** Remove o separador inferior (ex: último item de uma lista) */
  last?: boolean;
}

// ── Component ─────────────────────────────────────────────────

const TeamMemberRow = React.forwardRef<HTMLDivElement, TeamMemberRowProps>(
  ({ name, role, initials, metric, last, className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "flex items-center gap-3 py-2.5",
          !last && "border-b border-lone-border",
          className,
        )}
        {...props}
      >
        {/* Avatar */}
        <div
          className="w-[26px] h-[26px] rounded-full shrink-0 flex items-center justify-center"
          style={{ backgroundColor: "var(--lone-brand-bg-soft)" }}
          aria-hidden
        >
          <span
            className="font-inter text-[9px] font-semibold leading-none"
            style={{ color: "var(--lone-brand-soft)" }}
          >
            {initials.slice(0, 2).toUpperCase()}
          </span>
        </div>

        {/* Name + role */}
        <div className="flex-1 min-w-0">
          <p className="text-lone-body font-inter font-medium text-lone-text-primary leading-none truncate">
            {name}
          </p>
          {role && (
            <p className="text-lone-caption font-inter text-lone-text-tertiary leading-none mt-0.5 truncate">
              {role}
            </p>
          )}
        </div>

        {/* Metric */}
        {metric && (
          <div className="shrink-0 text-right">
            <p className={cn("text-[13px]", metricTone({ tone: metric.tone }))}>
              {metric.value}
            </p>
            <p className="text-lone-caption font-inter text-lone-text-tertiary leading-none mt-0.5">
              {metric.label}
            </p>
          </div>
        )}
      </div>
    );
  },
);

TeamMemberRow.displayName = "LoneUI.TeamMemberRow";

export { TeamMemberRow };
