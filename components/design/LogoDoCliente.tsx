"use client";

// components/design/LogoDoCliente.tsx — a logo do cliente (ou as iniciais, na cor do nome) na fila do
// designer. O designer reconhece o cliente pela marca antes de ler o nome.

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { estiloDasIniciais, iniciais } from "@/lib/notificacoes/visual";

export default function LogoDoCliente({ nome, logo, className, texto = "text-[10px]" }: {
  nome: string;
  logo?: string | null;
  /** Tamanho (h-/w-). Padrão: 24px. */
  className?: string;
  texto?: string;
}) {
  return (
    <Avatar className={cn("h-6 w-6 rounded-md bg-card ring-1 ring-border", className)} title={nome}>
      {logo && <AvatarImage src={logo} alt="" className="object-contain p-px" />}
      <AvatarFallback delayMs={logo ? 500 : undefined} className={cn("rounded-[inherit] font-semibold", texto)} style={estiloDasIniciais(nome)}>
        {iniciais(nome)}
      </AvatarFallback>
    </Avatar>
  );
}
