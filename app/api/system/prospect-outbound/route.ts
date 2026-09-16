export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import { requireRole, GESTAO } from "@/lib/api/require-role";
import { comExecucao } from "@/lib/obs/correlacao";
import { carregarConfig } from "@/lib/prospeccao/config";
import { campanhaAtual } from "@/lib/prospeccao/piloto";
import { rodarOutbound } from "@/lib/prospeccao/abordagem";

// POST /api/system/prospect-outbound — a cada 5 min, 09:00–11:00 BRT dias úteis: 1 primeira
// abordagem da fila (quality gate no envio, teto do dia, intervalo) + follow-ups e retomadas vencidos.
export async function POST(req: NextRequest) {
  // Cron (CRON_SECRET) ou gestão logada (botões da página /prospeccao).
  if (requireCron(req)) { const gate = await requireRole(req, GESTAO); if (gate instanceof NextResponse) return gate; }
  const dry = req.nextUrl.searchParams.get("dry") !== null;
  return comExecucao({ origem: "prospeccao:outbound", ator: "sdr" }, async () => {
    const cfg = await carregarConfig();
    const campanha = await campanhaAtual();
    const r = await rodarOutbound(cfg, campanha, { dry, semJitter: dry });
    console.log(`[prospect-outbound] abordagens=${r.abordagens.filter((a) => a.ok).length} followups=${r.followups.length} retomadas=${r.retomadas.length} teto=${r.teto.usado}/${r.teto.limite} pulados=${r.pulados.join("; ")}`);
    return NextResponse.json({ ok: true, dry, ...r });
  });
}
