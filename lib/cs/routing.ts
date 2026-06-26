// lib/cs/routing.ts — A IA decide O QUÊ; o CÓDIGO decide QUEM (determinístico).
// tipo da demanda → área → pessoa responsável (via clients.assigned_*). Blueprint A3 §lógica.

import type { CsDemandType, CsArea } from "@/lib/cs/taxonomy";

export function tipoToArea(tipo: CsDemandType): CsArea {
  switch (tipo) {
    case "arte_nova":
    case "ajuste_arte":
      return "designer";
    case "feedback_campanha":
      return "trafego";
    default: // cobranca_prazo, duvida, reclamacao, elogio, agendamento, retracao
      return "social";
  }
}

export interface ClienteAssign {
  assigned_social?: string | null;
  assigned_designer?: string | null;
  assigned_traffic?: string | null;
}

/** Resolve o nome do responsável pela área; cai pro social, depois pra "o time". */
export function resolveResponsavel(area: CsArea, a: ClienteAssign): string {
  const byArea: Record<CsArea, string | null | undefined> = {
    designer: a.assigned_designer,
    trafego: a.assigned_traffic,
    social: a.assigned_social,
  };
  return (byArea[area] || a.assigned_social || a.assigned_designer || a.assigned_traffic || "time")!.trim() || "time";
}
