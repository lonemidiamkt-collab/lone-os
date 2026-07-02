export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import * as db from "@/lib/supabase/queries";

// CRM comercial (SDR) — CRUD dos leads. BFF: exige usuário logado; o escopo de quem VÊ a área
// é feito no menu (papel "comercial"). Service role por baixo (queries.ts).
//   GET                       → lista os leads
//   POST   { ...campos }      → cria um lead (contatoNome obrigatório)
//   PATCH  { id, ...campos }  → atualiza (ex.: mover de estágio, marcar reunião)
//   DELETE ?id=…              → apaga

export async function GET(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const leads = await db.fetchCrmLeads();
  return NextResponse.json({ leads });
}

export async function POST(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body?.contatoNome?.trim()) return NextResponse.json({ error: "Nome do contato é obrigatório" }, { status: 400 });
  try {
    const lead = await db.insertCrmLead(body);
    return NextResponse.json({ lead });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "erro" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const { id, ...patch } = body ?? {};
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });
  try {
    const lead = await db.updateCrmLead(id, patch);
    return NextResponse.json({ lead });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "erro" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });
  try {
    await db.deleteCrmLead(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "erro" }, { status: 500 });
  }
}
