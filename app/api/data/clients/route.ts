export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import * as db from "@/lib/supabase/queries";
import { requireRole, GESTAO } from "@/lib/api/require-role";
import { dispararLinkDoPortal } from "@/lib/portal/link-automatico";

export async function GET(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [clients, clientChats] = await Promise.all([
    db.fetchClients(),
    db.fetchClientChats(),
  ]);

  return NextResponse.json({ clients, clientChats });
}

// Cadastro manual de cliente (Clientes → Novo cliente). Só gestão — é quem vê o botão; estar logado
// não bastava (e agora o cadastro também avisa o grupo de cadastro).
export async function POST(req: NextRequest) {
  const gate = await requireRole(req, GESTAO);
  if (gate instanceof NextResponse) return gate;

  const body = await req.json();
  const { id } = await db.insertClient(body);
  // Cliente novo já nasce com o link do portal, e o grupo de cadastro recebe (uma vez).
  if (!body?.draftStatus) dispararLinkDoPortal(id, "cadastro");
  return NextResponse.json({ id }, { status: 201 });
}
