// GET /api/clients/[id] — registro COMPLETO de 1 cliente (logins, PII, docs, tokens de link
// público) pra tela de detalhe. Gated: exige usuário logado. A lista geral (/api/data/clients)
// vem MAGRA de propósito — os campos sensíveis só saem daqui, 1 cliente por vez, sob demanda.
// (Senhas de plataforma continuam fora; admin revela via /api/client-vault/reveal.)

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { fetchClientById } from "@/lib/supabase/queries";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;
  const client = await fetchClientById(id);
  if (!client) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });

  return NextResponse.json({ client });
}
