export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";

/**
 * GET /api/cards/[id]/attachments
 *
 * Lista os attachments de um content_card, ordenados por position (ASC).
 * Retorna [] para cards sem attachments (cards legados com image_url usam
 * o campo imageUrl do próprio card como fallback — responsabilidade do frontend).
 *
 * Auth: qualquer usuário autenticado. Sem auth → 401.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getServerUser(req);
  if (!user) {
    return NextResponse.json({ error: "Sessão inválida ou ausente" }, { status: 401 });
  }

  const { id: cardId } = await params;

  const { data, error } = await supabaseAdmin
    .from("card_attachments")
    .select("id, card_id, url, path, position, created_at")
    .eq("card_id", cardId)
    .order("position", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ attachments: data ?? [] });
}
