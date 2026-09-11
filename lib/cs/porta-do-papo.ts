// lib/cs/porta-do-papo.ts — QUANDO O LONINHO FALA NO GRUPO DO TIME, e quando ele cala.
//
// Roberto (11/09/2026): "o loninho também segue alucinando ainda em algumas conversas". Sete
// respostas em 22 minutos no grupo do time; cinco eram palpite ou filler. Rodrigo mandou um print
// dizendo "Está assim...ainda" e recebeu "pode ser que a atualização não rolou direito", depois
// "pode ser um bug mesmo", depois "pode ser que tá filtrando por responsável" — ninguém perguntou
// nada ao agente, e ele não tem como saber nada disso.
//
// A causa não era o prompt. Era a cadeia no inbound:
//   1. `emConversa` (janela de 5 min depois de uma resposta) contava como "chamado direto";
//   2. "chamado direto" DESLIGAVA os dois freios — o `ignorar` do modelo e o filtro de recibo
//      vazio só funcionavam quando NÃO era chamado direto;
//   3. cada resposta renovava a janela.
// Uma vez chamado pelo nome, por 5 minutos deslizantes o agente era OBRIGADO a responder tudo,
// sem poder ignorar nem calar. O "menos tagarela" já pedido antes tinha sido apertado na entrada
// e reaberto por trás.
//
// A regra aqui é pura e testável com as mensagens reais de hoje.

export interface SinaisDoPapo {
  /** A mensagem chama o agente pelo nome ("Lone", "Loninho"). Só isto abre os freios. */
  chamadoPeloNome: boolean;
  /** Dentro da janela aberta por um chamado pelo nome. Continua o papo, mas com os freios ligados. */
  continuacao: boolean;
  /** Pergunta operacional que o agente sabe responder (pendências, atrasos, entrega…). */
  perguntaOperacional: boolean;
}

export interface VeredictoDoModelo {
  /** O modelo achou que a mensagem não era para ele. */
  ignorar: boolean;
  /** A resposta gerada é só cortesia sem conteúdo ("beleza, tamo junto"). */
  soRecibo: boolean;
  /** O modelo reconheceu uma tarefa como feita e o sistema a marcou. Isso vale confirmar sempre. */
  marcouTarefa: boolean;
}

/** A mensagem merece passar pelo modelo? (antes de gastar a chamada) */
export function deveOuvir(s: SinaisDoPapo): boolean {
  return s.chamadoPeloNome || s.continuacao || s.perguntaOperacional;
}

/**
 * Depois de o modelo responder: manda ou cala?
 *
 * Só o CHAMADO PELO NOME passa por cima do "ignorar" e do recibo vazio — foi a pessoa que pediu.
 * Continuação e pergunta operacional respeitam os dois: se o modelo disse "não era pra mim", cala;
 * se a resposta é "beleza, tamo junto", cala. Marcação de tarefa confirma sempre — é uma escrita
 * no sistema, e escrita sem confirmação é o que faz a pessoa marcar de novo.
 */
export function deveFalar(s: SinaisDoPapo, v: VeredictoDoModelo): boolean {
  if (v.marcouTarefa) return true;
  if (s.chamadoPeloNome) return true;
  if (v.ignorar) return false;
  if (v.soRecibo) return false;
  return true;
}

/**
 * A janela de continuação abre com o nome e NÃO desliza com as respostas do agente. Cinco minutos
 * cabem "e do Pedro?" três vezes; não cabem uma tarde inteira de "tamo junto".
 */
export const JANELA_CONTINUACAO_MS = 5 * 60 * 1000;

export function abreJanela(s: SinaisDoPapo): boolean {
  return s.chamadoPeloNome;
}
