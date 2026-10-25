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
import { resultadoDosEnvios, SEM_GRUPO_INTERNO, type FalhaEnvio } from "@/lib/automacoes/envios";
import { loadBriefingCombinado } from "@/lib/cs/load-briefing";
import {
  gerarPautaSemanal, datasProximaSemana, serializePauta, formatPauta, buildPautaSugestao, labelDia,
} from "@/lib/cs/pauta";

// POST /api/system/cs-pauta — pauta semanal PROATIVA: propõe a pauta da semana seguinte por
// cliente e a equipe responde "ok" pra criar os CARDS no board (com due_date). Inverte a cobrança
// de "sem pauta": em vez de só cobrar, o agente chega com a proposta pronta. Suggest-only.
// Cron sugerido: sexta 14h BRT = `0 17 * * 5` (UTC). ?preview=1 calcula sem postar/gravar.
//
// 25/10/2026 (auditoria 10.4): a falha da IA virava "skip" com ok:true, envio que falhava contava como
// "sugerida" e o dedup da semana (a demanda já gravada) impedia propor de novo. Agora a falha entra em
// `falhas` (ok:false), a demanda só fica se a mensagem saiu (ou pode ter saído), e `sugeridas` conta o que
// chegou ao grupo.
const PAUTA_LIVE = true; // false = só calcula (kill switch)

// Piloto: env CS_PAUTA_CLIENT_IDS (ids separados por vírgula) delimita quem recebe pauta.
// Sem a env: clientes com briefing razoável (>=200 chars), cap de 3 — não abre pra base toda
// sem o Roberto ver a qualidade primeiro.
const PILOT_CAP = 3;

export async function POST(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;
  const previewOnly = req.nextUrl.searchParams.get("preview") !== null;

  if (!isOpenAIConfigured()) return NextResponse.json({ ok: false, erro: "IA não configurada (OPENAI_API_KEY) — nenhuma pauta foi proposta." });

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
    // Elegível = tem contexto de verdade: texto livre razoável OU briefing ESTRUTURADO
    // (client_briefings is_current — na base real é onde o briefing mora; o texto livre é vazio).
    const { data: comEstruturado } = await supabaseAdmin
      .from("client_briefings").select("client_id").eq("is_current", true);
    const estruturados = new Set((comEstruturado ?? []).map((r) => r.client_id as string));
    clientes = clientes
      .filter((c) =>
        (((c.fixed_briefing as string) || "") + ((c.campaign_briefing as string) || "")).trim().length >= 200 ||
        estruturados.has(c.id as string))
      .slice(0, PILOT_CAP);
  }

  const internalJid = process.env.CS_INTERNAL_GROUP_JID || null;
  const semanaKey = ymd(segunda);
  const resultados: Array<Record<string, unknown>> = [];
  const falhas: FalhaEnvio[] = [];
  let sugeridas = 0;
  if (!internalJid && !previewOnly && PAUTA_LIVE && clientes.length) {
    // Sem grupo, a proposta não chega a ninguém — e gravar a demanda travaria a semana.
    return NextResponse.json({ ...resultadoDosEnvios([{ alvo: "grupo interno", erro: SEM_GRUPO_INTERNO }]), semana: semanaKey, elegiveis: clientes.length, sugeridas: 0 });
  }

  for (const c of clientes) {
    const nome = (c.nome_fantasia as string) || (c.name as string) || "Cliente";
    // Dedup por cliente+semana (re-rodar o cron não duplica a proposta).
    const messageId = `pauta-${c.id}-${semanaKey}`;
    const { data: ja, error: jaErr } = await supabaseAdmin.from("cs_demandas").select("id").eq("message_id", messageId).limit(1).maybeSingle();
    // Não saber se já propôs não é "ainda não propôs": pula e diz (senão duplicaria a pauta).
    if (jaErr) { falhas.push({ alvo: nome, erro: `não consegui conferir se a pauta já foi proposta: ${jaErr.message}` }); continue; }
    if (ja) { resultados.push({ cliente: nome, skip: "já proposta" }); continue; }

    const briefing = await loadBriefingCombinado(c.id as string, [
      (c.fixed_briefing as string) && `FIXO: ${(c.fixed_briefing as string).slice(0, 1200)}`,
      (c.campaign_briefing as string) && `CAMPANHA: ${(c.campaign_briefing as string).slice(0, 1200)}`,
    ].filter(Boolean).join("\n\n"));
    const rules = await fetchClientCsRules(c.id as string);
    const regras = rules.filter((r) => r.escopo !== "roteiro").map((r) => `${r.texto} (${r.escopo})`);
    const { data: recentes } = await supabaseAdmin
      .from("content_cards").select("title").eq("client_id", c.id as string)
      .is("archived_at", null).order("created_at", { ascending: false }).limit(10);
    const historico = (recentes ?? []).map((r) => (r.title as string) || "").filter(Boolean);

    // Datas/promoções que o PRÓPRIO cliente marcou (cs_client_events) pra semana da pauta + poucos
    // dias além (teaser de promo iminente) → a pauta planeja conteúdo pra elas.
    const fimJanela = ymd(new Date(segunda.getTime() + 9 * 86400000));
    const { data: evCli } = await supabaseAdmin.from("cs_client_events")
      .select("titulo, event_date").eq("client_id", c.id as string).eq("status", "ativo")
      .gte("event_date", semanaKey).lte("event_date", fimJanela).order("event_date", { ascending: true });
    const eventos = (evCli ?? []).map((e) => `${e.titulo as string} (${labelDia(e.event_date as string)})`);

    const r = await gerarPautaSemanal({
      clienteNome: nome, clienteNicho: (c.nicho as string) || undefined,
      briefing, regras, historicoTitulos: historico, datas, eventos,
    });
    if (!r.ok || !r.data || !r.data.itens.length) {
      const motivo = `a IA não gerou a pauta (${r.ok ? "0 itens" : r.error})`;
      resultados.push({ cliente: nome, erro: motivo });
      falhas.push({ alvo: nome, erro: motivo });
      continue;
    }
    // Só itens em datas válidas (o modelo não pode inventar dia).
    const itens = r.data.itens.filter((i) => datas.includes(i.dia)).slice(0, datas.length);
    if (!itens.length) {
      resultados.push({ cliente: nome, erro: "itens fora das datas" });
      falhas.push({ alvo: nome, erro: "a IA propôs só datas fora da semana" });
      continue;
    }

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
    if (insErr || !dem) {
      resultados.push({ cliente: nome, erro: `insert: ${insErr?.message}` });
      falhas.push({ alvo: nome, erro: `não gravei a demanda da pauta: ${insErr?.message ?? "sem retorno"}` });
      continue;
    }

    const msg = buildPautaSugestao((c.assigned_social as string) || null, nome, itens, r.data.observacao);
    // FICA COMO TEXTO DE PROPÓSITO, mesmo passando de 600 caracteres de vez em quando.
    // O time RESPONDE esta mensagem ("ok c6d4") e o id dela é guardado em
    // cs_demandas.msg_id_sugestao para amarrar a resposta à demanda. PDF não tem esse fio, e
    // trocar interação que funciona por um aviso mais bonito é um mau negócio.
    const sent = await csSendGroupText(internalJid as string, msg, undefined, { origem: "cs-pauta", destino: "interno" });
    if (!sent.ok && !sent.incerto) {
      // Certo que não saiu: apaga a demanda, senão o dedup da semana impede propor de novo.
      const { error: delErr } = await supabaseAdmin.from("cs_demandas").delete().eq("id", dem.id);
      resultados.push({ cliente: nome, erro: `envio: ${sent.error}` });
      falhas.push({ alvo: nome, erro: `a proposta não saiu (${sent.error ?? "o WhatsApp recusou"})${delErr ? ` e não consegui desfazer a demanda (${delErr.message}) — a semana ficou travada` : " — rode de novo para propor"}` });
      continue;
    }
    if (sent.incerto) {
      // Pode ter saído: a demanda fica (não duplica), e o time confere o grupo.
      falhas.push({ alvo: nome, erro: `${sent.error ?? "sem resposta"} — pode ter saído, confira o grupo` });
    } else if (sent.id) {
      await supabaseAdmin.from("cs_demandas").update({ msg_id_sugestao: sent.id }).eq("id", dem.id);
    }
    sugeridas++;
    resultados.push({ cliente: nome, itens: itens.length });
  }

  console.log(`[cs-pauta] semana=${semanaKey} elegiveis=${clientes.length} sugeridas=${sugeridas} preview=${previewOnly}`);
  return NextResponse.json({
    ...resultadoDosEnvios(falhas), live: PAUTA_LIVE, semana: semanaKey, datas, elegiveis: clientes.length, sugeridas, resultados,
  });
}
