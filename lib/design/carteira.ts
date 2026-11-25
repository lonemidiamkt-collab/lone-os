// lib/design/carteira.ts — os clientes da carteira de um designer e as artes deles que estão com OUTRA pessoa.
// Puro (tests/design-carteira.test.ts).
//
// 25/11/2026: "a gente adicionou o designer, mas para ele ainda não aparece o cliente". Três causas:
//  1. a arte guarda o dono na criação (lib/design/atribuicao.ts) e esse dono vence a carteira: trocar o designer
//     do cliente não movia nada do que já estava aberto;
//  2. a tela do designer só mostrava cliente que já tinha arte na fila dele;
//  3. a carteira só era lida ao abrir a página.

import type { ItemQuadro } from "@/lib/conteudo/quadro";
import { designerDeve, type EstadoDesign } from "@/lib/conteudo/producao";
import { mesmaPessoa, nomesParecidos } from "@/lib/equipe/pessoa";

/** A arte ainda depende do designer (ou volta para ele quando o social responder). Entregue não muda de mãos. */
export function arteAberta(estado: EstadoDesign): boolean {
  return designerDeve(estado) || estado === "bloqueado";
}

export interface ClienteDaCarteira { id: string; name: string; nomeFantasia?: string | null; assignedDesigner?: string | null; active?: boolean; draftStatus?: string | null }

export interface ArteComOutro { pedidoId: string; cardId: string; titulo: string; com: string; fazendo: boolean }

export interface LinhaDaCarteira {
  id: string;
  nome: string;
  /** Artes abertas na fila desta pessoa. */
  abertas: number;
  /** Artes abertas deste cliente gravadas com outra pessoa. */
  comOutros: ArteComOutro[];
}

export const nomeDoCliente = (c: Pick<ClienteDaCarteira, "name" | "nomeFantasia">) => c.nomeFantasia?.trim() || c.name;

export function artesComOutro(itens: readonly Pick<ItemQuadro, "card" | "pedido" | "estado">[], clientId: string, dono: string): ArteComOutro[] {
  return itens
    .filter((it) => it.card.clientId === clientId && it.pedido && arteAberta(it.estado))
    .filter((it) => (it.pedido!.assignedDesigner ?? "").trim() && !mesmaPessoa(it.pedido!.assignedDesigner, dono))
    .map((it) => ({
      pedidoId: it.pedido!.id, cardId: it.card.id, titulo: it.card.title,
      com: it.pedido!.assignedDesigner!.trim(), fazendo: it.pedido!.status === "in_progress",
    }));
}

/** Todos os clientes da carteira de `pessoa`, com ou sem arte — quem tem arte com outra pessoa vem primeiro. */
export function carteiraDoDesigner(pessoa: string, clientes: readonly ClienteDaCarteira[], itens: readonly ItemQuadro[]): LinhaDaCarteira[] {
  return clientes
    .filter((c) => c.active !== false && !c.draftStatus && mesmaPessoa(c.assignedDesigner, pessoa))
    .map((c) => ({
      id: c.id, nome: nomeDoCliente(c),
      abertas: itens.filter((it) => it.card.clientId === c.id && arteAberta(it.estado) && mesmaPessoa(it.designer, pessoa)).length,
      comOutros: artesComOutro(itens, c.id, pessoa),
    }))
    .sort((a, b) => Number(b.comOutros.length > 0) - Number(a.comOutros.length > 0) || a.nome.localeCompare(b.nome, "pt-BR"));
}

/**
 * Quem leva de uma vez: a gestão, tudo. O designer, só o que ainda não começou — a arte que o colega está fazendo
 * ele assume no card, uma a uma, sabendo o que está pegando.
 */
export function podePassarJunto(papel: string | null | undefined, arte: Pick<ArteComOutro, "fazendo">): boolean {
  return papel === "admin" || papel === "manager" || (papel === "designer" && !arte.fazendo);
}

/** Clientes cujo designer gravado parece ser esta pessoa com outra grafia. Só aponta; quem decide é a gestão. */
export function clientesComNomeParecido(pessoa: string, clientes: readonly ClienteDaCarteira[], equipe: readonly { name: string }[]): { nome: string; gravado: string }[] {
  if (!equipe.length) return [];
  const ativos = clientes.filter((c) => c.active !== false && !c.draftStatus);
  const parecidos = nomesParecidos(pessoa, ativos.map((c) => c.assignedDesigner), equipe);
  return ativos.filter((c) => parecidos.some((p) => mesmaPessoa(p, c.assignedDesigner))).map((c) => ({ nome: nomeDoCliente(c), gravado: c.assignedDesigner!.trim() }));
}

/** "3 com Ana, 1 com Caio" */
export function comQuem(artes: readonly Pick<ArteComOutro, "com">[]): string {
  const n = new Map<string, { nome: string; total: number }>();
  for (const a of artes) {
    const k = [...n.keys()].find((x) => mesmaPessoa(x, a.com)) ?? a.com;
    n.set(k, { nome: k, total: (n.get(k)?.total ?? 0) + 1 });
  }
  return [...n.values()].map((x) => `${x.total} com ${x.nome}`).join(", ");
}
