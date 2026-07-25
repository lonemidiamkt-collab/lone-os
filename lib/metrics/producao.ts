// lib/metrics/producao.ts — A FONTE ÚNICA de "quantos posts saíram" (semana / mês / histórico).
//
// Por que existe: havia TRÊS cálculos divergentes na base —
//   1. app/api/dashboard/published-month  → certo, mas dependia de content_cards.status_changed_at
//      (que o comando de WhatsApp não carimbava → o post sumia da conta);
//   2. lib/dashboard/getDashboardData.ts  → contava status='published' SEM filtro de mês;
//   3. app/social/page.tsx                → lia clients.posts_this_month, campo manual zerado (soma=0).
//
// Agora a verdade é `content_card_transitions` (alimentada pelo trigger da migration 078): registra o
// EVENTO de publicação no momento em que acontece, por qualquer caminho (UI, WhatsApp, cron, psql), e
// sobrevive ao card ser arquivado ou mudar de status depois. Toda tela deve consumir daqui.

import { supabaseAdmin } from "@/lib/supabase/server";
import { spNow, ymd, addDays } from "@/lib/cs/vigilancia";

export interface PostsPeriodo {
  total: number;
  byClient: Record<string, number>;
  byMember: Record<string, number>;
}

interface LinhaTransicao {
  card_id: string;
  transitioned_at: string;
  content_cards: { client_id: string | null; social_media: string | null } | null;
}

/** Posts publicados num intervalo [inicio, fim). Datas em ISO. Dedup por card. */
export async function postsNoPeriodo(inicioISO: string, fimISO?: string): Promise<PostsPeriodo> {
  let q = supabaseAdmin
    .from("content_card_transitions")
    .select("card_id, transitioned_at, content_cards!inner(client_id, social_media)")
    .eq("to_status", "published")
    .gte("transitioned_at", inicioISO);
  if (fimISO) q = q.lt("transitioned_at", fimISO);

  const { data, error } = await q;
  if (error) {
    console.error("[metrics/producao] falhou:", error.message);
    return { total: 0, byClient: {}, byMember: {} };
  }

  // Um card pode ter mais de uma transição p/ published (voltou e republicou) — conta o card 1x.
  const vistos = new Set<string>();
  const byClient: Record<string, number> = {};
  const byMember: Record<string, number> = {};
  for (const row of (data ?? []) as unknown as LinhaTransicao[]) {
    if (vistos.has(row.card_id)) continue;
    vistos.add(row.card_id);
    const cid = row.content_cards?.client_id;
    if (cid) byClient[cid] = (byClient[cid] || 0) + 1;
    const m = row.content_cards?.social_media?.trim();
    if (m) byMember[m] = (byMember[m] || 0) + 1;
  }
  return { total: vistos.size, byClient, byMember };
}

/** Segunda-feira 00:00 (BRT) da semana corrente, em ISO. */
export function inicioSemanaISO(base = spNow()): string {
  const offset = base.getDay() === 0 ? 6 : base.getDay() - 1; // 0=dom → 6 dias desde segunda
  return `${ymd(addDays(base, -offset))}T00:00:00-03:00`;
}

/** Dia 1º 00:00 (BRT) do mês corrente, em ISO. */
export function inicioMesISO(base = spNow()): string {
  return `${ymd(base).slice(0, 7)}-01T00:00:00-03:00`;
}

export const postsSemana = () => postsNoPeriodo(inicioSemanaISO());
export const postsMes = () => postsNoPeriodo(inicioMesISO());

export interface MesHistorico { mes: string; label: string; total: number }

const MESES_PT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

/** Histórico dos últimos N meses (mais antigo → mais recente). Meses sem post entram com 0. */
export async function historicoMensal(nMeses = 6): Promise<MesHistorico[]> {
  const agora = spNow();
  const primeiroMes = new Date(agora.getFullYear(), agora.getMonth() - (nMeses - 1), 1);
  const inicioISO = `${primeiroMes.getFullYear()}-${String(primeiroMes.getMonth() + 1).padStart(2, "0")}-01T00:00:00-03:00`;

  const { data, error } = await supabaseAdmin
    .from("content_card_transitions")
    .select("card_id, transitioned_at")
    .eq("to_status", "published")
    .gte("transitioned_at", inicioISO);

  const porMes = new Map<string, Set<string>>();
  if (!error) {
    for (const r of data ?? []) {
      // Chave YYYY-MM no fuso de SP (o timestamp vem em UTC).
      const mes = ymd(spNow(new Date(r.transitioned_at as string))).slice(0, 7);
      if (!porMes.has(mes)) porMes.set(mes, new Set());
      porMes.get(mes)!.add(r.card_id as string);
    }
  } else {
    console.error("[metrics/producao] histórico falhou:", error.message);
  }

  const saida: MesHistorico[] = [];
  for (let i = 0; i < nMeses; i++) {
    const d = new Date(agora.getFullYear(), agora.getMonth() - (nMeses - 1) + i, 1);
    const mes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    saida.push({
      mes,
      label: `${MESES_PT[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`,
      total: porMes.get(mes)?.size ?? 0,
    });
  }
  return saida;
}

export interface SemanaProducao { label: string; inicio: string; total: number; corrente: boolean }

/**
 * Todas as semanas do mês corrente (S1…S5), com o que foi publicado em cada uma.
 * O card mostrava só o total da semana atual — não dava pra ver o ritmo dentro do mês.
 */
export async function semanasDoMes(base = spNow()): Promise<SemanaProducao[]> {
  const ano = base.getFullYear(), mes = base.getMonth();
  const primeiro = new Date(ano, mes, 1);
  const ultimo = new Date(ano, mes + 1, 0);

  // Semana começa na SEGUNDA. A 1ª "semana" do mês pode começar no meio.
  const semanas: { inicio: Date; fim: Date }[] = [];
  const cursor = new Date(primeiro);
  while (cursor <= ultimo) {
    const ini = new Date(cursor);
    const diasAteDomingo = cursor.getDay() === 0 ? 0 : 7 - cursor.getDay();
    const fim = new Date(cursor);
    fim.setDate(fim.getDate() + diasAteDomingo);
    semanas.push({ inicio: ini, fim: fim > ultimo ? new Date(ultimo) : fim });
    cursor.setDate(fim.getDate() + 1);
  }

  const { data } = await supabaseAdmin
    .from("content_card_transitions")
    .select("card_id, transitioned_at")
    .eq("to_status", "published")
    .gte("transitioned_at", `${ymd(primeiro)}T00:00:00-03:00`);

  const hojeKey = ymd(base);
  return semanas.map((s, i) => {
    const iniKey = ymd(s.inicio), fimKey = ymd(s.fim);
    const cards = new Set<string>();
    for (const r of data ?? []) {
      const k = ymd(spNow(new Date(r.transitioned_at as string)));
      if (k >= iniKey && k <= fimKey) cards.add(r.card_id as string);
    }
    return {
      label: `S${i + 1}`,
      inicio: iniKey,
      total: cards.size,
      corrente: hojeKey >= iniKey && hojeKey <= fimKey,
    };
  });
}

/** Meta do mês = soma do posts_goal dos clientes que estão em operação. */
export async function metaDoMes(): Promise<{ meta: number; clientes: number }> {
  const { data } = await supabaseAdmin
    .from("clients").select("posts_goal")
    .neq("status", "onboarding").neq("active", false).is("draft_status", null);
  const meta = (data ?? []).reduce((s, c) => s + ((c.posts_goal as number) ?? 12), 0);
  return { meta, clientes: (data ?? []).length };
}
