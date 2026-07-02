export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireCron } from "@/lib/api/cron-guard";
import { isOpenAIConfigured } from "@/lib/ai/openai";
import { csSendGroupText } from "@/lib/cs/notify";
import { spNow, ymd } from "@/lib/cs/vigilancia";
import { getHolidays } from "@/lib/holidays/brasil-api";
import { fetchClientCsRules } from "@/lib/supabase/queries";
import {
  gerarPautaSemanal, datasProximaSemana, serializePauta, formatPauta, buildPautaSugestao, labelDia,
} from "@/lib/cs/pauta";

// POST /api/system/cs-pauta — pauta semanal PROATIVA: propõe a pauta da semana seguinte por
// cliente e a equipe responde "ok" pra criar os CARDS no board (com due_date). Inverte a cobrança
// de "sem pauta": em vez de só cobrar, o agente chega com a proposta pronta. Suggest-only.
// Cron sugerido: sexta 14h BRT = `0 17 * * 5` (UTC). ?preview=1 calcula sem postar/gravar.
const PAUTA_LIVE = true; // false = só calcula (kill switch)

// Piloto: env CS_PAUTA_CLIENT_IDS (ids separados por vírgula) delimita quem recebe pauta.
// Sem a env: clientes com briefing razoável (>=200 chars), cap de 3 — não abre pra base toda
// sem o Roberto ver a qualidade primeiro.
const PILOT_CAP = 3;

export async function POST(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;
  const previewOnly = req.nextUrl.searchParams.get("preview") !== null;

  if (!isOpenAIConfigured()) return NextResponse.json({ ok: true, skip: "IA off" });

  const now = spNow();
  const { segunda, datas: datasBrutas } = datasProximaSemana(now);
  // Tira feriado nacional das datas-alvo (fail-open: sem API, mantém).
  let datas = datasBrutas;
  try {
    const hs = await getHolidays(segunda.getFullYear());
    const feriados = new Set((hs as Array<{ date: string }>).map((h) => h.date));
    datas = datasBrutas.filter((d) => !feriados.has(d));
  } catch { /* mantém as datas */ }
  if (!datas.length) return NextResponse.json({ ok: true, skip: "semana toda de feriado?" });

  // Clientes elegíveis.
  const { data: clientsData, error: cErr } = await supabaseAdmin
    .from("clients")
    .select("id, name, nome_fantasia, nicho, campaign_briefing, fixed_briefing, assigned_social")
    .or("active.is.null,active.eq.true")
    .eq("agente_ativo", true)
    .not("assigned_social", "is", null);
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });
  const allowIds = (process.env.CS_PAUTA_CLIENT_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  let clientes = (clientsData ?? []).filter((c) => !/\(teste\)/i.test((c.name as string) || ""));
  if (allowIds.length) {
    clientes = clientes.filter((c) => allowIds.includes(c.id as string));
  } else {
    clientes = clientes
      .filter((c) => (((c.fixed_briefing as string) || "") + ((c.campaign_briefing as string) || "")).trim().length >= 200)
      .slice(0, PILOT_CAP);
  }

  const internalJid = process.env.CS_INTERNAL_GROUP_JID || null;
  const semanaKey = ymd(segunda);
  const resultados: Array<Record<string, unknown>> = [];
  let sugeridas = 0;

  for (const c of clientes) {
    const nome = (c.nome_fantasia as string) || (c.name as string) || "Cliente";
    // Dedup por cliente+semana (re-rodar o cron não duplica a proposta).
    const messageId = `pauta-${c.id}-${semanaKey}`;
    const { data: ja } = await supabaseAdmin.from("cs_demandas").select("id").eq("message_id", messageId).limit(1).maybeSingle();
    if (ja) { resultados.push({ cliente: nome, skip: "já proposta" }); continue; }

    const briefing = [
      (c.fixed_briefing as string) && `FIXO: ${(c.fixed_briefing as string).slice(0, 1200)}`,
      (c.campaign_briefing as string) && `CAMPANHA: ${(c.campaign_briefing as string).slice(0, 1200)}`,
    ].filter(Boolean).join("\n\n") || undefined;
    const rules = await fetchClientCsRules(c.id as string);
    const regras = rules.filter((r) => r.escopo !== "roteiro").map((r) => `${r.texto} (${r.escopo})`);
    const { data: recentes } = await supabaseAdmin
      .from("content_cards").select("title").eq("client_id", c.id as string)
      .is("archived_at", null).order("created_at", { ascending: false }).limit(10);
    const historico = (recentes ?? []).map((r) => (r.title as string) || "").filter(Boolean);

    const r = await gerarPautaSemanal({
      clienteNome: nome, clienteNicho: (c.nicho as string) || undefined,
      briefing, regras, historicoTitulos: historico, datas,
    });
    if (!r.ok || !r.data || !r.data.itens.length) {
      resultados.push({ cliente: nome, skip: `geração falhou: ${r.ok ? "0 itens" : r.error}` });
      continue;
    }
    // Só itens em datas válidas (o modelo não pode inventar dia).
    const itens = r.data.itens.filter((i) => datas.includes(i.dia)).slice(0, datas.length);
    if (!itens.length) { resultados.push({ cliente: nome, skip: "itens fora das datas" }); continue; }

    if (previewOnly || !PAUTA_LIVE) {
      resultados.push({ cliente: nome, preview: formatPauta(itens), observacao: r.data.observacao });
      continue;
    }

    const codigo = randomBytes(2).toString("hex");
    const { data: dem, error: insErr } = await supabaseAdmin.from("cs_demandas").insert({
      codigo, group_jid: internalJid ?? "pauta", client_id: c.id as string, cliente_nome: nome,
      author: "🤖 Agente Lone (pauta)", message_id: messageId,
      message_text: serializePauta(semanaKey, itens),
      tipo: "pauta_semanal", urgencia: "media", confianca: 1,
      resumo: `Pauta da semana ${labelDia(datas[0]).split(" ")[1]}–${labelDia(datas[datas.length - 1]).split(" ")[1]}`,
      briefing: formatPauta(itens), responsavel: (c.assigned_social as string) || null, status: "pendente",
    }).select("id").single();
    if (insErr || !dem) { resultados.push({ cliente: nome, skip: `insert: ${insErr?.message}` }); continue; }

    if (internalJid) {
      const msg = buildPautaSugestao((c.assigned_social as string) || null, nome, itens, r.data.observacao);
      const sent = await csSendGroupText(internalJid, msg);
      if (sent.ok && sent.id) await supabaseAdmin.from("cs_demandas").update({ msg_id_sugestao: sent.id }).eq("id", dem.id);
    }
    sugeridas++;
    resultados.push({ cliente: nome, itens: itens.length });
  }

  console.log(`[cs-pauta] semana=${semanaKey} elegiveis=${clientes.length} sugeridas=${sugeridas} preview=${previewOnly}`);
  return NextResponse.json({
    ok: true, live: PAUTA_LIVE, semana: semanaKey, datas, elegiveis: clientes.length, sugeridas, resultados,
  });
}
