// lib/conteudo/producao-server.ts — o ÚNICO lugar que grava a etapa de design de um card.
// Server-only. As regras moram em lib/conteudo/producao.ts (puras, testadas); aqui é ler, aplicar
// e registrar.
//
// Quem chama (Leva 5b — antes cada um sincronizava card e demanda do seu jeito):
//   · /api/conteudo/design ............. o quadro de produção (Social e Designer), o card
//   · /api/design-requests/create ...... "Pedir arte" (card, tráfego, ficha do cliente, tarefa do designer)
//   · /api/design-requests/update ...... mudança de status do pedido (iniciar, concluir)
//   · /api/ops/entregar-arte ........... depois da entrega atômica (entregar_arte), leva o card pra revisão
//   · lib/cs/card.ts (aplicarAjusteNoCard) ajuste pedido pelo cliente no WhatsApp e no portal
//   · /api/cs/inbound .................. "Lone, marca a arte como pronta" e a aprovação que prova a entrega
//   · lib/traffic/replicar-executar.ts . variação de criativo vencedor (pedido sem card → nasce o card)

import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/server";
import { designerDaDemanda } from "@/lib/design/atribuir-server";
import { registrarAvaliacao } from "@/lib/conteudo/avaliacao-server";
import { statusDaEtapa } from "@/lib/conteudo/etapas";
import {
  planejarTransicao, type AcaoDesign, type CardDesign, type PedidoDesign, type StatusDoPedido,
} from "@/lib/conteudo/producao";
import type { EscolhaDesigner } from "@/lib/design/atribuicao";

const COLS_CARD = "id, title, client_id, client_name, social_media, status, priority, format, briefing, observations, due_date, archived_at, design_request_id, designer_delivered_at, designer_delivered_by, alteracao_pendente_em, alteracao_motivo, column_entered_at, blocked_reason";
const COLS_PEDIDO = "id, status, content_card_id, assigned_designer, client_id, title, deadline, created_at";

type Linha = Record<string, unknown>;

export type ResultadoTransicao =
  | { ok: true; card: Linha; pedido: Linha | null; semEfeito: boolean; designer?: EscolhaDesigner | null; pedidoRemovido?: string | null }
  | { ok: false; status: number; erro: string };

/** De onde veio o pedido de alteração — decide se vira avaliação do social. */
export type OrigemAlteracao = "social" | "cliente" | "cs";

export interface OpcoesTransicao {
  /** Nome de quem fez (vai para requested_by, designer_delivered_by, blocked_by, ops_log). */
  quem: string;
  /** Briefing do pedido quando ele nasce (ex.: o briefing da arte gerado pela IA e revisado). */
  briefing?: string | null;
  /** Só pedir_alteracao: "social" também grava a reprovação em content_approvals + retrabalho. */
  origem?: OrigemAlteracao;
  /** Id da operação (idempotência de quem chama e trilha no ops_log). */
  operationId?: string | null;
}

/** O card e o pedido ligado a ele (o do vínculo; senão o mais recente, aberto primeiro). */
export async function lerCardEPedido(cardId: string): Promise<{ card: Linha | null; pedido: Linha | null; erro?: string }> {
  const { data: card, error } = await supabaseAdmin.from("content_cards").select(COLS_CARD).eq("id", cardId).maybeSingle();
  if (error) return { card: null, pedido: null, erro: error.message };
  if (!card) return { card: null, pedido: null };
  let pedido: Linha | null = null;
  if (card.design_request_id) {
    const { data } = await supabaseAdmin.from("design_requests").select(COLS_PEDIDO).eq("id", card.design_request_id as string).maybeSingle();
    pedido = data ?? null;
  }
  if (!pedido) {
    const { data } = await supabaseAdmin.from("design_requests").select(COLS_PEDIDO)
      .eq("content_card_id", cardId).order("created_at", { ascending: false }).limit(5);
    const lista = data ?? [];
    pedido = lista.find((p) => p.status !== "done") ?? lista[0] ?? null;
  }
  return { card, pedido };
}

function paraCardDesign(c: Linha): CardDesign {
  return {
    id: c.id as string,
    status: c.status as CardDesign["status"],
    archivedAt: (c.archived_at as string) ?? null,
    dueDate: (c.due_date as string) ?? null,
    designRequestId: (c.design_request_id as string) ?? null,
    designerDeliveredAt: (c.designer_delivered_at as string) ?? null,
    alteracaoPendenteEm: (c.alteracao_pendente_em as string) ?? null,
    columnEnteredAt: (c.column_entered_at as Record<string, string>) ?? null,
  };
}

function paraPedidoDesign(p: Linha | null): PedidoDesign | null {
  return p ? { id: p.id as string, status: p.status as StatusDoPedido } : null;
}

/**
 * Executa uma transição de design num card: lê, planeja (regra pura), grava pedido e card, registra.
 *
 * Concorrência: a troca de etapa só grava se o card ainda estiver no status que foi lido. Se alguém
 * mexeu no meio (outro social arrastou, o designer entregou), devolve 409 e nada muda — melhor que
 * sobrescrever a mudança do colega.
 */
export async function executarTransicao(cardId: string, acao: AcaoDesign, op: OpcoesTransicao): Promise<ResultadoTransicao> {
  const lido = await lerCardEPedido(cardId);
  if (lido.erro) return { ok: false, status: 500, erro: lido.erro };
  if (!lido.card) return { ok: false, status: 404, erro: "Card não encontrado — ele pode ter sido apagado." };
  const card = lido.card;
  const pedido = lido.pedido;
  const agora = new Date().toISOString();

  const r = planejarTransicao(acao, paraCardDesign(card), paraPedidoDesign(pedido), agora);
  if (!r.ok) return { ok: false, status: r.status, erro: r.erro };
  const { plano } = r;
  if (plano.semEfeito) return { ok: true, card, pedido, semEfeito: true };

  const patchCard: Linha = { ...plano.card };
  let pedidoId = (pedido?.id as string) ?? null;
  let criado = false;
  let designer: EscolhaDesigner | null | undefined;

  // 1) Pedido novo primeiro: o card só muda de etapa com o pedido de pé.
  if (plano.pedido && "criar" in plano.pedido) {
    designer = await designerDaDemanda(card.client_id as string);
    const { data: novo, error } = await supabaseAdmin.from("design_requests").insert({
      title: `Arte: ${card.title as string}`,
      client_id: card.client_id,
      client_name: (card.client_name as string) ?? "",
      assigned_designer: designer?.designer ?? null,
      requested_by: op.quem,
      priority: (card.priority as string) ?? "medium",
      status: "queued",
      format: (card.format as string) || "Post",
      briefing: (op.briefing?.trim() || (card.briefing as string) || (card.observations as string) || `Criar arte para: ${card.title as string}`),
      attachments: [],
      content_card_id: cardId,
      // Prazo da arte = data de postagem. Card sem data (criativo de anúncio, tarefa do designer)
      // não tem prazo aqui — ele vem de quem pediu.
      deadline: (card.due_date as string) ?? null,
    }).select("id").single();
    if (error || !novo) return { ok: false, status: 500, erro: `Não consegui abrir o pedido de arte: ${error?.message ?? "sem id"}` };
    pedidoId = novo.id as string;
    criado = true;
    patchCard.design_request_id = pedidoId;
  } else if (pedidoId && !card.design_request_id && !(plano.pedido && "apagar" in plano.pedido)) {
    // Vínculo reverso faltando (legado): conserta de passagem.
    patchCard.design_request_id = pedidoId;
  }

  // 2) Card — com a trava de concorrência quando a etapa muda.
  if (Object.keys(patchCard).length > 0) {
    let q = supabaseAdmin.from("content_cards").update({ ...patchCard, updated_at: agora }).eq("id", cardId);
    if ("status" in patchCard) q = q.eq("status", card.status as string);
    const { data: gravado, error } = await q.select("id");
    if (error || !gravado?.length) {
      if (criado && pedidoId) await supabaseAdmin.from("design_requests").delete().eq("id", pedidoId);
      return error
        ? { ok: false, status: 500, erro: error.message }
        : { ok: false, status: 409, erro: "Alguém mexeu neste card agora há pouco. Recarreguei — confira e tente de novo." };
    }
  }

  // 3) Pedido existente: muda o status (trava no status lido) ou apaga.
  if (plano.pedido && pedido && !("criar" in plano.pedido)) {
    if ("apagar" in plano.pedido) {
      const { error } = await supabaseAdmin.from("design_requests").delete().eq("id", pedido.id as string);
      if (error) console.error("[producao] cancelar pedido:", error.message);
    } else {
      const { error } = await supabaseAdmin.from("design_requests")
        .update({ status: plano.pedido.status, updated_at: agora })
        .eq("id", pedido.id as string).eq("status", pedido.status as string);
      if (error) console.error("[producao] status do pedido:", error.message);
    }
  }

  // 4) Efeitos que não decidem nada (nunca derrubam a transição).
  if (criado && pedidoId) void gerarBriefingDaArte(cardId, pedidoId);
  if (acao.tipo === "pedir_alteracao" && op.origem === "social") {
    const av = await registrarAvaliacao(cardId, { status: "rejected", reviewedBy: op.quem, reviewedAt: agora, reason: acao.motivo.trim() });
    if (!av.ok) console.error("[producao] avaliação da alteração:", av.erro);
  }

  const depois = await lerCardEPedido(cardId);
  void registrarOperacao(acao, op, cardId, pedidoId, { card: resumo(card), pedido: pedido ? { status: pedido.status } : null },
    { card: depois.card ? resumo(depois.card) : null, pedido: depois.pedido ? { status: depois.pedido.status } : null });
  const cancelou = !!plano.pedido && "apagar" in plano.pedido;
  return {
    ok: true, card: depois.card ?? card, pedido: cancelou ? null : depois.pedido, semEfeito: false, designer,
    pedidoRemovido: cancelou ? ((pedido?.id as string) ?? null) : null,
  };
}

function resumo(c: Linha) {
  return { status: c.status, designer_delivered_at: c.designer_delivered_at, alteracao_pendente_em: c.alteracao_pendente_em, alteracao_motivo: c.alteracao_motivo };
}

async function registrarOperacao(acao: AcaoDesign, op: OpcoesTransicao, cardId: string, pedidoId: string | null, antes: unknown, depois: unknown) {
  const { error } = await supabaseAdmin.from("ops_log").insert({
    operation_id: op.operationId || `design-${randomUUID()}`,
    action: `design:${acao.tipo}`,
    actor: op.quem,
    card_id: cardId,
    design_request_id: pedidoId,
    before: antes,
    after: depois,
  });
  if (error && !/duplicate key/i.test(error.message)) console.error("[producao] ops_log:", error.message);
}

/**
 * O briefing enriquecido (regras visuais do cliente + motivos das reprovações anteriores) entra
 * segundos depois de o pedido nascer. Não bloqueia e não sobrescreve: campo próprio (briefing_ia).
 */
async function gerarBriefingDaArte(cardId: string, pedidoId: string) {
  try {
    const { briefingDesignDoCard } = await import("@/lib/cs/briefing-design-card");
    const texto = await briefingDesignDoCard(cardId);
    if (!texto) return;
    const { error } = await supabaseAdmin.from("design_requests").update({ briefing_ia: texto }).eq("id", pedidoId);
    if (error) console.error("[producao] briefing IA não salvou:", error.message);
  } catch (e) {
    console.error("[producao] briefing IA falhou (ignorado):", e);
  }
}

// ─── Pedido de arte que chega SEM card ───────────────────────────────────────

export interface PedidoSemCard {
  clientId: string;
  clientName?: string | null;
  titulo: string;
  briefing?: string | null;
  formato?: string | null;
  prioridade?: string | null;
  /** Prazo da ARTE (não é data de postagem). */
  prazo?: string | null;
  quem: string;
  /** Quem pediu é do tráfego (criativo de anúncio): o card mostra "Solicitação Tráfego". */
  doTrafego?: boolean;
  attachments?: string[];
  origem?: string | null;
  parentAdId?: string | null;
  variavel?: string | null;
}

export type ResultadoPedidoSemCard =
  | { ok: true; pedidoId: string; cardId: string; card: Linha | null; designer: EscolhaDesigner | null; dedupe?: boolean }
  | { ok: false; status: number; erro: string };

/**
 * Criativo de anúncio, tarefa própria do designer, pedido pela ficha do cliente: pedidos que antes
 * nasciam soltos (61 em produção). Agora nasce o card junto — o pedido é uma etapa do card.
 *
 * O card nasce em "Com o designer" e SEM data de postagem: não é post planejado, então não entra no
 * calendário, no "No ar" pelo Instagram nem na conta de pauta. O prazo da arte fica no pedido.
 * A mesma regra (em SQL) converteu os pedidos soltos antigos — ver a função criar_card_do_pedido
 * na migration 20260924200000_producao_unica.sql, que também é a rede de segurança do banco.
 */
export async function pedirArteSemCard(p: PedidoSemCard): Promise<ResultadoPedidoSemCard> {
  const titulo = p.titulo.trim();
  if (!titulo || !p.clientId) return { ok: false, status: 400, erro: "Cliente e título são obrigatórios." };

  // Duplo clique: mesmo cliente + título + pessoa nos últimos 2 min devolve o que já nasceu.
  const desde = new Date(Date.now() - 2 * 60_000).toISOString();
  const { data: repetido } = await supabaseAdmin.from("design_requests").select("id, content_card_id")
    .eq("client_id", p.clientId).eq("title", titulo).eq("requested_by", p.quem).gte("created_at", desde)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (repetido?.id && repetido.content_card_id) {
    return { ok: true, pedidoId: repetido.id as string, cardId: repetido.content_card_id as string, card: null, designer: null, dedupe: true };
  }

  const [{ data: cli }, designer] = await Promise.all([
    supabaseAdmin.from("clients").select("name, nome_fantasia, assigned_social").eq("id", p.clientId).maybeSingle(),
    designerDaDemanda(p.clientId),
  ]);
  const clienteNome = p.clientName || (cli?.nome_fantasia as string) || (cli?.name as string) || "";
  const agora = new Date().toISOString();
  const status = statusDaEtapa("com_designer");

  const { data: card, error: erroCard } = await supabaseAdmin.from("content_cards").insert({
    title: titulo.replace(/^arte:\s*/i, "").slice(0, 200) || titulo,
    client_id: p.clientId,
    client_name: clienteNome,
    social_media: (cli?.assigned_social as string) || null,
    status,
    priority: p.prioridade || "medium",
    format: p.formato || "",
    briefing: p.briefing ?? null,
    requested_by_traffic: p.doTrafego ? p.quem : null,
    status_changed_at: agora,
    column_entered_at: { [status]: agora },
  }).select("id").single();
  if (erroCard || !card) return { ok: false, status: 500, erro: `Não consegui criar o card do pedido: ${erroCard?.message ?? "sem id"}` };
  const cardId = card.id as string;

  const { data: pedido, error } = await supabaseAdmin.from("design_requests").insert({
    title: titulo,
    client_id: p.clientId,
    client_name: clienteNome,
    assigned_designer: designer?.designer ?? null,
    requested_by: p.quem,
    priority: p.prioridade || "medium",
    status: "queued",
    format: p.formato || null,
    briefing: p.briefing ?? null,
    attachments: p.attachments ?? [],
    content_card_id: cardId,
    deadline: p.prazo || null,
    ...(p.origem ? { origem: p.origem } : {}),
    ...(p.parentAdId ? { parent_ad_id: p.parentAdId } : {}),
    ...(p.variavel ? { variavel: p.variavel } : {}),
  }).select("id").single();
  if (error || !pedido) {
    // Sem pedido o card não tem razão de existir: arquiva (não apaga — o histórico fica).
    await supabaseAdmin.from("content_cards").update({ archived_at: agora }).eq("id", cardId);
    return { ok: false, status: 500, erro: `Não consegui abrir o pedido de arte: ${error?.message ?? "sem id"}` };
  }
  await supabaseAdmin.from("content_cards").update({ design_request_id: pedido.id }).eq("id", cardId);
  void gerarBriefingDaArte(cardId, pedido.id as string);

  const { data: linha } = await supabaseAdmin.from("content_cards").select("*").eq("id", cardId).maybeSingle();
  return { ok: true, pedidoId: pedido.id as string, cardId, card: linha ?? null, designer };
}

// ─── Dono do pedido (para a regra de permissão do designer) ──────────────────

export async function contextoDoPedido(pedidoId: string): Promise<{ clientId: string; assignedDesigner: string | null; clienteDesigner: string | null; anexosAtuais: string[] } | null> {
  const { data: dr } = await supabaseAdmin.from("design_requests").select("client_id, assigned_designer, attachments").eq("id", pedidoId).maybeSingle();
  if (!dr) return null;
  const { data: cli } = await supabaseAdmin.from("clients").select("assigned_designer").eq("id", dr.client_id as string).maybeSingle();
  return {
    clientId: dr.client_id as string,
    assignedDesigner: (dr.assigned_designer as string) ?? null,
    clienteDesigner: (cli?.assigned_designer as string) ?? null,
    anexosAtuais: (dr.attachments as string[]) ?? [],
  };
}

/** Nome do membro do time pelo e-mail (quem assina a transição). */
export async function nomeDoMembro(email: string | null | undefined): Promise<string | null> {
  const e = (email ?? "").toLowerCase();
  if (!e) return null;
  const { data } = await supabaseAdmin.from("team_members").select("name").eq("email", e).maybeSingle();
  return (data?.name as string) ?? null;
}
