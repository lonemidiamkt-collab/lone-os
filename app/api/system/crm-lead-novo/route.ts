export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import { csSendGroupText } from "@/lib/cs/notify";
import { mandarNoGrupoVendas } from "@/lib/crm/grupo-vendas-envio";
import { DESTINO_AVISOS_COMERCIAL } from "@/lib/crm/acesso";
import { leadsParaLembrete, textosLembrete, type LeadNovoSite } from "@/lib/crm/avisos";

// POST /api/system/crm-lead-novo — lead que chegou pelo FORMULÁRIO DO SITE e ninguém respondeu em
// 1 hora vira UM lembrete (por lead, uma vez só): sino de quem cuida do comercial + grupo de vendas
// (CS_VENDAS_GROUP_JID; sem ele, o WhatsApp do dono, CS_OWNER_JID), sem valor nenhum. Das 8h às 20h; o que chega de madrugada é lembrado às 8h.
// Cron: a cada 15 min, seg a sáb, 8h–20h45 BRT (`*/15 11-23 * * 1-6`). ?dry=1 mostra sem enviar.
// Marca em crm_recebidos.lembrete_em (migration 20261017200000).

export async function POST(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;
  const dry = req.nextUrl.searchParams.get("dry") !== null;
  const agora = new Date();

  const { data: recebidos, error } = await supabaseAdmin.from("crm_recebidos")
    .select("externo_id, lead_id, lembrete_em")
    .eq("resultado", "criado").is("lembrete_em", null).not("lead_id", "is", null)
    .gte("criado_em", new Date(agora.getTime() - 7 * 86_400_000).toISOString()).limit(200);
  if (error) {
    console.error("[crm-lead-novo] crm_recebidos:", error.message);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  const ids = (recebidos ?? []).map((r) => r.lead_id as string);
  if (!ids.length) return NextResponse.json({ ok: true, dry, lembrados: 0 });

  const { data: leads } = await supabaseAdmin.from("crm_leads")
    .select("id, empresa, contato_nome, segmento, estagio, created_at, primeiro_contato_em").in("id", ids);
  const candidatos: LeadNovoSite[] = (leads ?? []).map((l) => ({
    id: l.id as string, empresa: (l.empresa as string) ?? null, contatoNome: (l.contato_nome as string) ?? "",
    segmento: (l.segmento as string) ?? null, estagio: l.estagio as string, createdAt: l.created_at as string,
    primeiroContatoEm: (l.primeiro_contato_em as string) ?? null, lembreteEm: null,
  }));
  const devidos = leadsParaLembrete(candidatos, agora);
  // Quem já foi respondido (ou saiu de Novo) não precisa mais de lembrete: marca para não reavaliar.
  const resolvidos = candidatos.filter((l) => l.estagio !== "novo" || l.primeiroContatoEm).map((l) => l.id);
  if (!devidos.length) {
    if (!dry && resolvidos.length) await supabaseAdmin.from("crm_recebidos").update({ lembrete_em: agora.toISOString() }).in("lead_id", resolvidos);
    return NextResponse.json({ ok: true, dry, lembrados: 0, resolvidos: resolvidos.length });
  }

  const t = textosLembrete(devidos);
  if (dry) return NextResponse.json({ ok: true, dry, lembrados: devidos.length, texto: t });

  const { error: errSino } = await supabaseAdmin.from("notifications").insert({
    type: "content", title: t.titulo, body: t.corpo, target_user: DESTINO_AVISOS_COMERCIAL, read: false,
  });
  if (errSino) console.error("[crm-lead-novo] sino:", errSino.message);
  let whatsapp = false;
  if (process.env.CS_VENDAS_GROUP_JID) {
    whatsapp = (await mandarNoGrupoVendas(t.whatsapp, "crm-lead-novo")).ok;
  } else if (process.env.CS_OWNER_JID) {
    const r = await csSendGroupText(process.env.CS_OWNER_JID, t.whatsapp, undefined, { origem: "crm-lead-novo", destino: "interno" });
    whatsapp = r.ok;
  }
  await supabaseAdmin.from("crm_recebidos").update({ lembrete_em: agora.toISOString() }).in("lead_id", [...devidos.map((l) => l.id), ...resolvidos]);
  console.log(`[crm-lead-novo] lembrados=${devidos.length} whatsapp=${whatsapp}`);
  return NextResponse.json({ ok: true, lembrados: devidos.length, sino: !errSino, whatsapp });
}
