// lib/cs/palpite.ts — O LONINHO NÃO CHUTA SOBRE O SISTEMA.
//
// 11/09/2026, grupo do time, 22 minutos. Rodrigo manda um print do quadro vazio e escreve "Está
// assim...ainda". O agente responde, em sequência:
//   "pode ser que a atualização não rolou direito. Dá uma olhada se tá tudo certo no sistema."
//   "pode ser um bug mesmo. Verifica se tá tudo atualizado no sistema."
//   "pode ser que tá filtrando por responsável. Dá uma checada nisso."
// Ele não vê o painel. Não sabe se há bug, filtro ou atualização. Cada frase dessas tem cara de
// ajuda e é um chute — e o designer fica com a impressão de que "o sistema" respondeu.
//
// O prompt já diz para não fazer isso. O termômetro ensinou que exemplo em prompt não segura o
// modelo: quem segura é código. Este arquivo só sabe CALAR ou TROCAR a resposta; nunca cria uma.

// Marcadores de palpite sobre o estado do sistema.
const RX_PALPITE =
  /\b(pode ser (?:um |só um |que |que t[áa] |o )?(?:bug|filtro|atualiza[çc][ãa]o|cache|sess[ãa]o|permiss[ãa]o)|pode ser que (?:a |o )?(?:atualiza[çc][ãa]o|deploy|sistema|painel|filtro)|n[ãa]o rolou direito|verifica(?:r)? se t[áa] (?:tudo )?(?:atualizado|certo|ok)|d[áa] uma (?:olhada|checada|conferida) (?:se|n[oa]) (?:t[áa] tudo|sistema|painel|filtro)|tenta (?:dar um )?(?:f5|recarregar|atualizar a p[áa]gina)|limpa o cache|t[áa] filtrando por)\b/iu;

/** A resposta é chute sobre painel/sistema — coisa que o agente não tem como saber. */
export function ehPalpiteSobreSistema(resposta: string): boolean {
  return RX_PALPITE.test(resposta ?? "");
}

// Abertura + nome + fecho de cortesia, sem nada no meio. "Beleza, Carlos! Se precisar de mim pra
// ajustar algo ou dar um toque no pessoal, só avisar. Tamo junto!" — 100 caracteres, zero conteúdo.
const RX_ABERTURA = /^(?:opa|beleza|blz|show|boa|massa|perfeito|entendi|entendido|t[áa] tranquilo|tranquilo|fala|e a[ií]|certo|ok)[,!.\s]*/iu;
const RX_NOME = /^[A-ZÁÉÍÓÚÂÊÔÃÕÇ]\p{L}+(?:\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ]\p{L}+)?[,!.\s]*/u;
// "se precisar … só avisar" com qualquer coisa no meio ("de mim pra ajustar algo ou dar um toque no
// pessoal"): o miolo é não-guloso até o fecho da frase. Guloso comia o fecho e o filler passava.
const RX_FECHO =
  /(?:se (?:precisar|quiser|rolar)[^.!?]*?(?:avisar|avisa|me chama|chama|um toque|t[ôo] aqui|t[ôo] na [áa]rea|t[ôo] por aqui)|qualquer (?:coisa|d[úu]vida)[,]? (?:s[óo] )?(?:chamar|avisar|me chama)|tamo junto|t[ôo] (?:aqui|na [áa]rea|por aqui)|conta comigo|s[óo] avisar|s[óo] chamar)[.!…]?\s*(?:[\p{Emoji_Presentation}\p{Extended_Pictographic}]\s*)*/giu;

/** Só cortesia com nome — recibo disfarçado de resposta. */
export function ehFillerComNome(resposta: string): boolean {
  let t = (resposta ?? "").trim().replace(/^[^\p{L}\p{N}]+/u, "");
  if (!t) return true;
  if (/\d/.test(t) || /\?/.test(t) || /\n\s*[•\-*]/.test(t)) return false;
  t = t.replace(RX_ABERTURA, "").replace(RX_NOME, "");
  t = t.replace(RX_FECHO, " ");
  t = t.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, "").replace(/[\s.,!…]+/g, " ").trim();
  // Sobrou alguma coisa que não seja cortesia? Menos de 12 caracteres é resto de pontuação/conector.
  return t.length < 12;
}

/** Frase honesta que substitui o palpite quando a pessoa chamou pelo nome e merece uma resposta. */
export const RESPOSTA_SEM_VISAO_DO_PAINEL =
  "Isso é do painel, e eu não enxergo ele — não sei se é filtro, atualização ou bug. Manda pro Roberto que ele vê.";
