// lib/cs/formato-aviso.ts — TEXTO OU PDF? Regra única para todo aviso que o agente manda ao time.
//
// A história desta regra, porque ela explica o desenho:
//
//  03/09 — Roberto: "continua mandando textões, já falei sobre a estrutura de pdfs".
//          O bom-dia virou UM PDF POR PESSOA.
//  11/09 — Roberto: "ele também fez vários arquivos com apenas 1 linha escrita, podendo juntar ou
//          fazer diferente. Aqui não teve sentido ele fazer isso." Chegaram quatro PDFs no grupo,
//          cada um com UM item. E, no mesmo dia, a véspera de sexta saiu como texto com 11 clientes
//          — tão longa que o WhatsApp cortou com "Ler mais".
//
// O erro das duas vezes foi o mesmo: o formato estava amarrado a QUEM recebe (uma pessoa → PDF) em
// vez de QUANTO tem para ler. PDF de uma linha obriga baixar e abrir para ler seis palavras; texto
// de onze linhas é cortado pelo WhatsApp e ninguém lê o fim.
//
// A regra é: o formato segue o VOLUME.

/** Acima disto o WhatsApp corta a mensagem com "Ler mais" e o fim da lista deixa de ser lido. */
export const LIMITE_CARACTERES = 600;

/** Até esta quantidade, a lista cabe na conversa sem virar textão. */
export const LIMITE_ITENS = 4;

export type Formato = "texto" | "pdf";

export interface Aviso {
  /** Quantos itens a lista tem. */
  itens: number;
  /** O texto que seria enviado, se já estiver montado. Opcional. */
  texto?: string;
}

/**
 * Texto ou PDF.
 *
 * `pdf` quando a lista é longa o bastante para o WhatsApp cortar ou para virar rolagem no grupo.
 * `texto` quando cabe na conversa — inclusive para UM item, que é o caso em que o PDF atrapalha
 * mais do que ajuda.
 *
 * Zero item devolve "texto": quem chama decide se manda ou cala, mas gerar PDF vazio nunca.
 */
export function escolherFormato(aviso: Aviso): Formato {
  if (aviso.itens <= 0) return "texto";
  if (aviso.itens > LIMITE_ITENS) return "pdf";
  if ((aviso.texto?.length ?? 0) > LIMITE_CARACTERES) return "pdf";
  return "texto";
}

/** Atalho legível para quem só tem a contagem. */
export function vaiDePdf(itens: number, texto?: string): boolean {
  return escolherFormato({ itens, texto }) === "pdf";
}

/**
 * Junta blocos pequenos de várias pessoas num aviso só.
 *
 * Quatro PDFs de um item cada viram uma mensagem com quatro linhas — que é como a informação
 * caberia na cabeça de quem lê o grupo. Devolve os blocos que seguem sozinhos (os grandes) e os
 * que devem ser agrupados (os pequenos).
 */
export function separarPorTamanho<T extends { itens: unknown[] }>(
  blocos: T[],
): { emPdf: T[]; juntos: T[] } {
  const emPdf: T[] = [], juntos: T[] = [];
  for (const b of blocos) {
    if (vaiDePdf(b.itens.length)) emPdf.push(b);
    else if (b.itens.length > 0) juntos.push(b);
  }
  return { emPdf, juntos };
}
