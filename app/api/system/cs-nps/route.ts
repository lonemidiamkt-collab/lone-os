export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import { JOB_NPS, TEXTO_FOLLOWUP, textoPergunta } from "@/lib/cs/nps";
import { npsLigado, montarRodada, enviarPerguntas, fecharVencidas } from "@/lib/cs/nps-server";

// POST /api/system/cs-nps — NPS depois da reunião (Leva 6B, E6). Regras em lib/cs/nps.ts.
//
// Acha as reuniões marcadas como realizadas nas últimas 72h e pergunta ao cliente, no grupo dele,
// a nota de 0 a 10. Uma pergunta por cliente a cada 25 dias; nunca duas pela mesma reunião.
//
// FALA COM O CLIENTE → NASCE DESLIGADO. Só manda com o job ligado EXPLICITAMENTE na Central de
// Automações (cron-call.sh já pula quando está desligado; esta rota confere de novo, e trata "sem
// configuração" como desligado — o contrário dos outros jobs).
//
//   ?dry=1  não manda nada: devolve o texto exato e a lista de quem receberia (e quem ficou de fora).
//
// Cron: `15 12-20 * * 1-5` (seg a sex, de hora em hora, 9h15 às 17h15 BRT).

export async function POST(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;
  const dry = req.nextUrl.searchParams.get("dry") !== null;
  const agora = new Date();

  const trava = await npsLigado(agora);

  let rodada: Awaited<ReturnType<typeof montarRodada>>;
  try {
    rodada = await montarRodada(agora);
  } catch (e) {
    return NextResponse.json({ ok: false, job: JOB_NPS, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }

  if (dry) {
    return NextResponse.json({
      ok: true,
      job: JOB_NPS,
      dry: true,
      ligado: trava.ligado,
      situacao: trava.motivo,
      pergunta_modelo: textoPergunta(null),
      followup_nota_ate_8: TEXTO_FOLLOWUP,
      receberiam: rodada.envios.map((e) => ({ cliente: e.cliente, clientId: e.clientId, reuniao_realizada_em: e.realizadaEm, texto: e.texto })),
      ficaram_de_fora: rodada.ignorados,
    });
  }

  // Fechar o que venceu não fala com ninguém — roda mesmo com o job desligado.
  const vencidas = await fecharVencidas(agora).catch(() => ({ semResposta: 0, semMotivo: 0 }));

  if (!trava.ligado) {
    return NextResponse.json({
      ok: true, job: JOB_NPS, enviados: 0, desligado: true, situacao: trava.motivo,
      pendentes_na_fila: rodada.envios.length, vencidas,
    });
  }

  const resultados = await enviarPerguntas(rodada.envios);
  const enviados = resultados.filter((r) => r.ok).length;
  const falhas = resultados.filter((r) => !r.ok);
  console.log(`[cs-nps] ${enviados} pergunta(s) enviada(s), ${falhas.length} falha(s)`);
  return NextResponse.json({
    ok: falhas.length === 0 || enviados > 0,
    job: JOB_NPS,
    enviados,
    clientes: resultados.filter((r) => r.ok).map((r) => r.cliente),
    falhas,
    ficaram_de_fora: rodada.ignorados.length,
    vencidas,
  });
}
