export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import { requireRole, GESTAO } from "@/lib/api/require-role";
import { comExecucao } from "@/lib/obs/correlacao";
import { supabaseAdmin } from "@/lib/supabase/server";
import { campanhaAtual, encerrarSeVenceu, diaDoPiloto } from "@/lib/prospeccao/piloto";
import { gerarRelatorioFinal, textoRelatorioFinal } from "@/lib/prospeccao/relatorios";

// POST /api/system/prospect-piloto — 00:10 BRT todo dia: venceu o prazo? encerra (auto_stop),
// gera o relatório final (V2 §25), guarda em relatorio_final e manda ao grupo administrativo.
// ?forcar=1 gera o relatório do piloto atual sem encerrar (prévia).
export async function POST(req: NextRequest) {
  // Cron (CRON_SECRET) ou gestão logada (botões da página /prospeccao).
  if (requireCron(req)) { const gate = await requireRole(req, GESTAO); if (gate instanceof NextResponse) return gate; }
  const forcar = req.nextUrl.searchParams.get("forcar") !== null;
  return comExecucao({ origem: "prospeccao:piloto", ator: "sdr" }, async () => {
    const campanha = await campanhaAtual();
    if (!campanha) return NextResponse.json({ ok: true, pulado: "sem piloto" });
    const encerrou = await encerrarSeVenceu(campanha);
    if (!encerrou && !forcar) return NextResponse.json({ ok: true, status: campanha.status, dia: diaDoPiloto(campanha) });
    const r = await gerarRelatorioFinal(campanha);
    const texto = textoRelatorioFinal(r);
    if (encerrou) {
      await supabaseAdmin.from("prospect_campanhas").update({ relatorio_final: r as unknown as Record<string, unknown> }).eq("id", campanha.id);
      if (process.env.CS_ADM_GROUP_JID) {
        const { csSendGroupText } = await import("@/lib/cs/notify");
        await csSendGroupText(process.env.CS_ADM_GROUP_JID, `O piloto "${campanha.nome}" chegou ao fim e o agente PAROU sozinho (só você reativa, em /prospeccao).\n\n${texto}`, undefined, { origem: "prospeccao", destino: "interno" });
      }
    }
    return NextResponse.json({ ok: true, encerrou, previa: !encerrou, relatorio: r, texto });
  });
}
