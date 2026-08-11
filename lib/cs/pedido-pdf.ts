// lib/cs/pedido-pdf.ts — entender "loninho, transforma esse roteiro em pdf pro varejão".
//
// A mensagem vem em duas partes: um PEDIDO curto e o TEXTO que deve virar documento. Às vezes os
// dois na mesma mensagem, às vezes o texto foi colado antes e o pedido vem depois.
//
// A ARMADILHA A EVITAR: transformar em PDF a própria frase do pedido. "loninho faz um pdf disso"
// tem 30 caracteres — vira um documento com uma linha, que parece ter funcionado e não serve pra
// nada. Por isso o pedido e o conteúdo são separados, e conteúdo curto demais é recusado.

/** Tipos de documento que a casa produz — vira o rótulo no cabeçalho do PDF. */
const TIPOS: Array<[RegExp, string]> = [
  [/\brotei/i,                     "Roteiro de Vídeo"],
  [/\bpauta/i,                     "Pauta de Conteúdo"],
  [/\bplanejamento|calend[áa]rio/i, "Planejamento"],
  [/\bproposta/i,                  "Proposta"],
  [/\bbriefing/i,                  "Briefing"],
];

export interface PedidoPdf {
  quer: boolean;
  /** O texto que vira documento — já sem a linha do pedido. */
  conteudo: string;
  tipo: string;
}

/** "faz um pdf", "transforma em pdf", "vira pdf", "monta o documento". */
export function pediuPdf(texto: string): boolean {
  const t = (texto || "").toLowerCase();
  const verbo = /\b(transform|vira|virar|faz|fazer|gera|gerar|monta|montar|manda|mandar|cria|criar)\w*\b/.test(t);
  const objeto = /\bpdf\b|\bdocumento\b/.test(t);
  return verbo && objeto;
}

/**
 * Separa o pedido do conteúdo.
 *
 * A linha que CONTÉM o pedido sai — ela é instrução pra mim, não conteúdo do cliente. O resto fica
 * intacto, na ordem original.
 */
export function lerPedidoPdf(texto: string): PedidoPdf {
  const bruto = texto || "";
  if (!pediuPdf(bruto)) return { quer: false, conteudo: "", tipo: "Documento" };

  const linhas = bruto.split("\n");
  const restantes = linhas.filter((l) => !pediuPdf(l));
  const conteudo = restantes.join("\n").trim();

  const alvo = TIPOS.find(([rx]) => rx.test(bruto));
  return { quer: true, conteudo, tipo: alvo ? alvo[1] : "Documento" };
}
