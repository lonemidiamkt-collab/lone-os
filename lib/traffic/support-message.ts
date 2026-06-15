// lib/traffic/support-message.ts — mensagem de suporte enviada nos grupos dos
// clientes (seg/qua/sex). Texto único para todos.

export const SUPPORT_MESSAGE =
  "Olá, pessoal, tudo bem? Como vocês estão? Como estão sendo as vendas? " +
  "Vocês estão precisando de alguma ajuda? Estamos aqui para auxiliar vocês. " +
  "Também estamos de olho nos resultados dos anúncios.";

/** Legenda do PDF de relatório enviado no grupo do cliente. */
export function reportCaption(clientName: string, period: string): string {
  return `📊 *Relatório dos últimos 7 dias — ${clientName}*\nPeríodo: ${period}`;
}
