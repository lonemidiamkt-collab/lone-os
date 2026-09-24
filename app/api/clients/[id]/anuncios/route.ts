export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { requireRole, GESTAO } from "@/lib/api/require-role";
import { obterSnapshot } from "@/lib/portal/snapshotCache";
import type { PeriodKind } from "@/lib/portal/types";

// GET /api/clients/[id]/anuncios?periodo=last_week — resultado dos anúncios do cliente para a aba
// Resultados da ficha. O MESMO snapshot que o cliente vê no portal (lib/portal/snapshotCache.ts:
// cache de 6h, nunca "zero" quando a Meta falha), só que pela sessão do time em vez do token.
//
// Designer fica de fora, como na aba Crescimento de antes: é dado de negócio do cliente.

const PERIODOS: PeriodKind[] = ["last_week", "last_2_weeks", "this_month", "last_month"];

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireRole(req, [...GESTAO, "traffic", "social", "comercial"]);
  if (gate instanceof NextResponse) return gate;
  const { id } = await params;
  const p = req.nextUrl.searchParams.get("periodo") as PeriodKind | null;
  const periodo: PeriodKind = p && PERIODOS.includes(p) ? p : "last_week";
  try {
    return NextResponse.json(await obterSnapshot(id, periodo));
  } catch (e) {
    return NextResponse.json({ error: `Não consegui montar os resultados: ${e instanceof Error ? e.message : String(e)}` }, { status: 502 });
  }
}
