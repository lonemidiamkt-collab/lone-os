export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { requireRole, GESTAO } from "@/lib/api/require-role";
import { comExecucao } from "@/lib/obs/correlacao";
import { carregarConfig } from "@/lib/prospeccao/config";
import { campanhaAtual } from "@/lib/prospeccao/piloto";
import { rodarDescoberta } from "@/lib/prospeccao/descoberta";

// POST /api/prospeccao/descobrir { segmento, cidade, dry } — roda UMA consulta agora, pela página.
export async function POST(req: NextRequest) {
  const gate = await requireRole(req, GESTAO);
  if (gate instanceof NextResponse) return gate;
  const body = (await req.json().catch(() => null)) as { segmento?: string; cidade?: string; dry?: boolean } | null;
  const cfg = await carregarConfig();
  const seg = cfg.segmentos.find((s) => s.nome === body?.segmento) ?? cfg.segmentos[0];
  const cidade = body?.cidade || cfg.cidades[0];
  if (!seg || !cidade) return NextResponse.json({ error: "segmento/cidade inválidos" }, { status: 400 });
  return comExecucao({ origem: "prospeccao:descobrir-manual", ator: gate.user.email }, async () => {
    const campanha = await campanhaAtual();
    const r = await rodarDescoberta(cfg, { campanhaId: campanha?.id, dry: !!body?.dry, combos: [{ segmento: seg, cidade }] });
    return NextResponse.json({ ok: true, ...r });
  });
}
