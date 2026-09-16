export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import { requireRole, GESTAO } from "@/lib/api/require-role";
import { comExecucao } from "@/lib/obs/correlacao";
import { carregarConfig } from "@/lib/prospeccao/config";
import { campanhaAtual } from "@/lib/prospeccao/piloto";
import { rodarTick } from "@/lib/prospeccao/tick";

// POST /api/system/prospect-tick — a cada 15 min, 09:00–18:00 BRT dias úteis: respostas pendentes,
// lembretes de reunião (24h/1h), encerramentos e espelho no Google Sheets. ?dry=1 não envia.
export async function POST(req: NextRequest) {
  // Cron (CRON_SECRET) ou gestão logada (botões da página /prospeccao).
  if (requireCron(req)) { const gate = await requireRole(req, GESTAO); if (gate instanceof NextResponse) return gate; }
  const dry = req.nextUrl.searchParams.get("dry") !== null;
  return comExecucao({ origem: "prospeccao:tick", ator: "sdr" }, async () => {
    const cfg = await carregarConfig();
    const campanha = await campanhaAtual();
    const r = await rodarTick(cfg, campanha, { dry });
    console.log(`[prospect-tick] pendentes=${r.respostas_pendentes.length} lembretes=${r.lembretes.length} encerrados=${r.encerrados} planilha=${r.planilha?.ok ?? "-"}${r.pulado ? ` (${r.pulado})` : ""}`);
    return NextResponse.json({ ok: true, dry, ...r });
  });
}
