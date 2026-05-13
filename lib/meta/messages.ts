// Fonte única de verdade para contagem de mensagens via Meta API.
//
// REGRA: usar prioridade (primeiro match), NUNCA somar.
// A Meta retorna tipos sobrepostos para o mesmo conjunto de conversas:
//   total_messaging_connection: 40  ← inclui tudo
//   messaging_conversation_started_7d: 37  ← subconjunto do total
// Somar daria 77 em vez de 40. O primeiro tipo encontrado é o correto.

export const MESSAGE_ACTION_TYPES = [
  // Métrica agregada — soma todos os canais (WhatsApp + Messenger + IG DM).
  // Gerenciador exibe como "Resultados" para campanhas de mensagens.
  "onsite_conversion.total_messaging_connection",
  // WhatsApp Business (Click-to-WhatsApp) — janela 7d
  "onsite_conversion.messaging_conversation_started_7d",
  // Messenger e Instagram DM
  "onsite_conversion.messaging_first_conversation_started",
  "onsite_conversion.messaging_first_reply",
  // Formato legado sem prefixo onsite_conversion
  "messaging_conversation_started_7d",
  // WhatsApp — formato alternativo mais novo
  "onsite_conversion.whatsapp_business_messaging_conversation_started_7d",
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
