export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireCron } from "@/lib/api/cron-guard";
import {
  spNow, ymd, addDays, isBusinessDay, isBusinessHour, isFirmPostingDay, businessHoursSince,
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

const DRY_RUN = true; // Fase 0. Só vira false (cobrança real no grupo) quando o Roberto aprovar.

// Thresholds em HORAS ÚTEIS (decisão do Roberto: manter os propostos).
const TH_DESIGNER_PEGAR = 4; // card com demanda parado na Fila (designer não pegou)
const TH_PRODUCAO = 8;       // card em Produção sem entregar
const TH_SOCIAL_VER = 2;     // designer entregou e o social ainda não revisou
const TH_AGENDAR = 3;        // social revisou e não agendou (mover pra "Agendado")
const TH_TRAVADO = 2;        // card travado sem resolução

type Area = "social" | "designer";
interface Cobranca { vigilancia: number; area: Area; client_id: string; card_id: string | null; chave: string; motivo: string; }

interface CardRow {
  id: string; client_id: string; status: string; due_date: string | null;
  design_request_id: string | null; designer_delivered_at: string | null;
  social_confirmed_at: string | null; status_changed_at: string | null;
  column_entered_at: Record<string, string> | null; blocked_reason: string | null;
}

/** Quando o card entrou no estágio atual (p/ medir "parado há X"). */
function enteredAt(c: CardRow): string | null {
  return (c.column_entered_at && c.column_entered_at[c.status]) || c.status_changed_at;
}

/** Avalia 1 card e devolve a cobrança da etapa travada (ou null se está fluindo). */
function avaliarPipeline(c: CardRow, now: Date): { vigilancia: number; area: Area; motivo: string } | null {
  const h = businessHoursSince(enteredAt(c), now);
  switch (c.status) {
    case "published":
    case "scheduled":
      return null; // agendado/publicado → fluxo completo
    case "blocked":
      return h >= TH_TRAVADO
        ? { vigilancia: 3, area: "social", motivo: `card travado${c.blocked_reason ? `: ${c.blocked_reason}` : ""}` }
        : null;
    case "ideas":
    case "script":
      if (!c.design_request_id)
        return { vigilancia: 2, area: "social", motivo: 'ainda não foi pro designer (faltou marcar "A fazer")' };
      return h >= TH_DESIGNER_PEGAR
        ? { vigilancia: 3, area: "designer", motivo: "aguardando o designer pegar em produção" }
        : null;
    case "in_production":
      return h >= TH_PRODUCAO
        ? { vigilancia: 3, area: "designer", motivo: "em produção há um tempo sem entregar" }
        : null;
    case "approval":
    case "client_approval":
      if (!c.social_confirmed_at) {
        const since = businessHoursSince(c.designer_delivered_at ?? enteredAt(c), now);
        return since >= TH_SOCIAL_VER
          ? { vigilancia: 4, area: "social", motivo: "o designer entregou e ainda não foi revisado" }
          : null;
      }
      return businessHoursSince(c.social_confirmed_at, now) >= TH_AGENDAR
        ? { vigilancia: 5, area: "social", motivo: 'revisado — falta agendar no Meta (mover pra "Agendado")' }
        : null;
    default:
      return null;
  }
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

  // Clientes ativos
  const { data: clientsData, error: cErr } = await supabaseAdmin
    .from("clients")
    .select("id, name, assigned_social, assigned_designer, active")
    .or("active.is.null,active.eq.true");
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });
  const clients = clientsData ?? [];
  const clientById = new Map(clients.map((c) => [c.id as string, c]));

  // Cards near/overdue (due até amanhã+2), não-arquivados, não publicados.
  const limite = ymd(addDays(now, 2));
  const { data: cardsData, error: kErr } = await supabaseAdmin
    .from("content_cards")
    .select("id, client_id, status, due_date, design_request_id, designer_delivered_at, social_confirmed_at, status_changed_at, column_entered_at, blocked_reason")
    .is("archived_at", null)
    .neq("status", "published")
    .not("due_date", "is", null)
    .lte("due_date", limite);
  if (kErr) return NextResponse.json({ error: kErr.message }, { status: 500 });
  const cards = (cardsData ?? []) as CardRow[];

  const cobrancas: Cobranca[] = [];

  // ── A) PAUTA AUSENTE — só em dia FIRME (seg/sex). Quarta é leve (pula). ──
  const temCardNaData = (clientId: string, dia: string) =>
    cards.some((k) => k.client_id === clientId && k.due_date === dia);
  for (const c of clients) {
    if (!(c.active === null || c.active === true)) continue;
    // #2 — hoje é dia firme e não há pauta pra hoje
    if (isFirmPostingDay(now) && !temCardNaData(c.id as string, hoje)) {
      cobrancas.push({ vigilancia: 2, area: "social", client_id: c.id as string, card_id: null,
        chave: `2-${c.id}-${hoje}`, motivo: "hoje é dia de postagem e não há pauta criada" });
    }
    // #1 — amanhã é dia firme e nada planejado (D-1)
    if (isFirmPostingDay(amanhaDate) && !temCardNaData(c.id as string, amanha)) {
      cobrancas.push({ vigilancia: 1, area: "social", client_id: c.id as string, card_id: null,
        chave: `1-${c.id}-${amanha}`, motivo: "amanhã é dia de postagem e nada está planejado" });
    }
  }

  // ── B) PIPELINE TRAVADO — por card (qualquer dia, inclusive quarta). ──
  for (const k of cards) {
    const v = avaliarPipeline(k, now);
    if (!v) continue;
    cobrancas.push({ vigilancia: v.vigilancia, area: v.area, client_id: k.client_id, card_id: k.id,
      chave: `${v.vigilancia}-${k.id}-${hoje}`, motivo: v.motivo });
  }

  // Resolve quem seria cobrado (assigned_social/designer) e registra (dry-run, dedup pela chave).
  const detalhe: Array<Record<string, unknown>> = [];
  for (const cob of cobrancas) {
    const cli = clientById.get(cob.client_id);
    const nome = (cli?.name as string) || "Cliente";
    const pessoa = cob.area === "designer" ? (cli?.assigned_designer as string) : (cli?.assigned_social as string);
    await supabaseAdmin.from("cs_cobrancas").upsert({
      vigilancia: cob.vigilancia, client_id: cob.client_id, card_id: cob.card_id,
      pessoa_cobrada: pessoa || null, chave: cob.chave,
      mensagem: `[dry-run] ${nome}: ${cob.motivo}${pessoa ? ` (@${pessoa})` : ""}`,
      dry_run: DRY_RUN,
    }, { onConflict: "chave", ignoreDuplicates: true });
    detalhe.push({ vig: cob.vigilancia, cliente: nome, pessoa: pessoa || null, motivo: cob.motivo });
  }

  console.log(`[cs-vigilancia] dry_run=${DRY_RUN} dia=${hoje} firme=${isFirmPostingDay(now)} cobrancas=${cobrancas.length}`);
  return NextResponse.json({
    ok: true, dry_run: DRY_RUN, dia: hoje, dia_firme_hoje: isFirmPostingDay(now),
    clientes_ativos: clients.length, cards_avaliados: cards.length,
    cobrancas: cobrancas.length,
    por_vigilancia: cobrancas.reduce((acc, c) => { acc[c.vigilancia] = (acc[c.vigilancia] || 0) + 1; return acc; }, {} as Record<number, number>),
    detalhe: detalhe.slice(0, 30),
  });
}
