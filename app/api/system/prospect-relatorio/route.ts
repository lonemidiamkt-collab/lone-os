export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import { requireRole, GESTAO } from "@/lib/api/require-role";
import { comExecucao } from "@/lib/obs/correlacao";
import { campanhaAtual } from "@/lib/prospeccao/piloto";
import { gravarMetricasDoDia, textoRelatorioDiario, hojeYmd } from "@/lib/prospeccao/relatorios";

// POST /api/system/prospect-relatorio — 18:30 BRT dias úteis: métricas do dia (§34) gravadas +
// relatório diário (V2 §24) no grupo administrativo. ?dia=YYYY-MM-DD recalcula outro dia. ?dry=1 não envia.
export async function POST(req: NextRequest) {
  // Cron (CRON_SECRET) ou gestão logada (botões da página /prospeccao).
  if (requireCron(req)) { const gate = await requireRole(req, GESTAO); if (gate instanceof NextResponse) return gate; }
  const dry = req.nextUrl.searchParams.get("dry") !== null;
  const dia = req.nextUrl.searchParams.get("dia") || hojeYmd();
  return comExecucao({ origem: "prospeccao:relatorio", ator: "sdr" }, async () => {
    const campanha = await campanhaAtual();
    if (!campanha || campanha.status === "draft") return NextResponse.json({ ok: true, pulado: "sem piloto", dry });
    const m = await gravarMetricasDoDia(dia, campanha);
    const texto = await textoRelatorioDiario(dia, m);
    let enviado = false;
    if (!dry && process.env.CS_ADM_GROUP_JID) {
      const { csSendGroupText } = await import("@/lib/cs/notify");
      const r = await csSendGroupText(process.env.CS_ADM_GROUP_JID, texto, undefined, { origem: "prospeccao", destino: "interno" });
      enviado = r.ok;
    }
    return NextResponse.json({ ok: true, dry, dia, enviado, metricas: m, texto });
  });
}
