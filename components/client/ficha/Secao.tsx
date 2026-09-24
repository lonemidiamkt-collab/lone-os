"use client";

// components/client/ficha/Secao.tsx — um bloco com título dentro de uma aba da ficha. O `id` é a
// âncora que o link antigo (`?tab=onboarding` → Admin#onboarding) usa para rolar até aqui.

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Secao({ id, titulo, descricao, acoes, children, className, semCard }: {
  id?: string;
  titulo?: string;
  descricao?: string;
  acoes?: ReactNode;
  children: ReactNode;
  className?: string;
  /** O conteúdo já é um card (componente antigo com moldura própria): só título e espaço. */
  semCard?: boolean;
}) {
  return (
    <section id={id} className={cn("scroll-mt-24 space-y-3", className)}>
      {(titulo || acoes) && (
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div className="min-w-0">
            {titulo && <h2 className="text-lone-h2 tracking-tight text-foreground">{titulo}</h2>}
            {descricao && <p className="mt-0.5 text-lone-caption text-muted-foreground">{descricao}</p>}
          </div>
          {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
        </div>
      )}
      {semCard ? children : <div className="rounded-xl border border-border bg-card p-4 sm:p-5">{children}</div>}
    </section>
  );
}

/** Estado vazio dentro de uma seção: uma frase, sem ilustração. */
export function Vazio({ children }: { children: ReactNode }) {
  return <p className="py-2 text-lone-body text-muted-foreground">{children}</p>;
}
