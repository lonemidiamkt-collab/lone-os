// A REUNIÃO VIRA MEMÓRIA DO SISTEMA.
//
// PRA QUE (Roberto, 04/09): "ele tem que pegar essa transcrição, mandar alocar dentro do nosso
// sistema e ficar guardado — e às vezes aprimorar o briefing, ou deixar ali como pontos de atenção
// que o cliente precisa, ou até mesmo pra gente repescar."
//
// O `resumirReuniao` que já existia extrai decisões, ações e pendências — o suficiente para fechar
// a jornada. Falta o que ele pediu agora, que é diferente em natureza:
//
//   PONTOS DE ATENÇÃO — o que precisa ficar no radar sobre ESTE cliente, mesmo sem virar tarefa.
//     "Ele reclamou duas vezes do tempo de resposta." Não é ação, é contexto que muda o cuidado.
//   SUGESTÕES DE BRIEFING — o que muda a PRÓXIMA PEÇA. É a régua de [[loneos-cs-aprendizado-regras]]:
//     preço e promoção não entram (mudam toda semana); identidade, proibição e dado operacional
//     entram.
//
// A distinção importa porque as duas alimentam lugares diferentes: ponto de atenção vai para o
// painel do cliente e o raio-x; sugestão de briefing vira regra que o gerador de arte lê.

import { chatJson, isOpenAIConfigured, type OpenAiResult } from "@/lib/ai/openai";

export interface AnaliseReuniao {
  /** 2-3 frases do que rolou. É o que aparece na lista do histórico. */
  resumo: string;
  decisoes: string[];
  proximas_acoes: { acao: string; responsavel: string | null; prazo: string | null }[];
  pendencias_cliente: { item: string; impacto: string | null }[];
  /** Contexto que muda o cuidado com este cliente, mesmo sem virar tarefa. */
  pontos_atencao: string[];
  /** O que muda a PRÓXIMA PEÇA. Vira regra de briefing quando o time aprovar. */
  sugestoes_briefing: { regra: string; motivo: string }[];
  /** Como o cliente pareceu: alimenta o componente de sentimento da saúde. */
  clima: "positivo" | "neutro" | "preocupado" | "insatisfeito";
  proxima_reuniao: string | null;
}

const SISTEMA = `Você é o CS de uma agência de marketing lendo a TRANSCRIÇÃO de uma reunião com o cliente.

REGRA ZERO: não invente. Use só o que está na transcrição. Campo sem base = lista vazia ou null.

Distinções que mudam onde cada coisa vai parar no sistema:

• proximas_acoes — o que a AGÊNCIA vai fazer. Com responsável e prazo se ditos, senão null.
• pendencias_cliente — o que o CLIENTE ficou de mandar/fazer, com o impacto de não fazer.
• pontos_atencao — contexto que muda o CUIDADO com este cliente e não vira tarefa. Ex.: "reclamou
  duas vezes do tempo de resposta", "vai abrir uma segunda loja em novembro", "o filho assumiu o
  marketing e quer aprovar tudo". Máximo 5, os mais relevantes.
• sugestoes_briefing — o que muda a PRÓXIMA PEÇA que a gente produzir. Só entra o que é DURÁVEL:
  identidade visual ("não usar vermelho"), tom ("não gosta de gíria"), dado operacional (endereço,
  horário, telefone), proibição explícita, público. NÃO entra preço, promoção da semana, nem
  combinação pontual — isso muda toda semana e poluiria o briefing. Cada uma com o motivo em uma
  frase. Se nada durável foi dito, devolva lista vazia — é o caso mais comum.
• clima — como o cliente pareceu no geral.

NÃO trate de preço, pagamento, desconto ou contrato em nenhum campo.`;

const SCHEMA: Record<string, unknown> = {
  type: "object", additionalProperties: false,
  required: ["resumo", "decisoes", "proximas_acoes", "pendencias_cliente", "pontos_atencao", "sugestoes_briefing", "clima", "proxima_reuniao"],
  properties: {
    resumo: { type: "string" },
    decisoes: { type: "array", items: { type: "string" } },
    proximas_acoes: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["acao", "responsavel", "prazo"],
        properties: { acao: { type: "string" }, responsavel: { type: ["string", "null"] }, prazo: { type: ["string", "null"] } },
      },
    },
    pendencias_cliente: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["item", "impacto"],
        properties: { item: { type: "string" }, impacto: { type: ["string", "null"] } },
      },
    },
    pontos_atencao: { type: "array", items: { type: "string" } },
    sugestoes_briefing: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["regra", "motivo"],
        properties: { regra: { type: "string" }, motivo: { type: "string" } },
      },
    },
    clima: { type: "string", enum: ["positivo", "neutro", "preocupado", "insatisfeito"] },
    proxima_reuniao: { type: ["string", "null"] },
  },
};

/** Quantas palavras a transcrição tem — mostrado na lista sem carregar o texto todo. */
export function contarPalavras(t: string): number {
  return (t || "").trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Analisa a transcrição.
 *
 * Transcrição longa é cortada pelas BORDAS, não pelo fim: o começo tem o contexto e o fim tem os
 * combinados — e são justamente os combinados que viram ação. Cortar só o fim perderia o que mais
 * importa.
 */
export async function analisarTranscricao(
  cliente: string, nicho: string | undefined, transcricao: string,
): Promise<OpenAiResult<AnaliseReuniao>> {
  if (!isOpenAIConfigured()) {
    return { ok: false, error: "OpenAI não configurada" } as OpenAiResult<AnaliseReuniao>;
  }
  const LIMITE = 48_000;   // ~12k tokens, folgado para gpt-4o
  let texto = transcricao;
  if (texto.length > LIMITE) {
    const meio = Math.floor(LIMITE / 2);
    texto = `${texto.slice(0, meio)}\n\n[…trecho do meio omitido por tamanho…]\n\n${texto.slice(-meio)}`;
  }
  return chatJson<AnaliseReuniao>({
    model: "gpt-4o",
    system: SISTEMA,
    user: `Cliente: ${cliente}${nicho ? ` (${nicho})` : ""}\n\nTRANSCRIÇÃO:\n${texto}`,
    schema: SCHEMA,
    schemaName: "analise_reuniao",
    maxTokens: 2000,
  });
}

/** O aviso no grupo depois de processar. Curto: o detalhe está no PDF e na aba do cliente. */
export function textoRegistrada(cliente: string, a: AnaliseReuniao, mencao: string): string {
  const l = [`📝 ${mencao || ""} registrei a reunião da *${cliente}*.`.trim(), "", `_${a.resumo}_`];

  // Plural por PAR de palavras, não por sufixo. Concatenar "s" produziu "3 items" no PDF do
  // bom-dia e "2 açãoões" aqui — em português a flexão troca a terminação, não acrescenta letra.
  const plural = (n: number, um: string, muitos: string) => `${n} ${n === 1 ? um : muitos}`;
  const partes: string[] = [];
  if (a.decisoes.length) partes.push(plural(a.decisoes.length, "decisão", "decisões"));
  if (a.proximas_acoes.length) partes.push(plural(a.proximas_acoes.length, "ação nossa", "ações nossas"));
  if (a.pendencias_cliente.length) partes.push(plural(a.pendencias_cliente.length, "pendência do cliente", "pendências do cliente"));
  if (a.pontos_atencao.length) partes.push(plural(a.pontos_atencao.length, "ponto de atenção", "pontos de atenção"));
  if (partes.length) l.push("", `Extraí: ${partes.join(" · ")}.`);

  if (a.sugestoes_briefing.length) {
    l.push("", `💡 *${plural(a.sugestoes_briefing.length, "coisa", "coisas")} pro briefing:*`);
    for (const s of a.sugestoes_briefing.slice(0, 3)) l.push(`• ${s.regra}`);
    l.push(`_Responde "ok briefing" que eu aplico, ou ignora se não valer._`);
  }
  if (a.clima === "insatisfeito" || a.clima === "preocupado") {
    l.push("", `${a.clima === "insatisfeito" ? "🔴" : "🟡"} O cliente pareceu *${a.clima}* na conversa.`);
  }
  l.push("", `A transcrição inteira está na aba do cliente.`);
  return l.join("\n");
}
