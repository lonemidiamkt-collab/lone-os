import { cn } from "@/lib/utils";

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  action?: { label: string; onClick: () => void };
  count?: number;
  className?: string;
}

export default function SectionHeader({
  title,
  subtitle,
  action,
  count,
  className,
}: SectionHeaderProps) {
  return (
    <div className={cn("flex items-center justify-between mb-3", className)}>
      <div className="flex items-center gap-2 min-w-0">
        <h2 className="text-[16px] font-bold text-foreground leading-tight truncate">{title}</h2>
        {count !== undefined && (
          <span className="flex-shrink-0 text-[11px] font-semibold bg-muted text-muted-foreground rounded-full px-2 py-0.5 leading-none">
            {count}
          </span>
        )}
      </div>
      <div className="flex items-center gap-3 shrink-0 ml-4">
        {subtitle && (
          <p className="text-[13px] text-muted-foreground hidden sm:block">{subtitle}</p>
        )}
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            className="text-[13px] font-medium text-primary hover:text-primary/80 transition-colors"
          >
            {action.label}
          </button>
        )}
      </div>
    </div>
  );
}
