export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import { spNow, ymd, isWeekday } from "@/lib/cs/vigilancia";
import { coletarPostagem } from "@/lib/cs/manha-fontes";

// POST /api/system/cs-postagem — relatório de POSTAGEM do dia, no grupo da equipe.
// Dia firme (seg/sex): balanço completo (quem tem/não tem pauta). Dia fora (ter/qua/qui):
// só posta se algum cliente tiver post agendado pra hoje. Cron sugerido: dias úteis 8h30 BRT.
// A coleta mora em lib/cs/manha-fontes.ts (a manhã unificada, cs-manha, monta a mesma seção).
const POSTAGEM_LIVE = true; // false = calcula e devolve o preview, mas NÃO posta.

export async function POST(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;

  const previewOnly = req.nextUrl.searchParams.get("preview") !== null;
  const now = spNow();
  if (!isWeekday(now)) {
    return NextResponse.json({ ok: true, skip: "fim de semana", dia: ymd(now) });
  }

  const f = await coletarPostagem(now);
  if ("erro" in f) return NextResponse.json({ error: f.erro }, { status: 500 });
  const { msg, lista, videoQuarta, hoje, diaLabel, wd, firme, videoDay } = f;

  const internalJid = process.env.CS_INTERNAL_GROUP_JID || null;
  let postada = false;
  if (msg && POSTAGEM_LIVE && internalJid && !previewOnly) {
    // Os MESMOS fatos que a vigilância declara no digest nominal — quem já foi cobrado pelo nome
    // não precisa deste disparo pro grupo inteiro. Na segunda (lembrete de roteiro) não declara nada.
    // Texto ou PDF segue o VOLUME (lib/cs/enviar-aviso.ts).
    const { enviarAviso } = await import("@/lib/cs/enviar-aviso");
    const r = await enviarAviso(internalJid, msg, { titulo: "Postagem de hoje" }, {
      origem: "cs-postagem", destino: "interno", fatos: f.fatos,
    });
    postada = r.ok;
    if (!r.ok) console.error("[cs-postagem] post falhou:", r.error);
  }

  const esperadosN = lista.filter((c) => c.esperado).length;
  console.log(`[cs-postagem] ${hoje} wd=${wd} firme=${firme} video=${videoDay} esperados=${esperadosN} comPost=${f.comPostTotal} postada=${postada} skip=${!msg}`);
  return NextResponse.json({
    ok: true, live: POSTAGEM_LIVE, dia: diaLabel, firme, video_day: videoDay,
    esperados: esperadosN,
    com_post: lista.filter((c) => c.esperado && c.temPost).length,
    sem_post: lista.filter((c) => c.esperado && !c.temPost).length,
    video_quarta: videoQuarta ?? null, postada, skip: !msg, preview: msg,
  });
}
