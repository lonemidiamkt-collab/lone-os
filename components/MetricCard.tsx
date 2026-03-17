import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface MetricCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  sub?: string;
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
  iconColor?: string;
  iconBg?: string;
}

export default function MetricCard({
  icon: Icon,
  label,
  value,
  sub,
  trend,
  trendValue,
  iconColor = "text-primary",
  iconBg = "bg-primary/20",
}: MetricCardProps) {
  return (
    <Card>
      <CardContent className="p-5 flex items-start gap-4">
        <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center shrink-0", iconBg)}>
          <Icon size={20} className={iconColor} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-muted-foreground text-xs font-medium">{label}</p>
          <p className="text-2xl font-bold text-foreground mt-0.5 leading-none">{value}</p>
          {(sub || trendValue) && (
            <div className="flex items-center gap-2 mt-1.5">
              {trendValue && (
                <span
                  className={cn(
                    "text-xs font-medium",
                    trend === "up" && "text-green-400",
                    trend === "down" && "text-red-400",
                    trend === "neutral" && "text-muted-foreground"
                  )}
                >
                  {trend === "up" ? "↑" : trend === "down" ? "↓" : "—"} {trendValue}
                </span>
              )}
              {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
