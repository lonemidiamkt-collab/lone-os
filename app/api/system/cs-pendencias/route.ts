export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import { csSendGroupText } from "@/lib/cs/notify";
import { spNow, ymd, isBusinessDay } from "@/lib/cs/vigilancia";
import { coletarPendencias } from "@/lib/cs/manha-fontes";

// POST /api/system/cs-pendencias — lembrete diário das sugestões PENDENTES no grupo interno.
// Fecha o loop do suggest-only: o agente capta muito, mas card só nasce quando alguém dá "ok".
// Backstage (o cliente nunca vê). Cron sugerido: 9h BRT (= `0 12 * * 1-5`, UTC = BRT+3).
// A coleta (e a expiração das pendências de +14 dias) mora em lib/cs/manha-fontes.ts.
const PENDENCIAS_LIVE = true; // false = calcula e devolve o preview, mas NÃO posta no WhatsApp.

export async function POST(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;

  // ?preview=1 → calcula e devolve o texto, mas NÃO posta (pra validar com dados reais sem spammar).
  const previewOnly = req.nextUrl.searchParams.get("preview") !== null;

  const now = spNow();
  // Só em dia útil (não cutuca no fim de semana/feriado). Preview ignora o gate.
  if (!previewOnly && !(await isBusinessDay(now))) {
    return NextResponse.json({ ok: true, skip: "fora de dia útil", dia: ymd(now) });
  }

  // Expira (fora do preview) as pendências que o time nunca decidiu há 14+ dias e lista as recentes.
  const f = await coletarPendencias({ aplicar: !previewOnly });
  if ("erro" in f) return NextResponse.json({ error: f.erro }, { status: 500 });
  const { itens, expiradas, erroExpirar, mortasHoje } = f;

  const msg = f.msg;
  const internalJid = process.env.CS_INTERNAL_GROUP_JID || null;

  // MORRER EM SILÊNCIO ERA O PIOR DESFECHO: o time vê o que está sendo perdido, no dia em que se
  // perde — e pode ressuscitar.
  if (f.arquivadas && PENDENCIAS_LIVE && internalJid && !previewOnly) {
    await csSendGroupText(internalJid, f.arquivadas, undefined, { origem: "cs-pendencias-expiradas", destino: "interno" });
  }

  let postada = false;
  if (PENDENCIAS_LIVE && internalJid && !previewOnly && msg) {
    // Texto ou PDF segue o VOLUME (lib/cs/enviar-aviso.ts). Abaixo do limite nada muda; acima,
    // vira PDF em vez de ser cortado pelo WhatsApp com "Ler mais".
    const { enviarAviso } = await import("@/lib/cs/enviar-aviso");
    const r = await enviarAviso(internalJid, msg, { titulo: "Pendências do agente" }, { origem: "cs-pendencias", destino: "interno" });
    postada = r.ok;
    if (!r.ok) console.error("[cs-pendencias] post falhou:", r.error);
  }

  console.log(`[cs-pendencias] dia=${ymd(now)} pendentes=${itens.length} postada=${postada}`);
  return NextResponse.json({ ok: true, live: PENDENCIAS_LIVE, pendentes: itens.length, expiradas, avisadas: mortasHoje.length, erroExpirar, postada, preview: msg || "(nada pendente)" });
}
