export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { papelDoUsuario } from "@/lib/api/require-role";
import { supabaseAdmin } from "@/lib/supabase/server";
import { feed, taxaDeDecisao } from "@/lib/priority/repo";

// GET /api/priority/feed?escopo=meu|todos — o que preciso fazer hoje, ranqueado.
// Cada pessoa vê o que é dela (nome) ou do papel dela sem dono; admin/gestor com escopo=todos vê tudo.
export async function GET(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const papel = await papelDoUsuario(user);
  const { data: tm } = await supabaseAdmin.from("team_members").select("name").eq("email", user.email).maybeSingle();
  const escopo = req.nextUrl.searchParams.get("escopo") === "todos" ? "todos" : "meu";
  try {
    const [itens, taxa] = await Promise.all([
      feed({ papel, nome: (tm?.name as string) ?? null, admin: user.isAdmin, escopo }),
      taxaDeDecisao(14),
    ]);
    return NextResponse.json({ itens, taxa, eu: { nome: tm?.name ?? null, papel, admin: user.isAdmin }, escopo });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
