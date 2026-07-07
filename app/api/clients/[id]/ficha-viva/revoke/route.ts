// app/api/clients/[id]/ficha-viva/revoke/route.ts — revoga o link da Ficha Viva. Admin apenas.
// Marca revoked_at + enabled=false (o link para de funcionar). Não apaga o histórico.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Sessão inválida" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const { id: clientId } = await params;

  const { error } = await supabaseAdmin
    .from("clients")
    .update({ ficha_viva_token_revoked_at: new Date().toISOString(), ficha_viva_enabled: false })
    .eq("id", clientId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
