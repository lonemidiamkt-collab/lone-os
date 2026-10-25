// lib/cs/pedido-pdf.ts — entender "loninho, transforma esse roteiro em pdf pro varejão".
//
// A mensagem vem em duas partes: um PEDIDO curto e o TEXTO que deve virar documento. Às vezes os
// dois na mesma mensagem, às vezes o texto foi colado antes e o pedido vem depois.
//
// A ARMADILHA A EVITAR: transformar em PDF a própria frase do pedido. "loninho faz um pdf disso"
// tem 30 caracteres — vira um documento com uma linha, que parece ter funcionado e não serve pra
// nada. Por isso o pedido e o conteúdo são separados, e conteúdo curto demais é recusado.
//
// E há DOIS pedidos diferentes escondidos no mesmo "manda em pdf" (Roberto, 12/08):
//   DIAGRAMAR — "transforma ESSE roteiro em pdf": o texto já é a peça pronta, só falta o documento.
//               A IA não encosta nas palavras.
//   CRIAR     — "cria um roteiro pro WT Shopping COM ESSAS INFORMAÇÕES": o texto é matéria-prima
//               (contexto do cliente), e o roteiro ainda não existe. Aqui a IA escreve, cruzando o
//               contexto com o briefing do cliente.
// Tratar os dois como diagramação era o bug: o contexto de castração do WT Shopping virou um PDF
// de "1 bloco" com o texto cru, em vez de um roteiro de gravação.

/** Tipos de documento que a casa produz — vira o rótulo no cabeçalho do PDF. */
const TIPOS: Array<[RegExp, string]> = [
  [/\brotei/i,                     "Roteiro de Vídeo"],
  [/\bpauta/i,                     "Pauta de Conteúdo"],
  [/\bplanejamento|calend[áa]rio/i, "Planejamento"],
  [/\bproposta/i,                  "Proposta"],
  [/\bbriefing/i,                  "Briefing"],
];

export type ModoPdf = "diagramar" | "criar";

export interface PedidoPdf {
  quer: boolean;
  /** O texto que vira documento (diagramar) ou serve de matéria-prima (criar) — já sem o pedido. */
  conteudo: string;
  tipo: string;
  /** diagramar = sai o que entrou; criar = a IA escreve em cima do conteúdo + briefing do cliente. */
  modo: ModoPdf;
}

// Verbos de pedido. O imperativo ("crie", "faça", "monte") FALTAVA e isso tinha consequência
// visível: "loninho, crie esse pdf de roteiro" não era reconhecido como linha de pedido, então a
// frase do Roberto saía impressa DENTRO do PDF que foi pro cliente.
const VERBO =
  /\b(transform\w*|convert\w*|vir(?:a|ar|e|em)\b|pass(?:a|ar|e|em)\b|faz\w*|fa[çc]\w*|fazer|ger(?:a|ar|e|em)\w*|mont(?:a|ar|e|em)\w*|mand(?:a|ar|e|em)\w*|env(?:ia|iar|ie|iem)\w*|cri(?:a|ar|e|em)\w*|escrev\w*|escrev(?:a|am)\b|elabor\w*|produz\w*|prepar\w*|refa[çc]\w*)\b/;

const OBJETO = /\bpdf\b|\bdocumento\b|\barquivo\b/;
/** Chamar o agente pelo nome é sinal forte de instrução — ninguém escreve "loninho" num roteiro. */
const VOCATIVO = /\blon(?:inho|e)\b|\bloninho\b/i;

/** "faz um pdf", "transforma em pdf", "vira pdf", "monta o documento". */
export function pediuPdf(texto: string): boolean {
  const t = (texto || "").toLowerCase();
  return VERBO.test(t) && OBJETO.test(t);
}

/**
 * A linha é INSTRUÇÃO pra mim (e não conteúdo do cliente)?
 *
 * Exige mais do que "tem verbo": pede o objeto (pdf/documento) OU o meu nome. Sem esse cuidado o
 * filtro comia fala legítima — "está FAZENDO uma obra maior e procurando piso" tem verbo e é
 * exatamente o tipo de frase que o roteiro precisa manter.
 */
function ehLinhaDePedido(linha: string): boolean {
  const t = (linha || "").toLowerCase();
  if (!VERBO.test(t)) return false;
  return OBJETO.test(t) || VOCATIVO.test(t);
}

// "com essas informações", "com isso", "em cima disso" — marca que o texto colado é MATÉRIA-PRIMA,
// não a peça pronta.
const MATERIA_PRIMA =
  /\b(com|usando|utilizando|a partir de|em cima d|com base n|baseado n|baseada n|seguindo)\s*(essas?|esses?|estas?|estes?|isso|isto|aquilo|as|os)?\s*(informa[çc][õo]es|infos?|dados|contexto|material|conte[úu]do|texto|coisas|detalhes|que te passei|que passei|que mandei|que enviei)\b/i;

// Verbos que dizem "só troque o formato do que já está aqui".
const VERBO_FORMATAR = /\b(transform\w*|convert\w*|vir(?:a|ar|e|em)\b|pass(?:a|ar|e|em)\b|diagram\w*|formata\w*)\b/i;
// Verbos que dizem "escreva algo novo".
const VERBO_CRIAR = /\b(cri(?:a|ar|e|em)\w*|escrev\w*|elabor\w*|produz\w*|desenvolv\w*|monta?r?\b|mont(?:a|e|em)\b|faz\w*|fa[çc]\w*)\b/i;

/** O texto colado JÁ é uma peça pronta (tem cara de roteiro), ou é informação solta? */
function pareceRoteiroPronto(conteudo: string): boolean {
  const sinais = [
    /dura[çc][ãa]o\s*:/i.test(conteudo),
    /texto\s+na\s+tela/i.test(conteudo),
    /^\s*\**\s*(criativos?|v[íi]deos?|reels?|op[çc][ãa]o|vers[ãa]o|roteiros?)\s*\d/im.test(conteudo),
    /^\s*[âa]ngulo\s*:/im.test(conteudo),
    /^\s*\d{1,2}[.)]\s+\S+/m.test(conteudo),
    // Fala entre aspas + chamada pra ação: a assinatura de um roteiro de anúncio.
    /["“][^"”]{25,}["”]/.test(conteudo) && /\b(clique|chama|chame|whatsapp|link na bio|manda|envie)\b/i.test(conteudo),
  ].filter(Boolean).length;
  return sinais >= 2;
}

/**
 * Separa o pedido do conteúdo e decide se é pra DIAGRAMAR ou CRIAR.
 *
 * A linha que CONTÉM o pedido sai — ela é instrução pra mim, não conteúdo do cliente. O resto fica
 * intacto, na ordem original.
 */
export function lerPedidoPdf(texto: string): PedidoPdf {
  const bruto = texto || "";
  if (!pediuPdf(bruto)) return { quer: false, conteudo: "", tipo: "Documento", modo: "diagramar" };

  const linhas = bruto.split("\n");
  const instrucoes = linhas.filter((l) => ehLinhaDePedido(l));
  const conteudo = linhas.filter((l) => !ehLinhaDePedido(l)).join("\n").trim();
  const pedido = instrucoes.join(" ");

  // ── Diagramar ou criar? ────────────────────────────────────────────────────
  // Ordem importa: "transforma isso em pdf" é explícito e ganha de tudo. Depois vem o sinal de
  // matéria-prima ("com essas informações"), que é a marca do pedido de CRIAÇÃO. Sem nenhum dos
  // dois, quem decide é o próprio texto: se já tem cara de roteiro, é só diagramar.
  let modo: ModoPdf = "diagramar";
  if (VERBO_FORMATAR.test(pedido)) {
    modo = "diagramar";
  } else if (MATERIA_PRIMA.test(pedido) && VERBO_CRIAR.test(pedido)) {
    modo = "criar";
  } else if (VERBO_CRIAR.test(pedido) && !pareceRoteiroPronto(conteudo)) {
    modo = "criar";
  }

  // O tipo vem do PEDIDO quando ele diz ("transforma esse ROTEIRO em pdf"). Quando não diz, vem do
  // CONTEÚDO: um texto com "Duração:" e "Texto na tela:" é roteiro de vídeo, e sair rotulado como
  // "Documento" faz o cliente receber algo com cara de genérico.
  const doPedido = TIPOS.find(([rx]) => rx.test(pedido));
  if (doPedido) return { quer: true, conteudo, tipo: doPedido[1], modo };

  const pareceRoteiro = /dura[çc][ãa]o\s*:/i.test(conteudo) && /texto\s+na\s+tela/i.test(conteudo);
  if (pareceRoteiro) return { quer: true, conteudo, tipo: "Roteiro de Vídeo", modo };

  const doConteudo = TIPOS.find(([rx]) => rx.test(conteudo));
  return { quer: true, conteudo, tipo: doConteudo ? doConteudo[1] : "Documento", modo };
}

// "cria UMA proposta", "escreve UM briefing", "monta UMA pauta" — artigo indefinido = a peça ainda não
// existe. "monta A proposta em pdf" (artigo definido) é a proposta que veio colada: diagramar.
const CRIAR_PECA = /\b(cri|escrev|elabor|desenvolv|redig|mont|fa[zç]|prepar|produz)\w*\s+(um|uma)\s+(nov[oa]\s+)?(proposta|briefing|pauta|planejamento|calend[áa]rio|rotei)/i;

/**
 * 25/10/2026 (auditoria de erro recuperável, 11.10). Só o ROTEIRO tem quem escreva do zero (o fluxo de
 * roteiro). "Cria uma proposta/briefing/pauta em PDF com essas informações" caía na diagramação: o texto
 * cru saía rotulado "Proposta — Cliente", com cara de peça pronta — o mesmo bug já corrigido para o
 * roteiro. Devolve o tipo pedido quando é pedido de ESCREVER uma peça (para o inbound responder "ainda
 * não escrevo isso; quer que eu só diagrame?"), ou null quando é diagramação.
 */
export function pedidoParaEscrever(texto: string): string | null {
  const p = lerPedidoPdf(texto);
  if (!p.quer || p.modo !== "criar") return null;
  const pedido = (texto || "").split("\n").filter((l) => ehLinhaDePedido(l)).join(" ");
  const tipo = TIPOS.find(([rx]) => rx.test(pedido));
  if (!tipo) return null; // "faz um pdf com essas informações" é documento genérico: diagramar não engana ninguém
  const escrever = CRIAR_PECA.test(pedido) || (MATERIA_PRIMA.test(pedido) && VERBO_CRIAR.test(pedido));
  return escrever ? tipo[1] : null;
}

/** A resposta para o pedido de escrever o que eu ainda não escrevo — com a saída que existe. */
export function textoNaoEscrevo(tipo: string): string {
  if (tipo === "Roteiro de Vídeo") {
    return "Roteiro eu escrevo quando o pedido vem no grupo da equipe ou no de artes: \"Lone, cria um roteiro pro <cliente> com essas informações\". Por aqui eu só diagramo — se o texto já é o roteiro pronto, manda de novo começando com *transforma em PDF*.";
  }
  const nome = tipo.toLowerCase();
  return `Ainda não escrevo *${nome}* do zero — o que eu faço é diagramar: o texto que você mandar vai pro PDF do jeito que está, sem eu mexer. Se é isso, manda de novo começando com *transforma em PDF* e o texto. Não montei nada.`;
}
