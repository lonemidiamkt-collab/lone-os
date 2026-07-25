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
// ESTÁ NO AR desde 26/jun (VIGILANCIA_LIVE = true, abaixo): posta cobrança de card REAL no grupo e
// registra em cs_cobrancas com dry_run=false. O que NÃO passa no gate de "ao vivo" (card antigo, sem
// responsável, "sem pauta") é só registrado com dry_run=true — é o modo seco, que sobrevive para
// calibragem. Cron: 10h30 e 15h (BRT).
// (Este cabeçalho dizia "FASE 0 = MODO SECO" muito depois de a rotina ter sido ligada — o comentário
//  desatualizado já induziu uma auditoria a concluir que o agente não cobrava nada.)
//
// Vigia o pipeline de cada post (seg/sex firmes; quarta leve), nas etapas que o Roberto definiu:
//   pauta pro dia → social mandou pro designer ("A fazer") → designer fez → (ou travada) →
//   social viu e agendou no Meta (= moveu o card pra coluna "Agendado").
// Mapeamento p/ os status reais do board: ideas/script=Fila · in_production=Produção ·
// blocked=Travado · approval/client_approval=Aprovação(entregue) · scheduled=Agendado · published=ok.

// Roberto aprovou ligar (26/jun) — mas SÓ posta cobrança de card REAL, criado ontem/hoje e com
// responsável (os cards antigos são lixo acumulado). "Sem pauta" e card antigo seguem só dry-run.
const VIGILANCIA_LIVE = true; // false = volta tudo pra dry-run (kill switch).

// Thresholds em HORAS ÚTEIS. Roberto pediu (jul/2026) TODOS em 1h — CS o mais rápido possível.
const TH_DESIGNER_PEGAR = 1;   // card com demanda parado na Fila (designer não pegou)
const TH_PRODUCAO = 1;         // card em Produção sem entregar
const TH_SOCIAL_VER = 1;       // designer entregou e o social ainda não revisou
const TH_AGENDAR = 1;          // social revisou e não agendou (mover pra "Agendado")
const TH_TRAVADO = 1;          // card travado sem resolução
const TH_MANDAR_DESIGNER = 1;  // card criado sem design_request ("A fazer" não marcado)

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

// Hash estável → escolhe uma variação de frase (mesma situação sempre gera a mesma, mas cada
// card/cliente/nível varia). Evita o efeito "robô repetindo a mesma frase".
function hashSeed(s: string): number { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }
function pick(arr: string[], seed: number): string { return arr[seed % arr.length]; }

// Banco de frases por SITUAÇÃO (6 tipos de pedido) × NÍVEL (1ª / 2ª / 3ª+ cobrança). Cada célula
// tem variações; a escolha é estável por card. Estrutura sempre: [o que vi] + [pergunta] + [oferta].
const FRASES: Record<string, [string[], string[], string[]]> = {
  // vig 2 — social: pauta ainda não foi pro designer ("A fazer")
  pauta: [
    [
      `Oi {p}! a pauta do {c} ainda não foi pro designer. Quando puder, marca *"A fazer"* que ela segue — qualquer dúvida, tô aqui.`,
      `Oi {p}! vi que o card do {c} ainda não foi encaminhado pro designer. É só marcar *"A fazer"* 🙂 precisando de algo, me chama.`,
      `{p}, o {c} já pode ir pro designer, falta só marcar *"A fazer"*. Consegue dar esse toque?`,
    ],
    [
      `{p}, passando de novo — o {c} ainda não seguiu pro designer. Quando der, marca *"A fazer"*.`,
      `Oi {p}, o {c} segue esperando ir pro designer. Uns segundos pra marcar *"A fazer"* e destrava.`,
    ],
    [`{p}, o {c} continua sem ir pro designer faz um tempo. Tem algum impedimento? Me fala que resolvo com você.`],
  ],
  // vig 3 — designer: pegar da fila / em produção há tempo
  designer: [
    [
      `Oi {p}! tem um card do {c} te esperando na fila. Consegue começar? Se faltar referência no briefing, é só falar. 🎨`,
      `Oi {p}! o {c} tá pronto pra produção e aguardando você pegar. Bora nele? Qualquer coisa que faltar, me avisa.`,
      `{p}, o {c} tá na fila há um tempinho — dá pra encaixar hoje? Se precisar de algo do briefing, tô aqui.`,
    ],
    [
      `{p}, passando de novo — o {c} segue esperando produção. Tá tudo certo com o briefing?`,
      `Oi {p}, o {c} ainda não andou. Consegue começar hoje? Se travou em algo, me conta.`,
    ],
    [`{p}, o {c} continua parado esperando produção. Tá rolando alguma coisa? Posso ajudar com algo.`],
  ],
  // vig 3 — social: card travado
  travado: [
    [
      `Oi {p}! o card do {c} tá travado{m}. Consegue dar uma destravada? Se precisar de algo, me chama.`,
      `Oi {p}! vi o {c} travado{m}. Dá pra resolver hoje? Qualquer impedimento, me fala que ajudo.`,
      `{p}, o {c} está parado como travado{m}. O que precisa pra seguir?`,
    ],
    [
      `{p}, só passando de novo — o {c} ainda tá travado. Quando puder, dá uma olhada.`,
      `Oi {p}, o {c} segue travado. Consegue destravar ou me diz o que falta?`,
    ],
    [`{p}, o {c} segue travado faz uns dias. Tem algum impedimento? Me fala que a gente resolve junto.`],
  ],
  // vig 4 — social: arte entregue, precisa revisar e ENTREGAR AO CLIENTE (mover pra Aprovação)
  revisar: [
    [
      `Oi {p}! o designer entregou a arte do {c}! Revisa e já manda pro cliente aprovar (move pra *Aprovação*). 👀`,
      `Oi {p}! saiu a arte do {c} 🎨 confere e envia pro cliente aprovar — move o card pra *Aprovação*.`,
      `{p}, a arte do {c} está pronta! Consegue revisar e mandar pro cliente aprovar?`,
    ],
    [
      `{p}, passando de novo — a arte do {c} ainda não foi pro cliente. Quando der, revisa e manda aprovar.`,
      `Oi {p}, o {c} segue entregue e sem ir pro cliente. Uma revisada e enviar pra aprovação já resolve.`,
    ],
    [`{p}, a arte do {c} segue entregue e ainda não foi pro cliente. Consegue revisar e mandar aprovar hoje? Se travou, me avisa.`],
  ],
  // vig 5 — social: cliente aprovou, falta agendar
  agendar: [
    [
      `Oi {p}! o cliente APROVOU a arte do {c} 🎉 — falta só agendar no Meta (mover pra *Agendado*). Consegue dar esse último passo?`,
      `Oi {p}! boa notícia: {c} aprovado pelo cliente ✅ agora é só agendar no Meta e mover pra *Agendado*.`,
      `{p}, o {c} já tem o ok do cliente! Falta agendar no Meta — consegue fechar isso?`,
    ],
    [
      `{p}, passando de novo — o {c} já foi aprovado e ainda falta agendar no Meta.`,
      `Oi {p}, o {c} segue aprovado e sem agendar. Quando puder, dá esse último passo 🙂`,
    ],
    [`{p}, o cliente aprovou o {c} e ele segue sem agendar — falta só esse passo. Precisa de ajuda?`],
  ],
};

/** Mensagem amigável, com VARIAÇÃO de fala por card. `seed` (card/cliente) mantém estável, mas
 *  diferente entre cards. T3: escala o tom por `nivel` (1ª/2ª/3ª+). Sempre educado, 1 emoji máx. */
function mensagemAmigavel(vig: number, area: Area, cliente: string, pessoa: string, motivo: string, nivel = 1, seed = ""): string {
  const travado = vig === 3 && /travado/i.test(motivo);
  const situacao = vig === 2 ? "pauta"
    : travado ? "travado"
    : vig === 3 ? "designer"
    : vig === 4 ? "revisar"
    : vig === 5 ? "agendar" : "";
  const banco = FRASES[situacao];
  if (banco) {
    const arr = banco[Math.min(Math.max(nivel, 1), 3) - 1];
    const extra = travado ? motivo.replace(/^card travado/i, "") : "";
    return pick(arr, hashSeed((seed || cliente) + vig + nivel))
      .replace(/\{p\}/g, pessoa).replace(/\{c\}/g, `*${cliente}*`).replace(/\{m\}/g, extra);
  }
  // Fallback genérico (situação sem banco).
  const oi = nivel >= 3 ? `${pessoa}, ` : nivel === 2 ? `${pessoa}, só passando de novo — ` : `Oi ${pessoa}! `;
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

  // Designer JÁ entregou (sinal de plataforma confiável) → o trabalho DELE acabou: nunca cobrar
  // designer. Mas o CARD precisa andar no board (decisão do Roberto: o time TEM que usar o card,
  // o board é a fonte de verdade) — entregue há >= TH_SOCIAL_VER h úteis e a coluna ainda atrás
  // de Aprovação → cobra o social pra revisar E MOVER. (Agendar pós-aprovação do cliente = vig 5.)
  if (c.designer_delivered_at || c.design_request_status === "done") {
    if (c.status === "approval" || c.status === "client_approval") return null; // board em dia
    const hEntrega = businessHoursSince(c.designer_delivered_at ?? enteredAt(c));
    return hEntrega >= TH_SOCIAL_VER
      ? { vigilancia: 4, area: "social", motivo: "arte entregue e o card parado no board — revisar e mover" }
      : null;
  }

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
      chave: `${v.vigilancia}-${k.id}-${hoje}`, motivo: v.motivo,
      // vig 4 (entregue, card parado): ao vivo se a ENTREGA é recente — a criação do card não importa.
      liveOverride: v.vigilancia === 4 ? (spDateKeyOf(k.designer_delivered_at) ?? "") >= ontem : undefined });
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
      ? mensagemAmigavel(cob.vigilancia, cob.area, nome, pessoa!, cob.motivo, nivel, cob.card_id || cob.client_id)
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

  // ── DIGEST "SEM PAUTA" POR PESSOA (AO VIVO) — decisão do Roberto: ficar em cima pro time USAR
  // O CARD. As linhas por cliente acima seguem só como registro (dry-run); aqui vai UMA mensagem
  // por social em dia FIRME listando os clientes dele sem card pra hoje — cobrança de board sem
  // spam. 1x/dia (chave `2d-<pessoa>-<dia>`), a partir das 10h (dá a manhã pra cardar). ──
  if (VIGILANCIA_LIVE && firmeHoje && now.getHours() >= 10 && internalJid) {
    const porPessoa = new Map<string, string[]>();
    for (const cob of cobrancas) {
      if (cob.vigilancia !== 2 || cob.card_id) continue; // só "sem pauta de hoje"
      if (!cob.chave.endsWith(`-${hoje}`)) continue;
      const cli = clientById.get(cob.client_id);
      const pessoa = (cli?.assigned_social as string) || "";
      const nome = (cli?.name as string) || "Cliente";
      if (!pessoa || /\(teste\)/i.test(nome)) continue;
      porPessoa.set(pessoa, [...(porPessoa.get(pessoa) ?? []), nome]);
    }
    for (const [pessoa, nomes] of porPessoa) {
      const chave = `2d-${pessoa}-${hoje}`;
      const lista = nomes.slice(0, 10).map((n) => `*${n}*`).join(", ") + (nomes.length > 10 ? ` e mais ${nomes.length - 10}` : "");
      const msgDigest = `Oi ${pessoa}! 📋 Hoje é dia de postagem e ainda não vi card com a data de hoje pra: ${lista}. Consegue cardar no board? Se algum não vai postar hoje, de boa — me avisa que tá tudo certo.`;
      const { error: insErr } = await supabaseAdmin.from("cs_cobrancas").insert({
        vigilancia: 2, client_id: null, card_id: null, pessoa_cobrada: pessoa, chave, mensagem: msgDigest, dry_run: false,
      });
      if (!insErr) {
        const r = await csSendGroupText(internalJid, msgDigest);
        if (r.ok) postadas++; else console.error("[cs-vigilancia] digest pauta falhou:", r.error);
      } else if (insErr.code !== "23505") console.error("[cs-vigilancia] digest insert:", insErr.message);
    }
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
