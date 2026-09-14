export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { decidir, type Decisao } from "@/lib/priority/repo";

const DECISOES: Decisao[] = ["vista", "aceita", "ignorada", "incorreta", "executada"];

// POST /api/priority/decidir { id, decisao, motivo? } — a decisão é o que a Fase 1 mede.
export async function POST(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const id = body?.id as string;
  const decisao = body?.decisao as Decisao;
  if (!id || !DECISOES.includes(decisao)) return NextResponse.json({ error: "id e decisao (vista|aceita|ignorada|incorreta|executada) são obrigatórios" }, { status: 400 });
  const { data: tm } = await supabaseAdmin.from("team_members").select("name").eq("email", user.email).maybeSingle();
  try {
    const r = await decidir(id, decisao, (tm?.name as string) ?? user.email, typeof body?.motivo === "string" ? body.motivo.slice(0, 300) : null);
    if (!r) return NextResponse.json({ error: "recomendação não encontrada" }, { status: 404 });
    return NextResponse.json({ ok: true, ...r });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
