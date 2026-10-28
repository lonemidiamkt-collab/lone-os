export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole, GESTAO } from "@/lib/api/require-role";
import { valorDaVenda } from "@/lib/contracts/valor-da-venda";

/** GET /api/contracts/valor-da-venda?clientId= — o valor vendido no Comercial (lib/contracts/valor-da-venda.ts). Gestão. */
export async function GET(req: NextRequest) {
  const gate = await requireRole(req, GESTAO);
  if (gate instanceof NextResponse) return gate;
  const clientId = req.nextUrl.searchParams.get("clientId") ?? "";
  if (!clientId) return NextResponse.json({ error: "clientId obrigatório" }, { status: 400 });
  return NextResponse.json({ venda: await valorDaVenda(clientId) });
}
