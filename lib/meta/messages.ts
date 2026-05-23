// Fonte única de verdade para métricas de mensagens via Meta API.
//
// REGRA: usar prioridade (primeiro match), NUNCA somar vários action_types.
//
// MÉTRICA CORRETA: "Conversas iniciadas" = messaging_conversation_started_7d
// É o que o Gerenciador exibe na coluna "Resultados" para campanhas
// Click-to-WhatsApp. total_messaging_connection inclui reconexões e
// retornos de conversas já abertas — infla o número vs Gerenciador.
//
// JANELA DE ATRIBUIÇÃO: usar apenas "7d_click" (sem "1d_view").
// "1d_view" soma conversões view-through (quem viu o anúncio sem clicar)
// que o Gerenciador NÃO exibe na coluna Resultados por padrão.
// Evidência: Madeirão Móveis (87 vs 79) e Madeireira D'Aldeia (39 vs 32) — 2026-05-18.
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

export type MessageActionType = (typeof MESSAGE_ACTION_TYPES)[number];

// Tipo mínimo compatível com MetaInsight de api.ts (evita dependência circular)
export interface InsightRowForMessages {
  spend: string;
  actions?: { action_type: string; value: string; [key: string]: string }[];
}

export interface MessageMetric {
  messages: number;
  spend: number;
  cpa: number | null;
  attributionWindow: "7d_click" | "1d_click";
  matchedActionType: string | null;
  // Todos os action_types presentes na linha — para diagnóstico com o Gerenciador
  allActionTypes: string[];
}

/**
 * Extrai mensagens, spend e CPA de UMA linha de insights da Meta API.
 *
 * IMPORTANTE: spend e messages vêm da mesma linha — garante que o CPA seja
 * calculado com valores do mesmo escopo (conta, campanha, conjunto ou anúncio).
 * Nunca chamar com spend de um escopo e messages de outro.
 *
 * Emite logs diagnósticos completos para comparação com o Gerenciador:
 *   account_id, period, level, objectiveFilter, spend, todos os action_types
 *   encontrados, action_type que fez match, messages, cpa, attribution window.
 */
export function getMessageMetricFromInsights(
  insight: InsightRowForMessages | null,
  context: {
    accountId?: string;
    period?: string;
    level?: "account" | "campaign" | "adset" | "ad";
    objectiveFilter?: string;
    window?: "7d_click" | "1d_click";
  } = {},
): MessageMetric {
  const {
    window = "7d_click",
    accountId = "-",
    period = "-",
    level = "account",
    objectiveFilter = "-",
  } = context;

  if (!insight) {
    console.log(
      `[messages] account=${accountId} period=${period} level=${level} obj=${objectiveFilter} window=${window} → insight=null → messages=0`,
    );
    return {
      messages: 0,
      spend: 0,
      cpa: null,
      attributionWindow: window,
      matchedActionType: null,
      allActionTypes: [],
    };
  }

  const spend = parseFloat(insight.spend) || 0;
  const allActionTypes = (insight.actions ?? []).map((a) => a.action_type);

  // Log linha 1: contexto + todos os action_types recebidos
  console.log(
    `[messages] account=${accountId} period=${period} level=${level} obj=${objectiveFilter} window=${window} spend=${spend}\n` +
      `  all_action_types=${JSON.stringify(allActionTypes)}`,
  );

  let matchedActionType: string | null = null;
  let messages = 0;

  for (const type of MESSAGE_ACTION_TYPES) {
    const found = (insight.actions ?? []).find((a) => a.action_type === type);
    if (found) {
      matchedActionType = type;
      // Quando a API retorna múltiplas janelas, cada action tem as chaves
      // "1d_click" e "7d_click" além de "value". Quando retorna janela única,
      // o valor está em "value". O fallback garante leitura correta em ambos.
      const raw = found[window] ?? found.value;
      messages = parseInt(raw, 10) || 0;
      break;
    }
  }

  const cpa = messages > 0 ? spend / messages : null;

  // Log linha 2: resultado
  console.log(
    `[messages] → matched=${matchedActionType ?? "NONE"} messages=${messages} cpa=${cpa !== null ? cpa.toFixed(4) : "null"}`,
  );

  return {
    messages,
    spend,
    cpa,
    attributionWindow: window,
    matchedActionType,
    allActionTypes,
  };
}

/**
 * Versão simplificada para uso em séries diárias (chart) e top_creatives,
 * onde só precisamos do número de mensagens sem o contexto completo.
 * Mantida para não quebrar chamadas existentes.
 */
export function countMessagesFromActions(
  actions?: { action_type: string; value: string; [key: string]: string }[],
  window?: "1d_click" | "7d_click",
): number {
  if (!actions) return 0;
  for (const type of MESSAGE_ACTION_TYPES) {
    const found = actions.find((a) => a.action_type === type);
    if (found) {
      const raw = window ? (found[window] ?? found.value) : found.value;
      const v = parseInt(raw, 10);
      return Number.isFinite(v) ? v : 0;
    }
  }
  return 0;
}
