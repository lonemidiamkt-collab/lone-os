export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { supabaseAdmin } from "@/lib/supabase/server";
import { isOpenAIConfigured } from "@/lib/ai/openai";
import { parseUpsert, isTrivial, isLoneTeam, type EvolutionUpsert } from "@/lib/cs/ingest";
import { classifyBlock, type ClassifierContext } from "@/lib/cs/classifier";
import { csSendGroupText } from "@/lib/cs/notify";
import { tipoToArea, resolveResponsavel } from "@/lib/cs/routing";
import { gerarBriefing, formatBriefing } from "@/lib/cs/briefing";
import type { CsDemandType } from "@/lib/cs/taxonomy";

// Webhook INBOUND do Agente CS — `messages.upsert` da Evolution (monitor[IA]). Suggest-only:
// A0 filtra → A1 classifica → A3 redige o briefing (regras do cliente) → posta a sugestão no
// grupo interno NOMEANDO o responsável (assigned_*). Card só nasce no "ok <código>".

const CLIENT_COLS =
  "id, name, nome_fantasia, nicho, campaign_briefing, fixed_briefing, assigned_social, assigned_designer, assigned_traffic";

function authorized(req: NextRequest): boolean {
  const secret = process.env.CS_INBOUND_SECRET;
  if (!secret) return false;
  const got = req.headers.get("x-cs-secret") || req.nextUrl.searchParams.get("secret");
  return got === secret;
}

const splitEnv = (v?: string) => (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const teamJids = () => splitEnv(process.env.CS_LONE_TEAM_JIDS);
const pilotGroupAllowlist = () => splitEnv(process.env.CS_PILOT_GROUP_JIDS);
const internalGroupJid = () => process.env.CS_INTERNAL_GROUP_JID || null;
const isPilot = () => pilotGroupAllowlist().length > 0;

const PRIO: Record<string, string> = { alta: "high", media: "medium", baixa: "low" };

type ClientRow = Record<string, unknown>;
const nomeOf = (c?: ClientRow | null) =>
  ((c?.nome_fantasia as string) || (c?.name as string) || "Cliente");

function parseDecision(text: string): { acao: "confirmar" | "descartar"; codigo: string } | null {
  const m = text.trim().match(/^(ok|sim|confirmar|confirma|nao|não|descartar|descarta)\s+([a-z0-9]{3,8})$/i);
  if (!m) return null;
  const acao = /^(ok|sim|confirm)/i.test(m[1]) ? "confirmar" : "descartar";
  return { acao, codigo: m[2].toLowerCase() };
}

async function criarCard(opts: {
  clientId: string; clienteNome: string; responsavel?: string | null;
  titulo: string; urgencia: string; briefing: string;
}): Promise<string | null> {
  const { data: card, error } = await supabaseAdmin
    .from("content_cards")
    .insert({
      title: (isPilot() ? "[TESTE] " : "") + opts.titulo,
      client_id: opts.clientId,
      client_name: opts.clienteNome,
      social_media: opts.responsavel || null,
      status: "ideas",
      priority: PRIO[opts.urgencia] ?? "medium",
      briefing: opts.briefing,
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

  // ─── Decisão humana (grupo interno): "ok <cod>" cria o card; "nao <cod>" descarta ───
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
      await csSendGroupText(msg.groupJid, `❌ Demanda *${decision.codigo}* descartada — você cuida então. 👍`);
      return NextResponse.json({ ok: true, decision: "descartada" });
    }
    const clientId = (d.client_id as string) || process.env.CS_TEST_CLIENT_ID || null;
    if (!clientId) {
      await csSendGroupText(msg.groupJid, `⚠️ Sem cliente para criar o card de *${decision.codigo}*.`);
      return NextResponse.json({ ok: true, decision: "sem_cliente" });
    }
    const cardId = await criarCard({
      clientId, clienteNome: (d.cliente_nome as string) || "Cliente", responsavel: d.responsavel as string | null,
      titulo: (d.resumo as string) || (d.message_text as string), urgencia: d.urgencia as string,
      briefing: (d.briefing as string) || (d.message_text as string),
    });
    await supabaseAdmin.from("cs_demandas").update({
      status: "confirmada", content_card_id: cardId, decided_at: new Date().toISOString(), decided_by: decidedBy,
    }).eq("id", d.id);
    await csSendGroupText(msg.groupJid, cardId
      ? `✅ Pronto! Criei o card *${d.resumo}* nas demandas${d.responsavel ? ` pra ${d.responsavel}` : ""}.`
      : `⚠️ Falha ao criar o card de *${decision.codigo}*.`);
    console.log(`[CS/inbound] demanda ${decision.codigo} confirmada → card ${cardId}`);
    return NextResponse.json({ ok: true, decision: "confirmada", cardId });
  }

  // ─── Mensagem de cliente: A0 → A1 → A3 → sugere ───
  if (isLoneTeam(msg.authorJid, teamJids())) return NextResponse.json({ ok: true, skip: "autor = equipe Lone" });
  if (isTrivial(msg.text)) return NextResponse.json({ ok: true, skip: "trivial" });

  let { data: clients } = await supabaseAdmin.from("clients").select(CLIENT_COLS).eq("whatsapp_group_jid", msg.groupJid);
  const isTestGroup = (!clients || clients.length === 0) && allow.includes(msg.groupJid);
  if (isTestGroup && process.env.CS_TEST_CLIENT_ID) {
    // Grupo de teste: usa o cliente de teste (com briefing/assigned cadastrados) como stand-in.
    const { data: t } = await supabaseAdmin.from("clients").select(CLIENT_COLS).eq("id", process.env.CS_TEST_CLIENT_ID).maybeSingle();
    if (t) clients = [t];
  }
  if (!clients || clients.length === 0) {
    console.warn("[CS/inbound] grupo sem cliente mapeado:", msg.groupJid);
    return NextResponse.json({ ok: true, skip: "grupo sem cliente" });
  }

  const multiCliente = clients.length > 1;
  const c = clients[0];
  const clienteNome = nomeOf(c);
  const clienteBriefing = (c.campaign_briefing as string) || (c.fixed_briefing as string) || undefined;

  if (!isOpenAIConfigured()) {
    return NextResponse.json({ ok: true, classified: false, reason: "A1 desligado (sem key)", cliente: clienteNome });
  }

  const ctx: ClassifierContext = {
    clienteNome,
    clienteNicho: (c.nicho as string) || undefined,
    briefing: clienteBriefing,
    nomesEquipeLone: teamJids(),
    clientesDoGrupo: clients.map(nomeOf),
  };

  const res = await classifyBlock([{ author: msg.authorName || "Cliente", text: msg.text }], ctx);
  if (!res.ok || !res.data) {
    console.error("[CS/inbound] A1 falhou:", res.error);
    return NextResponse.json({ ok: true, classified: false, reason: res.error });
  }

  const internalJid = internalGroupJid();
  const sugeridas: string[] = [];
  for (const it of res.data.itens.filter((i) => i.is_demanda && i.confianca >= 0.6)) {
    const area = tipoToArea(it.tipo as CsDemandType);
    const responsavel = resolveResponsavel(area, {
      assigned_social: c.assigned_social as string, assigned_designer: c.assigned_designer as string, assigned_traffic: c.assigned_traffic as string,
    });

    // A3 — redige o briefing seguindo as regras do cliente (não inventa; pede o que falta).
    const a3 = await gerarBriefing({
      clienteNome, clienteNicho: c.nicho as string, clienteBriefing,
      tipo: it.tipo, urgencia: it.urgencia, resumo: it.resumo, mensagemOriginal: msg.text,
    });
    const briefingTxt = a3.ok && a3.data ? formatBriefing(a3.data) : `${it.resumo}\nMensagem: "${msg.text}"`;
    const titulo = a3.ok && a3.data ? a3.data.titulo : it.resumo;

    const codigo = randomBytes(2).toString("hex");
    const { error: insErr } = await supabaseAdmin.from("cs_demandas").insert({
      codigo, group_jid: msg.groupJid, client_id: (c.id as string) ?? null, cliente_nome: clienteNome,
      author: msg.authorName || msg.authorJid, message_id: msg.messageId, message_text: msg.text,
      tipo: it.tipo, urgencia: it.urgencia, confianca: it.confianca, resumo: titulo,
      briefing: briefingTxt, responsavel, status: "pendente",
    });
    if (insErr) { console.error("[CS/inbound] gravar demanda:", insErr.message); continue; }
    sugeridas.push(`${it.tipo}/${it.urgencia}[${codigo}→${responsavel}]`);

    if (internalJid) {
      const txt =
        `${responsavel}, a *${clienteNome}* pediu: ${it.resumo}.\n` +
        `Montei o briefing seguindo as regras do cliente — *mando pras demandas (crio o card) ou você envia?*\n\n` +
        `${briefingTxt}\n\n` +
        `Responda: *ok ${codigo}* (criar card) · *nao ${codigo}* (você cuida)`;
      const r = await csSendGroupText(internalJid, txt);
      if (!r.ok) console.error("[CS/inbound] post sugestão falhou:", r.error);
    }
  }

  console.log(`[CS/inbound] ${clienteNome} "${msg.text.slice(0, 60)}" → ${sugeridas.join(", ") || "nenhuma demanda"}`);
  return NextResponse.json({ ok: true, classified: true, cliente: clienteNome, sugeridas, multiCliente });
}
