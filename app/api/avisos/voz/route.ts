export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET  /api/avisos/voz → { podeOuvir, ligada } de quem está logado.
// POST /api/avisos/voz { ligada } → grava a escolha (team_members.ouvir_avisos).
//
// É essa escolha que faz o SÓCIO receber os avisos de tráfego falados (padrão: não recebe) e que
// silencia o gestor que não quiser ouvir. Regras: lib/avisos/regras.ts.

import { NextRequest, NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { podeOuvir } from "@/lib/avisos/fala";
import { vozPadraoDoPapel } from "@/lib/avisos/regras";

async function membroDe(email: string) {
  const { data, error } = await supabaseAdmin.from("team_members")
    .select("id, name, role, ouvir_avisos").ilike("email", email).is("deleted_at", null).maybeSingle();
  if (error) throw new Error(error.message);
  return data as { id: string; name: string; role: string; ouvir_avisos: boolean | null } | null;
}

export async function GET(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    const m = await membroDe(user.email);
    if (!m || !podeOuvir(m.role)) return NextResponse.json({ podeOuvir: false, ligada: false });
    return NextResponse.json({ podeOuvir: true, ligada: m.ouvir_avisos ?? vozPadraoDoPapel(m.role) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "erro" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const corpo = await req.json().catch(() => ({}));
  if (typeof corpo?.ligada !== "boolean") return NextResponse.json({ error: "Informe ligada: true ou false." }, { status: 400 });
  try {
    const m = await membroDe(user.email);
    if (!m) return NextResponse.json({ error: "Seu usuário não está no cadastro do time." }, { status: 404 });
    if (!podeOuvir(m.role)) return NextResponse.json({ error: "Seu papel não recebe avisos falados." }, { status: 403 });
    const { error } = await supabaseAdmin.from("team_members").update({ ouvir_avisos: corpo.ligada }).eq("id", m.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, ligada: corpo.ligada });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "erro" }, { status: 500 });
  }
}
