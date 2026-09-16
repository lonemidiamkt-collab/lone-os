export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole, GESTAO } from "@/lib/api/require-role";
import { buscarProspect } from "@/lib/prospeccao/db";
import { carregarConfig } from "@/lib/prospeccao/config";
import { abordagemInicial, mensagemDecisor, convite, followup } from "@/lib/prospeccao/mensagens";

// GET /api/prospeccao/prospects/:id/rascunho — o que o agente diria a este prospect em cada momento.
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireRole(req, GESTAO);
  if (gate instanceof NextResponse) return gate;
  const { id } = await ctx.params;
  const p = await buscarProspect(id);
  if (!p) return NextResponse.json({ error: "prospect não encontrado" }, { status: 404 });
  const cfg = await carregarConfig();
  // Prévia = texto-base (modo fixo), sem gastar IA. ?ia=1 pede a redação real da Rafaela.
  const forcarModo = req.nextUrl.searchParams.get("ia") ? undefined : ("fixo" as const);
  const red = { p, cfg, historico: [], forcarModo, origem: "prospeccao:previa" };
  const c = convite(red);
  return NextResponse.json({
    ok: true, modo: forcarModo ?? "diretriz",
    abordagem: await abordagemInicial(red), followup_1: await followup(red, 1), followup_2: await followup(red, 2), followup_3: await followup(red, 3),
    decisor: await mensagemDecisor(red), convite: { tipo: c.tipo, texto: await c.texto },
  });
}
