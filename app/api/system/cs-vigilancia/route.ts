export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireCron } from "@/lib/api/cron-guard";
import { csSendGroupText } from "@/lib/cs/notify";
import {
  spNow, ymd, addDays, isBusinessDay, isBusinessHour, isFirmPostingDay, isPostingDay, proximoDiaFirme, businessHoursSince, spDateKeyOf,
} from "@/lib/cs/vigilancia";

// POST /api/system/cs-vigilancia — "Vigilância de Fluxo" do Agente CS.
// FASE 0 = MODO SECO: avalia o fluxo de produção e REGISTRA em cs_cobrancas (dry_run=true) o que
// cobraria, mas NÃO posta no WhatsApp. Cron sugerido: 10h30 e 15h (BRT). Calibrar antes da Fase 1.
//
// Vigia o pipeline de cada post (seg/sex firmes; quarta leve), nas etapas que o Roberto definiu:
//   pauta pro dia → social mandou pro designer ("A fazer") → designer fez → (ou travada) →
//   social viu e agendou no Meta (= moveu o card pra coluna "Agendado").
// Mapeamento p/ os status reais do board: ideas/script=Fila · in_production=Produção ·
// blocked=Travado · approval/client_approval=Aprovação(entregue) · scheduled=Agendado · published=ok.

// Roberto aprovou ligar (26/jun) — mas SÓ posta cobrança de card REAL, criado ontem/hoje e com
// responsável (os cards antigos são lixo acumulado). "Sem pauta" e card antigo seguem só dry-run.
const VIGILANCIA_LIVE = true; // false = volta tudo pra dry-run (kill switch).

// Thresholds em HORAS ÚTEIS (decisão do Roberto: manter os propostos).
const TH_DESIGNER_PEGAR = 4;   // card com demanda parado na Fila (designer não pegou)
const TH_PRODUCAO = 8;         // card em Produção sem entregar
const TH_SOCIAL_VER = 2;       // designer entregou e o social ainda não revisou
const TH_AGENDAR = 3;          // social revisou e não agendou (mover pra "Agendado")
const TH_TRAVADO = 2;          // card travado sem resolução
const TH_MANDAR_DESIGNER = 2;  // card criado sem design_request ("A fazer" não marcado)

type Area = "social" | "designer";
interface Cobranca {
  vigilancia: number; area: Area; client_id: string; card_id: string | null; chave: string; motivo: string;
  /** Força o gate de "ao vivo" (vig 5 usa a recência da APROVAÇÃO, não da criação do card). */
  liveOverride?: boolean;
}

interface CardRow {
  id: string; client_id: string; status: string; due_date: string | null; created_at: string | null;
  design_request_id: string | null; designer_delivered_at: string | null;
  social_confirmed_at: string | null; status_changed_at: string | null;
  column_entered_at: Record<string, string> | null; blocked_reason: string | null;
  design_request_status?: string | null; // status REAL da demanda (queued/in_progress/done)
}

/** Mensagem amigável: [o que vi] + [pergunta] + [oferta de ajuda]. 1 emoji máx. T3: tom escala
 *  conforme `nivel` (1ª/2ª/3ª+ vez que a MESMA situação é cobrada) — sempre educado. */
function mensagemAmigavel(vig: number, area: Area, cliente: string, pessoa: string, motivo: string, nivel = 1): string {
  const travado = vig === 3 && /travado/i.test(motivo);
  if (nivel >= 3) { // 3ª+ vez: firme (educado), oferece ajuda direta
    const oi = `${pessoa}, `;
    if (travado) return `${oi}o card do *${cliente}* segue travado faz uns dias. Tem algum impedimento? Me fala que a gente resolve junto.`;
    if (vig === 3) return `${oi}o card do *${cliente}* continua parado esperando produção. Tá rolando alguma coisa? Posso ajudar com algo.`;
    if (vig === 4) return `${oi}a arte do *${cliente}* segue entregue e sem revisão. Consegue dar uma olhada hoje? Se travou em algo, me avisa.`;
    if (vig === 5) return `${oi}o cliente aprovou a arte do *${cliente}* e ela segue sem agendar — falta só esse passo. Precisa de ajuda?`;
    return `${oi}o *${cliente}* segue pendente: ${motivo}. Posso ajudar com algo?`;
  }
  if (nivel === 2) { // 2ª vez: lembrete reconhecendo que já passou aqui
    const oi = `${pessoa}, só passando de novo aqui — `;
    if (travado) return `${oi}o card do *${cliente}* ainda tá travado. Quando puder, dá uma olhada.`;
    if (vig === 3) return `${oi}o card do *${cliente}* segue esperando produção. Tá tudo certo com o briefing?`;
    if (vig === 4) return `${oi}a arte do *${cliente}* ainda não foi revisada. Quando der, confirma se tá ok.`;
    if (vig === 5) return `${oi}o cliente já aprovou a arte do *${cliente}* e ainda falta agendar no Meta.`;
    return `${oi}o *${cliente}*: ${motivo}.`;
  }
  const oi = `Oi ${pessoa}! `; // 1ª vez
  if (vig === 2) return `${oi}a pauta do *${cliente}* ainda não foi pro designer. Quando puder, marca *"A fazer"* pra ela seguir — qualquer dúvida, tô aqui.`;
  if (travado) return `${oi}o card do *${cliente}* tá travado${motivo.replace(/^card travado/i, "")}. Consegue dar uma destravada? Se precisar de algo, me chama.`;
  if (vig === 3) return `${oi}tem um card do *${cliente}* esperando produção. Tá tudo certo com o briefing? Se faltar referência, é só falar. 🎨`;
  if (vig === 4) return `${oi}o designer entregou a arte do *${cliente}*. Quando puder, dá uma olhada e confirma se tá ok pra seguir.`;
  if (vig === 5) return `${oi}o cliente APROVOU a arte do *${cliente}* 🎉 — falta só agendar no Meta (mover pra *Agendado*). Consegue dar esse último passo?`;
  return `${oi}sobre o *${cliente}*: ${motivo}. Quando puder, dá uma olhada — tamo junto.`;
}

/** Quando o card entrou no estágio atual (p/ medir "parado há X"). */
function enteredAt(c: CardRow): string | null {
  return (c.column_entered_at && c.column_entered_at[c.status]) || c.status_changed_at;
}

/**
 * Avalia 1 card pelos SINAIS REAIS (não só o status do board, que costuma ficar atrasado —
 * card entregue continua parado em "Ideias"). Conservador: na dúvida NÃO cobra (regra do PDF —
 * falso positivo destrói a confiança). Só cobra o que é inequívoco e atual.
 */
function avaliarPipeline(c: CardRow): { vigilancia: number; area: Area; motivo: string } | null {
  if (c.status === "published" || c.status === "scheduled") return null; // fluxo completo

  // Se o designer JÁ entregou (designer_delivered_at) ou a demanda está "done" → trabalho dele
  // acabou: NUNCA cobrar o designer. E o que vem depois (revisar/agendar) depende de o board estar
  // atualizado, o que não é confiável hoje → SILENCIA pra não gerar falso positivo.
  // (Exceção confiável: aprovação do CLIENTE — vigilância 5, tratada à parte no POST.)
  if (c.designer_delivered_at || c.design_request_status === "done") return null;

  // Horas úteis com relógio REAL — passar spNow() aqui deslocava o getTime() e subcontava ~3h.
  const h = businessHoursSince(enteredAt(c));
  if (c.status === "blocked")
    return h >= TH_TRAVADO
      ? { vigilancia: 3, area: "social", motivo: `card travado${c.blocked_reason ? `: ${c.blocked_reason}` : ""}` }
      : null;

  // Ainda NÃO entregue:
  if (!c.design_request_id)
    return h >= TH_MANDAR_DESIGNER
      ? { vigilancia: 2, area: "social", motivo: 'ainda não foi pro designer (faltou marcar "A fazer")' }
      : null; // card recém-criado ganha um fôlego — cobrar minutos após criar era punição injusta
  if (c.design_request_status === "in_progress")
    return h >= TH_PRODUCAO
      ? { vigilancia: 3, area: "designer", motivo: "em produção há um bom tempo — tá rendendo? precisa de algo?" }
      : null; // designer produzindo dentro do prazo → não cobra
  // Demanda "queued" (designer ainda não pegou) e parada além do limite:
  return h >= TH_DESIGNER_PEGAR
    ? { vigilancia: 3, area: "designer", motivo: "aguardando o designer pegar em produção" }
    : null;
}

export async function POST(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;

  const now = spNow();
  if (!(await isBusinessDay(now)) || !isBusinessHour(now)) {
    return NextResponse.json({ ok: true, skip: "fora de dia útil/horário comercial (8h–18h)", dia: ymd(now), hora: now.getHours() });
  }

  const hoje = ymd(now);
  const amanhaDate = addDays(now, 1);
  const amanha = ymd(amanhaDate);
  const ontem = ymd(addDays(now, -1)); // janela de "recente": card criado ontem ou hoje

  // Clientes ativos
  const { data: clientsData, error: cErr } = await supabaseAdmin
    .from("clients")
    .select("id, name, assigned_social, assigned_designer, active")
    .or("active.is.null,active.eq.true")
    .eq("agente_ativo", true); // S8: pula clientes com o agente pausado
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });
  const clients = clientsData ?? [];
  const clientById = new Map(clients.map((c) => [c.id as string, c]));

  // Cards near/overdue, não-arquivados. Limite +4 dias: na sexta a véspera olha a SEGUNDA.
  // Cards `published` ENTRAM na busca (avaliarPipeline os ignora): sem eles, o "sem pauta"
  // acusava cliente que JÁ tinha publicado o post do dia.
  const limite = ymd(addDays(now, 4));
  const { data: cardsData, error: kErr } = await supabaseAdmin
    .from("content_cards")
    .select("id, client_id, status, due_date, created_at, design_request_id, designer_delivered_at, social_confirmed_at, status_changed_at, column_entered_at, blocked_reason")
    .is("archived_at", null)
    .not("due_date", "is", null)
    .lte("due_date", limite);
  if (kErr) return NextResponse.json({ error: kErr.message }, { status: 500 });
  const cards = (cardsData ?? []) as CardRow[];
  const cardById = new Map(cards.map((k) => [k.id, k]));

  // Status REAL da demanda (queued/in_progress/done) — sinal mais confiável que o status do card,
  // que o time não atualiza no board (card entregue fica em "Ideias").
  const drIds = [...new Set(cards.map((k) => k.design_request_id).filter((x): x is string => !!x))];
  if (drIds.length) {
    const { data: drs } = await supabaseAdmin.from("design_requests").select("id, status").in("id", drIds);
    const drStatus = new Map((drs ?? []).map((d) => [d.id as string, d.status as string]));
    for (const k of cards) k.design_request_status = k.design_request_id ? (drStatus.get(k.design_request_id) ?? null) : null;
  }

  const cobrancas: Cobranca[] = [];

  // ── A) PAUTA AUSENTE — seg/sex firmes; QUARTA leve (lembra 1x, na rodada das ~13h). ──
  const temCardNaData = (clientId: string, dia: string) =>
    cards.some((k) => k.client_id === clientId && k.due_date === dia);
  const firmeHoje = isFirmPostingDay(now);
  // Quarta (dia de postagem mas não firme): só na rodada das ~13h (a chave diária garante 1x só).
  const quartaLembra = isPostingDay(now) && !firmeHoje && now.getHours() === 13;
  // Véspera: amanhã se amanhã é firme (qui→sex, dom→seg); na SEXTA, a véspera é a SEGUNDA —
  // "amanhã" fixo fazia a véspera de segunda nunca disparar (amanhã = sábado).
  const alvoVespera = isFirmPostingDay(amanhaDate) ? amanhaDate : (now.getDay() === 5 ? proximoDiaFirme(now) : null);
  const vesperaKey = alvoVespera ? ymd(alvoVespera) : null;
  const vesperaLabel = alvoVespera && alvoVespera.getDay() === 1 ? "segunda" : "amanhã";
  for (const c of clients) {
    if (!(c.active === null || c.active === true)) continue;
    if (!c.assigned_social) continue; // só clientes com social (tira os de tráfego-only)
    // #2 — pauta de HOJE
    if ((firmeHoje || quartaLembra) && !temCardNaData(c.id as string, hoje)) {
      cobrancas.push({ vigilancia: 2, area: "social", client_id: c.id as string, card_id: null,
        chave: `2-${c.id}-${hoje}`,
        motivo: firmeHoje ? "hoje é dia de postagem e não há pauta criada"
                          : "quarta é mais de boa, mas não vi nenhuma pauta criada pra hoje" });
    }
    // #1 — véspera dos dias firmes (seg/sex); quarta não tem véspera firme
    if (vesperaKey && !temCardNaData(c.id as string, vesperaKey)) {
      cobrancas.push({ vigilancia: 1, area: "social", client_id: c.id as string, card_id: null,
        chave: `1-${c.id}-${vesperaKey}`, motivo: `${vesperaLabel} é dia de postagem e nada está planejado` });
    }
  }

  // ── B) PIPELINE TRAVADO — por card (qualquer dia, inclusive quarta). ──
  for (const k of cards) {
    const v = avaliarPipeline(k);
    if (!v) continue;
    cobrancas.push({ vigilancia: v.vigilancia, area: v.area, client_id: k.client_id, card_id: k.id,
      chave: `${v.vigilancia}-${k.id}-${hoje}`, motivo: v.motivo });
  }

  // ── C) PÓS-ENTREGA (vig 5) — o CLIENTE aprovou a arte (client_approved_at, marcado pelo
  // detector S3 a partir do WhatsApp do próprio cliente = sinal CONFIÁVEL, diferente do board) e
  // o card segue sem agendar há >= TH_AGENDAR horas úteis → cobra o social. Query separada: a
  // principal filtra por due_date e perderia card aprovado sem data. É o elo que faltava depois
  // do silenciamento pós-entrega do avaliarPipeline. ──
  const d7 = new Date(Date.now() - 7 * 86400000).toISOString();
  const { data: aprovadosData } = await supabaseAdmin
    .from("content_cards")
    .select("id, client_id, status, client_approved_at")
    .not("client_approved_at", "is", null)
    .gte("client_approved_at", d7)
    .is("archived_at", null);
  for (const k of aprovadosData ?? []) {
    if (k.status === "scheduled" || k.status === "published") continue;
    if (!clientById.has(k.client_id as string)) continue; // inativo / agente pausado
    if (businessHoursSince(k.client_approved_at as string) < TH_AGENDAR) continue;
    cobrancas.push({
      vigilancia: 5, area: "social", client_id: k.client_id as string, card_id: k.id as string,
      chave: `5-${k.id}-${hoje}`, motivo: "o cliente aprovou a arte e falta agendar",
      // Ao vivo se a APROVAÇÃO é recente (ontem/hoje) — recência do card não importa aqui.
      liveOverride: (spDateKeyOf(k.client_approved_at as string) ?? "") >= ontem,
    });
  }

  // Registra cada cobrança e POSTA no grupo interno só as que estão "ao vivo":
  // card REAL + criado ontem/hoje (recente) + com responsável. O resto (sem pauta, card antigo)
  // só registra (dry-run). INSERT (não upsert): conflito de chave = já cobrado hoje → não repete.
  const internalJid = process.env.CS_INTERNAL_GROUP_JID || null;
  const detalhe: Array<Record<string, unknown>> = [];
  let postadas = 0;
  for (const cob of cobrancas) {
    const cli = clientById.get(cob.client_id);
    const nome = (cli?.name as string) || "Cliente";
    const pessoa = cob.area === "designer" ? (cli?.assigned_designer as string) : (cli?.assigned_social as string);
    const card = cob.card_id ? cardById.get(cob.card_id) : null;
    const recente = cob.liveOverride ?? (card ? (spDateKeyOf(card.created_at) ?? "") >= ontem : false);
    const live = VIGILANCIA_LIVE && !!cob.card_id && recente && !!pessoa && !!internalJid;
    let nivel = 1;
    if (live && cob.card_id) {
      // T3: quantas vezes essa MESMA situação (card+vigilância) já foi cobrada antes → escala o tom.
      const { count } = await supabaseAdmin.from("cs_cobrancas").select("id", { count: "exact", head: true })
        .eq("card_id", cob.card_id).eq("vigilancia", cob.vigilancia);
      nivel = (count ?? 0) + 1;
    }
    const msg = live
      ? mensagemAmigavel(cob.vigilancia, cob.area, nome, pessoa!, cob.motivo, nivel)
      : `[dry-run] ${nome}: ${cob.motivo}${pessoa ? ` (@${pessoa})` : ""}`;
    const { error: insErr } = await supabaseAdmin.from("cs_cobrancas").insert({
      vigilancia: cob.vigilancia, client_id: cob.client_id, card_id: cob.card_id,
      pessoa_cobrada: pessoa || null, chave: cob.chave, mensagem: msg, dry_run: !live,
    });
    const novo = !insErr;
    if (insErr && insErr.code !== "23505") console.error("[cs-vigilancia] insert:", insErr.message);
    if (novo && live && internalJid) {
      const r = await csSendGroupText(internalJid, msg);
      if (r.ok) postadas++; else console.error("[cs-vigilancia] post falhou:", r.error);
    }
    detalhe.push({ vig: cob.vigilancia, cliente: nome, pessoa: pessoa || null, live, motivo: cob.motivo });
  }

  console.log(`[cs-vigilancia] live=${VIGILANCIA_LIVE} dia=${hoje} firme=${isFirmPostingDay(now)} cobrancas=${cobrancas.length} postadas=${postadas}`);
  return NextResponse.json({
    ok: true, live: VIGILANCIA_LIVE, dia: hoje, dia_firme_hoje: isFirmPostingDay(now),
    clientes_ativos: clients.length, cards_avaliados: cards.length,
    cobrancas: cobrancas.length, postadas_ao_vivo: postadas,
    por_vigilancia: cobrancas.reduce((acc, c) => { acc[c.vigilancia] = (acc[c.vigilancia] || 0) + 1; return acc; }, {} as Record<number, number>),
    detalhe: detalhe.slice(0, 30),
  });
}
