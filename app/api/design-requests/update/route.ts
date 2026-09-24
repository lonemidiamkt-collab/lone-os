export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireRole, GESTAO } from "@/lib/api/require-role";
import { snakeToContentCard, snakeToDesignRequest } from "@/lib/supabase/queries";
import { executarTransicao } from "@/lib/conteudo/producao-server";
import type { AcaoDesign } from "@/lib/conteudo/producao";
import { podeAtualizarDemanda } from "../permissao";

/**
 * POST /api/design-requests/update — campos do PEDIDO de arte (briefing, prazo, anexos, comentário do
 * designer, quem assumiu). O STATUS não se grava mais aqui: é etapa do card (Leva 5b) e passa pela
 * transição de design (lib/conteudo/producao-server.ts):
 *   queued → in_progress  = "iniciar"
 *   → done                = "entregue" (a entrega com arquivos vai por /api/ops/entregar-arte)
 * Reabrir um pedido entregue é "pedir alteração", no card.
 */
export async function POST(req: NextRequest) {
  const gate = await requireRole(req, [...GESTAO, "social", "designer"]);
  if (gate instanceof NextResponse) return gate;

  const body = await req.json().catch(() => null);
  if (!body?.id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  const { id, ...updates } = body as Record<string, unknown>;
  const row: Record<string, unknown> = {};
  if (updates.priority !== undefined) row.priority = updates.priority;
  if (updates.briefing !== undefined) row.briefing = updates.briefing;
  if (updates.format !== undefined) row.format = updates.format;
  if (updates.deadline !== undefined) row.deadline = updates.deadline;
  if (updates.attachments !== undefined) row.attachments = updates.attachments;
  if (updates.designerNote !== undefined) row.designer_note = updates.designerNote;
  // "Assumir demanda": string vazia devolve à carteira do cliente (NULL), não grava "" — vazio no
  // banco faria a regra de dono achar que alguém assumiu e não achar quem.
  if (updates.assignedDesigner !== undefined) {
    const nome = String(updates.assignedDesigner ?? "").trim();
    row.assigned_designer = nome || null;
  }
  const novoStatus = typeof updates.status === "string" ? updates.status : null;

  if (Object.keys(row).length === 0 && !novoStatus) return NextResponse.json({ success: true });

  try {
    const { data: dr, error: erroDr } = await supabaseAdmin.from("design_requests")
      .select("client_id, assigned_designer, attachments, status, content_card_id").eq("id", id as string).maybeSingle();
    if (erroDr) return NextResponse.json({ error: erroDr.message }, { status: 500 });
    if (!dr) return NextResponse.json({ error: "Demanda não encontrada." }, { status: 404 });

    const [{ data: cli }, { data: membro }] = await Promise.all([
      supabaseAdmin.from("clients").select("assigned_designer").eq("id", dr.client_id as string).maybeSingle(),
      supabaseAdmin.from("team_members").select("name").eq("email", (gate.user.email || "").toLowerCase()).maybeSingle(),
    ]);
    const quem = (membro?.name as string) ?? "";
    const decisao = podeAtualizarDemanda(gate.papel, quem, {
      clientId: dr.client_id as string,
      assignedDesigner: (dr.assigned_designer as string) ?? null,
      clienteDesigner: (cli?.assigned_designer as string) ?? null,
      anexosAtuais: (dr.attachments as string[]) ?? [],
    }, updates);
    if (!decisao.ok) return NextResponse.json({ error: decisao.erro }, { status: decisao.status });

    if (Object.keys(row).length > 0) {
      const { error } = await supabaseAdmin.from("design_requests").update(row).eq("id", id as string);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Status: vira transição do card. Sem mudança real, nada a fazer.
    if (novoStatus && novoStatus !== dr.status) {
      const acao: AcaoDesign | null = novoStatus === "in_progress" && dr.status === "queued" ? { tipo: "iniciar" }
        : novoStatus === "done" ? { tipo: "entregue", quem: quem || null }
        : null;
      if (!acao) {
        return NextResponse.json({ error: "Para reabrir um pedido entregue, use \"Pedir alteração\" no card." }, { status: 409 });
      }
      const cardId = dr.content_card_id as string | null;
      if (!cardId) return NextResponse.json({ error: "Pedido sem card — rode a migration da produção única." }, { status: 409 });
      const r = await executarTransicao(cardId, acao, { quem: quem || gate.user.email || "equipe" });
      if (!r.ok) return NextResponse.json({ error: r.erro }, { status: r.status });
      const [{ data: card }, { data: pedido }] = await Promise.all([
        supabaseAdmin.from("content_cards").select("*").eq("id", cardId).maybeSingle(),
        supabaseAdmin.from("design_requests").select("*").eq("id", id as string).maybeSingle(),
      ]);
      return NextResponse.json({
        success: true,
        card: card ? snakeToContentCard(card) : null,
        pedido: pedido ? snakeToDesignRequest(pedido) : null,
      });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
