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
  return NextResponse.json({
    ok: true,
    abordagem: abordagemInicial(p, cfg), followup_1: followup(p, cfg, 1), followup_2: followup(p, cfg, 2), followup_3: followup(p, cfg, 3),
    decisor: mensagemDecisor(p, cfg), convite: convite(p, cfg),
  });
}
