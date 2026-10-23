// lib/cs/aprovacao-cliente.ts — QUAL ARTE o "aprovado" do cliente no grupo aprova. Módulo puro
// (testado em tests/cs-aprovacao-cliente.test.ts); quem lê e grava é o inbound.
//
// POR QUE (21/10/2026, auditoria de erro recuperável, item 2.4). O inbound pegava o card ENTREGUE
// mais recente do cliente — em qualquer etapa, até em "Revisão interna" (o cliente nunca viu) ou
// arquivado — marcava "Cliente aprovou" e movia para Agendado. Cliente só aprova o que recebeu, e
// o que ele recebeu está "Com o cliente". Com mais de uma arte com ele, não dá para saber qual:
// em vez de chutar, o time é perguntado.
//
// A entrega INFERIDA continua (Roberto, 02/09: o designer manda a arte direto no grupo e não marca
// no sistema — o cliente aprova e nada fecha). Mas só quando não há nada "Com o cliente" e existe
// UM único card com o designer, recente, sem entrega e sem devolução.

import { etapaDoStatus, estaBloqueado } from "@/lib/conteudo/etapas";

export interface CardCandidato {
  id: string;
  title: string;
  status: string;
  designerDeliveredAt?: string | null;
  clientApprovedAt?: string | null;
  archivedAt?: string | null;
  createdAt?: string | null;
}

export type EscolhaAprovacao =
  | { tipo: "marcar"; card: CardCandidato; inferirEntrega: boolean }
  /** Mais de uma arte com o cliente: pergunta ao time em vez de marcar. */
  | { tipo: "perguntar"; cards: CardCandidato[] }
  | { tipo: "nenhum" };

/** Card com o designer mais velho que isto não é "a arte que acabou de ser mandada no grupo". */
export const JANELA_INFERENCIA_DIAS = 21;

export function escolherCardAprovado(cards: CardCandidato[], agora: Date): EscolhaAprovacao {
  const vivos = cards.filter((c) => !c.archivedAt && !c.clientApprovedAt);

  // 1) O que está com o cliente — é o que ele viu.
  const comCliente = vivos.filter((c) => etapaDoStatus(c.status) === "com_cliente");
  if (comCliente.length === 1) {
    return { tipo: "marcar", card: comCliente[0], inferirEntrega: !comCliente[0].designerDeliveredAt };
  }
  if (comCliente.length > 1) return { tipo: "perguntar", cards: comCliente };

  // 2) Nada com o cliente: a arte pode ter ido direto do designer para o grupo, sem registro.
  //    Só com UM candidato — com dois, inferir a entrega no card errado é pior que não inferir.
  const desde = agora.getTime() - JANELA_INFERENCIA_DIAS * 86400_000;
  const comDesigner = vivos.filter((c) =>
    etapaDoStatus(c.status) === "com_designer"
    && !estaBloqueado(c.status)
    && !c.designerDeliveredAt
    && (!c.createdAt || new Date(c.createdAt).getTime() >= desde));
  if (comDesigner.length === 1) return { tipo: "marcar", card: comDesigner[0], inferirEntrega: true };
  return { tipo: "nenhum" };
}

/** A pergunta ao time quando o cliente aprovou e há mais de uma arte com ele. */
export function textoAprovacaoAmbigua(cliente: string, cards: Pick<CardCandidato, "title">[]): string {
  const lista = cards.slice(0, 6).map((c) => `• ${c.title || "arte sem título"}`).join("\n");
  const resto = cards.length > 6 ? `\n_e mais ${cards.length - 6}._` : "";
  return `🎉 A *${cliente}* aprovou no grupo, mas tem *${cards.length} artes* com o cliente:\n${lista}${resto}\n\n`
    + `Não marquei nenhuma pra não aprovar a arte errada. Qual foi? Abre o card certo e move pra *Agendado*.`;
}
