export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { fetchClientCsRules } from "@/lib/supabase/queries";

const ESCOPOS = new Set(["sempre", "promocao", "arte", "social", "trafego"]);

/**
 * CRUD das regras (do's & don'ts) do Agente CS por cliente — tabela cs_client_rules.
 * Tela do cliente (admin). Todas as ações exigem usuário logado.
 *
 *   GET    ?clientId=…           → lista as regras ATIVAS
 *   POST   { clientId, texto, escopo? }  → cria uma regra manual
 *   DELETE ?id=…                 → desativa (soft-delete; preserva histórico)
 */
export async function GET(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const clientId = req.nextUrl.searchParams.get("clientId");
  if (!clientId) return NextResponse.json({ error: "clientId obrigatório" }, { status: 400 });

  const rules = await fetchClientCsRules(clientId);
  return NextResponse.json({ rules });
}

export async function POST(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const clientId = body?.clientId as string | undefined;
  const texto = (body?.texto as string | undefined)?.trim();
  const escopo = (body?.escopo as string | undefined) ?? "sempre";

  if (!clientId || !texto) return NextResponse.json({ error: "clientId e texto obrigatórios" }, { status: 400 });
  if (!ESCOPOS.has(escopo)) return NextResponse.json({ error: `escopo inválido: ${escopo}` }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("cs_client_rules")
    .insert({ client_id: clientId, texto, escopo, origem: "manual" })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data.id });
}

export async function DELETE(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  // Soft-delete: preserva o histórico do que o agente já aprendeu.
  const { error } = await supabaseAdmin.from("cs_client_rules").update({ ativo: false }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
