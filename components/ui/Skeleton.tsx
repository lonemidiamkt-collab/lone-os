import type { CSSProperties } from "react";

// Skeleton — placeholder de carregamento com shimmer sutil (design system Lone).
// Substitui os `animate-pulse bg-muted` crus por um brilho que corre, mais elegante.
//   <Skeleton className="h-4 w-32" />  ·  <Skeleton className="h-20 rounded-xl" />
export default function Skeleton({ className = "", style }: { className?: string; style?: CSSProperties }) {
  return <div className={`lone-skeleton rounded-lg ${className}`} style={style} aria-hidden />;
}
