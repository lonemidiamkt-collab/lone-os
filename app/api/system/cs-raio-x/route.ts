export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import { csSendGroupText } from "@/lib/cs/notify";
import { spNow, businessHoursSince } from "@/lib/cs/vigilancia";
import { fetchContentCards } from "@/lib/supabase/queries";
import { computeOperationalKpis } from "@/lib/kpis/operational";
import { cardsParados, formatRaioXGestor } from "@/lib/cs/gestor";

// POST /api/system/cs-raio-x — "Raio-X do Gestor": gargalo do fluxo (lead time, prazo) + cards
// travados por social (tempo real parado na coluna). Posta no grupo interno.
// Cron sugerido: sexta 16h BRT (`0 19 * * 5`), junto do relatório semanal. ?dry=1 não posta.
export async function POST(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;
  const dry = req.nextUrl.searchParams.get("dry") !== null;

  const cards = await fetchContentCards(); // ativos (não arquivados)
  const kpis = computeOperationalKpis(cards);
  // businessHoursSince exige o relógio REAL (nunca spNow — deslocaria o getTime em ~3h).
  const agora = new Date();
  const parados = cardsParados(cards, (c) => businessHoursSince(c.columnEnteredAt?.[c.status], agora));

  const now = spNow();
  const dataLabel = `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}`;
  const texto = formatRaioXGestor(kpis, parados, dataLabel);

  const internalJid = process.env.CS_INTERNAL_GROUP_JID || null;
  let enviado = false;
  if (!dry && internalJid) {
    const r = await csSendGroupText(internalJid, texto);
    enviado = r.ok;
  }
  console.log(`[cs-raio-x] travados=${parados.length} gargalo=${kpis.bottleneck?.stage ?? "-"} dry=${dry}`);
  return NextResponse.json({ ok: true, dry, enviado, texto, kpis, parados });
}
