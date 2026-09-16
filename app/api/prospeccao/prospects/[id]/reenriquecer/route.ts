export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import { requireRole, GESTAO } from "@/lib/api/require-role";
import { comExecucao } from "@/lib/obs/correlacao";
import { buscarProspect } from "@/lib/prospeccao/db";
import { carregarConfig } from "@/lib/prospeccao/config";
import { enriquecerProspect } from "@/lib/prospeccao/enriquecer";

// POST /api/prospeccao/prospects/:id/reenriquecer — roda a pesquisa de novo (depois de corrigir CNPJ/Instagram, por ex.).
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireRole(req, GESTAO);
  if (gate instanceof NextResponse) return gate;
  const { id } = await ctx.params;
  const p = await buscarProspect(id);
  if (!p) return NextResponse.json({ error: "prospect não encontrado" }, { status: 404 });
  return comExecucao({ origem: "prospeccao:reenriquecer", ator: gate.user.email }, async () => {
    const cfg = await carregarConfig();
    const r = await enriquecerProspect(p, cfg);
    return NextResponse.json({ ok: true, etapas: r.etapas, erros: r.erros, prospect: r.prospect });
  });
}
