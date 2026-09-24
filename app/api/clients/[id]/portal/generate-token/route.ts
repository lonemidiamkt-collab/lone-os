export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { gravarTokenDoPortal } from "@/lib/portal/link-automatico";
import { urlDoPortal } from "@/lib/portal/link";

// Gera (ou reativa com um novo) o link do portal. Botão "Portal" da ficha. Só admin.
// A mesma escrita que a automação do cadastro usa (lib/portal/link-automatico.ts).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Sessão inválida" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const { id: clientId } = await params;

  const { data: client, error: fetchErr } = await supabaseAdmin
    .from("clients")
    .select("id")
    .eq("id", clientId)
    .maybeSingle();
  if (fetchErr || !client) {
    return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
  }

  const g = await gravarTokenDoPortal(clientId);
  if (!g.ok) return NextResponse.json({ error: g.erro }, { status: 500 });

  return NextResponse.json({ success: true, token: g.token, full_url: urlDoPortal(g.token) });
}
