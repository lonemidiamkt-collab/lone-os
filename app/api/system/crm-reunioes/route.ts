export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import { DESTINO_AVISOS_COMERCIAL } from "@/lib/crm/acesso";
import { mandarNoGrupoVendas } from "@/lib/crm/grupo-vendas-envio";
import { deLinha } from "@/lib/crm/reunioes-server";
import { horaCurta, lembretesDevidos, textoHoraGrupo, textoVesperaGrupo } from "@/lib/crm/reunioes";

// POST /api/system/crm-reunioes — LEMBRETES das reuniões de venda no grupo de vendas (e no sino):
// véspera a partir das 9h e 1 hora antes, uma vez cada (crm_reunioes.lembrete_*_em). Regra em lib/crm/reunioes.ts.
// Cron: a cada 15 min, das 7h às 20h45 BRT (`*/15 10-23 * * *`). ?dry=1 mostra sem enviar.

export async function POST(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;
  const dry = req.nextUrl.searchParams.get("dry") !== null;
  const agora = new Date();
  const { data, error } = await supabaseAdmin.from("crm_reunioes")
    .select("*, crm_leads(empresa, contato_nome, telefone, endereco, cidade)")
    .eq("estado", "agendada").gt("inicio", agora.toISOString()).lte("inicio", new Date(agora.getTime() + 2 * 86_400_000).toISOString());
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const enviados: { id: string; tipo: string }[] = [];
  for (const linha of data ?? []) {
    const r = deLinha(linha);
    const l = linha.crm_leads as { empresa: string | null; contato_nome: string; telefone: string | null; endereco: string | null; cidade: string | null } | null;
    if (!l) continue;
    const lead = { empresa: l.empresa, contatoNome: l.contato_nome, telefone: l.telefone, endereco: l.endereco, cidade: l.cidade };
    const devidos = lembretesDevidos(r, agora);
    for (const tipo of ["vespera", "hora"] as const) {
      if (!devidos[tipo]) continue;
      if (dry) { enviados.push({ id: r.id, tipo }); continue; }
      // Marca ANTES de mandar: se o cron rodar de novo no meio, não repete.
      const coluna = tipo === "vespera" ? "lembrete_vespera_em" : "lembrete_hora_em";
      const { data: marcou } = await supabaseAdmin.from("crm_reunioes").update({ [coluna]: agora.toISOString() }).eq("id", r.id).is(coluna, null).select("id");
      if (!marcou?.length) continue;
      await mandarNoGrupoVendas(tipo === "vespera" ? textoVesperaGrupo(r, lead) : textoHoraGrupo(r, lead, agora), `crm-reuniao:${tipo}`);
      await supabaseAdmin.from("notifications").insert({
        type: "content", target_user: DESTINO_AVISOS_COMERCIAL, read: false,
        title: tipo === "vespera" ? `Comercial: reunião amanhã às ${horaCurta(r.inicio)} — ${lead.empresa || lead.contatoNome}` : `Comercial: reunião às ${horaCurta(r.inicio)} — ${lead.empresa || lead.contatoNome}`,
        body: r.meetUrl ?? r.local ?? "",
      });
      enviados.push({ id: r.id, tipo });
    }
  }
  console.log(`[crm-reunioes] lembretes=${enviados.length} dry=${dry}`);
  return NextResponse.json({ ok: true, dry, enviados });
}
