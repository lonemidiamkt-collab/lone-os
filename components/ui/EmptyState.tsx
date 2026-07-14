import type { ReactNode } from "react";

// EmptyState — estado vazio padrão do design system (navy + azul + Montserrat).
// Substitui os "Nenhum X" em texto seco espalhados pelo sistema por um bloco
// centrado: ícone num quadrado suave + título + subtítulo + ação opcional.
//
//   <EmptyState icon="✅" title="Tudo sob controle" subtitle="Nenhum alerta agora." />
//   <EmptyState icon={<Users size={20} />} title="..." action={<button .../>} />

export default function EmptyState({
  icon,
  title,
  subtitle,
  action,
  className = "",
  tone = "primary",
}: {
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
  tone?: "primary" | "muted";
}) {
  const iconWrap =
    tone === "muted"
      ? "bg-muted border-border text-muted-foreground"
      : "bg-primary/10 border-primary/15 text-primary";
  return (
    <div
      className={`flex flex-col items-center justify-center text-center rounded-2xl border border-border bg-card/60 px-6 py-10 animate-fade-in ${className}`}
    >
      {icon != null && (
        <div className={`w-12 h-12 rounded-2xl border flex items-center justify-center text-xl mb-3 ${iconWrap}`}>
          {icon}
        </div>
      )}
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {subtitle && (
        <p className="text-xs text-muted-foreground mt-1 max-w-xs leading-relaxed">{subtitle}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
