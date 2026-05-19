import * as React from "react";
import { cn } from "@/lib/utils";

export interface SectionDividerProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  badge?: string;
}

const SectionDivider = React.forwardRef<HTMLDivElement, SectionDividerProps>(
  ({ label, badge, className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn("flex items-center gap-3", className)}
        {...props}
      >
        {/* Eyebrow label */}
        <span className="text-lone-eyebrow font-inter font-medium uppercase tracking-[1.5px] text-lone-text-tertiary shrink-0 leading-none">
          {label}
        </span>

        {/* Horizontal line */}
        <div className="flex-1 h-px bg-lone-border" aria-hidden />

        {/* Optional badge */}
        {badge && (
          <span className="shrink-0 font-inter text-[10px] font-medium px-2 py-0.5 rounded-full leading-none"
                style={{
                  backgroundColor: "var(--lone-brand-bg-soft)",
                  color: "var(--lone-brand-soft)",
                }}>
            {badge}
          </span>
        )}
      </div>
    );
  },
);

SectionDivider.displayName = "LoneUI.SectionDivider";

export { SectionDivider };
