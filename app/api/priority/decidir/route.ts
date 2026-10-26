export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { adiar, decidir, reabrir, ESTADOS_ABERTOS, type Decisao, type EstadoAberto } from "@/lib/priority/repo";

const DECISOES: Decisao[] = ["vista", "aceita", "ignorada", "incorreta", "executada"];

// POST /api/priority/decidir { id, decisao, motivo? } — a decisão é o que a Fase 1 mede.
// 25/10/2026 (auditoria 11.8): { id, decisao: "reabrir", estadoAnterior? } desfaz Feito/Ignorar/Incorreta
// (o "Desfazer" do feed). Antes uma tecla errada sumia com a prioridade, sem volta.
export async function POST(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const id = body?.id as string;
  if (id && body?.decisao === "reabrir") {
    const anterior = (ESTADOS_ABERTOS as readonly string[]).includes(body?.estadoAnterior) ? (body.estadoAnterior as EstadoAberto) : "vista";
    try {
      const r = await reabrir(id, anterior);
      if (!r) return NextResponse.json({ error: "essa recomendação não está mais decidida (ou não existe)" }, { status: 409 });
      return NextResponse.json({ ok: true, ...r });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 409 });
    }
  }
  // Mesa do Gestor (26/10/2026): { id, decisao: "adiar", ate: "YYYY-MM-DD" } tira da fila até a data.
  if (id && body?.decisao === "adiar") {
    const ate = typeof body?.ate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.ate) ? new Date(`${body.ate}T08:00:00-03:00`) : null;
    if (!ate || ate.getTime() <= Date.now()) return NextResponse.json({ error: "ate (YYYY-MM-DD, no futuro) é obrigatório para adiar" }, { status: 400 });
    const { data: quem } = await supabaseAdmin.from("team_members").select("name").eq("email", user.email).maybeSingle();
    try {
      const r = await adiar(id, ate, (quem?.name as string) ?? user.email ?? "alguém");
      if (!r) return NextResponse.json({ error: "essa recomendação não está mais aberta" }, { status: 409 });
      return NextResponse.json({ ok: true, ...r });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
    }
  }
  const decisao = body?.decisao as Decisao;
  if (!id || !DECISOES.includes(decisao)) return NextResponse.json({ error: "id e decisao (vista|aceita|ignorada|incorreta|executada|reabrir) são obrigatórios" }, { status: 400 });
  const { data: tm } = await supabaseAdmin.from("team_members").select("name").eq("email", user.email).maybeSingle();
  try {
    const r = await decidir(id, decisao, (tm?.name as string) ?? user.email, typeof body?.motivo === "string" ? body.motivo.slice(0, 300) : null);
    if (!r) return NextResponse.json({ error: "recomendação não encontrada" }, { status: 404 });
    return NextResponse.json({ ok: true, ...r });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
