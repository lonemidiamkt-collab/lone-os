export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import { requireRole, GESTAO } from "@/lib/api/require-role";
import { comExecucao } from "@/lib/obs/correlacao";
import { carregarConfig } from "@/lib/prospeccao/config";
import { campanhaAtual, pilotoRodando } from "@/lib/prospeccao/piloto";
import { montarFilaDoDia } from "@/lib/prospeccao/ranking";

// POST /api/system/prospect-ranking — 08:35 BRT dias úteis: quality gate + top N por score → fila do dia.
export async function POST(req: NextRequest) {
  // Cron (CRON_SECRET) ou gestão logada (botões da página /prospeccao).
  if (requireCron(req)) { const gate = await requireRole(req, GESTAO); if (gate instanceof NextResponse) return gate; }
  const dry = req.nextUrl.searchParams.get("dry") !== null;
  return comExecucao({ origem: "prospeccao:ranking", ator: "sdr" }, async () => {
    const cfg = await carregarConfig();
    const campanha = await campanhaAtual();
    if (!cfg.ligado || !pilotoRodando(campanha)) return NextResponse.json({ ok: true, pulado: !cfg.ligado ? "agente desligado" : "piloto não está rodando", dry });
    const r = await montarFilaDoDia(cfg, campanha, { dry });
    console.log(`[prospect-ranking] ${r.dia}: candidatos=${r.candidatos} aprovados=${r.aprovados} fila=${r.fila.length} reprovados=${r.reprovados.length}`);
    return NextResponse.json({ ok: true, dry, ...r });
  });
}
