"use client";

// Célula "Ritmo do mês" de Contas & Verba: gasto do mês contra a verba, com o marcador de "hoje".
// Era a aba Investimento inteira (uma conta por vez, verba do localStorage); agora é uma coluna.

import { PACING_UI } from "@/components/traffic/investimento";
import type { RitmoMes } from "@/lib/trafego/contas-verba";
import { cn } from "@/lib/utils";

const brl0 = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export default function CelulaRitmo({ ritmo, onDefinirVerba }: { ritmo: RitmoMes; onDefinirVerba?: () => void }) {
  if (ritmo.status === "sem_verba") {
    return (
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">
          {ritmo.gasto != null ? `${brl0(ritmo.gasto)} no mês` : "Sem gasto sincronizado"}
        </p>
        {onDefinirVerba && (
          <button type="button" onClick={onDefinirVerba} className="mt-0.5 text-[10px] text-muted-foreground transition-colors hover:text-primary">
            Definir verba →
          </button>
        )}
      </div>
    );
  }
  const ui = PACING_UI[ritmo.status];
  const titulo = ritmo.esperado != null && ritmo.gasto != null
    ? `Dia ${ritmo.dia} de ${ritmo.diasNoMes} · esperado até hoje ${brl0(ritmo.esperado)} · gasto ${brl0(ritmo.gasto)}` +
      (ritmo.mediaDia != null && ritmo.diaIdeal != null ? ` · média ${brl0(ritmo.mediaDia)}/dia (ideal ${brl0(ritmo.diaIdeal)})` : "") +
      (ritmo.fimProjetado != null && ritmo.fimProjetado < ritmo.diasNoMes ? ` · verba acaba por volta do dia ${ritmo.fimProjetado}` : "")
    : ui.label;
  return (
    <div className="min-w-0" title={titulo}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="truncate text-xs tabular-nums text-foreground">
          {ritmo.gasto != null ? brl0(ritmo.gasto) : "—"}
          <span className="text-muted-foreground"> / {brl0(ritmo.verba!)}</span>
        </p>
        <span className={cn("shrink-0 text-[10px] font-medium tabular-nums", ui.texto)}>
          {ritmo.pctGasto != null ? `${Math.round(ritmo.pctGasto)}%` : "—"}
        </span>
      </div>
      <div className="relative mt-1 h-1.5 rounded-full bg-muted">
        <div className={cn("absolute inset-y-0 left-0 rounded-full", ui.barra)} style={{ width: `${ritmo.pctGasto ?? 0}%` }} />
        <div className="absolute -top-0.5 h-2.5 w-0.5 rounded-full bg-foreground" style={{ left: `${ritmo.pctMes}%` }} aria-hidden="true" />
      </div>
      <p className={cn("mt-1 truncate text-[10px]", ui.texto)}>{ui.label}</p>
    </div>
  );
}
