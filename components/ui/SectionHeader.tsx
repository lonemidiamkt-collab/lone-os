import type { ReactNode } from "react";

// SectionHeader — cabeçalho de seção padrão (eyebrow + título + subtítulo + ação).
// Dá ritmo visual igual entre as telas, mantendo a identidade (Montserrat, azul da marca).
//   <SectionHeader eyebrow="Operação" title="O que precisa de atenção" action={<button/>} />
export default function SectionHeader({
  eyebrow,
  title,
  subtitle,
  icon,
  action,
  className = "",
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-end justify-between gap-3 mb-3 ${className}`}>
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-primary/80 mb-1">{eyebrow}</p>
        )}
        <h2 className="text-base font-bold text-foreground flex items-center gap-2 leading-tight">
          {icon}
          {title}
        </h2>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
