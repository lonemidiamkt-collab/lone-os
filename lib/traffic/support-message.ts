// lib/traffic/support-message.ts — mensagens enviadas nos grupos dos clientes.
// Tom positivo, próximo e motivacional. Servem de base (podem variar no futuro,
// quando virarem configuráveis por cliente).

export type ClientMsgKind = "monday" | "wed" | "fri";

/** Segunda: acompanha o PDF de 7 dias (vira a legenda do relatório). */
export const MONDAY_REPORT_MESSAGE =
  "Olá, bom dia, amigos! Estou enviando aqui para vocês o nosso relatório da última semana. " +
  "Espero que a nossa semana seja positiva, que a gente gere muitas vendas e que a gente vá " +
  "atrás do melhor resultado possível. 🚀";

/** Quarta: acompanhamento de meio de semana. */
export const WEDNESDAY_MESSAGE =
  "Olá, pessoal! Ótima quarta-feira para a gente, ótimo meio de semana. Vamos para cima hoje, " +
  "vamos buscar os resultados! Como está sendo por aí? Como foi o dia de ontem?";

/** Sexta: fechamento da semana. */
export const FRIDAY_MESSAGE =
  "Olá, pessoal! Ótima sexta-feira para a gente. Já estamos finalizando a semana. Como está sendo " +
  "o resultado da semana no geral? Conseguimos gerar mais resultados de vendas na loja? Vamos atrás " +
  "hoje buscando o melhor resultado possível!";

/** Texto de suporte para os dias sem relatório (qua/sex). */
export function supportMessageFor(kind: ClientMsgKind): string {
  return kind === "fri" ? FRIDAY_MESSAGE : WEDNESDAY_MESSAGE;
}
