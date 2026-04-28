export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";

/**
 * POST /api/content-cards/delete
 * Body: { id: string }
 *
 * Deleta um content_card. Auth via session (Supabase real ou LocalSession).
 * Bypassa RLS via service_role — confiando na confirmação UI (DeleteConfirmModal).
 */
export async function POST(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Sessão inválida" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const id = (body as { id?: string }).id;
  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "id obrigatório" }, { status: 400 });
  }

  try {
    const { error } = await supabaseAdmin.from("content_cards").delete().eq("id", id);
    if (error) {
      console.error("[content-cards/delete] error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true, deletedBy: user.email });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("[content-cards/delete] unhandled:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
