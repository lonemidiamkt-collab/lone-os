import { cn } from "@/lib/utils";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";

interface MetricCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  sub?: string;
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
  iconColor?: string;
  iconBg?: string;
  href?: string;
  onClick?: () => void;
}

export default function MetricCard({
  icon: Icon,
  label,
  value,
  sub,
  trend,
  trendValue,
  iconColor = "text-primary",
  iconBg = "bg-primary/10",
  href,
  onClick,
}: MetricCardProps) {
  const Wrapper = href ? Link : onClick ? "button" : "div";
  const wrapperProps = href ? { href } : onClick ? { onClick, type: "button" as const } : {};
  return (
    <Wrapper
      {...wrapperProps as any}
      className={cn(
        "relative rounded-xl border border-border bg-card p-5 transition-all duration-200 w-full text-left",
        (href || onClick) && "cursor-pointer hover:border-border/60",
      )}
    >
      <div className="flex items-start gap-4">
        <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center shrink-0", iconBg)}>
          <Icon size={20} className={iconColor} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
          <p className="text-[26px] font-bold text-foreground mt-0.5 leading-none tracking-tight">{value}</p>
          {(sub || trendValue) && (
            <div className="flex items-center gap-2 mt-1.5">
              {trendValue && (
                <span className={cn(
                  "text-xs font-medium",
                  trend === "up"      && "text-primary",
                  trend === "down"    && "text-destructive",
                  trend === "neutral" && "text-muted-foreground",
                )}>
                  {trend === "up" ? "↑" : trend === "down" ? "↓" : "—"} {trendValue}
                </span>
              )}
              {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
            </div>
          )}
        </div>
      </div>
    </Wrapper>
  );
}
