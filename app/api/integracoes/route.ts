export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { requireRole, GESTAO } from "@/lib/api/require-role";
import { verificarIntegracoes } from "@/lib/integracoes/verificar-server";

// GET /api/integracoes — Sistema › Integrações: cada aplicativo que o Lone OS usa, conferido agora
// (lib/integracoes/). Só leitura; nunca devolve segredo. Gestão vê; conectar o Google é só admin
// (/api/integracoes/google).
export async function GET(req: NextRequest) {
  const gate = await requireRole(req, GESTAO);
  if (gate instanceof NextResponse) return gate;
  const integracoes = await verificarIntegracoes();
  return NextResponse.json({ integracoes, conferidoEm: new Date().toISOString(), podeConectar: gate.papel === "admin" });
}
