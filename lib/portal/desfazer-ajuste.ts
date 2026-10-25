// lib/portal/desfazer-ajuste.ts — "Desfazer" do "Pedir alteração" do portal do cliente. Puro.
//
// POR QUE (25/10/2026, onda 6 da auditoria de erro recuperável, item 12.5). O pedido de alteração age na
// hora: tira a arte de Agendado/Com o cliente, limpa a aprovação e as marcas e devolve ao designer. Um
// clique no card errado — ou um "tá ótimo" escrito no campo — desagendava o post, e o cliente não tinha
// como voltar atrás.
//
// Agora a rota fotografa o card ANTES do pedido (ops_log, action "portal:ajuste") e o portal oferece
// "Desfazer" por 10 minutos. Desfazer só vale enquanto ninguém mexeu na arte depois do pedido: mesma
// etapa, mesma marca do pedido, sem entrega nova do designer e, quando o pedido de arte nasceu agora,
// ainda na fila. Passou disso, o cliente fala com o time — que já pode estar trabalhando.
// Testado em tests/portal-desfazer-ajuste.test.ts.

export const JANELA_DESFAZER_AJUSTE_MS = 10 * 60 * 1000;

/** O que é fotografado antes do pedido (e volta no Desfazer). */
export const CAMPOS_DA_FOTO = [
  "status", "status_changed_at", "column_entered_at", "briefing",
  "designer_delivered_at", "designer_delivered_by", "social_confirmed_at", "social_confirmed_by", "client_approved_at",
  "scheduled_at", "publish_verified_at", "publish_verified_by",
  "blocked_reason", "blocked_by", "blocked_at",
  "alteracao_pendente_em", "alteracao_motivo", "design_request_id",
] as const;

export const COLUNAS_DA_FOTO = ["id", "archived_at", ...CAMPOS_DA_FOTO].join(", ");

export type FotoDoCard = Partial<Record<(typeof CAMPOS_DA_FOTO)[number], unknown>> & { id?: string; archived_at?: string | null };
export interface PedidoResumo { id: string; status: string }

/** O que fica em ops_log.before / ops_log.after do pedido. */
export interface AntesDoAjuste { card: FotoDoCard; pedido: PedidoResumo | null }
export interface DepoisDoAjuste {
  status: string | null;
  alteracao_pendente_em: string | null;
  briefing: string | null;
  pedido: PedidoResumo | null;
  /** O pedido de arte nasceu NESTE ajuste (Desfazer apaga; senão, só volta o status). */
  pedidoCriado: boolean;
}

export function fotografar(card: Record<string, unknown>): FotoDoCard {
  const foto: FotoDoCard = {};
  for (const c of CAMPOS_DA_FOTO) foto[c] = card[c] ?? null;
  return foto;
}

export function resumoDepois(card: Record<string, unknown>, pedidoAntes: PedidoResumo | null, pedidoDepois: PedidoResumo | null): DepoisDoAjuste {
  return {
    status: (card.status as string) ?? null,
    alteracao_pendente_em: (card.alteracao_pendente_em as string) ?? null,
    briefing: (card.briefing as string) ?? null,
    pedido: pedidoDepois,
    pedidoCriado: !!pedidoDepois && (!pedidoAntes || pedidoAntes.id !== pedidoDepois.id),
  };
}

export type ResultadoDesfazer =
  | { ok: true }
  | { ok: false; motivo: "prazo" | "mudou" | "entregue" | "designer"; frase: string };

const FALE_COM_O_TIME = "Fale com a gente no WhatsApp que a gente ajusta.";

/** Ainda dá para desfazer? `em` = quando o pedido foi feito. */
export function podeDesfazerAjuste(p: {
  em: string;
  depois: DepoisDoAjuste;
  cardAgora: Record<string, unknown>;
  pedidoAgora: PedidoResumo | null;
  agora: number;
}): ResultadoDesfazer {
  const feitoEm = new Date(p.em).getTime();
  if (!Number.isFinite(feitoEm) || p.agora - feitoEm > JANELA_DESFAZER_AJUSTE_MS) {
    return { ok: false, motivo: "prazo", frase: `Passaram mais de 10 minutos e o time já pode estar mexendo na arte. ${FALE_COM_O_TIME}` };
  }
  if (p.cardAgora.archived_at) return { ok: false, motivo: "mudou", frase: `Esse post foi encerrado pelo time. ${FALE_COM_O_TIME}` };
  if (p.cardAgora.designer_delivered_at) {
    return { ok: false, motivo: "entregue", frase: `O designer já entregou a nova versão. ${FALE_COM_O_TIME}` };
  }
  if ((p.cardAgora.status ?? null) !== p.depois.status || (p.cardAgora.alteracao_pendente_em ?? null) !== p.depois.alteracao_pendente_em) {
    return { ok: false, motivo: "mudou", frase: `A arte já andou no time depois do seu pedido. ${FALE_COM_O_TIME}` };
  }
  if (p.depois.pedidoCriado && p.pedidoAgora && p.pedidoAgora.id === p.depois.pedido?.id && p.pedidoAgora.status !== "queued") {
    return { ok: false, motivo: "designer", frase: `O designer já começou a ajustar. ${FALE_COM_O_TIME}` };
  }
  return { ok: true };
}

export const NOTA_DESFEITO = "↩️ O cliente desfez este pedido de ajuste pelo portal.";

/** O que gravar para voltar ao estado de antes. Não grava nada. */
export function planoDesfazerAjuste(antes: AntesDoAjuste, depois: DepoisDoAjuste, cardAgora: Record<string, unknown>, pedidoAgora: PedidoResumo | null): {
  card: Record<string, unknown>;
  pedido: { apagar: string } | { id: string; status: string } | null;
} {
  const card: Record<string, unknown> = {};
  for (const c of CAMPOS_DA_FOTO) {
    if (c === "briefing") continue;
    card[c] = antes.card[c] ?? null;
  }
  // O briefing só volta inteiro se ninguém escreveu nele depois do pedido; senão, fica com uma nota.
  const briefingAgora = (cardAgora.briefing as string | null) ?? null;
  card.briefing = briefingAgora === depois.briefing
    ? (antes.card.briefing ?? null)
    : `${briefingAgora ?? ""}\n\n---\n${NOTA_DESFEITO}`;

  let pedido: { apagar: string } | { id: string; status: string } | null = null;
  if (depois.pedidoCriado && depois.pedido) pedido = { apagar: depois.pedido.id };
  else if (antes.pedido && pedidoAgora && pedidoAgora.id === antes.pedido.id && pedidoAgora.status !== antes.pedido.status) {
    pedido = { id: antes.pedido.id, status: antes.pedido.status };
  }
  return { card, pedido };
}
