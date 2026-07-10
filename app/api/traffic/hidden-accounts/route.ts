export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";

// Contas de anúncio "ocultas" na tela de Tráfego. Antes viviam no localStorage (por navegador/
// dispositivo) — ocultar numa máquina não refletia nas outras. Agora ficam em agency_settings
// (compartilhado por todo o time). Preferência de exibição, baixa sensibilidade: qualquer staff logado.

const KEY = "hidden_ad_accounts";

export async function GET(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Sessão inválida" }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from("agency_settings").select("value").eq("key", KEY).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let ids: string[] = [];
  try { ids = data?.value ? JSON.parse(data.value as string) : []; } catch { ids = []; }
  return NextResponse.json({ ids: Array.isArray(ids) ? ids : [] });
}

export async function POST(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Sessão inválida" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!Array.isArray(body?.ids)) {
    return NextResponse.json({ error: "ids array obrigatório" }, { status: 400 });
  }
  const ids = (body.ids as unknown[]).filter((x): x is string => typeof x === "string");

  const { error } = await supabaseAdmin
    .from("agency_settings")
    .upsert({ key: KEY, value: JSON.stringify(ids) }, { onConflict: "key" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
