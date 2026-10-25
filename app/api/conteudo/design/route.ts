export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/conteudo/design — a etapa de design do card (Leva 5b).
// { cardId, acao: { tipo: "pedir_arte" | "iniciar" | "pedir_alteracao" | "bloquear" | "desbloquear" | "cancelar_pedido", motivo? }, briefing?, operationId? }
//
// Um caminho só para o que antes eram vários: o quadro de produção (Social e Designer) e o card
// chamam isto. A regra está em lib/conteudo/producao.ts; quem grava, em lib/conteudo/producao-server.ts.
// A ENTREGA com arquivos continua em /api/ops/entregar-arte (a transação dos anexos) — que chama a
// mesma transição no fim.
// Devolve o card e o pedido como ficaram, no formato do store.

import { NextRequest, NextResponse } from "next/server";
import { requireRole, GESTAO } from "@/lib/api/require-role";
import { supabaseAdmin } from "@/lib/supabase/server";
import { snakeToContentCard, snakeToDesignRequest } from "@/lib/supabase/queries";
import { lerAcao, papelPode, podeCancelarPedido, type StatusDoPedido } from "@/lib/conteudo/producao";
import { executarTransicao, lerCardEPedido, contextoDoPedido, nomeDoMembro } from "@/lib/conteudo/producao-server";
import { podeAtualizarDemanda } from "@/app/api/design-requests/permissao";

export async function POST(req: NextRequest) {
  const gate = await requireRole(req, [...GESTAO, "social", "designer", "traffic"]);
  if (gate instanceof NextResponse) return gate;

  const body = await req.json().catch(() => null) as { cardId?: string; acao?: unknown; briefing?: string; operationId?: string } | null;
  const cardId = (body?.cardId ?? "").trim();
  const acao = lerAcao(body?.acao);
  if (!cardId || !acao) return NextResponse.json({ error: "cardId e acao são obrigatórios." }, { status: 400 });
  if (acao.tipo === "entregue") {
    return NextResponse.json({ error: "A entrega vai pelo \"Entregar arte\" (anexos)." }, { status: 400 });
  }
  if (!papelPode(gate.papel, acao.tipo)) {
    return NextResponse.json({ error: "Seu perfil não faz esta ação na arte." }, { status: 403 });
  }

  const quem = (await nomeDoMembro(gate.user.email)) || gate.user.email || "equipe";

  // Cancelar (24/10/2026, 2.6): quem pediu desfaz o pedido enquanto ele está NA FILA; depois que o
  // designer começou, só a gestão. A regra é podeCancelarPedido (lib/conteudo/producao.ts).
  if (acao.tipo === "cancelar_pedido" && !(gate.papel && GESTAO.includes(gate.papel))) {
    const { pedido } = await lerCardEPedido(cardId);
    const pode = podeCancelarPedido(gate.papel, pedido ? { id: pedido.id as string, status: pedido.status as StatusDoPedido } : null);
    if (!pode.ok) return NextResponse.json({ error: pode.motivo }, { status: 409 });
  }

  // Designer só inicia o pedido que é dele (ou que assumiu) — a mesma regra do /design-requests/update.
  if (acao.tipo === "iniciar" && gate.papel === "designer") {
    const { pedido } = await lerCardEPedido(cardId);
    const ctx = pedido ? await contextoDoPedido(pedido.id as string) : null;
    if (ctx) {
      const d = podeAtualizarDemanda(gate.papel, quem, ctx, { status: "in_progress" });
      if (!d.ok) return NextResponse.json({ error: d.erro }, { status: d.status });
    }
  }

  const r = await executarTransicao(cardId, acao.tipo === "bloquear" ? { ...acao, quem } : acao, {
    quem,
    briefing: body?.briefing ?? null,
    origem: acao.tipo === "pedir_alteracao" ? "social" : undefined,
    operationId: body?.operationId ?? null,
  });
  if (!r.ok) return NextResponse.json({ error: r.erro }, { status: r.status });

  const [{ data: card }, pedido] = await Promise.all([
    supabaseAdmin.from("content_cards").select("*").eq("id", cardId).maybeSingle(),
    r.pedido?.id ? supabaseAdmin.from("design_requests").select("*").eq("id", r.pedido.id as string).maybeSingle().then((x) => x.data) : Promise.resolve(null),
  ]);

  // Pedido sem dono (24/10/2026, 2.12): nem o pedido nem a ficha do cliente têm designer. A tela
  // dizia "foi pro designer" e o pedido ficava no quadro "(sem designer)", que ninguém abre.
  let semDesigner = false;
  if (acao.tipo === "pedir_arte" && pedido && pedido.status !== "done" && !String(pedido.assigned_designer ?? "").trim()) {
    const { data: cli } = await supabaseAdmin.from("clients").select("assigned_designer").eq("id", pedido.client_id as string).maybeSingle();
    semDesigner = !String(cli?.assigned_designer ?? "").trim();
  }

  return NextResponse.json({
    card: card ? snakeToContentCard(card) : null,
    pedido: pedido ? snakeToDesignRequest(pedido) : null,
    pedidoRemovido: r.pedidoRemovido ?? null,
    semEfeito: r.semEfeito,
    designer: r.designer?.designer ?? ((pedido?.assigned_designer as string) || null),
    atribuicao: r.designer?.motivo ?? null,
    semDesigner,
    pedidoCriado: r.pedidoCriado ?? false,
  });
}
