export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";

// Meta de faturamento do cliente (Ficha Viva): "bater R$ X até o mês YYYY-MM". Guardada em
// agency_settings (key `growth_goal:<clientId>`) pra não precisar de migration. Usada como linha de
// referência no gráfico e no progresso da meta. Staff logado lê/grava.

function keyFor(clientId: string) { return `growth_goal:${clientId}`; }

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Sessão inválida" }, { status: 401 });
  const { id } = await params;

  const { data } = await supabaseAdmin
    .from("agency_settings").select("value").eq("key", keyFor(id)).maybeSingle();
  let goal: { value: number; month: string } | null = null;
  try { goal = data?.value ? JSON.parse(data.value as string) : null; } catch { goal = null; }
  return NextResponse.json({ goal });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Sessão inválida" }, { status: 401 });
  const { id } = await params;

  const body = await req.json().catch(() => null);
  // value null / month vazio → remove a meta
  if (body?.value == null || !body?.month) {
    await supabaseAdmin.from("agency_settings").delete().eq("key", keyFor(id));
    return NextResponse.json({ ok: true, goal: null });
  }
  const value = Number(body.value);
  const month = String(body.month); // "YYYY-MM"
  if (!(value > 0) || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "value (>0) e month (YYYY-MM) obrigatórios" }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("agency_settings")
    .upsert({ key: keyFor(id), value: JSON.stringify({ value, month }) }, { onConflict: "key" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, goal: { value, month } });
}
