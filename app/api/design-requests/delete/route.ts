export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireRole, GESTAO } from "@/lib/api/require-role";

/** POST /api/design-requests/delete — Body: { id: string }. Só gestão: apagar some com o histórico. */
export async function POST(req: NextRequest) {
  const gate = await requireRole(req, GESTAO);
  if (gate instanceof NextResponse) return gate;
  const user = gate.user;

  const body = await req.json().catch(() => ({}));
  const id = (body as { id?: string }).id;
  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "id obrigatório" }, { status: 400 });
  }

  try {
    const { error } = await supabaseAdmin.from("design_requests").delete().eq("id", id);
    if (error) {
      console.error("[design-requests/delete] error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true, deletedBy: user.email });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("[design-requests/delete] unhandled:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
