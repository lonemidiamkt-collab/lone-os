export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import * as db from "@/lib/supabase/queries";
import { carregarExtras, EXTRAS_VAZIOS } from "@/lib/crm/extras";
import { montarFilaHoje } from "@/lib/crm/hoje";
import { hojeSP } from "@/lib/crm/meta";
import { DESTINO_AVISOS_COMERCIAL } from "@/lib/crm/acesso";
import { textoFollowupsGrupo } from "@/lib/crm/grupo-vendas";
import { mandarNoGrupoVendas } from "@/lib/crm/grupo-vendas-envio";

// POST /api/system/crm-followups — lembrete de follow-up do comercial: a MESMA lista do Comercial →
// Hoje (lib/crm/hoje.ts: responder, reunião, retomar, esfriando, toque da régua, contato marcado)
// vira UMA notificação no sino de quem cuida do comercial e UMA mensagem no grupo de vendas do
// WhatsApp (CS_VENDAS_GROUP_JID), sem valor nenhum. Régua encerrada entra só como contagem de
// "esperando decisão". Cron: dias úteis 8h BRT (`0 11 * * 1-5`). ?dry=1 mostra sem enviar.

export async function POST(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;
  const dry = req.nextUrl.searchParams.get("dry") !== null;
  const agora = new Date();
  const hoje = hojeSP(agora);

  const leads = await db.fetchCrmLeads();
  const extras = await carregarExtras(leads.map((l) => l.id));
  const fila = montarFilaHoje(leads.map((l) => ({ ...l, ...(extras.get(l.id) ?? EXTRAS_VAZIOS) })), hoje, agora);
  const fazer = fila.filter((i) => i.grupo !== "fim");
  const decisoes = fila.length - fazer.length;
  const texto = textoFollowupsGrupo(fazer.map((i) => ({ empresa: i.lead.empresa, contatoNome: i.lead.contatoNome, motivo: i.motivo })), decisoes);

  if (dry || !texto) return NextResponse.json({ ok: true, dry, vencendo: fazer.length, decisoes, texto });

  let notificado = false;
  if (fazer.length > 0) {
    const nomes = fazer.slice(0, 6).map((i) => i.lead.empresa || i.lead.contatoNome).join(", ");
    const extra = fazer.length > 6 ? ` +${fazer.length - 6}` : "";
    const { error } = await supabaseAdmin.from("notifications").insert({
      type: "content",
      title: `Comercial: ${fazer.length} contato${fazer.length === 1 ? "" : "s"} pra fazer hoje`,
      body: `${nomes}${extra}`,
      target_user: DESTINO_AVISOS_COMERCIAL,
      read: false,
    });
    if (error) console.error("[crm-followups] notificação falhou:", error.message);
    notificado = !error;
  }
  const grupo = await mandarNoGrupoVendas(texto, "crm-followups");
  console.log(`[crm-followups] vencendo=${fazer.length} decisoes=${decisoes} sino=${notificado} grupo=${grupo.ok}`);
  return NextResponse.json({ ok: true, vencendo: fazer.length, decisoes, notificado, grupo: grupo.ok });
}
