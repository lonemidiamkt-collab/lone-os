export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";

const BASE_URL = process.env.PUBLIC_REPORT_DOMAIN ?? "https://painel.lonemidia.com";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Sessão inválida" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const clientId = params.id;

  // Verifica se o cliente existe
  const { data: client, error: fetchErr } = await supabaseAdmin
    .from("clients")
    .select("id, name, public_report_token, public_report_enabled")
    .eq("id", clientId)
    .single();

  if (fetchErr || !client) {
    return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
  }

  // Gera novo token (UUID v4 via Postgres)
  const { data: tokenRow } = await supabaseAdmin
    .rpc("gen_random_uuid")
    .single<{ gen_random_uuid: string }>();

  const token = tokenRow?.gen_random_uuid ?? crypto.randomUUID();

  const { error: updateErr } = await supabaseAdmin
    .from("clients")
    .update({
      public_report_token: token,
      public_report_token_created_at: new Date().toISOString(),
      public_report_token_revoked_at: null,
      public_report_enabled: true,
    })
    .eq("id", clientId);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  const fullUrl = `${BASE_URL}/relatorio/${token}`;
  return NextResponse.json({ success: true, token, full_url: fullUrl });
}
