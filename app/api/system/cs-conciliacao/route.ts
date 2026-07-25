export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import { csSendGroupText } from "@/lib/cs/notify";
import { spNow, isBusinessDay } from "@/lib/cs/vigilancia";
import { varrerConciliacao, formatConciliacao } from "@/lib/cs/conciliacao";

// POST /api/system/cs-conciliacao — varredura de SINCRONIZAÇÃO entre o WhatsApp e a plataforma.
// Procura trabalho que aconteceu e não virou dado (arte pronta não postada, cliente que já aprovou e
// o card não andou, sugestão do agente esquecida, cliente sem grupo mapeado…).
// Cron sugerido: segunda 9h BRT = `0 12 * * 1`. `?preview=1` calcula sem postar no grupo.
export async function POST(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;

  const preview = req.nextUrl.searchParams.get("preview") !== null;
  const now = spNow();
  if (!preview && !(await isBusinessDay(now))) {
    return NextResponse.json({ ok: true, skip: "fora de dia útil" });
  }

  const divs = await varrerConciliacao();
  const msg = formatConciliacao(divs);

  const jid = process.env.CS_INTERNAL_GROUP_JID || null;
  let postada = false;
  if (msg && jid && !preview) {
    const r = await csSendGroupText(jid, msg);
    postada = r.ok;
    if (!r.ok) console.error("[cs-conciliacao] post falhou:", r.error);
  }

  console.log(`[cs-conciliacao] ${divs.length} divergências · postada=${postada}`);
  return NextResponse.json({ ok: true, divergencias: divs, postada, preview: msg });
}
