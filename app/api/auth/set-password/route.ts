export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";

// POST /api/auth/set-password { email, password } — admin define a senha de um usuário DIRETO no
// Supabase Auth (que é o que o login usa). O campo "Nova senha" do /ceo só mexia no estado local
// da lista e a troca nunca chegava no Auth — este endpoint conserta isso. SÓ admin.
export async function POST(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "Apenas admin pode trocar senha" }, { status: 403 });

  const { email, password } = (await req.json().catch(() => ({}))) as { email?: string; password?: string };
  if (!email || !password || password.length < 6) {
    return NextResponse.json({ error: "email e senha (mínimo 6) são obrigatórios" }, { status: 400 });
  }
  try {
    // Time pequeno → 1 página basta pra achar o usuário pelo email.
    const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
    if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 });
    const alvo = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (!alvo) return NextResponse.json({ error: "Usuário não encontrado no Auth" }, { status: 404 });

    const { error } = await supabaseAdmin.auth.admin.updateUserById(alvo.id, { password });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "erro" }, { status: 500 });
  }
}
