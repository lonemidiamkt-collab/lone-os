export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";

/** POST /api/design-requests/delete — Body: { id: string } */
export async function POST(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Sessão inválida" }, { status: 401 });

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
