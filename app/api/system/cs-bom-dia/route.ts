export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import { csSendGroupText } from "@/lib/cs/notify";
import { spNow, ymd, isBusinessDay } from "@/lib/cs/vigilancia";
import { montarSnapshotCS } from "@/lib/cs/snapshot";
import { buildBomDiaDigest } from "@/lib/cs/bom-dia";
import { fatoEsfriando } from "@/lib/cs/porta-voz";
import { supabaseAdmin } from "@/lib/supabase/server";

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
    // O time real, pra "Carlos" e "Carlos Augusto" não virarem dois blocos (o snapshot encurta
  // o dono do card e mantém o completo na pendência).
  const { data: membros } = await supabaseAdmin.from("team_members").select("name");
  const time = (membros ?? []).map((m) => m.name as string).filter(Boolean);
  const msg = buildBomDiaDigest(snap, now, time);
  // Bom dia vai pro grupo da EQUIPE (onde a Lone é "do time"); cai no grupo de artes se não houver.
  const internalJid = process.env.CS_TEAM_GROUP_JID || process.env.CS_INTERNAL_GROUP_JID || null;
  let postada = false;
  if (BOM_DIA_LIVE && internalJid && !previewOnly) {
    // Declara os esfriando que o texto JÁ cita — assim o cron das 9h30 não repete os mesmos.
    const r = await csSendGroupText(internalJid, msg, undefined, {
      origem: "cs-bom-dia", destino: "interno",
      fatos: snap.esfriando.map((e) => fatoEsfriando(e.cliente)),
    });
    postada = r.ok;
    if (!r.ok) console.error("[cs-bom-dia] post falhou:", r.error);
  }

  console.log(`[cs-bom-dia] dia=${ymd(now)} pendentes=${snap.pendentes.length} atrasados=${snap.atrasados.length} esfriando=${snap.esfriando.length} postada=${postada}`);
  return NextResponse.json({ ok: true, live: BOM_DIA_LIVE, postada, preview: msg });
}
