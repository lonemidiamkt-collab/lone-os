export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import { fetchClientCsRules } from "@/lib/supabase/queries";
import { sincronizarBriefingAprendido } from "@/lib/cs/briefing-sync";
import { chatJson, isOpenAIConfigured } from "@/lib/ai/openai";

// POST /api/system/cs-briefing-update — a IA "percebe" as conversas dos grupos e ENRIQUECE o briefing
// dos clientes: extrai FATOS de negócio/produto novos (lançou produto X, faz entrega em Y, promoção
// até Z) e grava como regra APRENDIDA (escopo negócio) → briefing-sync joga na seção "🧠 Aprendido".
// Lê o corpus cs_message_corpus (mensagens do CLIENTE, is_team=false). ?dry=1 não grava.
// Cron sugerido: 1x/dia. ?clientId=… roda só um cliente.

const SCHEMA = {
  type: "object", additionalProperties: false, required: ["fatos"],
  properties: {
    fatos: {
      type: "array",
      items: { type: "string" },
      description: "Fatos CONCRETOS e ÚTEIS sobre o negócio/produtos do cliente que valem estar no briefing. Vazio se não houver nada novo.",
    },
  },
};

export async function POST(req: NextRequest) {
  const denied = requireCron(req); if (denied) return denied;
  const dry = req.nextUrl.searchParams.get("dry") !== null;
  const onlyClient = req.nextUrl.searchParams.get("clientId");
  if (!isOpenAIConfigured()) return NextResponse.json({ error: "IA não configurada" }, { status: 503 });

  let q = supabaseAdmin.from("clients").select("id, name, nome_fantasia, whatsapp_group_jid").not("whatsapp_group_jid", "is", null).or("active.is.null,active.eq.true");
  if (onlyClient) q = supabaseAdmin.from("clients").select("id, name, nome_fantasia, whatsapp_group_jid").eq("id", onlyClient);
  const { data: clients } = await q;

  const seteDias = new Date(Date.now() - 7 * 86400000).toISOString();
  const resultados: { cliente: string; novos: number }[] = [];

  for (const c of clients ?? []) {
    const jid = c.whatsapp_group_jid as string;
    if (!jid) continue;
    // Mensagens do CLIENTE (não do time) nos últimos 7 dias.
    const { data: msgs } = await supabaseAdmin
      .from("cs_message_corpus").select("text")
      .eq("group_jid", jid).eq("is_team", false)
      .gte("created_at", seteDias).order("created_at", { ascending: false }).limit(60);
    if (!msgs || msgs.length < 8) continue; // pouco material → pula (sem IA)

    const conversa = msgs.map((m) => `- ${(m.text as string).slice(0, 300)}`).join("\n").slice(0, 6000);
    const r = await chatJson<{ fatos: string[] }>({
      model: "gpt-4o-mini",
      system: "Você lê mensagens do GRUPO de um cliente de uma agência de marketing e extrai FATOS de negócio/produto que valem estar no briefing dele (novos produtos/serviços, promoções com prazo, público, diferencial, área de entrega, horário, forma de contato). Regras: só fatos CONCRETOS e verificáveis ditos pelo cliente; NADA de fofoca, saudação, pedido de arte ou opinião; frases curtas e diretas; se não houver fato novo, retorne lista vazia. Máximo 6 fatos.",
      user: conversa,
      schema: SCHEMA, schemaName: "briefing_fatos", maxTokens: 500,
    });
    if (!r.ok || !r.data) continue;

    const existentes = (await fetchClientCsRules(c.id as string)).map((x) => x.texto.toLowerCase().trim());
    const novos = (r.data.fatos ?? [])
      .map((f) => f.trim())
      .filter((f) => f.length >= 6 && !existentes.some((e) => e.includes(f.toLowerCase()) || f.toLowerCase().includes(e)))
      .slice(0, 6);

    if (novos.length && !dry) {
      await supabaseAdmin.from("cs_client_rules").insert(
        novos.map((texto) => ({ client_id: c.id, texto, escopo: "sempre", origem: "aprendido", author: "IA (conversas)" }))
      );
      await sincronizarBriefingAprendido(c.id as string);
    }
    if (novos.length) resultados.push({ cliente: (c.nome_fantasia as string) || (c.name as string), novos: novos.length });
  }

  return NextResponse.json({ ok: true, dry, clientes_atualizados: resultados.length, detalhe: resultados });
}
