export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole, GESTAO } from "@/lib/api/require-role";
import { supabaseAdmin } from "@/lib/supabase/server";
import { snakeToContentCard, snakeToDesignRequest } from "@/lib/supabase/queries";
import { executarTransicao, pedirArteSemCard, nomeDoMembro } from "@/lib/conteudo/producao-server";

/**
 * POST /api/design-requests/create — "Pedir arte".
 *
 * Leva 5b: o pedido de arte é uma ETAPA do card, não um registro solto. Duas entradas, um dono
 * (lib/conteudo/producao-server.ts):
 *   · com `contentCardId` → transição "pedir_arte" no card (card vai pra "Com o designer"; o pedido
 *     nasce na fila, ou o aberto é devolvido — o clique repetido não abre outro);
 *   · sem card (criativo do tráfego, ficha do cliente, tarefa do próprio designer) → nasce o card
 *     junto, em "Com o designer", sem data de postagem.
 * Devolve { id, cardId, card, pedido, designer, atribuicao, semDesigner, dedupe? }.
 */
export async function POST(req: NextRequest) {
  const gate = await requireRole(req, [...GESTAO, "social", "designer", "traffic"]);
  if (gate instanceof NextResponse) return gate;

  const body = await req.json().catch(() => null);
  if (!body || !body.clientId || !body.title) {
    return NextResponse.json({ error: "clientId e title são obrigatórios" }, { status: 400 });
  }

  try {
    const quem = String(body.requestedBy || (await nomeDoMembro(gate.user.email)) || gate.user.email || "equipe");

    if (body.contentCardId) {
      const r = await executarTransicao(String(body.contentCardId), { tipo: "pedir_arte" }, { quem, briefing: body.briefing ?? null });
      if (!r.ok) return NextResponse.json({ error: r.erro }, { status: r.status });
      const pedidoId = (r.pedido?.id as string) ?? null;
      if (!pedidoId) return NextResponse.json({ error: "O pedido de arte não foi aberto." }, { status: 500 });
      return NextResponse.json(await resposta(pedidoId, String(body.contentCardId), {
        designer: r.designer?.designer ?? (r.pedido?.assigned_designer as string) ?? null,
        atribuicao: r.designer?.motivo ?? null,
        semDesigner: r.designer === null,
        dedupe: r.semEfeito,
      }));
    }

    const r = await pedirArteSemCard({
      clientId: String(body.clientId),
      clientName: body.clientName ?? null,
      titulo: String(body.title),
      briefing: body.briefing ?? null,
      formato: body.format ?? null,
      prioridade: body.priority ?? null,
      prazo: body.deadline ?? null,
      quem,
      doTrafego: gate.papel === "traffic",
      attachments: Array.isArray(body.attachments) ? body.attachments : [],
    });
    if (!r.ok) return NextResponse.json({ error: r.erro }, { status: r.status });
    return NextResponse.json(await resposta(r.pedidoId, r.cardId, {
      designer: r.designer?.designer ?? null,
      atribuicao: r.designer?.motivo ?? null,
      semDesigner: !r.dedupe && !r.designer,
      dedupe: !!r.dedupe,
    }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("[design-requests/create] unhandled:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

async function resposta(pedidoId: string, cardId: string, extra: { designer: string | null; atribuicao: string | null; semDesigner: boolean; dedupe: boolean }) {
  const [{ data: card }, { data: pedido }] = await Promise.all([
    supabaseAdmin.from("content_cards").select("*").eq("id", cardId).maybeSingle(),
    supabaseAdmin.from("design_requests").select("*").eq("id", pedidoId).maybeSingle(),
  ]);
  return {
    id: pedidoId,
    cardId,
    card: card ? snakeToContentCard(card) : null,
    pedido: pedido ? snakeToDesignRequest(pedido) : null,
    ...extra,
  };
}
