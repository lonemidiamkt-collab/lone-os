// app/api/clients/[id]/ficha-viva/generate-token/route.ts — gera (ou rotaciona) o token do
// link da Ficha Viva do cliente. Admin apenas. Espelha o generate-token do portal de tráfego.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";

const BASE_URL = process.env.NEXT_PUBLIC_PORTAL_DOMAIN ?? "https://resultados.lonemidia.com";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Sessão inválida" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const { id: clientId } = await params;

  const { data: client, error: fetchErr } = await supabaseAdmin
    .from("clients").select("id").eq("id", clientId).single();
  if (fetchErr || !client) {
    return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
  }

  const token = crypto.randomUUID();          // link do DONO (full)
  const raioxToken = crypto.randomUUID();     // link do VENDEDOR (só Raio-X)
  const { error: updateErr } = await supabaseAdmin
    .from("clients")
    .update({
      ficha_viva_token: token,
      ficha_viva_raiox_token: raioxToken,
      ficha_viva_token_created_at: new Date().toISOString(),
      ficha_viva_token_revoked_at: null,
      ficha_viva_enabled: true,
    })
    .eq("id", clientId);

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  return NextResponse.json({
    success: true,
    token, raioxToken,
    full_url: `${BASE_URL}/ficha/${token}`,
    raiox_url: `${BASE_URL}/ficha/${raioxToken}`,
  });
}
