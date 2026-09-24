// lib/conteudo/fila-designer.ts — A FILA DO DESIGNER: o quadro de produção lido do lado de quem faz
// a arte. Puro (testado em tests/conteudo-fila-designer.test.ts); a tela é
// components/design/FilaDoDesigner.tsx.
//
// POR QUE EXISTE (set/2026). A Leva 5b juntou os quadros num só, com as seis etapas do card — e o
// designer passou a abrir o /design e ver o quadro do social inteiro: Pauta, Revisão interna e Com o
// cliente cheios de cards que não são dele ("tá bugado, como se eu fosse o social"). A área antiga
// tinha colunas com nome de trabalho de designer (Fila, Em produção, Alterações, Aprovação), e era
// disso que eles gostavam.
//
// Aqui a coluna sai do ESTADO DA ARTE (lib/conteudo/producao.ts → estadoDoDesign), não da etapa do
// card. Nada é gravado: é uma leitura do mesmo dado que o quadro usa, e toda transição continua
// passando por lib/conteudo/producao-server.ts. As etapas do social viram contexto no cartão.
//
//   Na fila → Fazendo → Ajustes pedidos → Entregue → Aprovado / No ar

import type { ItemQuadro } from "./quadro";
import { designerDeve } from "./producao";
import { infoEtapa } from "./etapas";
import { ROTULO_FORMATO, diasEntre, formatoDoCard, somarDias } from "./no-ar";

export type ColunaFila = "na_fila" | "fazendo" | "ajustes" | "entregue" | "aprovado";

export interface InfoColunaFila {
  id: ColunaFila;
  rotulo: string;
  /** Frase curta: o que mora aqui (coluna vazia). */
  descricao: string;
  /** Bolinha da coluna. Token do design system. */
  cor: string;
}

export const COLUNAS_FILA: readonly InfoColunaFila[] = [
  { id: "na_fila", rotulo: "Na fila", descricao: "Pedidos de arte novos, do prazo mais perto.", cor: "bg-chart-4" },
  { id: "fazendo", rotulo: "Fazendo", descricao: "O que você pegou e ainda não entregou.", cor: "bg-primary" },
  { id: "ajustes", rotulo: "Ajustes pedidos", descricao: "Voltou com pedido de mudança — o motivo está no card.", cor: "bg-destructive" },
  { id: "entregue", rotulo: "Entregue", descricao: "Arte entregue, esperando o social conferir ou o cliente aprovar.", cor: "bg-lone-warning" },
  { id: "aprovado", rotulo: "Aprovado / No ar", descricao: "Aprovado, agendado ou publicado nos últimos dias.", cor: "bg-lone-success" },
];

/** Quantas artes "Fazendo" por designer antes do aviso (limite de WIP — aviso, não trava). */
export const LIMITE_FAZENDO = 3;
/** Quantos dias de "Aprovado / No ar" a coluna mostra. */
export const DIAS_APROVADO = 7;
/** Quantos dias de "Entregue" a coluna mostra (o que ficou parado mais que isso é do social). */
export const DIAS_ENTREGUE = 30;

type ItemFila = Pick<ItemQuadro, "card" | "pedido" | "etapa" | "estado" | "prazoArte">;

/** Em que coluna da fila o card cai. null = não é do designer (sem pedido de arte). */
export function colunaDaFila(it: ItemFila): ColunaFila | null {
  switch (it.estado) {
    case "alteracao": return "ajustes";
    case "em_andamento": return "fazendo";
    // Devolvido ao social continua na fila (no fim, marcado): volta pra ele quando o social resolver.
    case "na_fila": case "bloqueado": return "na_fila";
    case "entregue":
      return it.etapa === "agendado" || it.etapa === "no_ar" || !!it.card.clientApprovedAt ? "aprovado" : "entregue";
    default: return null;
  }
}

/** A etapa do social como contexto no cartão ("Revisão interna", "Com o cliente"…). null antes da entrega. */
export function contextoDoSocial(it: Pick<ItemQuadro, "etapa">): string | null {
  if (it.etapa === "pauta" || it.etapa === "com_designer") return null;
  return infoEtapa(it.etapa).rotulo;
}

// ─── Ordem ───────────────────────────────────────────────────────────────────

const PESO_PRIORIDADE: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

/** Prazo da arte primeiro (sem prazo no fim), depois a hora, a prioridade e o pedido mais antigo. */
export function porPrazo(a: ItemFila, b: ItemFila): number {
  return (a.prazoArte ?? "9999").localeCompare(b.prazoArte ?? "9999")
    || (a.card.dueTime ?? "99").localeCompare(b.card.dueTime ?? "99")
    || (PESO_PRIORIDADE[a.card.priority] ?? 2) - (PESO_PRIORIDADE[b.card.priority] ?? 2)
    || (a.pedido?.createdAt ?? "").localeCompare(b.pedido?.createdAt ?? "")
    || a.card.title.localeCompare(b.card.title, "pt-BR");
}

/** Quando a arte foi entregue (ou, no legado sem a data, quando o card mudou de etapa). */
export function entregueEm(card: ItemFila["card"]): string | null {
  return card.designerDeliveredAt ?? card.columnEnteredAt?.[card.status] ?? card.statusChangedAt ?? null;
}

/** Desde quando o card espera na etapa em que está (revisão do social, cliente). */
export function esperaDesde(card: ItemFila["card"]): string | null {
  return card.columnEnteredAt?.[card.status] ?? card.statusChangedAt ?? card.designerDeliveredAt ?? null;
}

/** Quando saiu aprovado/agendado/no ar — para o recorte dos últimos dias. */
function aprovadoEm(card: ItemFila["card"]): string {
  return card.publishVerifiedAt ?? card.columnEnteredAt?.[card.status] ?? card.clientApprovedAt ?? card.statusChangedAt ?? card.dueDate ?? "";
}

// ─── Montagem ────────────────────────────────────────────────────────────────

export interface ColunaDaFila extends InfoColunaFila {
  itens: ItemQuadro[];
  /** Ficaram de fora pelo recorte de dias (Entregue e Aprovado). */
  ocultos: number;
}

export function montarFila(itens: readonly ItemQuadro[], opts: { hoje: string; diasAprovado?: number; diasEntregue?: number }): ColunaDaFila[] {
  const desdeAprovado = somarDias(opts.hoje, -(opts.diasAprovado ?? DIAS_APROVADO));
  const desdeEntregue = somarDias(opts.hoje, -(opts.diasEntregue ?? DIAS_ENTREGUE));
  const grupos = new Map<ColunaFila, ItemQuadro[]>(COLUNAS_FILA.map((c) => [c.id, []]));
  const ocultos = new Map<ColunaFila, number>(COLUNAS_FILA.map((c) => [c.id, 0]));
  for (const it of itens) {
    const col = colunaDaFila(it);
    if (!col) continue;
    if (col === "aprovado" && aprovadoEm(it.card).slice(0, 10) < desdeAprovado) { ocultos.set(col, ocultos.get(col)! + 1); continue; }
    if (col === "entregue" && (entregueEm(it.card) ?? "").slice(0, 10) < desdeEntregue) { ocultos.set(col, ocultos.get(col)! + 1); continue; }
    grupos.get(col)!.push(it);
  }
  const ordem: Record<ColunaFila, (a: ItemQuadro, b: ItemQuadro) => number> = {
    // Devolvido espera o social: vai pro fim da fila, não some.
    na_fila: (a, b) => Number(a.estado === "bloqueado") - Number(b.estado === "bloqueado") || porPrazo(a, b),
    fazendo: porPrazo,
    ajustes: (a, b) => porPrazo(a, b) || (a.card.alteracaoPendenteEm ?? "").localeCompare(b.card.alteracaoPendenteEm ?? ""),
    entregue: (a, b) => (entregueEm(b.card) ?? "").localeCompare(entregueEm(a.card) ?? ""),
    aprovado: (a, b) => aprovadoEm(b.card).localeCompare(aprovadoEm(a.card)),
  };
  return COLUNAS_FILA.map((c) => ({ ...c, itens: grupos.get(c.id)!.sort(ordem[c.id]), ocultos: ocultos.get(c.id)! }));
}

// ─── Números ─────────────────────────────────────────────────────────────────

export interface ResumoFila {
  /** Arte que o designer deve com prazo hoje ou vencido. */
  paraHoje: number;
  vencidas: number;
  ajustes: number;
  naFila: number;
  fazendo: number;
  devolvidos: number;
  /** Tudo o que o designer deve (fila, fazendo, ajuste). */
  devendo: number;
}

export function resumirFila(itens: readonly ItemFila[], hoje: string): ResumoFila {
  const r: ResumoFila = { paraHoje: 0, vencidas: 0, ajustes: 0, naFila: 0, fazendo: 0, devolvidos: 0, devendo: 0 };
  for (const it of itens) {
    if (it.estado === "bloqueado") { r.devolvidos++; continue; }
    if (!designerDeve(it.estado)) continue;
    r.devendo++;
    if (it.estado === "alteracao") r.ajustes++;
    if (it.estado === "na_fila") r.naFila++;
    if (it.estado === "em_andamento") r.fazendo++;
    if (it.prazoArte && it.prazoArte <= hoje) {
      r.paraHoje++;
      if (it.prazoArte < hoje) r.vencidas++;
    }
  }
  return r;
}

/** "Fazendo" passou do limite de WIP? (`designers` = quantos designers a fila mostra.) */
export function acimaDoLimite(fazendo: number, designers = 1): boolean {
  return fazendo > LIMITE_FAZENDO * Math.max(1, designers);
}

// ─── O que o cartão mostra ───────────────────────────────────────────────────

export type NivelUrgencia = "vencido" | "hoje" | "amanha" | "semana" | "depois";

const DIA_DA_SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

function ddmm(ymd: string): string {
  const [, m, d] = ymd.slice(0, 10).split("-");
  return `${d}/${m}`;
}

/** O prazo como o designer lê: "Venceu 22/09", "Hoje", "Amanhã", "sex 26/09", "03/10". */
export function urgenciaDoPrazo(prazo: string | null | undefined, hoje: string): { nivel: NivelUrgencia; rotulo: string; dias: number } | null {
  if (!prazo) return null;
  const p = prazo.slice(0, 10);
  const dias = diasEntre(hoje, p);
  if (dias < 0) return { nivel: "vencido", rotulo: `Venceu ${ddmm(p)}`, dias };
  if (dias === 0) return { nivel: "hoje", rotulo: "Hoje", dias };
  if (dias === 1) return { nivel: "amanha", rotulo: "Amanhã", dias };
  if (dias <= 6) {
    const [y, m, d] = p.split("-").map(Number);
    return { nivel: "semana", rotulo: `${DIA_DA_SEMANA[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${ddmm(p)}`, dias };
  }
  return { nivel: "depois", rotulo: ddmm(p), dias };
}

export interface FormatoPeca {
  /** "Carrossel", "Story"… (ou o texto do card, quando não é um formato conhecido). */
  rotulo: string;
  /** Medida da peça ("1080×1350"). null quando não dá pra saber. */
  medida: string | null;
  /** "5 lâminas", quando o formato diz. */
  detalhe: string | null;
}

/** Feed é 4:5 (a mesma moldura da prévia do Instagram); story e reels, 9:16. */
const MEDIDA: Record<string, string | null> = {
  post: "1080×1350", carrossel: "1080×1350", story: "1080×1920", reel: "1080×1920", outro: null,
};

/** O formato do card (texto livre) do jeito que o designer precisa: tipo, medida e lâminas. */
export function formatoDaPeca(format: string | null | undefined): FormatoPeca {
  const texto = (format ?? "").trim();
  const tipo = formatoDoCard(texto);
  const explicita = texto.match(/(\d{3,4})\s*[x×]\s*(\d{3,4})/i);
  const laminas = texto.match(/(\d{1,2})\s*(l[aâ]minas?|slides?|telas?|cards?|artes?|imagens?)/i);
  return {
    rotulo: tipo === "outro" ? texto || "Peça" : ROTULO_FORMATO[tipo],
    medida: explicita ? `${explicita[1]}×${explicita[2]}` : MEDIDA[tipo],
    detalhe: laminas ? `${laminas[1]} ${Number(laminas[1]) === 1 ? "lâmina" : "lâminas"}` : null,
  };
}

/**
 * O que falta no pedido antes de começar ("definition of ready"): o designer devolve no mesmo dia,
 * com o que falta nomeado, em vez de adivinhar e voltar em ajuste.
 */
export function faltasNoPedido(p: {
  briefing?: string | null;
  briefingDoPedido?: string | null;
  formato?: string | null;
  prazo?: string | null;
  guidelines?: string | null;
}): string[] {
  const faltas: string[] = [];
  if (((p.briefing || p.briefingDoPedido || "").trim().length) <= 10) faltas.push("briefing");
  if (!(p.formato ?? "").trim()) faltas.push("formato");
  if (!p.prazo) faltas.push("prazo");
  if (!(p.guidelines ?? "").trim()) faltas.push("guidelines do cliente");
  return faltas;
}

/** O texto pronto do "Devolver ao social" quando falta algo no pedido. */
export function motivoDasFaltas(faltas: readonly string[]): string {
  if (!faltas.length) return "";
  return `Falta no pedido: ${faltas.join(", ")}.`;
}

const EH_IMAGEM = /\.(png|jpe?g|webp|gif)(\?|$)/i;

/**
 * A miniatura do cartão: antes da entrega, a REFERÊNCIA (o que o social mandou, ou a proposta da IA
 * no pedido); depois, a VERSÃO atual (a entrega).
 */
export function miniaturaDoItem(it: Pick<ItemQuadro, "card" | "pedido">, coluna: ColunaFila): { url: string; tipo: "referencia" | "versao" } | null {
  const anexos = [...(it.card.cardAttachments ?? [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const entrega = anexos.find((a) => a.tipo === "entrega");
  if (coluna === "ajustes" || coluna === "entregue" || coluna === "aprovado") {
    if (entrega) return { url: entrega.url, tipo: "versao" };
    if (it.card.imageUrl) return { url: it.card.imageUrl, tipo: "versao" };
    return null;
  }
  const ref = anexos.find((a) => a.tipo !== "entrega");
  if (ref) return { url: ref.url, tipo: "referencia" };
  const doPedido = (it.pedido?.attachments ?? []).find((u) => EH_IMAGEM.test(u));
  if (doPedido) return { url: doPedido, tipo: "referencia" };
  if (it.card.imageUrl && !entrega) return { url: it.card.imageUrl, tipo: "referencia" };
  return null;
}

/** "1º ajuste", "2º ajuste" — rodadas de revisão (2 é normal; muitas é briefing ou processo). */
export function rotuloRodada(alteracoes: number): string | null {
  return alteracoes > 0 ? `${alteracoes}º ajuste` : null;
}

// ─── Meu Trabalho › Hoje ─────────────────────────────────────────────────────

export interface AgendaDoDesigner {
  /** Voltou com pedido de mudança — primeiro, é trabalho que já devia estar pronto. */
  ajustes: ItemQuadro[];
  /** Prazo hoje ou vencido (sem os ajustes). */
  paraHoje: ItemQuadro[];
  /** O que vem depois, na ordem da fila (fazendo primeiro). */
  proximas: ItemQuadro[];
  /** Devolvidos ao social, esperando resposta. */
  devolvidos: ItemQuadro[];
  /** Tudo o que o designer deve. */
  total: number;
}

export function agendaDoDesigner(itens: readonly ItemQuadro[], hoje: string, opts: { proximas?: number } = {}): AgendaDoDesigner {
  const deve = itens.filter((it) => designerDeve(it.estado));
  const ajustes = deve.filter((it) => it.estado === "alteracao").sort(porPrazo);
  const paraHoje = deve.filter((it) => it.estado !== "alteracao" && !!it.prazoArte && it.prazoArte <= hoje).sort(porPrazo);
  const ja = new Set([...ajustes, ...paraHoje].map((it) => it.card.id));
  const proximas = deve
    .filter((it) => !ja.has(it.card.id))
    .sort((a, b) => Number(b.estado === "em_andamento") - Number(a.estado === "em_andamento") || porPrazo(a, b))
    .slice(0, opts.proximas ?? 5);
  const devolvidos = itens.filter((it) => it.estado === "bloqueado").sort(porPrazo);
  return { ajustes, paraHoje, proximas, devolvidos, total: deve.length };
}
