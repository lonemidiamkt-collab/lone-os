export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { trafegoPorCliente } from "@/lib/metrics/trafego";

// GET /api/clients/[id]/trafego — verba e resultado do cliente para a FICHA dele.
// A ficha não mostrava nenhum número de tráfego: a conta Meta aparecia vinculada, mas gasto, verba e
// resultado ficavam só em /traffic. Quem abria a ficha pra falar com o cliente não via a metade paga
// da operação.
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await ctx.params;
  const mapa = await trafegoPorCliente();
  return NextResponse.json({ trafego: mapa.get(id) ?? null });
}
