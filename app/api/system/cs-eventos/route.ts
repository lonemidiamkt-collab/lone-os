export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import { csSendGroupText } from "@/lib/cs/notify";
import { spNow } from "@/lib/cs/vigilancia";
import { resultadoDosEnvios, SEM_GRUPO_INTERNO, type FalhaEnvio } from "@/lib/automacoes/envios";

// POST /api/system/cs-eventos — lembra o time das DATAS/PROMOÇÕES que o cliente marcou (cs_client_events).
// Avisa faltando ~5 e ~2 dias, no grupo interno + notificação pro social. Cron diário (manhã).
// Janelas (robustas a dia perdido): 5d = evento a 3–5 dias sem aviso de 5d; 2d = evento a 0–2 dias sem 2d.
//
// 25/10/2026 (auditoria 10.4): marcava `reminded_5d/2d` sem olhar o envio — WhatsApp recusando, sem grupo
// interno ou leitura com erro, o lembrete sumia e a Central ficava verde. Agora só marca o que saiu (incerto
// marca para não duplicar, mas a rotina responde falha), e `ok` só quando tudo o que devia sair saiu.

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
  const falhas: FalhaEnvio[] = [];

  // Datas que já passaram: tira do radar.
  const { error: passouErr } = await supabaseAdmin.from("cs_client_events").update({ status: "passou" }).eq("status", "ativo").lt("event_date", hojeISO);
  if (passouErr) falhas.push({ alvo: "registro", erro: `não tirei do radar as datas que passaram: ${passouErr.message}` });

  const SEL = "id, titulo, descricao, event_date, assigned_social, client_id, client:clients(name, nome_fantasia)";

  async function lembrar(rows: EvRow[], marcar: "reminded_5d" | "reminded_2d") {
    for (const e of rows) {
      const dias = diasEntre(e.event_date, hojeISO);
      const nome = nomeCli(e);
      const quando = dias <= 0 ? "é HOJE" : dias === 1 ? "é AMANHÃ" : `faltam ${dias} dias`;
      // Sem grupo interno, o lembrete não sai: não marca (sai quando o grupo for configurado).
      if (!jid) { falhas.push({ alvo: `${nome} (${e.titulo})`, erro: SEM_GRUPO_INTERNO }); continue; }
      const envio = await csSendGroupText(jid, `⏰ *Lembrete — ${nome}* (${quando})\n*${e.titulo}* em ${brDate(e.event_date)}${e.assigned_social ? ` · ${e.assigned_social}` : ""}\n${e.descricao ? `_${e.descricao}_\n` : ""}\nBora preparar o conteúdo pra essa data! 🎯`,
        undefined, { origem: "cs-eventos-lembrete", destino: "interno" });
      if (!envio.ok && !envio.incerto) {
        // Certo que não saiu: não marca — amanhã a janela ainda pega e o lembrete sai.
        falhas.push({ alvo: `${nome} (${e.titulo})`, erro: envio.error ?? "o WhatsApp recusou" });
        continue;
      }
      if (envio.incerto) falhas.push({ alvo: `${nome} (${e.titulo})`, erro: `${envio.error ?? "sem resposta"} — pode ter saído, não repito` });
      if (e.client_id) {
        await supabaseAdmin.from("notifications").insert({
          type: "content", title: `⏰ ${nome}: ${e.titulo} (${quando})`,
          body: `Dia ${brDate(e.event_date)}. Preparar o post/arte pra essa data.`,
          client_id: e.client_id,
        }).then(() => {}, () => {});
      }
      const { error: mErr } = await supabaseAdmin.from("cs_client_events").update({ [marcar]: true }).eq("id", e.id);
      if (mErr) falhas.push({ alvo: `${nome} (${e.titulo})`, erro: `avisei, mas não marquei — pode repetir amanhã (${mErr.message})` });
      avisos.push(`${nome}/${marcar}:${e.titulo}`);
    }
  }

  // 5 dias (evento a 3–5 dias, sem aviso de 5d)
  const { data: ev5, error: e5 } = await supabaseAdmin.from("cs_client_events").select(SEL)
    .eq("status", "ativo").eq("reminded_5d", false)
    .gte("event_date", addDays(hoje, 3)).lte("event_date", addDays(hoje, 5));
  if (e5) falhas.push({ alvo: "leitura (5 dias)", erro: e5.message });
  await lembrar((ev5 ?? []) as unknown as EvRow[], "reminded_5d");

  // 2 dias (evento a 0–2 dias, sem aviso de 2d)
  const { data: ev2, error: e2 } = await supabaseAdmin.from("cs_client_events").select(SEL)
    .eq("status", "ativo").eq("reminded_2d", false)
    .gte("event_date", hojeISO).lte("event_date", addDays(hoje, 2));
  if (e2) falhas.push({ alvo: "leitura (2 dias)", erro: e2.message });
  await lembrar((ev2 ?? []) as unknown as EvRow[], "reminded_2d");

  return NextResponse.json({ ...resultadoDosEnvios(falhas), avisos: avisos.length, detalhe: avisos });
}
