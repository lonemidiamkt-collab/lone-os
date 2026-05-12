export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";

const BASE_URL = process.env.PUBLIC_REPORT_DOMAIN ?? "https://painel.lonemidia.com";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Sessão inválida" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const { id } = await params;
  const newToken = crypto.randomUUID();

  // Revoga o token atual e emite um novo atomicamente
  const { error } = await supabaseAdmin
    .from("clients")
    .update({
      public_report_token: newToken,
      public_report_token_created_at: new Date().toISOString(),
      public_report_token_revoked_at: null,
      public_report_enabled: true,
    })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const fullUrl = `${BASE_URL}/relatorio/${newToken}`;
  return NextResponse.json({ success: true, token: newToken, full_url: fullUrl });
}
