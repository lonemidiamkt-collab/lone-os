export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireCron } from "@/lib/api/cron-guard";
import { csSendGroupText } from "@/lib/cs/notify";
import { spNow, ymd, isBusinessDay } from "@/lib/cs/vigilancia";
import { buildEsfriandoDigest, type ClienteQuieto } from "@/lib/cs/esfriando";

// POST /api/system/cs-esfriando — detector de "cliente esfriando" (churn precoce): cliente que
// FALAVA no grupo (last_client_msg_at não-nulo) e sumiu por >= N dias. Alerta interno pro time
// reengajar. Só flaga quem já teve atividade (não flaga cliente de grupo não-monitorado = null).
// Cron sugerido: segunda 9h30 BRT (= `30 12 * * 1` UTC). ?preview=1 calcula sem postar.
const ESFRIANDO_LIVE = true;
const DIAS_QUIETO = 7; // dias sem falar pra considerar "esfriando"

export async function POST(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;
  const previewOnly = req.nextUrl.searchParams.get("preview") !== null;

  const now = spNow();
  if (!previewOnly && !(await isBusinessDay(now))) {
    return NextResponse.json({ ok: true, skip: "fora de dia útil", dia: ymd(now) });
  }

  const limite = new Date(Date.now() - DIAS_QUIETO * 86400000).toISOString();
  const { data, error } = await supabaseAdmin
    .from("clients")
    .select("name, nome_fantasia, assigned_social, last_client_msg_at, agente_ativo")
    .or("active.is.null,active.eq.true")
    .not("last_client_msg_at", "is", null)   // só quem JÁ falou (tem baseline)
    .lt("last_client_msg_at", limite)         // e sumiu há >= N dias
    .not("name", "ilike", "%(teste)%");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const clientes: ClienteQuieto[] = (data ?? [])
    .filter((c) => c.agente_ativo !== false)
    .map((c) => ({
      nome: (c.nome_fantasia as string) || (c.name as string) || "Cliente",
      social: (c.assigned_social as string) || null,
      diasQuieto: Math.floor((Date.now() - new Date(c.last_client_msg_at as string).getTime()) / 86400000),
    }));

  const msg = buildEsfriandoDigest(clientes);
  const internalJid = process.env.CS_INTERNAL_GROUP_JID || null;
  let postada = false;
  if (ESFRIANDO_LIVE && internalJid && !previewOnly && msg) {
    const r = await csSendGroupText(internalJid, msg);
    postada = r.ok;
    if (!r.ok) console.error("[cs-esfriando] post falhou:", r.error);
  }

  console.log(`[cs-esfriando] dia=${ymd(now)} esfriando=${clientes.length} postada=${postada}`);
  return NextResponse.json({ ok: true, live: ESFRIANDO_LIVE, esfriando: clientes.length, postada, preview: msg || "(ninguém esfriando)" });
}
