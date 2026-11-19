export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Manifesto do Painel de Resultados DESTE link (lib/portal/manifesto.ts): o ícone na tela inicial do cliente
// abre o painel dele, não o login da equipe. Link inválido, revogado ou de ex-cliente não tem manifesto.

import { NextRequest, NextResponse } from "next/server";
import { clienteDoLink } from "@/lib/portal/token";
import { manifestoDoPortal } from "@/lib/portal/manifesto";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const lido = await clienteDoLink(token);
  if (lido.estado === "indisponivel") return new NextResponse(null, { status: 503 });
  if (lido.estado !== "ok") return new NextResponse(null, { status: 404 });
  return NextResponse.json(manifestoDoPortal(token, lido.linha.nome), {
    headers: { "Content-Type": "application/manifest+json", "Cache-Control": "private, max-age=300" },
  });
}
