export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import { requireRole, GESTAO } from "@/lib/api/require-role";
import { comExecucao } from "@/lib/obs/correlacao";
import { carregarConfig } from "@/lib/prospeccao/config";
import { campanhaAtual, pilotoRodando } from "@/lib/prospeccao/piloto";
import { rodarDescoberta } from "@/lib/prospeccao/descoberta";

// POST /api/system/prospect-descobrir — 06:30 BRT dias úteis: N consultas (segmento × cidade em
// rodízio) → empresas novas como `descoberto`. ?dry=1 pesquisa mas não grava. ?quantas=N.
export async function POST(req: NextRequest) {
  // Cron (CRON_SECRET) ou gestão logada (botões da página /prospeccao).
  if (requireCron(req)) { const gate = await requireRole(req, GESTAO); if (gate instanceof NextResponse) return gate; }
  const dry = req.nextUrl.searchParams.get("dry") !== null;
  const quantas = Number(req.nextUrl.searchParams.get("quantas") ?? "") || undefined;
  return comExecucao({ origem: "prospeccao:descobrir", ator: "sdr" }, async () => {
    const cfg = await carregarConfig();
    const campanha = await campanhaAtual();
    if (!cfg.ligado || !pilotoRodando(campanha)) {
      return NextResponse.json({ ok: true, pulado: !cfg.ligado ? "agente desligado" : "piloto não está rodando", dry });
    }
    const r = await rodarDescoberta(cfg, { campanhaId: campanha?.id, quantas, dry });
    console.log(`[prospect-descobrir] combos=${r.combos} achados=${r.achados} novos=${r.novos} dup=${r.duplicados} excl=${r.excluidos} erros=${r.erros.length} dry=${dry}`);
    return NextResponse.json({ ok: true, dry, ...r });
  });
}
