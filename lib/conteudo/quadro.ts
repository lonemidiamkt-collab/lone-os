// lib/conteudo/quadro.ts — o QUADRO DE PRODUÇÃO em dados: junta card + pedido de arte, decide de
// quem é, em que coluna cai e em que ordem aparece. Puro (testado em tests/conteudo-quadro.test.ts);
// a tela é components/conteudo/QuadroProducao.tsx.
//
// Três vistas, as mesmas para o Social e para o Designer (Leva 5b, D1):
//   · Meus         — as seis etapas em colunas, com os cards da pessoa;
//   · Por cliente  — cada cliente é uma coluna (o que pede ação no topo);
//   · Por designer — cada designer é uma coluna com a fila de arte dele.

import type { ContentCard, DesignRequest } from "@/lib/types";
import { donoDaDemanda, SEM_DONO, type ClienteComDesigner } from "@/lib/design/dono";
import { ETAPAS, etapaDoStatus, ordemDoStatus, type Etapa } from "./etapas";
import { estadoDoDesign, designerDeve, type EstadoDesign, type PedidoDesign } from "./producao";

export type Vista = "meus" | "cliente" | "designer";

export const VISTAS: { id: Vista; rotulo: string }[] = [
  { id: "meus", rotulo: "Meus" },
  { id: "cliente", rotulo: "Por cliente" },
  { id: "designer", rotulo: "Por designer" },
];

/** Abas e links antigos → vista nova. Ninguém cai numa tela em branco por ter um favorito velho. */
export const VISTA_DA_ABA_ANTIGA: Record<string, Vista> = {
  kanban: "meus",          // /social — "Board de Produção"
  kanbans: "meus",         // /design — "Kanbans Social Media"
  requests: "designer",    // /design — "Quadro de Tarefas"
  producao: "meus",
  cliente: "cliente",
  unificada: "cliente",
  designer: "designer",
};

export function lerVista(v: string | null | undefined): Vista | null {
  if (!v) return null;
  return (VISTA_DA_ABA_ANTIGA[v] ?? (["meus", "cliente", "designer"].includes(v) ? v : null)) as Vista | null;
}

export interface ItemQuadro {
  card: ContentCard;
  pedido: DesignRequest | null;
  etapa: Etapa;
  estado: EstadoDesign;
  /** Dono da arte: quem assumiu o pedido, senão o designer da carteira do cliente. */
  designer: string | null;
  /** Prazo da arte: a data de postagem; sem ela (criativo, tarefa do designer), o prazo do pedido. */
  prazoArte: string | null;
  /** Arte entregue que o social ainda não conferiu. */
  arteNova: boolean;
}

/** O pedido do card: o do vínculo; senão o mais novo que aponta pro card (aberto primeiro). */
export function pedidoDoCard(card: Pick<ContentCard, "id" | "designRequestId">, pedidos: readonly DesignRequest[]): DesignRequest | null {
  if (card.designRequestId) {
    const p = pedidos.find((d) => d.id === card.designRequestId);
    if (p) return p;
  }
  const doCard = pedidos.filter((d) => d.contentCardId === card.id);
  if (!doCard.length) return null;
  return [...doCard].sort((a, b) =>
    Number(a.status === "done") - Number(b.status === "done") || (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))[0];
}

export function paraPedidoDesign(p: DesignRequest | null): PedidoDesign | null {
  return p ? { id: p.id, status: p.status } : null;
}

export function montarItem(card: ContentCard, pedidos: readonly DesignRequest[], clientes: readonly ClienteComDesigner[]): ItemQuadro {
  const pedido = pedidoDoCard(card, pedidos);
  const estado = estadoDoDesign({
    status: card.status, designerDeliveredAt: card.designerDeliveredAt, alteracaoPendenteEm: card.alteracaoPendenteEm,
  }, paraPedidoDesign(pedido));
  return {
    card,
    pedido,
    etapa: etapaDoStatus(card.status),
    estado,
    designer: donoDaDemanda({ clientId: card.clientId, assignedDesigner: pedido?.assignedDesigner ?? null }, clientes),
    prazoArte: (card.dueDate || pedido?.deadline || null)?.slice(0, 10) ?? null,
    arteNova: estado === "entregue" && !card.socialConfirmedAt && etapaDoStatus(card.status) === "revisao",
  };
}

export function montarItens(cards: readonly ContentCard[], pedidos: readonly DesignRequest[], clientes: readonly ClienteComDesigner[]): ItemQuadro[] {
  return cards.filter((c) => !c.archivedAt).map((c) => montarItem(c, pedidos, clientes));
}

// ─── Filtros ─────────────────────────────────────────────────────────────────

export interface Filtro {
  /** "Todos" = sem filtro de pessoa. */
  pessoa: string;
  /** Como ler a pessoa: dona do card (social) ou dona da arte (designer). */
  modo: "social" | "designer";
  clientId?: string | null;
  busca?: string;
}

function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function passaNoFiltro(it: ItemQuadro, f: Filtro): boolean {
  if (f.clientId && it.card.clientId !== f.clientId) return false;
  if (f.pessoa && f.pessoa !== "Todos") {
    if (f.modo === "social" && it.card.socialMedia !== f.pessoa) return false;
    if (f.modo === "designer") {
      const dono = it.designer ?? SEM_DONO;
      if (dono !== f.pessoa) return false;
    }
  }
  const q = semAcento((f.busca ?? "").trim());
  if (q) {
    const onde = semAcento(`${it.card.title ?? ""} ${it.card.clientName ?? ""} ${it.card.format ?? ""}`);
    if (!onde.includes(q)) return false;
  }
  return true;
}

// ─── Ordem ───────────────────────────────────────────────────────────────────

/** O que pede ação agora vem primeiro: alteração, devolvido, arte nova; depois o prazo mais perto. */
export function pesoDeAtencao(it: ItemQuadro): number {
  if (it.estado === "alteracao") return 0;
  if (it.estado === "bloqueado") return 1;
  if (it.arteNova) return 2;
  return 3;
}

export function compararItens(a: ItemQuadro, b: ItemQuadro): number {
  return pesoDeAtencao(a) - pesoDeAtencao(b)
    || (a.prazoArte ?? "9999").localeCompare(b.prazoArte ?? "9999")
    || (a.card.dueTime ?? "99").localeCompare(b.card.dueTime ?? "99")
    || a.card.title.localeCompare(b.card.title, "pt-BR");
}

// ─── Vistas ──────────────────────────────────────────────────────────────────

export interface Coluna {
  id: string;
  titulo: string;
  itens: ItemQuadro[];
}

/** Meus: as seis etapas. No ar mostra só o recente (o histórico inteiro afogaria a coluna). */
export function colunasPorEtapa(itens: readonly ItemQuadro[], opts: { noArDesde?: string } = {}): (Coluna & { etapa: Etapa })[] {
  return ETAPAS.map((e) => ({
    id: e.id,
    etapa: e.id,
    titulo: e.rotulo,
    itens: itens
      .filter((it) => it.etapa === e.id)
      .filter((it) => e.id !== "no_ar" || !opts.noArDesde || noArRecente(it, opts.noArDesde))
      .sort(compararItens),
  }));
}

function noArRecente(it: ItemQuadro, desde: string): boolean {
  const quando = it.card.publishVerifiedAt ?? it.card.statusChangedAt ?? it.card.dueDate ?? "";
  return quando.slice(0, 10) >= desde;
}

/** Por cliente: uma coluna por cliente, na ordem do fluxo (o que pede ação primeiro). */
export function colunasPorCliente(itens: readonly ItemQuadro[], clientes: readonly { id: string; nome: string }[], opts: { comVazios?: boolean } = {}): Coluna[] {
  const porCliente = new Map<string, ItemQuadro[]>();
  for (const it of itens) {
    const l = porCliente.get(it.card.clientId) ?? [];
    l.push(it);
    porCliente.set(it.card.clientId, l);
  }
  return clientes
    .filter((c) => opts.comVazios || porCliente.has(c.id))
    .map((c) => ({
      id: c.id,
      titulo: c.nome,
      itens: (porCliente.get(c.id) ?? []).sort((a, b) =>
        pesoDeAtencao(a) - pesoDeAtencao(b) || ordemDoStatus(a.card.status) - ordemDoStatus(b.card.status) || compararItens(a, b)),
    }));
}

/**
 * Por designer: a fila de arte de cada designer — os cards "Com o designer" (na fila, fazendo,
 * alteração, devolvidos). Quem não tem nada aberto aparece com a coluna vazia, para a gestão ver
 * quem está livre. Sem dono vai para "(sem designer)" — escondê-lo seria perder o pedido.
 */
export function colunasPorDesigner(itens: readonly ItemQuadro[], designers: readonly string[]): Coluna[] {
  const naFila = itens.filter((it) => it.etapa === "com_designer");
  const nomes = [...new Set([...designers, ...naFila.map((it) => it.designer ?? SEM_DONO)])]
    .sort((a, b) => (a === SEM_DONO ? 1 : b === SEM_DONO ? -1 : a.localeCompare(b, "pt-BR")));
  return nomes.map((nome) => ({
    id: nome,
    titulo: nome,
    itens: naFila.filter((it) => (it.designer ?? SEM_DONO) === nome).sort(compararItens),
  }));
}

// ─── Números do topo ─────────────────────────────────────────────────────────

export interface Resumo {
  /** Arte que o designer deve (fila, fazendo, alteração). */
  comODesigner: number;
  alteracoes: number;
  bloqueados: number;
  /** Arte entregue esperando o social conferir. */
  paraRevisar: number;
  comOCliente: number;
  /** Prazo da arte vencido ou hoje, e o designer ainda deve. */
  urgentes: number;
}

export function resumir(itens: readonly ItemQuadro[], hoje: string): Resumo {
  const r: Resumo = { comODesigner: 0, alteracoes: 0, bloqueados: 0, paraRevisar: 0, comOCliente: 0, urgentes: 0 };
  for (const it of itens) {
    if (it.etapa === "com_designer" && designerDeve(it.estado)) r.comODesigner++;
    if (it.estado === "alteracao") r.alteracoes++;
    if (it.estado === "bloqueado") r.bloqueados++;
    if (it.etapa === "revisao") r.paraRevisar++;
    if (it.etapa === "com_cliente") r.comOCliente++;
    if (designerDeve(it.estado) && it.prazoArte && it.prazoArte <= hoje) r.urgentes++;
  }
  return r;
}
