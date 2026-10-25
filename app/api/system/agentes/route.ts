export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole, GESTAO } from "@/lib/api/require-role";
import { montarCentralDeAgentes } from "@/lib/agentes/central-server";

// GET /api/system/agentes — a Central de Agentes: cada agente de IA do catálogo (lib/agentes/catalogo.ts)
// com o uso real (última execução, falhas dos últimos 7 dias), os interruptores e o estado.
// Só gestão. Sem custo em dinheiro: é número da agência e fica fora do Lone OS.
export async function GET(req: NextRequest) {
  const gate = await requireRole(req, GESTAO);
  if (gate instanceof NextResponse) return gate;
  try {
    return NextResponse.json(await montarCentralDeAgentes());
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[agentes] não montei a Central:", msg);
    return NextResponse.json({ error: `Não consegui montar a Central de Agentes (${msg.slice(0, 160)}). Tente de novo em alguns segundos.` }, { status: 500 });
  }
}
