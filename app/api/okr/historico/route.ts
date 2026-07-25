export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { okrHistorico } from "@/lib/metrics/okr-historico";

// GET /api/okr/historico?meses=12 — operação REAL mês a mês (posts entregues, SLA, entregas no prazo).
// Substitui os números que o /goals fabricava por fórmula nas visões Mensal/Trimestral/YTD.
export async function GET(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const meses = Math.min(Math.max(Number(req.nextUrl.searchParams.get("meses") ?? 12), 1), 24);
  return NextResponse.json({ historico: await okrHistorico(meses) });
}
