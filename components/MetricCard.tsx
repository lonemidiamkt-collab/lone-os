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
    <Wrapper {...wrapperProps as any} className={cn(
      "relative rounded-2xl border border-[#2a2a2a] p-5 overflow-hidden bg-[#121212] shadow-[0_8px_32px_-8px_rgba(0,0,0,0.6)] hover:border-[#0d4af5]/30 hover:shadow-[0_4px_14px_0_rgba(10,52,245,0.15),0_8px_32px_-8px_rgba(0,0,0,0.6)] transition-all duration-300",
      (href || onClick) && "cursor-pointer group"
    )}>
      {/* Top blue glow line */}
      <div className="absolute top-0 left-[15%] right-[15%] h-px bg-gradient-to-r from-transparent via-[#0d4af5]/30 to-transparent" />

      <div className="flex items-start gap-4">
        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", iconBg)}>
          <Icon size={20} className={iconColor} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-zinc-500 text-xs font-medium uppercase tracking-wider">{label}</p>
          <p className="text-2xl font-bold text-foreground mt-1 leading-none">{value}</p>
          {(sub || trendValue) && (
            <div className="flex items-center gap-2 mt-2">
              {trendValue && (
                <span
                  className={cn(
                    "text-xs font-semibold px-1.5 py-0.5 rounded-md",
                    trend === "up" && "text-[#0d4af5] bg-[#0d4af5]/10",
                    trend === "down" && "text-red-400 bg-red-500/10",
                    trend === "neutral" && "text-zinc-500"
                  )}
                >
                  {trend === "up" ? "↑" : trend === "down" ? "↓" : "—"} {trendValue}
                </span>
              )}
              {sub && <span className="text-xs text-zinc-600">{sub}</span>}
            </div>
          )}
        </div>
      </div>
    </Wrapper>
  );
}
