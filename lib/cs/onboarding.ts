// lib/cs/onboarding.ts — Onboarding conduzido pelo agente Lone NO grupo do cliente novo.
// Conversa multi-turno (uma pergunta por vez); ao fim, a IA estrutura as respostas no briefing.

import { chatJson, type OpenAiResult } from "@/lib/ai/openai";

// Gatilho no grupo da equipe: "Lone, entrou um novo cliente, o cliente X no grupo Y".
export function ehOnboardingTrigger(text: string): boolean {
  const t = text.toLowerCase();
  if (!/\blone\b/.test(t)) return false;
  return /\b(novo cliente|entrou.*cliente|cliente novo|onboarding|cadastr\w+ um cliente|come[çc]a.*onboarding|inicia.*onboarding)\b/.test(t);
}

const TRIGGER_SCHEMA: Record<string, unknown> = {
  type: "object", additionalProperties: false, required: ["cliente", "grupo"],
  properties: { cliente: { type: ["string", "null"] }, grupo: { type: ["string", "null"] } },
};

/** Extrai {cliente, grupo} da mensagem de gatilho (texto livre). */
export async function parseOnboardingTrigger(text: string): Promise<{ cliente: string | null; grupo: string | null }> {
  const res = await chatJson<{ cliente: string | null; grupo: string | null }>({
    model: "gpt-4o-mini", schemaName: "cs_onboarding_trigger", schema: TRIGGER_SCHEMA,
    maxTokens: 120, temperature: 0,
    system:
      "Extraia da mensagem da equipe o NOME DO CLIENTE e o NOME DO GRUPO de WhatsApp onde fazer o " +
      "onboarding. Ex.: 'Lone, entrou um novo cliente, o cliente Padaria do João no grupo Padaria João x Lone' " +
      "→ {cliente:'Padaria do João', grupo:'Padaria João x Lone'}. Se algum não estiver claro, retorne null nele.",
    user: text,
  });
  return res.ok && res.data ? res.data : { cliente: null, grupo: null };
}

// Perguntas de onboarding da Lone (lista oficial do Roberto), no tom da Lone, 1 por vez.
export const ONBOARDING_QUESTIONS: string[] = [
  "Pra começar: vocês já têm fotos profissionais ou um banco de imagens próprio? 📸",
  "Qual o principal objetivo de vocês com o Instagram nesse momento? (atrair mais clientes, construir autoridade, divulgar produtos/serviços, fortalecer a marca…)",
  "Quais serviços ou produtos vocês querem dar mais foco nas postagens?",
  "Como vocês descreveriam a missão da empresa? Se quiser, pode contar um pouco da história — ajuda a criar um conteúdo mais humano e autêntico. 💙",
  "Vocês têm algum slogan ou frase de impacto que costumam usar?",
  "Existe algum perfil no Instagram que vocês curtem ou se inspiram? (pelo design, linguagem, estilo dos posts… se lembrar, manda os @!)",
  "Quais são os produtos que mais vendem?",
  "E por último: quais produtos dão mais margem (mais lucro) pro negócio? 🎯",
];

export function onboardingWelcome(cliente: string): string {
  return (
    `Olá! 👋 Eu sou o assistente da *Lone Mídia* e vou ajudar a montar a estratégia de vocês.\n` +
    `Vou fazer umas perguntinhas rápidas (leva 2 minutinhos) pra gente já começar com o pé direito. Pode responder no seu tempo! 😊\n\n` +
    ONBOARDING_QUESTIONS[0].replace("{cliente}", cliente)
  );
}

export function onboardingQuestion(step: number, cliente: string): string {
  const q = ONBOARDING_QUESTIONS[step] ?? "";
  return q.replace("{cliente}", cliente);
}

export const ONBOARDING_TOTAL = ONBOARDING_QUESTIONS.length;

export function onboardingDone(): string {
  return (
    `Fechou! 🙌 É isso por agora — já tenho o que preciso pra equipe começar a criar pra vocês. ` +
    `Qualquer ajuste a gente alinha por aqui. Bem-vindos à Lone! 💙`
  );
}

// ── Estruturação final: a IA transforma o Q&A em campos do client_briefings ──
// tom_voz é restrito no banco (chk_tom_voz). A nuance rica do tom vai em observacoes_estrategicas.
export type TomVoz = "formal" | "informal" | "divertido" | "tecnico" | "misto" | null;

export interface BriefingEstruturado {
  resumo_estrategico: string;
  posicionamento: string;
  produtos: string[];
  produtos_destaque_atual: string[];
  publico_alvo: string[];
  dores: string[];
  tom_voz: TomVoz;
  observacoes_estrategicas: string;
  palavras_proibidas: string[];
  concorrentes_evitar_mencionar: string[];
  ganchos: string[];
  ctas: string[];
}

const BRIEFING_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: [
    "resumo_estrategico", "posicionamento", "produtos", "produtos_destaque_atual", "publico_alvo",
    "dores", "tom_voz", "observacoes_estrategicas", "palavras_proibidas", "concorrentes_evitar_mencionar", "ganchos", "ctas",
  ],
  properties: {
    resumo_estrategico: { type: "string" },
    posicionamento: { type: "string" },
    produtos: { type: "array", items: { type: "string" } },
    produtos_destaque_atual: { type: "array", items: { type: "string" } },
    publico_alvo: { type: "array", items: { type: "string" } },
    dores: { type: "array", items: { type: "string" } },
    tom_voz: { type: ["string", "null"], enum: ["formal", "informal", "divertido", "tecnico", "misto", null] },
    observacoes_estrategicas: { type: "string" },
    palavras_proibidas: { type: "array", items: { type: "string" } },
    concorrentes_evitar_mencionar: { type: "array", items: { type: "string" } },
    ganchos: { type: "array", items: { type: "string" } },
    ctas: { type: "array", items: { type: "string" } },
  },
};

export async function estruturarBriefing(
  cliente: string,
  qa: Array<{ pergunta: string; resposta: string }>,
): Promise<OpenAiResult<BriefingEstruturado>> {
  const conversa = qa.map((x) => `P: ${x.pergunta}\nR: ${x.resposta}`).join("\n\n");
  return chatJson<BriefingEstruturado>({
    model: "gpt-4o",
    schemaName: "cs_onboarding_briefing",
    schema: BRIEFING_SCHEMA,
    maxTokens: 1500,
    temperature: 0.3,
    system:
      "Você organiza as respostas de onboarding de um cliente de agência de marketing num briefing " +
      "estruturado. Use SÓ o que o cliente disse — NÃO invente. Campos vazios = array vazio ou string curta. " +
      "Seja fiel e conciso. resumo_estrategico = 1-2 frases sobre o negócio e o objetivo. posicionamento = " +
      "como a marca quer ser vista. tom_voz = EXATAMENTE um de: formal | informal | divertido | tecnico | misto " +
      "(o mais próximo do que o cliente descreveu; null se não der pra inferir). observacoes_estrategicas = a " +
      "NUANCE do tom e qualquer detalhe útil que não cabe nos outros campos (ex.: 'tom acolhedor e caseiro'). " +
      "palavras_proibidas/concorrentes = só o que o cliente pediu pra evitar. ganchos/ctas = ideias derivadas " +
      "do que ele falou (promoção/objetivo).",
    user: `Cliente: ${cliente}\n\nConversa de onboarding:\n${conversa}\n\nEstruture no schema.`,
  });
}
