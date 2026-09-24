// clients.status — o que ele É de verdade: o resultado do anúncio (CPL x meta, régua de sexta em
// status-clientes), não risco de churn. Risco de churn é a saúde (lib/scores/health.ts).
// Chamar "at_risk" de "Crítico"/"Em risco (churn)" na tela misturava as duas leituras.

import type { ClientStatus } from "@/lib/types";

export const TITULO_RESULTADO_ANUNCIO = "Resultado do anúncio";

export const ROTULO_RESULTADO_ANUNCIO: Record<ClientStatus, string> = {
  onboarding: "Onboarding",
  good: "Bom",
  average: "Médio",
  at_risk: "Ruim",
};

export function rotuloResultadoAnuncio(status: string | null | undefined): string {
  return ROTULO_RESULTADO_ANUNCIO[status as ClientStatus] ?? (status || "—");
}
