// lib/budgets/account-status.ts — o que cada account_status da Meta significa, num lugar só.
// Antes o 3 (UNSETTLED = cobrança falhou) aparecia como "Em revisão" e o 8 como "Status 8".

export type GravidadeStatus = "ok" | "critical" | "review" | "paused";

export interface StatusConta {
  /** Rótulo curto para tela. */
  label: string;
  /** Frase curta para alerta ("Conta <frase>"). */
  frase: string;
  gravidade: GravidadeStatus;
}

const MAPA: Record<number, StatusConta> = {
  1:   { label: "Ativa",                 frase: "ativa",                                        gravidade: "ok" },
  2:   { label: "Desativada",            frase: "desativada",                                   gravidade: "paused" },
  3:   { label: "Pagamento falhou",      frase: "com pagamento pendente (cobrança falhou)",     gravidade: "critical" },
  7:   { label: "Em análise de risco",   frase: "em análise de risco pela Meta",                gravidade: "review" },
  8:   { label: "Acerto pendente",       frase: "aguardando acerto de pagamento",               gravidade: "critical" },
  9:   { label: "Período de carência",   frase: "em período de carência (risco de pausa)",      gravidade: "critical" },
  100: { label: "Encerramento pendente", frase: "com encerramento pendente",                    gravidade: "paused" },
  101: { label: "Encerrada",             frase: "encerrada",                                    gravidade: "paused" },
};

export function metaAccountStatus(status: number | null | undefined): StatusConta {
  if (status == null) return { label: "Desconhecido", frase: "com status desconhecido", gravidade: "review" };
  return MAPA[status] ?? { label: `Status ${status}`, frase: `com status ${status}`, gravidade: "review" };
}
