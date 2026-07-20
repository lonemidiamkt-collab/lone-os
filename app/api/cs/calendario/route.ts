// GET /api/cs/calendario?clientId=... — PREVIEW do calendário estratégico da próxima semana.
// Roda o motor (diagnosticar → objetivo do período → decidir peças) e devolve o plano com a
// JUSTIFICATIVA de cada peça. Preview: NÃO cria card nem grava (isso é o passo seguinte).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { planejarPeriodo } from "@/lib/cs/motor";
import { datasProximaSemana } from "@/lib/cs/pauta";
import { spNow, ymd } from "@/lib/cs/vigilancia";

export async function GET(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const clientId = req.nextUrl.searchParams.get("clientId");
  if (!clientId) return NextResponse.json({ error: "clientId obrigatório" }, { status: 400 });

  const { segunda, datas } = datasProximaSemana(spNow());
  const periodo = `semana de ${ymd(segunda)}`;

  const r = await planejarPeriodo(clientId, periodo, datas);
  if (!r.ok || !r.plano) return NextResponse.json({ error: r.error ?? "Falha ao planejar" }, { status: 502 });

  return NextResponse.json({ cliente: r.nome, periodo, plano: r.plano });
}
