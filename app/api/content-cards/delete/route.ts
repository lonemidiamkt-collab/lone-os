export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireRole, GESTAO } from "@/lib/api/require-role";

/**
 * POST /api/content-cards/delete
 * Body: { id: string }
 *
 * "Excluir" ARQUIVA (archived_at) — não apaga mais. Designer conseguia apagar card de vez e o
 * briefing/comentários/artes sumiam sem volta. Recuperável em "Arquivadas".
 */
export async function POST(req: NextRequest) {
  const gate = await requireRole(req, [...GESTAO, "social"]);
  if (gate instanceof NextResponse) return gate;

  const body = await req.json().catch(() => ({}));
  const id = (body as { id?: string }).id;
  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "id obrigatório" }, { status: 400 });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("content_cards")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", id)
      .is("archived_at", null)
      .select("id");
    if (error) {
      console.error("[content-cards/delete] error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true, archived: true, jaArquivado: !data?.length, archivedBy: gate.user.email });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("[content-cards/delete] unhandled:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
