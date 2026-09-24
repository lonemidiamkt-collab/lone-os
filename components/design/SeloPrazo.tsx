"use client";

// components/design/SeloPrazo.tsx — o prazo da arte com a cor da urgência (vencido, hoje, amanhã,
// esta semana). O mesmo selo na fila, no card do designer e no Meu Trabalho.

import { CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";
import { urgenciaDoPrazo, type NivelUrgencia } from "@/lib/conteudo/fila-designer";

export const TOM_URGENCIA: Record<NivelUrgencia, string> = {
  vencido: "bg-destructive/10 text-destructive border-destructive/20",
  hoje: "bg-lone-warning-bg text-lone-warning border-lone-warning-border",
  amanha: "bg-lone-info-bg text-lone-info border-lone-info-border",
  semana: "bg-muted text-foreground border-border",
  depois: "bg-muted text-muted-foreground border-border",
};

export default function SeloPrazo({ prazo, hora, hoje, prefixo, className }: {
  prazo: string | null | undefined;
  /** Hora do post ("14:00"), quando o prazo é a data de postagem. */
  hora?: string | null;
  hoje: string;
  prefixo?: string;
  className?: string;
}) {
  const u = urgenciaDoPrazo(prazo, hoje);
  if (!u) {
    return (
      <span className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[11px] bg-muted text-muted-foreground border-border", className)}>
        <CalendarClock size={11} aria-hidden="true" /> Sem prazo
      </span>
    );
  }
  return (
    <span className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[11px] font-medium tabular-nums", TOM_URGENCIA[u.nivel], className)}>
      <CalendarClock size={11} aria-hidden="true" />
      {prefixo ? `${prefixo} ` : ""}{u.rotulo}{hora ? ` · ${hora.slice(0, 5)}` : ""}
    </span>
  );
}
