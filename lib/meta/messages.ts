// Fonte única de verdade para contagem de mensagens via Meta API.
//
// REGRA: usar prioridade (primeiro match), NUNCA somar.
//
// MÉTRICA CORRETA: "Conversas iniciadas" = messaging_conversation_started_7d
// É o que o Gerenciador exibe na coluna "Resultados" para campanhas
// Click-to-WhatsApp. total_messaging_connection inclui reconexões e
// retornos de conversas já abertas — infla o número vs Gerenciador.
//
// Evidência: Império dos Pisos dia 07/05
//   total_messaging_connection:      53  ← inflado (reconexões incluídas)
//   messaging_conversation_started_7d: 43  ← correto (Gerenciador: ~41)
// Armazém do ferr0 dia 06/05
//   total_messaging_connection:      23  ← inflado
//   messaging_conversation_started_7d: 18  ← correto

export const MESSAGE_ACTION_TYPES = [
  // PRINCIPAL: Conversas iniciadas via anúncio Click-to-WhatsApp, janela 7d.
  // Corresponde à coluna "Resultados" do Gerenciador de Anúncios.
  "onsite_conversion.messaging_conversation_started_7d",
  // WhatsApp — formato alternativo mais novo (mesma semântica)
  "onsite_conversion.whatsapp_business_messaging_conversation_started_7d",
  // Formato legado sem prefixo onsite_conversion
  "messaging_conversation_started_7d",
  // Fallback: agregado de todos os canais (WhatsApp + Messenger + IG DM).
  // Usado quando a conta não reporta messaging_conversation_started_7d
  // (ex: campanha com objetivo Engajamento sem evento de mensagem específico).
  "onsite_conversion.total_messaging_connection",
  // Messenger e Instagram DM (fallback adicional)
  "onsite_conversion.messaging_first_conversation_started",
  "onsite_conversion.messaging_first_reply",
  // Click-to-WhatsApp via objetivo Engajamento
  "onsite_conversion.engagement",
] as const;

export type MessageActionType = typeof MESSAGE_ACTION_TYPES[number];

export function countMessagesFromActions(
  actions?: { action_type: string; value: string }[],
): number {
  if (!actions) return 0;
  for (const type of MESSAGE_ACTION_TYPES) {
    const found = actions.find((a) => a.action_type === type);
    if (found) {
      const v = parseInt(found.value, 10);
      return Number.isFinite(v) ? v : 0;
    }
  }
  return 0;
}
