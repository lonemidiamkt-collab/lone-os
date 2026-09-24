export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireRole, type Papel } from "@/lib/api/require-role";

// POST /api/materiais/uso — o time diz em que post um material enviado pelo cliente foi usado (N37).
// Corpo: { uploadId, cardId | null }. null desfaz a ligação.
//
// É a ligação que o portal mostra em "Seus envios" ("usado em: Promoção de sábado · No ar"). O card
// TEM que ser do mesmo cliente do material — senão o portal mostraria post de outro cliente.
// Precisa da migration 20260926120000_gestao_portal.sql (coluna client_uploads.card_id).

const QUEM: Papel[] = ["admin", "manager", "social", "designer"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  const gate = await requireRole(req, QUEM);
  if (gate instanceof NextResponse) return gate;

  const body = (await req.json().catch(() => ({}))) as { uploadId?: string; cardId?: string | null };
  const uploadId = (body.uploadId ?? "").trim();
  const cardId = body.cardId == null || body.cardId === "" ? null : String(body.cardId).trim();
  if (!UUID.test(uploadId) || (cardId !== null && !UUID.test(cardId))) {
    return NextResponse.json({ error: "Material ou card inválido." }, { status: 400 });
  }

  const { data: up } = await supabaseAdmin.from("client_uploads").select("id, client_id").eq("id", uploadId).maybeSingle();
  if (!up) return NextResponse.json({ error: "Material não encontrado." }, { status: 404 });
  if (cardId) {
    const { data: card } = await supabaseAdmin.from("content_cards").select("id")
      .eq("id", cardId).eq("client_id", up.client_id as string).maybeSingle();
    if (!card) return NextResponse.json({ error: "Esse card não é do mesmo cliente do material." }, { status: 409 });
  }

  const { error } = await supabaseAdmin.from("client_uploads")
    .update({ card_id: cardId, usado_em: cardId ? new Date().toISOString() : null })
    .eq("id", uploadId);
  if (error) {
    const semColuna = /card_id|usado_em|column/i.test(error.message);
    return NextResponse.json(
      { error: semColuna ? "Falta aplicar a migration 20260926120000_gestao_portal.sql." : error.message },
      { status: semColuna ? 503 : 500 });
  }
  return NextResponse.json({ ok: true });
}
