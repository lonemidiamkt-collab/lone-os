export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import * as db from "@/lib/supabase/queries";
import { csSendGroupText } from "@/lib/cs/notify";
import { carregarExtras, EXTRAS_VAZIOS } from "@/lib/crm/extras";
import { DESTINO_AVISOS_COMERCIAL } from "@/lib/crm/acesso";
import { avisoDaMeta } from "@/lib/crm/avisos";
import { montarFilaHoje } from "@/lib/crm/hoje";
import { hojeSP, mesSP } from "@/lib/crm/meta";

// POST /api/system/crm-meta — COBRANÇA DA META do comercial, no máximo 1 aviso por dia:
//   segunda → resumo da semana (meta, falta, ritmo, contatos do dia, quem mexe no ponteiro);
//   ritmo abaixo do necessário por 3 dias úteis seguidos (de 3 em 3 dias, não todo dia);
//   marco do dia 10/20 com a projeção abaixo de 80% da meta.
// SINO de quem cuida do comercial com os números; WHATSAPP do dono (CS_OWNER_JID) só com o empurrão,
// sem valor (lib/crm/avisos.ts). Cron: seg a sex, 8h05 BRT (`5 11 * * 1-5`). ?dry=1 mostra sem enviar.
// Trava diária em automation_settings (chave `crm-meta:aviso`, como o vigia faz com `ia:<causa>`).

const CHAVE = "crm-meta:aviso";

export async function POST(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;
  const dry = req.nextUrl.searchParams.get("dry") !== null;
  const agora = new Date();
  const hoje = hojeSP(agora);

  const { data: trava } = await supabaseAdmin.from("automation_settings").select("ultimo_alerta_em").eq("job", CHAVE).maybeSingle();
  const ultimo = trava?.ultimo_alerta_em as string | null | undefined;
  if (!dry && ultimo && hojeSP(new Date(ultimo)) === hoje) return NextResponse.json({ ok: true, jaAvisouHoje: true });

  const [leads, meta] = await Promise.all([db.fetchCrmLeads(), db.fetchCrmMeta(mesSP(agora))]);
  const extras = await carregarExtras(leads.map((l) => l.id));
  const completos = leads.map((l) => ({ ...l, ...(extras.get(l.id) ?? EXTRAS_VAZIOS) }));
  const fila = montarFilaHoje(completos, hoje, agora);
  const aviso = avisoDaMeta({
    leads: completos, metaValor: meta?.metaValor ?? null, hoje,
    paraFazerHoje: fila.filter((i) => i.grupo !== "fim").length, esfriando: fila.filter((i) => i.grupo === "esfriando").length,
  });
  if (!aviso) return NextResponse.json({ ok: true, dry, aviso: null });
  if (dry) return NextResponse.json({ ok: true, dry, aviso });

  const { error: errSino } = await supabaseAdmin.from("notifications").insert({
    type: "content", title: aviso.titulo, body: aviso.corpo, target_user: DESTINO_AVISOS_COMERCIAL, read: false,
  });
  if (errSino) console.error("[crm-meta] sino:", errSino.message);
  const dono = process.env.CS_OWNER_JID || null;
  let whatsapp = false;
  if (dono) {
    const r = await csSendGroupText(dono, aviso.whatsapp, undefined, { origem: "crm-meta", destino: "interno" });
    whatsapp = r.ok;
  }
  await supabaseAdmin.from("automation_settings").upsert({ job: CHAVE, ultimo_alerta_em: agora.toISOString() }, { onConflict: "job" });
  console.log(`[crm-meta] motivo=${aviso.motivo} sino=${!errSino} whatsapp=${whatsapp}`);
  return NextResponse.json({ ok: true, motivo: aviso.motivo, sino: !errSino, whatsapp });
}
