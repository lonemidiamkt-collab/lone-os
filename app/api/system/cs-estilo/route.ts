export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import { chatJson, isOpenAIConfigured } from "@/lib/ai/openai";

// POST /api/system/cs-estilo — PASSO 2 do aprendizado de estilo. Lê o corpus (cs_message_corpus) e a
// IA resume o PERFIL DE ESTILO de comunicação: por CLIENTE (mensagens do cliente, is_team=false do
// grupo dele) e um GLOBAL do TIME da Lone (is_team=true). Guarda em agency_settings key
// `cs_style:<clientId>` e `cs_style:team`. NÃO liga no agente ainda — Roberto revisa antes (passo 3).
// ?dry=1 não grava. Cron sugerido: 1x/dia. Só gera se houver material suficiente.

const MIN_MSGS = 15;

const SCHEMA = {
  type: "object", additionalProperties: false, required: ["estilo"],
  properties: {
    estilo: { type: "string", description: "1 parágrafo curto: tom (formal/informal), uso de emojis, gírias/expressões típicas, tamanho das mensagens, como cumprimenta e fecha. Objetivo e prático." },
  },
};

async function resumirEstilo(amostra: string[]): Promise<string | null> {
  const texto = amostra.map((t) => `- ${t.slice(0, 240)}`).join("\n").slice(0, 6000);
  const r = await chatJson<{ estilo: string }>({
    model: "gpt-4o-mini",
    system: "Você analisa mensagens de WhatsApp e descreve o ESTILO de comunicação de quem escreve, pra outro assistente conseguir imitar o tom. Foque em: formalidade, emojis, gírias/expressões, comprimento típico, saudações/fechamentos. 1 parágrafo objetivo, sem inventar.",
    user: texto,
    schema: SCHEMA, schemaName: "perfil_estilo", maxTokens: 400,
  });
  return r.ok && r.data ? r.data.estilo : null;
}

async function salvar(key: string, value: string) {
  await supabaseAdmin.from("agency_settings").upsert({ key, value }, { onConflict: "key" });
}

export async function POST(req: NextRequest) {
  const denied = requireCron(req); if (denied) return denied;
  const dry = req.nextUrl.searchParams.get("dry") !== null;
  const onlyClient = req.nextUrl.searchParams.get("clientId");
  if (!isOpenAIConfigured()) return NextResponse.json({ error: "IA não configurada" }, { status: 503 });

  const trintaDias = new Date(Date.now() - 30 * 86400000).toISOString();
  const gerados: string[] = [];

  // Perfil do TIME (mensagens is_team=true, qualquer grupo) — só uma vez.
  if (!onlyClient) {
    const { data: team } = await supabaseAdmin
      .from("cs_message_corpus").select("text").eq("is_team", true)
      .gte("created_at", trintaDias).order("created_at", { ascending: false }).limit(80);
    if (team && team.length >= MIN_MSGS) {
      const estilo = await resumirEstilo(team.map((m) => m.text as string));
      if (estilo) { if (!dry) await salvar("cs_style:team", estilo); gerados.push("team"); }
    }
  }

  // Perfil por CLIENTE (mensagens do cliente no grupo dele).
  let cq = supabaseAdmin.from("clients").select("id, name, nome_fantasia, whatsapp_group_jid").not("whatsapp_group_jid", "is", null).or("active.is.null,active.eq.true");
  if (onlyClient) cq = supabaseAdmin.from("clients").select("id, name, nome_fantasia, whatsapp_group_jid").eq("id", onlyClient);
  const { data: clients } = await cq;

  for (const c of clients ?? []) {
    const jid = c.whatsapp_group_jid as string;
    if (!jid) continue;
    const { data: msgs } = await supabaseAdmin
      .from("cs_message_corpus").select("text").eq("group_jid", jid).eq("is_team", false)
      .gte("created_at", trintaDias).order("created_at", { ascending: false }).limit(60);
    if (!msgs || msgs.length < MIN_MSGS) continue;
    const estilo = await resumirEstilo(msgs.map((m) => m.text as string));
    if (estilo) { if (!dry) await salvar(`cs_style:${c.id}`, estilo); gerados.push((c.nome_fantasia as string) || (c.name as string)); }
  }

  return NextResponse.json({ ok: true, dry, perfis_gerados: gerados.length, detalhe: gerados });
}
