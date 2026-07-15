export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import { csSendGroupText } from "@/lib/cs/notify";
import { spNow, ymd, isBusinessDay } from "@/lib/cs/vigilancia";
import { montarSnapshotCS } from "@/lib/cs/snapshot";
import { buildBomDiaDigest } from "@/lib/cs/bom-dia";

// POST /api/system/cs-bom-dia — "bom dia" diário da Lone no grupo interno: raio-x rápido do dia
// (pendências esperando ok/não, produção, atrasados, quem esfriou) pro time começar sabendo o que
// fazer. Determinístico (sem IA). Só dia útil. Cron sugerido: `0 11 * * 1-5` UTC (= 8h BRT).
// ?preview=1 monta sem postar.
const BOM_DIA_LIVE = true;

export async function POST(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;
  const previewOnly = req.nextUrl.searchParams.get("preview") !== null;

  const now = spNow();
  if (!previewOnly && !(await isBusinessDay(now))) {
    return NextResponse.json({ ok: true, skip: "fora de dia útil", dia: ymd(now) });
  }

  const snap = await montarSnapshotCS();
  const msg = buildBomDiaDigest(snap, now);
  // Bom dia vai pro grupo da EQUIPE (onde a Lone é "do time"); cai no grupo de artes se não houver.
  const internalJid = process.env.CS_TEAM_GROUP_JID || process.env.CS_INTERNAL_GROUP_JID || null;
  let postada = false;
  if (BOM_DIA_LIVE && internalJid && !previewOnly) {
    const r = await csSendGroupText(internalJid, msg);
    postada = r.ok;
    if (!r.ok) console.error("[cs-bom-dia] post falhou:", r.error);
  }

  console.log(`[cs-bom-dia] dia=${ymd(now)} pendentes=${snap.pendentes.length} atrasados=${snap.atrasados.length} esfriando=${snap.esfriando.length} postada=${postada}`);
  return NextResponse.json({ ok: true, live: BOM_DIA_LIVE, postada, preview: msg });
}
