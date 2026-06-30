// lib/cs/criativo.ts — Agente Criativo do Agente CS (gera roteiros de anúncio).
// Lê o briefing do cliente + o pedido e monta 2-3 roteiros de ALTA CONVERSÃO seguindo o
// Método Lone Mídia (Playbook de Criação de Anúncios). SUGGEST-ONLY: o social (Carlos/Pedro)
// avalia, ajusta ou refaz. Nunca inventa fato do cliente. gpt-4o (julgamento + tom).

import { chatJson, type OpenAiResult } from "@/lib/ai/openai";

export const CRIATIVO_MODEL = "gpt-4o";

export interface BriefingCliente {
  nome: string;
  nicho?: string;
  resumoEstrategico?: string;
  produtos?: string[];
  publicoAlvo?: string[];
  posicionamento?: string;
  dores?: string[];
  ganchos?: string[];
  ctas?: string[];
  tomVoz?: string;
  produtosDestaque?: string[];
  palavrasProibidas?: string[];
  concorrentesEvitar?: string[];
}

export interface CriativoInput {
  briefing: BriefingCliente;
  /** O que o social/tráfego pediu (produto/promoção/objetivo específico). Vazio = agente escolhe. */
  pedido?: string;
  /** topo | meio | fundo — se souber. */
  estagioFunil?: string;
}

export interface Etapa { tempo: string; nome: string; texto: string; }
export interface Roteiro {
  angulo: string;            // o ângulo dessa versão (o que a diferencia)
  framework: string;         // PAS | AIDA | AIDCA | BAB | PASTOR | Hook-Story-Offer | FAB | Método Lone
  gatilhos: string[];        // 2-3
  arquetipo: string;         // Apple | Bosch | Ford | Samsung | Mercedes
  estagio_funil: string;     // topo | meio | fundo
  etapas: Etapa[];           // gancho → ... → CTA, por tempo
  scorecard: number;         // 0-100 (mín 70)
  pontos_fortes: string;
  sugestoes: string;
}
export interface CriativoOutput {
  precisa_briefing: boolean; // true = briefing insuficiente, NÃO dá pra criar
  perguntas: string[];       // o que perguntar ao social/tráfego (se precisa_briefing)
  roteiros: Roteiro[];       // 2-3 versões (vazio se precisa_briefing)
}

const CRIATIVO_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["precisa_briefing", "perguntas", "roteiros"],
  properties: {
    precisa_briefing: { type: "boolean" },
    perguntas: { type: "array", items: { type: "string" } },
    roteiros: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["angulo", "framework", "gatilhos", "arquetipo", "estagio_funil", "etapas", "scorecard", "pontos_fortes", "sugestoes"],
        properties: {
          angulo: { type: "string" },
          framework: { type: "string" },
          gatilhos: { type: "array", items: { type: "string" } },
          arquetipo: { type: "string" },
          estagio_funil: { type: "string" },
          etapas: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["tempo", "nome", "texto"],
              properties: { tempo: { type: "string" }, nome: { type: "string" }, texto: { type: "string" } },
            },
          },
          scorecard: { type: "number" },
          pontos_fortes: { type: "string" },
          sugestoes: { type: "string" },
        },
      },
    },
  },
};

// Prefixo ESTÁVEL (cacheado pela OpenAI) — o Método Lone Mídia inteiro.
const CRIATIVO_SYSTEM = `Você é o AGENTE CRIATIVO da Lone Mídia. Ajuda os social media (Carlos e Pedro) a criar
roteiros de ANÚNCIO de alta conversão. Você SUGERE — o humano aprova, ajusta ou refaz. Tradução do
método Roberto Lino.

# FILOSOFIA
Na Lone Mídia não criamos vídeos, criamos ANÚNCIOS. Todo anúncio gera AÇÃO (uma conversa no WhatsApp).
Vender SOLUÇÃO/transformação, NUNCA o produto. A vida do cliente vem primeiro; a empresa só aparece
DEPOIS da dor. Se o roteiro pode existir sem citar o produto até a metade, está no caminho certo.

# MÉTODO LONE (8 etapas, anúncio de 35-50s, escreva CADA etapa com o texto falado, por tempo)
1) GANCHO [0-3s]: para a rolagem. Começa pela DOR/pergunta/número. NUNCA "Olá", "Somos", "Aqui na".
   Máx ~12 palavras. Faz a pessoa pensar "isso é pra mim".
2) IDENTIFICAÇÃO [3-11s]: mostra que entende a dor exata ("Todo mês a conta sobe…").
3) AGRAVAR A DOR [11-19s]: consequência REAL (sem exagero/medo falso).
4) QUEBRA DE CRENÇA [19-23s]: "muita gente acha que basta… mas…".
5) SOLUÇÃO [23-33s]: agora apresenta a empresa, como consequência da dor.
6) BENEFÍCIOS [33-41s]: transformação (mais economia/tempo/lucro/tranquilidade), NUNCA características.
7) PROVA [41-46s]: números/cases/depoimentos — SÓ se vierem do briefing (nunca invente).
8) CTA [46-50s]: única e específica ("Chame agora no WhatsApp", "Faça sua cotação").

# COMO ESCREVER
Conversa entre amigos, não comercial de TV. Frases CURTAS, respiração, ritmo ("Pensa comigo.", "Olha isso.").
Linguagem simples (como empresário fala) — nada corporativo/acadêmico/robótico. Cada frase prende pra próxima.

# FRAMEWORKS (escolha 1, no máx combine 2): PAS (padrão, dor clara) · AIDA (público não conhece o problema) ·
AIDCA (cético/ticket alto, reforça prova) · BAB (antes/depois visual) · PASTOR (narrativo) ·
Hook-Story-Offer (marca pessoal) · FAB (B2B/comparação). Energia solar/piso/seguro→AIDCA; estética/fitness→BAB.

# GATILHOS (use 2-3 SÓ): aversão à perda, prova social, especificidade, escassez, autoridade, curiosidade,
afinidade, FOMO, pertencimento. Combo forte: prova social + aversão à perda + especificidade.

# ARQUÉTIPO: Apple(identidade→ótica/estética) · Bosch(confiança→construção/piso/seguro) ·
Ford(identificação→varejo popular) · Samsung(inovação→solar/marketing) · Mercedes(excelência→luxo).

# REGRAS DE OURO / LINHA VERMELHA
- NÃO invente fato do cliente: número/case/tempo de mercado só se estiver no briefing.
- NÃO use palavra proibida do cliente; respeite o tom de voz do briefing.
- Específico vence genérico: troque "muito" por número, "barato" por preço quando o briefing der o dado.
- 1 emoção dominante por anúncio. 1 CTA só.

# SCORECARD (avalie cada roteiro 0-100; gancho3s, dor específica, identificação, consequência, quebra,
solução-resposta, benefícios-transformação, prova, CTA-única, linguagem natural). Só entregue >= 70.

# SE O BRIEFING ESTÁ INSUFICIENTE (sem dores ou sem produto/contexto pra produzir): NÃO invente. Marque
precisa_briefing=true e liste em "perguntas" o que perguntar ao social/tráfego (qual produto/promoção,
qual transformação, números/cases disponíveis, região, estágio do funil).

# SAÍDA
Gere 2-3 roteiros com ÂNGULOS diferentes (ex.: PAS direto, BAB visual, AIDCA com prova). Cada um com
framework, gatilhos (2-3), arquétipo, estágio do funil, as 8 etapas com o texto falado, scorecard, pontos
fortes e sugestões. Responda só no JSON do schema.`;

function buildUser(inp: CriativoInput): string {
  const b = inp.briefing;
  const arr = (a?: string[]) => (a && a.length ? a.join(" · ") : "(não informado)");
  return [
    `Cliente: ${b.nome}${b.nicho ? ` — nicho: ${b.nicho}` : ""}`,
    `Resumo estratégico: ${b.resumoEstrategico?.trim() || "(não informado)"}`,
    `Dores do público: ${arr(b.dores)}`,
    `Produtos/serviços: ${arr(b.produtos)}`,
    `Público-alvo: ${arr(b.publicoAlvo)}`,
    `Posicionamento: ${b.posicionamento?.trim() || "(não informado)"}`,
    `Ganchos que o cliente já usa: ${arr(b.ganchos)}`,
    `CTAs preferidas: ${arr(b.ctas)}`,
    `Produtos em destaque agora: ${arr(b.produtosDestaque)}`,
    `Tom de voz: ${b.tomVoz?.trim() || "(não informado)"}`,
    `Palavras PROIBIDAS (não usar): ${arr(b.palavrasProibidas)}`,
    `Concorrentes a NÃO mencionar: ${arr(b.concorrentesEvitar)}`,
    ``,
    `Pedido do social/tráfego: ${inp.pedido?.trim() || "(não especificado — escolha o produto/ângulo mais forte do briefing)"}`,
    `Estágio do funil: ${inp.estagioFunil?.trim() || "(inferir do contexto)"}`,
    ``,
    `Monte 2-3 roteiros seguindo o Método Lone. Se faltar base no briefing, peça (precisa_briefing).`,
  ].join("\n");
}

/** Gera roteiros de anúncio a partir do briefing do cliente. Nunca lança (retorno estruturado). */
export async function gerarRoteiros(inp: CriativoInput): Promise<OpenAiResult<CriativoOutput>> {
  return chatJson<CriativoOutput>({
    model: CRIATIVO_MODEL,
    schemaName: "cs_roteiros",
    schema: CRIATIVO_SCHEMA,
    maxTokens: 3000,
    temperature: 0.6,
    system: CRIATIVO_SYSTEM,
    user: buildUser(inp),
  });
}

/** Formata um roteiro pro WhatsApp/UI no padrão de entrega ao social (Carlos/Pedro). */
export function formatRoteiro(r: Roteiro, cliente: string, n: number): string {
  const etapas = r.etapas.map((e) => `[${e.tempo}] *${e.nome}*\n${e.texto}`).join("\n\n");
  return [
    `🎬 *Roteiro ${n} — ${cliente}* (${r.angulo})`,
    `Framework: ${r.framework} · Gatilhos: ${r.gatilhos.join(", ")} · Arquétipo: ${r.arquetipo} · Funil: ${r.estagio_funil}`,
    ``,
    etapas,
    ``,
    `📊 Scorecard: ${r.scorecard}/100`,
    r.pontos_fortes ? `✅ ${r.pontos_fortes}` : "",
    r.sugestoes ? `🔧 ${r.sugestoes}` : "",
  ].filter(Boolean).join("\n");
}
