export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import { csSendGroupText } from "@/lib/cs/notify";
import { spNow } from "@/lib/cs/vigilancia";

// POST /api/system/cs-eventos — lembra o time das DATAS/PROMOÇÕES que o cliente marcou (cs_client_events).
// Avisa faltando ~5 e ~2 dias, no grupo interno + notificação pro social. Cron diário (manhã).
// Janelas (robustas a dia perdido): 5d = evento a 3–5 dias sem aviso de 5d; 2d = evento a 0–2 dias sem 2d.

const addDays = (d: Date, n: number): string => { const x = new Date(d); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
const brDate = (iso: string): string => new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR");
const diasEntre = (iso: string, hojeISO: string): number =>
  Math.round((new Date(`${iso}T12:00:00`).getTime() - new Date(`${hojeISO}T12:00:00`).getTime()) / 86400000);

type EvRow = {
  id: string; titulo: string; descricao: string | null; event_date: string;
  assigned_social: string | null; client_id: string | null;
  client?: { name?: string; nome_fantasia?: string } | null;
};
const nomeCli = (e: EvRow) => e.client?.nome_fantasia || e.client?.name || "cliente";

export async function POST(req: NextRequest) {
  const denied = requireCron(req); if (denied) return denied;
  const jid = process.env.CS_INTERNAL_GROUP_JID || null;
  const hoje = spNow();
  const hojeISO = hoje.toISOString().slice(0, 10);
  const avisos: string[] = [];

  // Datas que já passaram: tira do radar.
  await supabaseAdmin.from("cs_client_events").update({ status: "passou" }).eq("status", "ativo").lt("event_date", hojeISO);

  const SEL = "id, titulo, descricao, event_date, assigned_social, client_id, client:clients(name, nome_fantasia)";

  async function lembrar(rows: EvRow[], marcar: "reminded_5d" | "reminded_2d") {
    for (const e of rows) {
      const dias = diasEntre(e.event_date, hojeISO);
      const nome = nomeCli(e);
      const quando = dias <= 0 ? "é HOJE" : dias === 1 ? "é AMANHÃ" : `faltam ${dias} dias`;
      if (jid) {
        await csSendGroupText(jid, `⏰ *Lembrete — ${nome}* (${quando})\n*${e.titulo}* em ${brDate(e.event_date)}${e.assigned_social ? ` · ${e.assigned_social}` : ""}\n${e.descricao ? `_${e.descricao}_\n` : ""}\nBora preparar o conteúdo pra essa data! 🎯`);
      }
      if (e.client_id) {
        await supabaseAdmin.from("notifications").insert({
          type: "content", title: `⏰ ${nome}: ${e.titulo} (${quando})`,
          body: `Dia ${brDate(e.event_date)}. Preparar o post/arte pra essa data.`,
          client_id: e.client_id,
        }).then(() => {}, () => {});
      }
      await supabaseAdmin.from("cs_client_events").update({ [marcar]: true }).eq("id", e.id);
      avisos.push(`${nome}/${marcar}:${e.titulo}`);
    }
  }

  // 5 dias (evento a 3–5 dias, sem aviso de 5d)
  const { data: ev5 } = await supabaseAdmin.from("cs_client_events").select(SEL)
    .eq("status", "ativo").eq("reminded_5d", false)
    .gte("event_date", addDays(hoje, 3)).lte("event_date", addDays(hoje, 5));
  await lembrar((ev5 ?? []) as unknown as EvRow[], "reminded_5d");

  // 2 dias (evento a 0–2 dias, sem aviso de 2d)
  const { data: ev2 } = await supabaseAdmin.from("cs_client_events").select(SEL)
    .eq("status", "ativo").eq("reminded_2d", false)
    .gte("event_date", hojeISO).lte("event_date", addDays(hoje, 2));
  await lembrar((ev2 ?? []) as unknown as EvRow[], "reminded_2d");

  return NextResponse.json({ ok: true, avisos: avisos.length, detalhe: avisos });
}
