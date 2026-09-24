export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole, type Papel } from "@/lib/api/require-role";
import { carregarHoje } from "@/lib/traffic/hoje/carregar";

// GET /api/trafego/hoje — a aba "Hoje" do Tráfego numa chamada só: uma linha por cliente que comprou
// tráfego, com o pior problema primeiro (saldo, conta, entrega, diagnóstico), os números do dia e o
// "visto" de cada alerta. Tudo do que o servidor já sincronizou — nenhuma chamada à Meta.
// Regras em lib/traffic/hoje/montar.ts; visto em lib/traffic/hoje/visto.ts.

const TRAFEGO: Papel[] = ["admin", "manager", "traffic"];

export async function GET(req: NextRequest) {
  const gate = await requireRole(req, TRAFEGO);
  if (gate instanceof NextResponse) return gate;
  try {
    return NextResponse.json(await carregarHoje(gate.user.email));
  } catch (err) {
    console.error("[trafego/hoje]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Não consegui montar o Hoje agora. Recarregue em instantes." }, { status: 500 });
  }
}
