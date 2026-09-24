// lib/conteudo/producao.ts — A ETAPA DE DESIGN MORA NO CARD. Regras puras (testadas em
// tests/conteudo-producao.test.ts); quem grava é lib/conteudo/producao-server.ts.
//
// POR QUE EXISTE (Leva 5b, D2). "Pedir arte" criava um registro à parte (design_requests) que cada
// tela sincronizava à mão com o card: o botão "A fazer" gravava a demanda e depois o vínculo, a
// reprovação reabria a demanda por outro fetch, o ajuste do cliente reabria por um terceiro
// caminho, e a entrega tinha dois. Eram 834 cards e 873 demandas, quase 1:1 — e daí vinham as
// demandas que "sumiam" e as entregas registradas duas vezes.
//
// Agora o pedido de arte é uma ETAPA do card ("Com o designer"). A tabela design_requests continua
// (muita coisa lê dela), mas quem decide o que muda nela é UMA função: `planejarTransicao`. As
// transições são quatro, mais três de apoio:
//
//   pedir_arte       card → "Com o designer"; pedido na fila (cria, ou reabre se não foi entregue)
//   iniciar          designer pegou: pedido em andamento
//   entregue         pedido concluído; card → "Revisão interna" com designer_delivered_at
//   pedir_alteracao  volta pra "Com o designer": entrega anterior deixa de valer, motivo gravado
//   bloquear / desbloquear   o designer devolve o card por falta de algo (marca dentro da etapa)
//   cancelar_pedido  só a gestão: apaga o pedido aberto e o card volta pra Pauta
//
// E `planejarMovimento` traduz o ARRASTE no quadro para uma dessas (ou para uma troca simples de
// etapa, quando não há arte envolvida).

import { etapaDoStatus, estaBloqueado, infoEtapa, statusDaEtapa, type Etapa, type StatusDoCard } from "./etapas";

// ─── O estado que as regras enxergam ─────────────────────────────────────────

export type StatusDoPedido = "queued" | "in_progress" | "done";

export interface CardDesign {
  id: string;
  status: StatusDoCard;
  archivedAt?: string | null;
  dueDate?: string | null;
  designRequestId?: string | null;
  designerDeliveredAt?: string | null;
  alteracaoPendenteEm?: string | null;
  columnEnteredAt?: Record<string, string> | null;
}

export interface PedidoDesign {
  id: string;
  status: StatusDoPedido;
}

/** Onde a arte está, dentro do card. É o que o quadro mostra embaixo do título. */
export type EstadoDesign = "sem_pedido" | "na_fila" | "em_andamento" | "alteracao" | "bloqueado" | "entregue";

export const ROTULO_ESTADO_DESIGN: Record<EstadoDesign, string> = {
  sem_pedido: "Sem pedido de arte",
  na_fila: "Na fila do designer",
  em_andamento: "Designer fazendo",
  alteracao: "Alteração pedida",
  bloqueado: "Devolvido pelo designer",
  entregue: "Arte entregue",
};

export function pedidoAberto(p: PedidoDesign | null | undefined): boolean {
  return !!p && p.status !== "done";
}

export function estadoDoDesign(card: Pick<CardDesign, "status" | "designerDeliveredAt" | "alteracaoPendenteEm">, pedido: PedidoDesign | null | undefined): EstadoDesign {
  if (estaBloqueado(card.status)) return "bloqueado";
  if (card.alteracaoPendenteEm) return "alteracao";
  if (card.designerDeliveredAt) return "entregue";
  if (pedido?.status === "in_progress") return "em_andamento";
  if (pedido?.status === "queued") return "na_fila";
  // Pedido concluído sem a data de entrega no card: legado de antes da operação única de entrega.
  if (pedido?.status === "done") return "entregue";
  return "sem_pedido";
}

/** A arte está devendo trabalho DO DESIGNER (fila, andamento ou alteração). Bloqueado espera o social. */
export function designerDeve(estado: EstadoDesign): boolean {
  return estado === "na_fila" || estado === "em_andamento" || estado === "alteracao";
}

// ─── Transições ──────────────────────────────────────────────────────────────

export type AcaoDesign =
  | { tipo: "pedir_arte" }
  | { tipo: "iniciar" }
  | { tipo: "entregue"; quem?: string | null }
  | { tipo: "pedir_alteracao"; motivo: string }
  | { tipo: "bloquear"; motivo: string; quem?: string | null }
  | { tipo: "desbloquear" }
  | { tipo: "cancelar_pedido" };

export type TipoAcao = AcaoDesign["tipo"];

export const TIPOS_DE_ACAO: readonly TipoAcao[] = [
  "pedir_arte", "iniciar", "entregue", "pedir_alteracao", "bloquear", "desbloquear", "cancelar_pedido",
];

/** O que fazer com o pedido de arte. */
export type MudancaNoPedido =
  | { criar: true; status: "queued" }
  | { status: StatusDoPedido }
  | { apagar: true };

export interface PlanoTransicao {
  /** Colunas de content_cards (snake_case). Vazio = o card não muda. */
  card: Record<string, unknown>;
  pedido: MudancaNoPedido | null;
  /** Nada a fazer (clique repetido, estado já é o pedido). */
  semEfeito: boolean;
}

export type ResultadoPlano =
  | { ok: true; plano: PlanoTransicao }
  | { ok: false; status: 400 | 409; erro: string };

const LIMPA_BLOQUEIO = { blocked_reason: null, blocked_by: null, blocked_at: null } as const;

/** Colunas que põem o card numa etapa (e registram quando entrou nela). */
function entrarEm(card: CardDesign, status: StatusDoCard, agora: string): Record<string, unknown> {
  if (card.status === status) return {};
  return {
    status,
    status_changed_at: agora,
    column_entered_at: { ...(card.columnEnteredAt ?? {}), [status]: agora },
  };
}

function plano(card: Record<string, unknown>, pedido: MudancaNoPedido | null): ResultadoPlano {
  return { ok: true, plano: { card, pedido, semEfeito: Object.keys(card).length === 0 && !pedido } };
}

const recusa = (status: 400 | 409, erro: string): ResultadoPlano => ({ ok: false, status, erro });

/**
 * O que a transição muda no card e no pedido. Não grava nada.
 *
 * `pedido` é o pedido de arte LIGADO ao card (o mais recente), ou null.
 */
export function planejarTransicao(acao: AcaoDesign, card: CardDesign, pedido: PedidoDesign | null, agora: string): ResultadoPlano {
  if (card.archivedAt) return recusa(409, "Card arquivado — desarquive antes de mexer na arte.");
  const etapa = etapaDoStatus(card.status);
  const bloqueado = estaBloqueado(card.status);
  const comDesigner = statusDaEtapa("com_designer");

  switch (acao.tipo) {
    case "pedir_arte": {
      // Já tem pedido aberto: o clique repetido não abre outro. Só garante a etapa.
      if (pedidoAberto(pedido)) {
        const mudaCard = bloqueado ? { ...entrarEm(card, comDesigner, agora), ...LIMPA_BLOQUEIO }
          : etapa !== "com_designer" ? entrarEm(card, comDesigner, agora) : {};
        return plano(mudaCard, null);
      }
      if (pedido?.status === "done" && card.designerDeliveredAt && !card.alteracaoPendenteEm) {
        return recusa(409, "A arte deste card já foi entregue. Para mudar, peça alteração.");
      }
      const cardMuda = { ...entrarEm(card, comDesigner, agora), ...(bloqueado ? LIMPA_BLOQUEIO : {}) };
      // Pedido concluído sem entrega no card (legado): reabre em vez de abrir um segundo.
      return plano(cardMuda, pedido ? { status: "queued" } : { criar: true, status: "queued" });
    }

    case "iniciar": {
      if (!pedido) return recusa(409, "Este card não tem pedido de arte.");
      if (pedido.status === "done") return recusa(409, "Este pedido já foi entregue. Para refazer, peça alteração.");
      const cardMuda = bloqueado ? { ...entrarEm(card, comDesigner, agora), ...LIMPA_BLOQUEIO }
        : etapa === "pauta" ? entrarEm(card, comDesigner, agora) : {};
      return plano(cardMuda, pedido.status === "queued" ? { status: "in_progress" } : null);
    }

    case "entregue": {
      const cardMuda: Record<string, unknown> = {};
      if (!card.designerDeliveredAt) {
        cardMuda.designer_delivered_at = agora;
        if (acao.quem) cardMuda.designer_delivered_by = acao.quem;
      }
      if (card.alteracaoPendenteEm) { cardMuda.alteracao_pendente_em = null; cardMuda.alteracao_motivo = null; }
      // A entrega leva o card pra Revisão interna — só se ele ainda estava antes dela. Card que o
      // time já tinha levado adiante (agendado, com o cliente) não volta.
      if (etapa === "pauta" || etapa === "com_designer") {
        Object.assign(cardMuda, entrarEm(card, statusDaEtapa("revisao"), agora), bloqueado ? LIMPA_BLOQUEIO : {});
      }
      return plano(cardMuda, pedidoAberto(pedido) ? { status: "done" } : null);
    }

    case "pedir_alteracao": {
      const motivo = acao.motivo.trim();
      if (!motivo) return recusa(400, "Diga o que precisa mudar na arte.");
      const cardMuda: Record<string, unknown> = {
        ...entrarEm(card, comDesigner, agora),
        ...(bloqueado ? LIMPA_BLOQUEIO : {}),
        alteracao_pendente_em: agora,
        alteracao_motivo: motivo.slice(0, 1000),
        // A entrega anterior deixa de valer: sem isso a vigilância parava de cobrar o designer, o
        // portal mostrava a arte velha como "nova" e o Início dizia "arte pronta, falta postar".
        // O histórico das versões fica em creative_deliveries.
        designer_delivered_at: null,
        designer_delivered_by: null,
        social_confirmed_at: null,
        social_confirmed_by: null,
        client_approved_at: null,
      };
      const mudaPedido: MudancaNoPedido | null = !pedido ? { criar: true, status: "queued" }
        : pedido.status === "done" ? { status: "in_progress" } : null;
      return plano(cardMuda, mudaPedido);
    }

    case "bloquear": {
      const motivo = acao.motivo.trim();
      if (!motivo) return recusa(400, "Diga o que está faltando para fazer a arte.");
      if (etapa !== "pauta" && etapa !== "com_designer") {
        return recusa(409, "Só dá pra devolver um card que ainda está com o designer.");
      }
      return plano({
        ...entrarEm(card, "blocked", agora),
        blocked_reason: motivo.slice(0, 500),
        blocked_by: acao.quem ?? null,
        blocked_at: agora,
      }, null);
    }

    case "desbloquear": {
      if (!bloqueado) return plano({}, null);
      return plano({ ...entrarEm(card, comDesigner, agora), ...LIMPA_BLOQUEIO }, null);
    }

    case "cancelar_pedido": {
      if (!pedido) return recusa(409, "Este card não tem pedido de arte.");
      if (pedido.status === "done") return recusa(409, "O pedido já foi entregue — não dá pra cancelar.");
      return plano({
        ...entrarEm(card, statusDaEtapa("pauta"), agora),
        ...LIMPA_BLOQUEIO,
        design_request_id: null,
        alteracao_pendente_em: null,
        alteracao_motivo: null,
      }, { apagar: true });
    }
  }
}

// ─── Quem pode ───────────────────────────────────────────────────────────────

export type PapelProducao = "admin" | "manager" | "traffic" | "social" | "designer" | "comercial";

const QUEM_PODE: Record<TipoAcao, readonly PapelProducao[]> = {
  pedir_arte: ["admin", "manager", "social", "traffic", "designer"],
  iniciar: ["admin", "manager", "designer"],
  entregue: ["admin", "manager", "designer"],
  pedir_alteracao: ["admin", "manager", "social"],
  bloquear: ["admin", "manager", "designer"],
  desbloquear: ["admin", "manager", "social", "designer"],
  cancelar_pedido: ["admin", "manager"],
};

export function papelPode(papel: string | null | undefined, acao: TipoAcao): boolean {
  return !!papel && (QUEM_PODE[acao] as readonly string[]).includes(papel);
}

/** Lê a ação que veio no corpo da requisição. null = inválida. */
export function lerAcao(bruto: unknown): AcaoDesign | null {
  if (!bruto || typeof bruto !== "object") return null;
  const a = bruto as Record<string, unknown>;
  const texto = (v: unknown) => (typeof v === "string" ? v : "");
  switch (a.tipo) {
    case "pedir_arte": return { tipo: "pedir_arte" };
    case "iniciar": return { tipo: "iniciar" };
    case "entregue": return { tipo: "entregue" };
    case "pedir_alteracao": return { tipo: "pedir_alteracao", motivo: texto(a.motivo) };
    case "bloquear": return { tipo: "bloquear", motivo: texto(a.motivo) };
    case "desbloquear": return { tipo: "desbloquear" };
    case "cancelar_pedido": return { tipo: "cancelar_pedido" };
    default: return null;
  }
}

// ─── O arraste no quadro ─────────────────────────────────────────────────────

export type Movimento =
  | { tipo: "nada" }
  /** Troca de etapa sem arte envolvida — grava o status direto. */
  | { tipo: "status"; status: StatusDoCard }
  /** Passa pela transição de design (servidor). */
  | { tipo: "design"; acao: AcaoDesign }
  /** Precisa dos arquivos: abre o "Entregar arte". */
  | { tipo: "entregar" }
  /** Precisa do motivo: abre o "Pedir alteração". */
  | { tipo: "alteracao" }
  | { tipo: "recusar"; motivo: string };

/**
 * O que acontece quando alguém arrasta o card para `destino`.
 *
 * O designer mexe só no trecho dele (puxar da Pauta, entregar). O resto do time move livremente,
 * menos onde isso deixaria o pedido de arte mentindo: tirar do designer um pedido aberto, ou passar
 * da etapa de design sem a arte entregue.
 */
export function planejarMovimento(
  card: CardDesign,
  pedido: PedidoDesign | null,
  destino: Etapa,
  papel: string | null | undefined,
): Movimento {
  const origem = etapaDoStatus(card.status);
  if (origem === destino) return { tipo: "nada" };
  if (card.archivedAt) return { tipo: "recusar", motivo: "Card arquivado — desarquive antes de mover." };

  const estado = estadoDoDesign(card, pedido);
  const entregue = estado === "entregue";
  const ordemDestino = infoEtapa(destino).ordem;
  const depoisDoDesign = ordemDestino > infoEtapa("com_designer").ordem;

  if (papel === "designer") {
    if (origem === "pauta" && destino === "com_designer") return { tipo: "design", acao: { tipo: "pedir_arte" } };
    if (origem === "com_designer" && destino === "revisao") {
      return entregue ? { tipo: "status", status: statusDaEtapa("revisao") } : { tipo: "entregar" };
    }
    return { tipo: "recusar", motivo: origem === "com_designer" || origem === "pauta"
      ? "Do designer, o card sai pela entrega da arte — daí em diante quem move é o social."
      : "Daqui em diante quem move é o social. Para refazer a arte, use \"Trocar arte\" no card." };
  }

  if (destino === "com_designer") {
    if (origem === "pauta") {
      if (!card.dueDate && !pedidoAberto(pedido)) {
        return { tipo: "recusar", motivo: "Falta a data de postagem — é o prazo que o designer e o CS usam. Abra o card e preencha." };
      }
      return { tipo: "design", acao: { tipo: "pedir_arte" } };
    }
    return { tipo: "alteracao" };
  }

  if (origem === "com_designer" && pedidoAberto(pedido) && !entregue) {
    if (destino === "pauta") {
      return papel === "admin" || papel === "manager"
        ? { tipo: "design", acao: { tipo: "cancelar_pedido" } }
        : { tipo: "recusar", motivo: "O pedido de arte está aberto com o designer. Só a gestão cancela o pedido." };
    }
    if (depoisDoDesign) {
      return papel === "admin" || papel === "manager"
        ? { tipo: "entregar" }
        : { tipo: "recusar", motivo: "A arte ainda não foi entregue — quem entrega é o designer, pelo \"Entregar arte\"." };
    }
  }

  return { tipo: "status", status: statusDaEtapa(destino) };
}

/**
 * Campos que acompanham uma troca SIMPLES de etapa (sem arte envolvida), em camelCase para o store.
 * Sair da Revisão interna para a frente é o social dizendo "conferi": marca a arte como confirmada.
 */
export function camposDaTroca(
  card: { status: StatusDoCard; columnEnteredAt?: Record<string, string> | null; socialConfirmedAt?: string | null; scheduledAt?: string | null; publishVerifiedAt?: string | null; designerDeliveredAt?: string | null },
  status: StatusDoCard,
  quem: string,
  agora: string,
): Record<string, unknown> {
  const campos: Record<string, unknown> = {
    status,
    statusChangedAt: agora,
    columnEnteredAt: { ...(card.columnEnteredAt ?? {}), [status]: agora },
  };
  const de = etapaDoStatus(card.status), para = etapaDoStatus(status);
  if (estaBloqueado(card.status)) Object.assign(campos, { blockedReason: null, blockedBy: null, blockedAt: null });
  if (de === "revisao" && infoEtapa(para).ordem > infoEtapa("revisao").ordem && card.designerDeliveredAt && !card.socialConfirmedAt) {
    Object.assign(campos, { socialConfirmedAt: agora, socialConfirmedBy: quem });
  }
  if (para === "agendado" && !card.scheduledAt) campos.scheduledAt = agora;
  if (para === "no_ar" && !card.publishVerifiedAt) Object.assign(campos, { publishVerifiedAt: agora, publishVerifiedBy: quem });
  return campos;
}
