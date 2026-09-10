export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";

// GET /api/clients/offboarding/detalhe?id=… — o processo inteiro, para a tela de encerramento.
export async function GET(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id é obrigatório" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("client_offboardings").select("*").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "não encontrado" }, { status: 404 });

  const { data: eventos } = await supabaseAdmin
    .from("offboarding_events").select("acao, ator, created_at")
    .eq("offboarding_id", id).order("created_at", { ascending: false }).limit(20);

  return NextResponse.json({ ok: true, offboarding: data, eventos: eventos ?? [] },
    { headers: { "cache-control": "no-store" } });
}
