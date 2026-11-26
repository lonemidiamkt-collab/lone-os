// lib/ai/modelos.ts — o ÚNICO lugar que diz qual modelo da OpenAI cada tipo de tarefa usa.
//
// POR QUE (Plano Inteligência, leva 1-M, 25/11/2026). A OpenAI marcou o desligamento na API de
// gpt-4o e gpt-4o-mini em 14/01/2027, do gpt-4o-mini-tts em 06/01/2027 e do whisper-1 em 26/02/2027
// (developers.openai.com/api/docs/deprecations — conferir a página antes de trocar). O nome do modelo
// estava escrito arquivo a arquivo (~140 vezes em ~55 arquivos): trocar seria caçar string e esquecer
// alguma, e o agente esquecido pararia de responder no dia do desligamento.
//
// ESTA LEVA NÃO TROCA MODELO: os valores abaixo são exatamente os de antes. A troca vem depois, por
// tipo, comparando a saída do atual × o novo num conjunto de mensagens reais (JSON estruturado e tool
// calls mudam entre famílias). tests/modelos-num-lugar.test.ts quebra se alguém voltar a escrever o
// nome do modelo fora daqui.
//
// FORA DESTE ARQUIVO, DE PROPÓSITO: as tabelas de preço (lib/obs/preco-llm.ts, CUSTO_FIXO em
// lib/obs/llm.ts) — elas precisam conhecer o nome de todo modelo, inclusive os antigos.
// Configuração gravada no banco (ex.: prospecção `modelo_redacao`) também guarda nome de modelo: a
// troca precisa olhar o que está salvo, não só este arquivo.

/** Tarefas curtas e baratas: classificar, extrair, decidir sim/não, resumo curto. */
export const MODELO_RAPIDO = "gpt-4o-mini";
/** Texto que vai para pessoa (cliente ou time), visão (ler arte/print), raciocínio mais longo. */
export const MODELO_FORTE = "gpt-4o";
/** Voz dos avisos em áudio. */
export const MODELO_VOZ = "gpt-4o-mini-tts";
/** Transcrição de áudio (WhatsApp, reunião). */
export const MODELO_TRANSCRICAO = "whisper-1";

/** Arte por IA (edição com referência + logo). gpt-image-1 saiu da API em 23/10/2026; a OpenAI indica
 *  gpt-image-2.5-sunburst ("edição com precisão") ou -flare ("o mais rápido"). Sunburst porque a arte
 *  parte da referência e da logo do cliente. Esta família não aceita `input_fidelity` — não mandar. */
export const MODELO_IMAGEM = "gpt-image-2.5-sunburst";

/**
 * Contrato de parâmetros de saída. As famílias GPT-5, GPT-6 e o3/o4 são de raciocínio: trocaram
 * `max_tokens` por `max_completion_tokens`, recusam o nome antigo ("Unsupported parameter") e não
 * aceitam `temperature` livre. Toda chamada à OpenAI monta o limite por aqui — senão, no dia da troca,
 * o ponto esquecido passa a dar 400 só em produção.
 * Atenção na troca: em modelo de raciocínio o limite conta também os tokens de raciocínio — um teto
 * apertado (500) pode acabar antes da resposta. Conferir no conjunto de teste.
 */
export function usaContratoNovo(modelo: string): boolean {
  return /^(gpt-5|gpt-6|o[34])/.test(modelo.trim().toLowerCase());
}

export function limiteDeSaida(modelo: string, maxTokens: number, temperature = 0): { max_tokens: number; temperature: number } | { max_completion_tokens: number } {
  return usaContratoNovo(modelo) ? { max_completion_tokens: maxTokens } : { max_tokens: maxTokens, temperature };
}

/** Quando cada modelo em uso sai da API (data do aviso da OpenAI). Mostrado na Central de Agentes. */
export const DESLIGAMENTO_NA_API: Readonly<Record<string, string>> = {
  [MODELO_RAPIDO]: "2027-01-14",
  [MODELO_FORTE]: "2027-01-14",
  [MODELO_VOZ]: "2027-01-06",
  [MODELO_TRANSCRICAO]: "2027-02-26",
};
