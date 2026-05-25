"use client";

import { cn } from "@/lib/utils";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";

type StatusColor = "success" | "warning" | "danger" | "info" | "neutral";
type TrendColor  = "positive" | "negative" | "neutral";

const STATUS_DOT: Record<StatusColor, string> = {
  success: "bg-[#22C55E]",
  warning: "bg-[#F59E0B]",
  danger:  "bg-[#EF4444]",
  info:    "bg-[#3B82F6]",
  neutral: "bg-muted-foreground",
};

const TREND_COLOR: Record<TrendColor, string> = {
  positive: "text-[#22C55E]",
  negative: "text-[#EF4444]",
  neutral:  "text-muted-foreground",
};

const TREND_ARROW: Record<"up" | "down" | "flat", string> = {
  up:   "↑",
  down: "↓",
  flat: "—",
};

export interface KPICardProps {
  label: string;
  value: string | number;
  hint?: string;
  trend?: {
    direction: "up" | "down" | "flat";
    text: string;
    color: TrendColor;
  };
  status?: StatusColor;
  icon?: LucideIcon;
  href?: string;
  emphasis?: boolean;
  className?: string;
}

export default function KPICard({
  label,
  value,
  hint,
  trend,
  status,
  icon: Icon,
  href,
  emphasis,
  className,
}: KPICardProps) {
  const isClickable = !!href;
  const Wrapper = isClickable ? Link : "div";
  const wrapperProps = isClickable ? { href } : {};

  return (
    <Wrapper
      {...wrapperProps as any}
      className={cn(
        // Base
        "relative flex flex-col gap-2 rounded-xl border bg-card px-4 py-5 transition-colors duration-150",
        // Border padrão
        emphasis ? "border-primary/40" : "border-border",
        // Border esquerda azul quando emphasis
        emphasis && "before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:rounded-l-xl before:bg-primary",
        // Hover somente se clicável
        isClickable && "cursor-pointer hover:border-border/60 hover:bg-card/80",
        className,
      )}
    >
      {/* Label row */}
      <div className="flex items-center gap-1.5">
        {status && (
          <span className={cn("inline-block w-1.5 h-1.5 rounded-full shrink-0", STATUS_DOT[status])} />
        )}
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground leading-none">
          {label}
        </span>
        {Icon && <Icon size={11} className="text-muted-foreground/60 shrink-0" />}
      </div>

      {/* Value */}
      <p className="text-[28px] font-extrabold leading-none tracking-[-0.02em] text-foreground">
        {value}
      </p>

      {/* Hint + Trend */}
      {(hint || trend) && (
        <div className="flex items-center gap-2 min-h-[16px]">
          {trend && (
            <span className={cn("text-[12px] font-medium leading-none", TREND_COLOR[trend.color])}>
              {TREND_ARROW[trend.direction]} {trend.text}
            </span>
          )}
          {hint && !trend && (
            <span className="text-[12px] text-muted-foreground leading-none">{hint}</span>
          )}
        </div>
      )}
    </Wrapper>
  );
}
