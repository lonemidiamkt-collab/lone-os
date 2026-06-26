export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { supabaseAdmin } from "@/lib/supabase/server";
import { isOpenAIConfigured } from "@/lib/ai/openai";
import { parseUpsert, isTrivial, isLoneTeam, type EvolutionUpsert } from "@/lib/cs/ingest";
import { classifyBlock, type ClassifierContext } from "@/lib/cs/classifier";
import { csSendGroupText } from "@/lib/cs/notify";

// Webhook INBOUND do Agente CS — recebe `messages.upsert` da Evolution (número monitor[IA]).
// Rota PÚBLICA (Evolution não manda cookie/JWT) MAS autenticada por segredo (CS_INBOUND_SECRET).
// Fluxo SUGGEST-ONLY: A0 filtra → A1 classifica → grava demanda 'pendente' em cs_demandas e
// POSTA a sugestão no grupo interno com um código. NÃO cria card sozinho — só quando alguém
// responde "ok <código>" no grupo interno. Card só nasce na confirmação humana.

function authorized(req: NextRequest): boolean {
  const secret = process.env.CS_INBOUND_SECRET;
  if (!secret) return false; // sem segredo configurado → rota desligada (fail-closed)
  const got = req.headers.get("x-cs-secret") || req.nextUrl.searchParams.get("secret");
  return got === secret;
}

const splitEnv = (v?: string) => (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const teamJids = () => splitEnv(process.env.CS_LONE_TEAM_JIDS);
const pilotGroupAllowlist = () => splitEnv(process.env.CS_PILOT_GROUP_JIDS);
const internalGroupJid = () => process.env.CS_INTERNAL_GROUP_JID || null;
const isPilot = () => pilotGroupAllowlist().length > 0; // piloto = rótulo [TESTE] nos cards

const PRIO: Record<string, string> = { alta: "high", media: "medium", baixa: "low" };

// Comando de decisão no grupo interno: "ok <cod>" / "nao <cod>".
function parseDecision(text: string): { acao: "confirmar" | "descartar"; codigo: string } | null {
  const m = text.trim().match(/^(ok|sim|confirmar|confirma|nao|não|descartar|descarta)\s+([a-z0-9]{3,8})$/i);
  if (!m) return null;
  const acao = /^(ok|sim|confirm)/i.test(m[1]) ? "confirmar" : "descartar";
  return { acao, codigo: m[2].toLowerCase() };
}

async function criarCard(opts: {
  clientId: string; clienteNome: string; tipo: string; urgencia: string;
  confianca: number; resumo: string; messageText: string;
}): Promise<string | null> {
  const titulo = (isPilot() ? "[TESTE] " : "") + opts.resumo;
  const briefing =
    `Demanda confirmada via Agente CS.\n` +
    `Tipo: ${opts.tipo} · Urgência: ${opts.urgencia} · Confiança: ${opts.confianca}\n` +
    `Cliente: ${opts.clienteNome}\nMensagem original: "${opts.messageText}"`;
  const { data: card, error } = await supabaseAdmin
    .from("content_cards")
    .insert({
      title: titulo,
      client_id: opts.clientId,
      client_name: opts.clienteNome,
      status: "ideas",
      priority: PRIO[opts.urgencia] ?? "medium",
      briefing,
      requested_by_traffic: isPilot() ? "🤖 Agente CS (teste)" : "🤖 Agente CS",
      status_changed_at: new Date().toISOString(),
      column_entered_at: { ideas: new Date().toISOString() },
    })
    .select("id")
    .maybeSingle();
  if (error) { console.error("[CS] criar card:", error.message); return null; }
  return (card?.id as string) ?? null;
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const payload = (await req.json().catch(() => null)) as EvolutionUpsert | null;
  if (!payload) return NextResponse.json({ ok: true, skip: "corpo inválido" });

  const msg = parseUpsert(payload);
  if (!msg) return NextResponse.json({ ok: true, skip: "não é mensagem de grupo com texto" });
  if (msg.fromMe) return NextResponse.json({ ok: true, skip: "própria mensagem" });

  const allow = pilotGroupAllowlist();
  if (allow.length > 0 && !allow.includes(msg.groupJid)) {
    return NextResponse.json({ ok: true, skip: "fora da allowlist do piloto" });
  }

  // ─── Decisão humana (só no grupo interno): "ok <cod>" cria o card, "nao <cod>" descarta ───
  const decision = parseDecision(msg.text);
  if (decision && msg.groupJid === internalGroupJid()) {
    const { data: d } = await supabaseAdmin
      .from("cs_demandas").select("*").eq("codigo", decision.codigo).eq("status", "pendente").maybeSingle();
    if (!d) {
      await csSendGroupText(msg.groupJid, `❓ Código *${decision.codigo}* não encontrado (ou já decidido).`);
      return NextResponse.json({ ok: true, decision: "not_found" });
    }
    const decidedBy = msg.authorName || msg.authorJid;
    if (decision.acao === "descartar") {
      await supabaseAdmin.from("cs_demandas").update({ status: "descartada", decided_at: new Date().toISOString(), decided_by: decidedBy }).eq("id", d.id);
      await csSendGroupText(msg.groupJid, `❌ Demanda *${decision.codigo}* descartada.`);
      return NextResponse.json({ ok: true, decision: "descartada" });
    }
    const clientId = (d.client_id as string) || process.env.CS_TEST_CLIENT_ID || null;
    if (!clientId) {
      await csSendGroupText(msg.groupJid, `⚠️ Sem cliente para criar o card de *${decision.codigo}*.`);
      return NextResponse.json({ ok: true, decision: "sem_cliente" });
    }
    const cardId = await criarCard({
      clientId, clienteNome: (d.cliente_nome as string) || "Cliente", tipo: d.tipo as string,
      urgencia: d.urgencia as string, confianca: Number(d.confianca), resumo: (d.resumo as string) || (d.message_text as string),
      messageText: d.message_text as string,
    });
    await supabaseAdmin.from("cs_demandas").update({
      status: "confirmada", content_card_id: cardId, decided_at: new Date().toISOString(), decided_by: decidedBy,
    }).eq("id", d.id);
    await csSendGroupText(msg.groupJid, cardId
      ? `✅ Card criado: *${d.resumo}* (${d.tipo}/${d.urgencia}).`
      : `⚠️ Falha ao criar o card de *${decision.codigo}*.`);
    console.log(`[CS/inbound] demanda ${decision.codigo} confirmada → card ${cardId}`);
    return NextResponse.json({ ok: true, decision: "confirmada", cardId });
  }

  // ─── Mensagem de cliente: A0 → A1 → sugere ───
  if (isLoneTeam(msg.authorJid, teamJids())) return NextResponse.json({ ok: true, skip: "autor = equipe Lone" });
  if (isTrivial(msg.text)) return NextResponse.json({ ok: true, skip: "trivial" });

  const { data: clients } = await supabaseAdmin
    .from("clients")
    .select("id, name, nome_fantasia, nicho, campaign_briefing, fixed_briefing")
    .eq("whatsapp_group_jid", msg.groupJid);

  // Grupo de teste = na allowlist mas sem cliente mapeado (ex.: grupo Automação) → cliente sintético.
  const isTestGroup = (!clients || clients.length === 0) && allow.includes(msg.groupJid);
  if ((!clients || clients.length === 0) && !isTestGroup) {
    console.warn("[CS/inbound] grupo sem cliente mapeado:", msg.groupJid);
    return NextResponse.json({ ok: true, skip: "grupo sem cliente" });
  }

  const multiCliente = (clients?.length ?? 0) > 1;
  const c = clients?.[0];
  const clienteNome = isTestGroup ? "Cliente Teste" : (c?.nome_fantasia as string) || (c?.name as string) || "Cliente";

  if (!isOpenAIConfigured()) {
    return NextResponse.json({ ok: true, classified: false, reason: "A1 desligado (sem key)", cliente: clienteNome });
  }

  const ctx: ClassifierContext = {
    clienteNome,
    clienteNicho: isTestGroup ? undefined : (c?.nicho as string) || undefined,
    briefing: isTestGroup ? undefined : (c?.campaign_briefing as string) || (c?.fixed_briefing as string) || undefined,
    nomesEquipeLone: teamJids(),
    clientesDoGrupo: isTestGroup ? [clienteNome] : (clients ?? []).map((x) => (x.nome_fantasia as string) || (x.name as string)),
  };

  const res = await classifyBlock([{ author: msg.authorName || "Cliente", text: msg.text }], ctx);
  if (!res.ok || !res.data) {
    console.error("[CS/inbound] A1 falhou:", res.error);
    return NextResponse.json({ ok: true, classified: false, reason: res.error });
  }

  // Grava cada demanda como 'pendente' e posta a sugestão no grupo interno (suggest-only).
  const internalJid = internalGroupJid();
  const sugeridas: string[] = [];
  for (const it of res.data.itens.filter((i) => i.is_demanda && i.confianca >= 0.6)) {
    const codigo = randomBytes(2).toString("hex"); // 4 chars
    const { error: insErr } = await supabaseAdmin.from("cs_demandas").insert({
      codigo, group_jid: msg.groupJid, client_id: (c?.id as string) ?? null, cliente_nome: clienteNome,
      author: msg.authorName || msg.authorJid, message_id: msg.messageId, message_text: msg.text,
      tipo: it.tipo, urgencia: it.urgencia, confianca: it.confianca, resumo: it.resumo, status: "pendente",
    });
    if (insErr) { console.error("[CS/inbound] gravar demanda:", insErr.message); continue; }
    sugeridas.push(`${it.tipo}/${it.urgencia}[${codigo}]`);
    if (internalJid) {
      const txt =
        `🤖 *Possível demanda* — ${clienteNome}${multiCliente ? " (grupo multi-cliente!)" : ""}\n` +
        `"${msg.text.slice(0, 140)}"\n` +
        `Tipo: *${it.tipo}* · Urgência: *${it.urgencia}* · Confiança: ${it.confianca}\n` +
        `Resumo: ${it.resumo}\n\n` +
        `Responda: *ok ${codigo}* (criar card) · *nao ${codigo}* (descartar)`;
      const r = await csSendGroupText(internalJid, txt);
      if (!r.ok) console.error("[CS/inbound] post sugestão falhou:", r.error);
    }
  }

  console.log(`[CS/inbound] ${clienteNome} "${msg.text.slice(0, 60)}" → sugeridas: ${sugeridas.join(", ") || "nenhuma"}`);
  return NextResponse.json({ ok: true, classified: true, cliente: clienteNome, sugeridas, itens: res.data.itens });
}
