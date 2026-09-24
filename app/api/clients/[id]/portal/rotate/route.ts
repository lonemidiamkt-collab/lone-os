export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { gravarTokenDoPortal } from "@/lib/portal/link-automatico";
import { urlDoPortal } from "@/lib/portal/link";

// Troca o link do portal: o atual para de abrir na hora e nasce um novo. Só admin.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Sessão inválida" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const { id } = await params;
  // Uma escrita só: o token antigo deixa de existir no mesmo update que grava o novo.
  const g = await gravarTokenDoPortal(id);
  if (!g.ok) return NextResponse.json({ error: g.erro }, { status: g.erro === "Cliente não encontrado" ? 404 : 500 });

  return NextResponse.json({ success: true, token: g.token, full_url: urlDoPortal(g.token) });
}
