// lib/cs/evento.ts — detecta quando o CLIENTE menciona uma DATA/EVENTO FUTURO que a equipe precisa
// lembrar (promoção, liquidação, lançamento, evento, data especial com dia marcado). Extrai título +
// data absoluta (resolve "dia 12", "próximo mês", "semana que vem" a partir de hoje). Vira um lembrete
// no calendário do social responsável, com aviso faltando 5 e 2 dias. Provider: gpt-4o-mini.

import { chatJson, type OpenAiResult } from "@/lib/ai/openai";

export interface EventoOutput {
  is_evento: boolean;
  titulo: string;      // "Promoção de 15%"
  descricao: string;   // detalhes do que foi dito
  data: string;        // YYYY-MM-DD (vazio se não houver data concreta)
}

// Pré-filtro barato: só chama a IA se a mensagem CHEIRAR a data/evento (economiza tokens).
const RX_DATA = /\b(dia\s*\d{1,2}|\d{1,2}\/\d{1,2}|promoç|promocao|liquidaç|liquidacao|black\s*friday|lançament|lancament|inaugura|evento|feriado|semana que vem|próxim|proxim|mês que vem|mes que vem|no dia|amanhã|amanha|segunda|terça|terca|quarta|quinta|sexta|sábado|sabado|domingo|janeiro|fevereiro|março|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b/i;
export function pareceTerData(text: string): boolean {
  return RX_DATA.test(text || "");
}

const SCHEMA: Record<string, unknown> = {
  type: "object", additionalProperties: false,
  required: ["is_evento", "titulo", "descricao", "data"],
  properties: {
    is_evento: { type: "boolean", description: "true SÓ se o cliente citou uma DATA/EVENTO FUTURO concreto (com dia identificável)" },
    titulo: { type: "string", description: "título curto do evento, ex.: 'Promoção de 15%'" },
    descricao: { type: "string", description: "o que o cliente disse, resumido" },
    data: { type: "string", description: "data do evento em YYYY-MM-DD (absoluta). Vazio se não der pra saber o dia." },
  },
};

const SYSTEM = `Você identifica se um cliente de agência MENCIONOU uma DATA ou EVENTO FUTURO que a equipe
precisa LEMBRAR pra preparar conteúdo: promoção, liquidação, lançamento, inauguração, evento, data
especial, campanha com dia marcado.

- Resolva datas RELATIVAS pra ABSOLUTA (YYYY-MM-DD) a partir de HOJE (informado). Ex.: "dia 12" =
  a próxima ocorrência do dia 12; "próximo mês dia 12" = dia 12 do mês seguinte; "semana que vem".
- is_evento=true SÓ com dia identificável e no FUTURO. Se for pedido de arte comum, dúvida, papo,
  reclamação, ou data vaga sem dia ("mês que vem a gente vê"), is_evento=false.
- NÃO invente data. Sem dia claro → is_evento=false e data vazia.
Responda APENAS no JSON do schema.`;

export async function detectarEventoFuturo(text: string, hojeISO: string, diaSemana: string): Promise<OpenAiResult<EventoOutput>> {
  const user = `HOJE: ${diaSemana}, ${hojeISO}\n\nMensagem do cliente:\n"${text.slice(0, 800)}"\n\nExtraia o evento futuro (JSON).`;
  return chatJson<EventoOutput>({
    model: "gpt-4o-mini", schemaName: "cs_evento", schema: SCHEMA,
    maxTokens: 200, temperature: 0.2, system: SYSTEM, user,
  });
}
