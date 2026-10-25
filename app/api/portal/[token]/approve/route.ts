export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { aplicarAjusteNoCard } from "@/lib/cs/card";
import { estaPausado } from "@/lib/clients/pausa";
import { criarLimite } from "@/lib/portal/limite";
import { FRASE_SEM_ALTERACAO, motivoSemAlteracao } from "@/lib/portal/agenda";
import { lerCardEPedido } from "@/lib/conteudo/producao-server";
import {
  COLUNAS_DA_FOTO, JANELA_DESFAZER_AJUSTE_MS, fotografar, planoDesfazerAjuste, podeDesfazerAjuste, resumoDepois,
  type AntesDoAjuste, type DepoisDoAjuste, type PedidoResumo,
} from "@/lib/portal/desfazer-ajuste";

// POST /api/portal/[token]/approve — o CLIENTE aprova (ou pede ajuste em) uma arte entregue, pelo
// próprio link do portal. Valida token + que o card é DELE. Aprovar → client_approved_at + notifica o
// time. Ajuste → salva o comentário + notifica. Público via token; rate-limit por token.
//
// APROVAR ESTÁ DESLIGADO; PEDIR AJUSTE CONTINUA. Roberto (31/08), decidindo o escopo do portal: o
// cliente pode MANDAR material pelo painel, mas "o cliente aprovar pelo painel ainda não". Os dois
// botões existiam no portal desde julho — anteriores à decisão — e o de aprovar estava no ar.
//
// A separação é o que ele disse, ao pé da letra: aprovação é o cliente dando o aceite final, e isso
// volta a ser conversa com o time. Pedir ajuste é o cliente dizendo o que quer mudar, que é
// feedback chegando por escrito e preso ao card — sem isso ele volta pro áudio no grupo.
// Para religar a aprovação quando ele quiser: PORTAL_APROVACAO_CLIENTE=on.
//
// PEDIR AJUSTE TEM DESFAZER (25/10/2026, onda 6 da auditoria de erro recuperável, 12.5). O ajuste age na
// hora (a arte sai da agenda e volta ao designer); um clique no card errado desagendava o post sem volta.
// Agora o card é fotografado antes (ops_log "portal:ajuste") e `action: "desfazer_ajuste"` volta tudo em
// até 10 minutos, se ninguém mexeu na arte depois (lib/portal/desfazer-ajuste.ts).

const APROVACAO_LIGADA = process.env.PORTAL_APROVACAO_CLIENTE === "on";

const LIMITE = criarLimite(20, 60_000); // até 20 ações/min por cliente

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const { data: client } = await supabaseAdmin
    .from("clients").select("id, name, nome_fantasia, public_report_enabled, public_report_token_revoked_at, active, churned_at, paused_at, paused_until")
    .eq("public_report_token", token).single();
  // Ex-cliente (inativo/arquivado) não acessa mais o portal — ver app/portal/[token]/page.tsx.
  if (!client || !client.public_report_enabled || client.public_report_token_revoked_at || client.active === false || client.churned_at || estaPausado(client)) {
    return NextResponse.json({ error: "Link inválido ou expirado" }, { status: 404 });
  }
  if (LIMITE.estourou(client.id as string)) return NextResponse.json({ error: "Muitas ações. Aguarde 1 minuto." }, { status: 429 });

  const body = (await req.json().catch(() => ({}))) as { cardId?: string; action?: string; comment?: string; desfazerId?: string };
  const cardId = (body.cardId || "").trim();
  const action = body.action === "ajuste" ? "ajuste" : body.action === "desfazer_ajuste" ? "desfazer_ajuste" : "approve";
  // O aceite final do cliente volta a ser conversa com o time — decisão do Roberto em 31/08.
  if (action === "approve" && !APROVACAO_LIGADA) {
    return NextResponse.json(
      { error: "A aprovação é feita com o time. Se precisar de ajuste, escreva aqui que a gente cuida." },
      { status: 403 });
  }
  const comment = (body.comment || "").trim().slice(0, 500);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cardId)) {
    return NextResponse.json({ error: "Card inválido" }, { status: 400 });
  }
  if (action === "ajuste" && !comment) {
    return NextResponse.json({ error: "Diga o que ajustar." }, { status: 422 });
  }

  // O card TEM que ser deste cliente (não dá pra aprovar arte de outro).
  const { data: card } = await supabaseAdmin
    .from("content_cards").select("id, title, status, archived_at, designer_delivered_at, client_approved_at")
    .eq("id", cardId).eq("client_id", client.id as string).maybeSingle();
  if (!card) return NextResponse.json({ error: "Arte não encontrada" }, { status: 404 });
  if (action === "approve" && !card.designer_delivered_at) return NextResponse.json({ error: "Essa arte ainda não foi entregue." }, { status: 409 });
  // N35: o pedido de alteração vale para arte entregue, aprovada ou agendada — não só para a que
  // espera aprovação. Post no ar, card encerrado e arte ainda em produção têm a frase certa.
  const semAlteracao = action === "ajuste" ? motivoSemAlteracao(card) : null;
  if (semAlteracao) return NextResponse.json({ error: FRASE_SEM_ALTERACAO[semAlteracao] }, { status: 409 });

  const nome = (client.nome_fantasia as string) || (client.name as string) || "Cliente";
  const titulo = (card.title as string) || "arte";

  if (action === "desfazer_ajuste") return desfazerAjuste({ cardId, desfazerId: (body.desfazerId || "").trim(), clientId: client.id as string, nome, titulo });

  if (action === "approve") {
    // Atômico: só marca (e notifica) se ainda NÃO estava aprovada — evita duplo aviso no clique repetido.
    const { data: upd } = await supabaseAdmin.from("content_cards")
      .update({ client_approved_at: new Date().toISOString() })
      .eq("id", cardId).is("client_approved_at", null).select("id");
    if (upd && upd.length > 0) {
      await supabaseAdmin.from("notifications").insert({
        type: "content", title: `🎉 ${nome} aprovou a arte`,
        body: `"${titulo}" — o cliente aprovou pelo portal. Já pode agendar/postar.`,
        client_id: client.id as string,
      }).then(() => {}, () => {});
    }
    return NextResponse.json({ ok: true, action: "approve" });
  }

  // AJUSTE — antes isto só inseria um comentário e uma notificação: o card continuava marcado como
  // "entregue", a demanda do designer seguia "concluída" e a vigilância PARAVA de cobrar (ela usa
  // designer_delivered_at). O pedido do cliente morria ali. Agora usa exatamente o mesmo caminho do
  // WhatsApp: volta pro designer, reabre a demanda e registra o motivo no briefing.
  // Foto do card ANTES do pedido — é o que o "Desfazer" põe de volta. Sem conseguir fotografar, o pedido
  // segue (o pedido do cliente vale mais), só sem o Desfazer.
  const antes = await fotoAtual(cardId);
  const ok = await aplicarAjusteNoCard({
    cardId, correcao: comment, clientId: client.id as string, clienteNome: nome, canal: "portal",
  });
  await supabaseAdmin.from("card_comments").insert({
    card_id: cardId, author: nome, role: "client", text: `(pelo portal) ${comment}`,
  }).then(() => {}, () => {});
  if (!ok) {
    // Card sumiu/arquivado: pelo menos avisa o time, pra não engolir o pedido do cliente.
    await supabaseAdmin.from("notifications").insert({
      type: "content", title: `✏️ ${nome} pediu ajuste`,
      body: `"${titulo}": ${comment}`,
      client_id: client.id as string,
    }).then(() => {}, () => {});
    return NextResponse.json({ ok: true, action: "ajuste", desfazer: null });
  }

  let desfazer: { id: string; ate: string } | null = null;
  const depoisFoto = antes ? await fotoAtual(cardId) : null;
  if (antes && depoisFoto) {
    const desfazerId = randomUUID();
    const depois: DepoisDoAjuste = resumoDepois(depoisFoto.card as Record<string, unknown>, antes.pedido, depoisFoto.pedido);
    const { error } = await supabaseAdmin.from("ops_log").insert({
      operation_id: desfazerId, action: "portal:ajuste", actor: `${nome} (cliente)`,
      card_id: cardId, design_request_id: depois.pedido?.id ?? null,
      before: antes, after: depois,
    });
    if (error) console.error("[portal/approve] foto do ajuste não gravada (sem Desfazer):", error.message);
    else desfazer = { id: desfazerId, ate: new Date(Date.now() + JANELA_DESFAZER_AJUSTE_MS).toISOString() };
  }
  return NextResponse.json({ ok: true, action: "ajuste", desfazer });
}

/** O card (só os campos da foto) e o pedido de arte ligado a ele, agora. null = não consegui ler. */
async function fotoAtual(cardId: string): Promise<AntesDoAjuste | null> {
  const { data: card, error } = await supabaseAdmin.from("content_cards").select(COLUNAS_DA_FOTO).eq("id", cardId).maybeSingle();
  if (error || !card) return null;
  const lido = await lerCardEPedido(cardId);
  if (lido.erro) return null;
  const pedido: PedidoResumo | null = lido.pedido ? { id: lido.pedido.id as string, status: lido.pedido.status as string } : null;
  return { card: fotografar(card as unknown as Record<string, unknown>), pedido };
}

/**
 * Desfaz o "Pedir alteração" feito pelo portal há menos de 10 minutos, se ninguém mexeu na arte depois.
 * Idempotente: o segundo clique responde "já desfeito".
 */
async function desfazerAjuste(p: { cardId: string; desfazerId: string; clientId: string; nome: string; titulo: string }) {
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID.test(p.desfazerId)) return NextResponse.json({ error: "Esse pedido não pode mais ser desfeito por aqui." }, { status: 400 });

  const { data: registros, error: eReg } = await supabaseAdmin.from("ops_log")
    .select("action, before, after, created_at")
    .eq("operation_id", p.desfazerId).eq("card_id", p.cardId)
    .in("action", ["portal:ajuste", "portal:desfazer_ajuste"]);
  if (eReg) return NextResponse.json({ error: "Não consegui desfazer agora. Tente de novo em instantes." }, { status: 503 });
  if ((registros ?? []).some((r) => r.action === "portal:desfazer_ajuste")) return NextResponse.json({ ok: true, action: "desfazer_ajuste", jaDesfeito: true });
  const reg = (registros ?? []).find((r) => r.action === "portal:ajuste");
  if (!reg) return NextResponse.json({ error: "Esse pedido não pode mais ser desfeito por aqui. Fale com a gente no WhatsApp." }, { status: 404 });

  const antes = reg.before as AntesDoAjuste;
  const depois = reg.after as DepoisDoAjuste;
  const { data: cardAgora, error: eCard } = await supabaseAdmin.from("content_cards").select(COLUNAS_DA_FOTO).eq("id", p.cardId).maybeSingle();
  if (eCard || !cardAgora) return NextResponse.json({ error: "Não consegui desfazer agora. Tente de novo em instantes." }, { status: 503 });
  const lido = await lerCardEPedido(p.cardId);
  if (lido.erro) return NextResponse.json({ error: "Não consegui desfazer agora. Tente de novo em instantes." }, { status: 503 });
  const pedidoAgora = lido.pedido ? { id: lido.pedido.id as string, status: lido.pedido.status as string } : null;
  const agoraCard = cardAgora as unknown as Record<string, unknown>;

  const pode = podeDesfazerAjuste({ em: reg.created_at as string, depois, cardAgora: agoraCard, pedidoAgora, agora: Date.now() });
  if (!pode.ok) return NextResponse.json({ error: pode.frase }, { status: 409 });

  const plano = planoDesfazerAjuste(antes, depois, agoraCard, pedidoAgora);
  // Trava: só grava se o card ainda está como o pedido deixou (alguém do time pode ter mexido no meio).
  let q = supabaseAdmin.from("content_cards").update({ ...plano.card, updated_at: new Date().toISOString() }).eq("id", p.cardId);
  q = depois.status === null ? q.is("status", null) : q.eq("status", depois.status);
  q = depois.alteracao_pendente_em === null ? q.is("alteracao_pendente_em", null) : q.eq("alteracao_pendente_em", depois.alteracao_pendente_em);
  const { data: gravado, error: eUpd } = await q.select("id");
  if (eUpd) return NextResponse.json({ error: "Não consegui desfazer agora. Tente de novo em instantes." }, { status: 500 });
  if (!gravado?.length) return NextResponse.json({ error: "A arte já andou no time depois do seu pedido. Fale com a gente no WhatsApp que a gente ajusta." }, { status: 409 });

  if (plano.pedido && "apagar" in plano.pedido) {
    // Só o pedido que nasceu no ajuste e ainda está na fila (o designer não começou).
    const { error } = await supabaseAdmin.from("design_requests").delete().eq("id", plano.pedido.apagar).eq("status", "queued");
    if (error) console.error("[portal/approve] desfazer: pedido de arte não apagado:", error.message);
  } else if (plano.pedido) {
    const { error } = await supabaseAdmin.from("design_requests").update({ status: plano.pedido.status, updated_at: new Date().toISOString() })
      .eq("id", plano.pedido.id).eq("status", pedidoAgora?.status ?? "");
    if (error) console.error("[portal/approve] desfazer: status do pedido não voltou:", error.message);
  }

  await supabaseAdmin.from("ops_log").insert({
    operation_id: p.desfazerId, action: "portal:desfazer_ajuste", actor: `${p.nome} (cliente)`, card_id: p.cardId,
    before: { status: agoraCard.status ?? null }, after: { status: plano.card.status ?? null },
  }).then(() => {}, () => {});
  await supabaseAdmin.from("card_comments").insert({
    card_id: p.cardId, author: "Portal do cliente", role: "system",
    text: "↩️ O cliente desfez o pedido de alteração pelo portal. A arte voltou para onde estava.",
  }).then(() => {}, () => {});
  await supabaseAdmin.from("notifications").insert({
    type: "content", title: `↩️ ${p.nome} desfez o pedido de ajuste`,
    body: `"${p.titulo}": o cliente cancelou o pedido de alteração pelo portal. A arte voltou para onde estava — não precisa refazer.`,
    client_id: p.clientId, card_id: p.cardId,
  }).then(() => {}, () => {});

  return NextResponse.json({ ok: true, action: "desfazer_ajuste" });
}
