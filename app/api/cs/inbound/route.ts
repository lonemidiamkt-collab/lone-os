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
import { verificarDemanda, A2_TRUST_FROM } from "@/lib/cs/verifier";
import { interpretarResposta } from "@/lib/cs/interpreter";
import { detectarAprovacao } from "@/lib/cs/aprovacao";
import type { CsDemandType } from "@/lib/cs/taxonomy";

// Janela de coalescência (debounce): mensagens do mesmo autor+grupo dentro desta janela
// enriquecem a demanda pendente em vez de criar/postar uma nova (evita spam de rajada).
const COALESCE_WINDOW_S = 90;

// Webhook INBOUND do Agente CS — `messages.upsert` da Evolution (monitor[IA]). Suggest-only:
// A0 filtra → A1 classifica → A3 redige o briefing (regras do cliente) → posta a sugestão no
// grupo interno NOMEANDO o responsável (assigned_*). Card só nasce no "ok <código>".

const CLIENT_COLS =
  "id, name, nome_fantasia, nicho, campaign_briefing, fixed_briefing, assigned_social, assigned_designer, assigned_traffic, agente_ativo";

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

// T7: variações pra confirmação/descarte não parecerem script. T9: descarte admite aprendizado.
const pick = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)];
function ackCriado(resumo: string, resp?: string | null): string {
  return pick([
    `Fechou! Criei o card *${resumo}*${resp ? ` pro ${resp}` : ""}.`,
    `Show, *${resumo}* já tá no Kanban${resp ? ` com o ${resp}` : ""}.`,
    `Combinado — mandei *${resumo}* pra produção.`,
    `Beleza, *${resumo}* criado${resp ? ` pro ${resp}` : ""}. Tamo junto.`,
    `Pronto, subi o card *${resumo}*.`,
  ]);
}
function ackDescartado(resumo: string): string {
  return pick([
    `Beleza, tirei *${resumo}* da fila — você cuida então. Anotei pra não confundir esse tipo de novo.`,
    `Tranquilo, deixo *${resumo}* de fora. Vou ficar esperto pra não te chamar à toa.`,
    `Fechou, descartei *${resumo}*. Valeu o toque — assim eu aprendo.`,
  ]);
}

// Sem código nas mensagens: a equipe RESPONDE (reply) a sugestão com "ok"/"não". Código vira
// opcional só por legado/hábito.
function parseDecision(text: string): { acao: "confirmar" | "descartar"; codigo?: string } | null {
  const m = text.trim().match(/^(ok|sim|confirmar|confirma|nao|não|descartar|descarta)(?:\s+([a-z0-9]{3,8}))?$/i);
  if (!m) return null;
  const acao = /^(ok|sim|confirm)/i.test(m[1]) ? "confirmar" : "descartar";
  return { acao, codigo: m[2]?.toLowerCase() };
}

// "ajustar <o que mudar>" — refina o briefing antes de criar o card (anexa VERBATIM, não re-gera).
function parseAjuste(text: string): { instrucao: string } | null {
  const m = text.trim().match(/^(ajustar|ajusta|ajuste)\s+([\s\S]+)$/i);
  if (!m) return null;
  return { instrucao: m[2].trim() };
}

// Heurística: a mensagem parece um PEDIDO NOVO (não uma resposta à demanda pendente)? Se sim e
// não for reply, não chama o interpretador — manda direto pro fluxo de classificação (nova demanda).
function pareceNovoPedido(text: string): boolean {
  const t = text.toLowerCase();
  return /\bcliente\b.*\b(pediu|solicit|quer|querem|precisa|mandou|pedindo)\b/.test(t)
    || /^\s*(preciso|precisamos|quero|queremos|faz|fazer|cria|criar|monta|montar|manda|fa[çc]a)\b.*\b(arte|post|an[úu]ncio|story|stories|panfleto|banner|card|pe[çc]a|cria[çc][aã]o|flyer|reels|v[íi]deo)/.test(t)
    || /\b(nova arte|outra arte|novo pedido|nova demanda|outra demanda|nova pe[çc]a)\b/.test(t);
}

// Acha a demanda PENDENTE alvo da resposta: 1) reply na sugestão (msg citada via quotedMsgId),
// 2) código (se a pessoa digitar, legado), 3) a última pendente (fallback se não deu reply).
async function acharDemanda(quotedMsgId?: string, codigo?: string) {
  if (quotedMsgId) {
    const { data } = await supabaseAdmin.from("cs_demandas").select("*").eq("msg_id_sugestao", quotedMsgId).eq("status", "pendente").maybeSingle();
    if (data) return data;
  }
  if (codigo) {
    const { data } = await supabaseAdmin.from("cs_demandas").select("*").eq("codigo", codigo).eq("status", "pendente").maybeSingle();
    if (data) return data;
  }
  const { data } = await supabaseAdmin.from("cs_demandas").select("*").eq("status", "pendente").order("created_at", { ascending: false }).limit(1).maybeSingle();
  return data ?? null;
}

async function criarCard(opts: {
  clientId: string; clienteNome: string; responsavel?: string | null;
  titulo: string; urgencia: string; briefing: string;
}): Promise<string | null> {
  // O card é CONTEÚDO do cliente → o DONO (social_media) é o assigned_social, pra aparecer no
  // board do social responsável pela carteira. O "responsável" da demanda (designer p/ arte) serve
  // só pro @ na sugestão; o designer enxerga o card pelo board dele (filtra por assigned_designer),
  // independente do social_media. Sem isso, card de arte ficava com social_media=designer e sumia
  // do board do social dono do cliente.
  const { data: cli } = await supabaseAdmin.from("clients").select("assigned_social").eq("id", opts.clientId).maybeSingle();
  const dono = ((cli?.assigned_social as string) || opts.responsavel || "").trim() || null;
  const { data: card, error } = await supabaseAdmin
    .from("content_cards")
    .insert({
      title: (isPilot() ? "[TESTE] " : "") + opts.titulo,
      client_id: opts.clientId,
      client_name: opts.clienteNome,
      social_media: dono,
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

  // ─── Decisão humana (grupo interno): RESPONDA a sugestão com "ok" (cria) ou "não" (descarta) ───
  const decision = parseDecision(msg.text);
  if (decision && msg.groupJid === internalGroupJid()) {
    const d = await acharDemanda(msg.quotedMsgId, decision.codigo);
    if (!d) {
      await csSendGroupText(msg.groupJid, `❓ Não achei a sugestão — responde *na própria mensagem* do agente (dá um "reply") que aí eu sei qual é. 😉`);
      return NextResponse.json({ ok: true, decision: "not_found" });
    }
    const decidedBy = msg.authorName || msg.authorJid;
    const sug = (d.msg_id_sugestao as string) || undefined; // threading: responde a sugestão
    if (decision.acao === "descartar") {
      await supabaseAdmin.from("cs_demandas").update({ status: "descartada", decided_at: new Date().toISOString(), decided_by: decidedBy }).eq("id", d.id);
      await csSendGroupText(msg.groupJid, ackDescartado(d.resumo as string), sug);
      return NextResponse.json({ ok: true, decision: "descartada" });
    }
    const clientId = (d.client_id as string) || process.env.CS_TEST_CLIENT_ID || null;
    if (!clientId) {
      await csSendGroupText(msg.groupJid, `⚠️ Sem cliente pra criar o card de *${d.resumo}*.`, sug);
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
      ? ackCriado(d.resumo as string, d.responsavel as string | null)
      : `Eita, deu ruim pra criar o card de *${d.resumo}* — pode tentar de novo?`, sug);
    console.log(`[CS/inbound] demanda ${d.codigo} confirmada → card ${cardId}`);
    return NextResponse.json({ ok: true, decision: "confirmada", cardId });
  }

  // ─── Ajuste humano: RESPONDA a sugestão com "ajustar <o que mudar>" → enriquece o briefing ───
  const ajuste = parseAjuste(msg.text);
  if (ajuste && msg.groupJid === internalGroupJid()) {
    const d = await acharDemanda(msg.quotedMsgId);
    if (!d) {
      await csSendGroupText(msg.groupJid, `❓ Não achei a sugestão pra ajustar — responde *na própria mensagem* do agente. 😉`);
      return NextResponse.json({ ok: true, ajuste: "not_found" });
    }
    const quem = msg.authorName || msg.authorJid;
    const sugAj = (d.msg_id_sugestao as string) || undefined; // threading
    const novoBriefing = `${(d.briefing as string) || (d.message_text as string)}\n\n---\n✏️ Ajuste (${quem}): ${ajuste.instrucao}`;
    await supabaseAdmin.from("cs_demandas").update({ briefing: novoBriefing }).eq("id", d.id);
    const r = await csSendGroupText(msg.groupJid,
      `✏️ Anotei o ajuste em *${d.resumo}*:\n\n${novoBriefing}\n\nResponde *ok* aqui que eu crio o card já com o ajuste.`, sugAj);
    if (r.ok && r.id) await supabaseAdmin.from("cs_demandas").update({ msg_id_sugestao: r.id }).eq("id", d.id);
    console.log(`[CS/inbound] demanda ${d.codigo} ajustada por ${quem}`);
    return NextResponse.json({ ok: true, ajuste: "ok" });
  }

  // ─── Resposta NATURAL da equipe (não foi keyword): interpreta a intenção com IA ───
  // Ex.: "coloca que a entrega é 8h-17h, pode criar" → entende = confirmar + complemento, cria o
  // card e responde no tom da Lone. Só dispara se há demanda pendente RECENTE (ou um reply).
  if (msg.groupJid === internalGroupJid() && !isTrivial(msg.text) && isOpenAIConfigured()) {
    const alvo = await acharDemanda(msg.quotedMsgId);
    const recente = !!alvo && (!!msg.quotedMsgId || (Date.now() - new Date(alvo.created_at as string).getTime() < 30 * 60 * 1000));
    // Só interpreta como RESPOSTA se: for reply à sugestão, OU (há pendente recente E NÃO parece
    // pedido novo). Pedido novo sem reply → cai no fluxo de classificação (cria demanda nova).
    const ehResposta = recente && (!!msg.quotedMsgId || !pareceNovoPedido(msg.text));
    if (alvo && ehResposta) {
      const interp = await interpretarResposta({
        clienteNome: (alvo.cliente_nome as string) || "Cliente",
        resumo: (alvo.resumo as string) || (alvo.message_text as string) || "",
        briefing: (alvo.briefing as string) || "",
        mensagemEquipe: msg.text,
        responsavel: (alvo.responsavel as string) || msg.authorName || "",
      });
      if (interp.ok && interp.data && interp.data.acao !== "ignorar") {
        const i = interp.data;
        const quem = msg.authorName || msg.authorJid;
        const sug = (alvo.msg_id_sugestao as string) || undefined; // threading: responde a sugestão
        let briefingFinal = (alvo.briefing as string) || (alvo.message_text as string) || "";
        if (i.complemento) {
          briefingFinal = `${briefingFinal}\n\n---\n✏️ ${quem}: ${i.complemento}`.trim();
          await supabaseAdmin.from("cs_demandas").update({ briefing: briefingFinal }).eq("id", alvo.id);
        }
        // Memória do cliente: fato durável → anexa ao fixed_briefing pra não perguntar de novo.
        if (i.aprendizado && alvo.client_id) {
          const { data: cli } = await supabaseAdmin.from("clients").select("fixed_briefing").eq("id", alvo.client_id as string).maybeSingle();
          const fb = (cli?.fixed_briefing as string) || "";
          if (!fb.includes(i.aprendizado)) {
            await supabaseAdmin.from("clients").update({ fixed_briefing: `${fb}\n📌 (CS) ${i.aprendizado}`.trim() }).eq("id", alvo.client_id as string);
            console.log(`[CS/inbound] aprendi sobre ${alvo.cliente_nome}: ${i.aprendizado}`);
          }
        }
        if (i.acao === "descartar") {
          await supabaseAdmin.from("cs_demandas").update({ status: "descartada", decided_at: new Date().toISOString(), decided_by: quem }).eq("id", alvo.id);
          await csSendGroupText(msg.groupJid, i.resposta, sug);
          return NextResponse.json({ ok: true, interp: "descartada" });
        }
        if (i.acao === "confirmar") {
          const clientId = (alvo.client_id as string) || process.env.CS_TEST_CLIENT_ID || null;
          let cardId: string | null = null;
          if (clientId) cardId = await criarCard({
            clientId, clienteNome: (alvo.cliente_nome as string) || "Cliente", responsavel: alvo.responsavel as string | null,
            titulo: (alvo.resumo as string) || (alvo.message_text as string), urgencia: alvo.urgencia as string,
            briefing: briefingFinal,
          });
          await supabaseAdmin.from("cs_demandas").update({ status: "confirmada", content_card_id: cardId, decided_at: new Date().toISOString(), decided_by: quem }).eq("id", alvo.id);
          await csSendGroupText(msg.groupJid, i.resposta, sug);
          console.log(`[CS/inbound] interp ${alvo.codigo} → confirmada, card ${cardId}`);
          return NextResponse.json({ ok: true, interp: "confirmada", cardId });
        }
        // ajustar → segue pendente; manda o ack (a IA já frasou "anotei, e aí?")
        const r = await csSendGroupText(msg.groupJid, i.resposta, sug);
        if (r.ok && r.id) await supabaseAdmin.from("cs_demandas").update({ msg_id_sugestao: r.id }).eq("id", alvo.id);
        return NextResponse.json({ ok: true, interp: "ajustada" });
      }
    }
  }

  // ─── Mensagem de cliente: A0 → A1 → A3 → sugere ───
  if (isLoneTeam(msg.authorJid, teamJids())) return NextResponse.json({ ok: true, skip: "autor = equipe Lone" });
  if (isTrivial(msg.text)) return NextResponse.json({ ok: true, skip: "trivial" });

  // Dedup: a Evolution reenvia `messages.upsert`. Se este message_id já gerou demanda, ignora.
  if (msg.messageId) {
    const { data: jaProcessada } = await supabaseAdmin
      .from("cs_demandas").select("id").eq("message_id", msg.messageId).limit(1).maybeSingle();
    if (jaProcessada) return NextResponse.json({ ok: true, skip: "message_id já processado (dedup)" });
  }

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
  if (c.agente_ativo === false) return NextResponse.json({ ok: true, skip: "agente pausado p/ este cliente" }); // S8
  const clienteNome = nomeOf(c);
  const clienteBriefing = (c.campaign_briefing as string) || (c.fixed_briefing as string) || undefined;

  // ─── S3: o cliente APROVOU uma arte entregue? Marca o card e avisa o time (não publica sozinho). ───
  if (isOpenAIConfigured()) {
    const { data: cardAprov } = await supabaseAdmin
      .from("content_cards")
      .select("id, title")
      .eq("client_id", c.id as string)
      .is("client_approved_at", null)
      .not("designer_delivered_at", "is", null)
      .neq("status", "published")
      .order("designer_delivered_at", { ascending: false })
      .limit(1).maybeSingle();
    if (cardAprov) {
      const ap = await detectarAprovacao(msg.text, (cardAprov.title as string) || clienteNome);
      if (ap.ok && ap.data?.aprovou) {
        await supabaseAdmin.from("content_cards").update({ client_approved_at: new Date().toISOString() }).eq("id", cardAprov.id);
        const jid = internalGroupJid();
        if (jid) await csSendGroupText(jid, `🎉 O cliente *${clienteNome}* aprovou a arte *${cardAprov.title}*! Já pode agendar.`);
        console.log(`[CS/inbound] cliente aprovou card ${cardAprov.id}`);
        return NextResponse.json({ ok: true, aprovacao: cardAprov.id as string });
      }
    }
  }

  // ─── Debounce (coalescência): rajada do mesmo autor+grupo numa janela curta enriquece a
  // demanda pendente em vez de criar/postar outra — evita 1 sugestão por mensagem da rajada.
  // A mensagem nova é anexada ao texto E ao briefing, então o card final terá o contexto todo. ───
  const autor = msg.authorName || msg.authorJid;
  const desde = new Date(Date.now() - COALESCE_WINDOW_S * 1000).toISOString();
  const { data: pendente } = await supabaseAdmin
    .from("cs_demandas").select("id, codigo, message_text, briefing")
    .eq("group_jid", msg.groupJid).eq("author", autor).eq("status", "pendente")
    .gte("created_at", desde)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (pendente) {
    const combinado = `${(pendente.message_text as string) || ""}\n${msg.text}`.trim();
    const novoBriefing = `${(pendente.briefing as string) || ""}\n\n+ (cliente complementou): ${msg.text}`.trim();
    await supabaseAdmin.from("cs_demandas").update({ message_text: combinado, briefing: novoBriefing }).eq("id", pendente.id);
    console.log(`[CS/inbound] coalesce → demanda ${pendente.codigo} (+"${msg.text.slice(0, 40)}")`);
    return NextResponse.json({ ok: true, coalesced: pendente.codigo as string });
  }

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
    // A2 — verificador cético só nos AMBÍGUOS (confiança < A2_TRUST_FROM). Refuta falso-positivo
    // antes de incomodar a equipe. Fail-open: erro de API no A2 não bloqueia o pipeline.
    if (it.confianca < A2_TRUST_FROM) {
      const a2 = await verificarDemanda({
        clienteNome, briefing: clienteBriefing, tipo: it.tipo as CsDemandType,
        resumo: it.resumo, trechoOrigem: it.trecho_origem, mensagemOriginal: msg.text,
      });
      if (a2.ok && a2.data && !a2.data.is_demanda_real) {
        console.log(`[CS/inbound] A2 refutou "${it.resumo}" (A1=${it.confianca}): ${a2.data.motivo}`);
        continue;
      }
    }
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
    const precisaConfirmar = a3.ok && !!a3.data?.observacao; // A3 achou o pedido vago → falta info do cliente

    const codigo = randomBytes(2).toString("hex"); // mantido só p/ auditoria — NÃO aparece na mensagem
    const { data: novaDem, error: insErr } = await supabaseAdmin.from("cs_demandas").insert({
      codigo, group_jid: msg.groupJid, client_id: (c.id as string) ?? null, cliente_nome: clienteNome,
      author: msg.authorName || msg.authorJid, message_id: msg.messageId, message_text: msg.text,
      tipo: it.tipo, urgencia: it.urgencia, confianca: it.confianca, resumo: titulo,
      briefing: briefingTxt, responsavel, status: "pendente",
    }).select("id").single();
    if (insErr || !novaDem) { console.error("[CS/inbound] gravar demanda:", insErr?.message); continue; }
    sugeridas.push(`${it.tipo}/${it.urgencia}[${codigo}→${responsavel}]`);

    if (internalJid) {
      // Mensagem CURTA e humana, SEM código — a equipe RESPONDE (reply) nesta mensagem.
      const a3d = a3.ok ? a3.data : null;
      const acao = `É só responder *nesta mensagem*: *ok* (crio o card) · *não* (você cuida) · ou *ajustar* e me diz o que mudar.`;
      const txt = precisaConfirmar
        ? `Oi ${responsavel}! 👋 A *${clienteNome}* pediu: *${it.resumo}* — mas o pedido tá meio vago. Antes de produzir, confirma com eles:\n${a3d?.observacao ?? ""}\n\n${acao}`
        : `Oi ${responsavel}! 👋 A *${clienteNome}* pediu: *${it.resumo}*.\n\n${a3d ? a3d.briefing.trim() : `Mensagem: "${msg.text}"`}${a3d ? `\n_${a3d.formato_sugerido} · prazo ${a3d.prazo_sugerido}_` : ""}\n\n${acao}`;
      const r = await csSendGroupText(internalJid, txt);
      // Guarda o id da msg postada → o "reply" da equipe casa com esta demanda (sem código).
      if (r.ok && r.id) await supabaseAdmin.from("cs_demandas").update({ msg_id_sugestao: r.id }).eq("id", novaDem.id);
      else if (!r.ok) console.error("[CS/inbound] post sugestão falhou:", r.error);
    }
  }

  console.log(`[CS/inbound] ${clienteNome} "${msg.text.slice(0, 60)}" → ${sugeridas.join(", ") || "nenhuma demanda"}`);
  return NextResponse.json({ ok: true, classified: true, cliente: clienteNome, sugeridas, multiCliente });
}
