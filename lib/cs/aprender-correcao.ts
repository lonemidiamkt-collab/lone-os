// lib/cs/aprender-correcao.ts — quando o cliente corrige, o agente aprende.
//
// PRA QUE (Roberto, 22/08): "se o cliente diz 'legenda errada o endereço não está certo' ele deve
// notar e cobrar atenção nisso e até na hora de fazer a arte ter esse entendimento".
//
// Medido antes de escrever isto: 29 correções de clientes em 60 dias produziram 1 regra aprendida.
// A correção virava card (`ajuste_arte`), o designer consertava, e a lição sobre aquele cliente
// morria ali — só `info_operacional` alimentava a memória, e correção nunca é info_operacional.
//
// O ponto NÃO é registrar o conserto: é responder "o que isso ensina que vale pra sempre?".
// "Não gostei dessa arte" não ensina nada. "O endereço está errado" ensina o endereço certo.

import { chatJson } from "@/lib/ai/openai";
import { DEFINICAO_DE_REGRA, SCHEMA_REGRAS, filtrarRegras, type RegraExtraida } from "@/lib/cs/regras";

export interface EntradaCorrecao {
  clienteNome: string;
  /** O que o A1 entendeu do pedido ("ajustar o endereço da legenda"). */
  resumo: string;
  /** A fala original do cliente — onde está a informação que o resumo perdeu. */
  mensagem: string;
  /** Briefing atual, pra IA saber o que JÁ está registrado e não repetir. */
  briefing?: string;
  /** Regras já ativas, pelo mesmo motivo. */
  regrasAtuais?: string[];
}

/**
 * Extrai a lição durável de uma correção. Retorna [] na maioria das vezes — e isso é o esperado:
 * a maior parte dos ajustes é sobre a peça daquele dia, não sobre o cliente.
 */
export async function aprenderDaCorrecao(inp: EntradaCorrecao): Promise<RegraExtraida[]> {
  const contexto = [
    `Cliente: ${inp.clienteNome}`,
    inp.briefing?.trim() ? `\nBriefing atual:\n${inp.briefing.trim().slice(0, 1500)}` : "",
    inp.regrasAtuais?.length
      ? `\nRegras que já estão registradas (NÃO repita nenhuma delas):\n${inp.regrasAtuais.slice(0, 40).map((r) => `- ${r}`).join("\n")}`
      : "",
    `\nO cliente pediu esta correção: "${inp.resumo}"`,
    `\nFala original dele:\n"""\n${inp.mensagem.slice(0, 1200)}\n"""`,
    `\nO que essa correção ensina sobre este cliente que vale para SEMPRE?`,
  ].filter(Boolean).join("\n");

  const r = await chatJson<{ regras: { texto: string; tipo: string }[] }>({
    model: "gpt-4o-mini",
    schemaName: "regra_da_correcao",
    schema: SCHEMA_REGRAS,
    maxTokens: 400,
    temperature: 0,
    system:
      `Um cliente de agência de marketing corrigiu uma peça. Sua função é decidir se essa correção ` +
      `ensina uma REGRA DURÁVEL sobre o cliente — algo que, se a equipe esquecer na próxima peça, ` +
      `faz o cliente reclamar de novo.\n\n${DEFINICAO_DE_REGRA}\n\n` +
      `MUITO IMPORTANTE — na maioria das vezes a resposta é LISTA VAZIA:\n` +
      `- "não gostei", "ficou estranho", "muda essa foto" → VAZIO (é sobre a peça, não sobre o cliente)\n` +
      `- "troca o preço pra 39,90" → VAZIO (preço muda toda semana)\n` +
      `- "esse post é sobre outro produto" → VAZIO (erro daquela peça)\n` +
      `Só retorne regra quando a correção revelar um PADRÃO ou um DADO FIXO:\n` +
      `- "o endereço está errado, é Av. Brasil 120" → operacional: conferir o endereço, o correto é Av. Brasil 120\n` +
      `- "de novo sem o logo" / "esqueceram o logo" → visual: incluir o logo em toda arte\n` +
      `- "já falei pra não usar esse azul" → visual: não usar esse azul\n` +
      `- "toda legenda tem que ter o telefone" → copy: fechar toda legenda com o telefone\n` +
      `Máximo 2 regras. Se o dado correto aparecer na fala do cliente, INCLUA o dado na regra.`,
    user: contexto,
  });

  if (!r.ok || !r.data) return [];
  return filtrarRegras(r.data.regras).slice(0, 2);
}

/** "de novo", "já falei", "sempre" — sinal de reincidência: a lição já devia estar registrada. */
export function pareceReincidencia(texto: string): boolean {
  return /\b(de novo|novamente|outra vez|j[áa] (falei|avisei|pedi|tinha (falado|pedido))|sempre (esquec|erra)|toda vez|de sempre)\b/i.test(texto || "");
}
