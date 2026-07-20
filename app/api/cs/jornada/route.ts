// /api/cs/jornada — o painel de jornada do CS (as 8 perguntas) + edição da ficha de relacionamento.
//   GET  → lista de todos os clientes ativos com risco consolidado, pendências, próxima ação.
//   POST { clientId, ...campos } → salva a ficha (próxima ação, pendências do cliente, notas, estado…).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { montarJornada } from "@/lib/cs/jornada";

export async function GET(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const fichas = await montarJornada();
  return NextResponse.json({ fichas });
}

export async function POST(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const b = await req.json().catch(() => ({}));
  const clientId = b?.clientId as string;
  if (!clientId) return NextResponse.json({ error: "clientId obrigatório" }, { status: 400 });

  // só os campos enviados (patch) — não zera o que não veio
  const patch: Record<string, unknown> = { client_id: clientId, updated_at: new Date().toISOString(), updated_by: user.email ?? null };
  if (b.proximaAcao !== undefined) patch.proxima_acao = b.proximaAcao || null;
  if (b.responsavel !== undefined) patch.proxima_acao_responsavel = b.responsavel || null;
  if (b.prazo !== undefined) patch.proxima_acao_prazo = b.prazo || null;
  if (b.pendenciasCliente !== undefined) patch.pendencias_cliente = b.pendenciasCliente ?? [];
  if (b.estado !== undefined) patch.estado = b.estado || null;
  if (b.ultimaReuniao !== undefined) patch.ultima_reuniao = b.ultimaReuniao || null;
  if (b.proximaReuniao !== undefined) patch.proxima_reuniao = b.proximaReuniao || null;
  if (b.notas !== undefined) patch.notas = b.notas || null;

  const { error } = await supabaseAdmin.from("client_journey").upsert(patch, { onConflict: "client_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
