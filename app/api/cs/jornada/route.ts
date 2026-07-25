// /api/cs/jornada — o painel de jornada do CS (as 8 perguntas) + edição da ficha de relacionamento.
//   GET  → lista de todos os clientes ativos com risco consolidado, pendências, próxima ação.
//   POST { clientId, ...campos } → salva a ficha (próxima ação, pendências do cliente, notas, estado…).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireRole, GESTAO } from "@/lib/api/require-role";
import { montarJornada } from "@/lib/cs/jornada";
import { checkinsRecentes, registrarRespostaManual } from "@/lib/cs/checkin";

// GESTÃO apenas: `client_journey.notas` carrega a nota de handoff do comercial (valor negociado,
// telefone e e-mail do lead) e o risco de churn. Antes qualquer logado — designer, SDR — lia tudo.
export async function GET(req: NextRequest) {
  const gate = await requireRole(req, GESTAO);
  if (gate instanceof NextResponse) return gate;
  // ?checkinsFor=<clientId> → os check-ins recentes daquele cliente (pra ficha expandida)
  const checkinsFor = req.nextUrl.searchParams.get("checkinsFor");
  if (checkinsFor) return NextResponse.json({ checkins: await checkinsRecentes(checkinsFor) });
  const fichas = await montarJornada();
  return NextResponse.json({ fichas });
}

export async function POST(req: NextRequest) {
  const gate = await requireRole(req, GESTAO);
  if (gate instanceof NextResponse) return gate;
  const { user } = gate;

  const b = await req.json().catch(() => ({}));
  const clientId = b?.clientId as string;
  if (!clientId) return NextResponse.json({ error: "clientId obrigatório" }, { status: 400 });

  // Registrar resposta de check-in (o time anota o que o cliente falou)
  if (typeof b?.checkinResposta === "string" && b.checkinResposta.trim()) {
    const ok = await registrarRespostaManual(clientId, b.checkinResposta.trim());
    return NextResponse.json({ ok });
  }

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
