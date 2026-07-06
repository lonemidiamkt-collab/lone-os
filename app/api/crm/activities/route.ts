export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import * as db from "@/lib/supabase/queries";

// Timeline do lead (CRM comercial). BFF: exige usuário logado.
//   GET  ?leadId=…              → atividades do lead (mais recente primeiro)
//   POST { leadId, tipo, texto, autor } → registra uma atividade (nota/ligação/whatsapp/email/reunião)
export async function GET(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const leadId = req.nextUrl.searchParams.get("leadId");
  if (!leadId) return NextResponse.json({ error: "leadId obrigatório" }, { status: 400 });
  const atividades = await db.fetchLeadActivities(leadId);
  return NextResponse.json({ atividades });
}

export async function POST(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body?.leadId || !body?.texto?.trim()) {
    return NextResponse.json({ error: "leadId e texto obrigatórios" }, { status: 400 });
  }
  try {
    const atividade = await db.insertLeadActivity({
      leadId: body.leadId, tipo: body.tipo || "nota", texto: String(body.texto).trim(), autor: body.autor ?? null,
    });
    return NextResponse.json({ atividade });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "erro" }, { status: 500 });
  }
}
