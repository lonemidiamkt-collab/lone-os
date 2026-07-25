// lib/metrics/okr-historico.ts — métricas de operação REAIS por mês, derivadas do histórico de
// transições de card (content_card_transitions).
//
// Antes, as visões Mensal/Trimestral/YTD do /goals eram geradas por fórmula em app/goals/page.tsx:
//   current: +(3.2 + v * 0.5)                       // "ROAS"
//   current: Math.round(320 + v * 100)              // "leads/mês"
//   baseProgress = 60 + v*20 + (m.name.length*2.3)%20  // progresso individual pelo TAMANHO DO NOME
// Nada disso vinha do banco, e nada era marcado como simulado — parecia relatório.
//
// REGRA: número só existe se dá pra calcular. Sem fonte → `null`, e a tela escreve "—".

import { supabaseAdmin } from "@/lib/supabase/server";
import { spNow, ymd } from "@/lib/cs/vigilancia";

export interface MesOperacao {
  mes: string;               // YYYY-MM
  label: string;             // "Jul/26"
  postsEntregues: number;    // publicados no mês (real)
  slaMedioHoras: number | null;  // tempo médio de produção → publicação
  entregasNoPrazo: number | null; // % publicado até a data combinada
  porMembro: Record<string, number>; // posts por social no mês (meta individual real)
}

const MESES_PT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export async function okrHistorico(nMeses = 12): Promise<MesOperacao[]> {
  const agora = spNow();
  const primeiro = new Date(agora.getFullYear(), agora.getMonth() - (nMeses - 1), 1);
  const desdeISO = `${primeiro.getFullYear()}-${String(primeiro.getMonth() + 1).padStart(2, "0")}-01T00:00:00-03:00`;

  const { data, error } = await supabaseAdmin
    .from("content_card_transitions")
    .select("card_id, transitioned_at, duration_ms, metadata, content_cards!inner(due_date, social_media)")
    .eq("to_status", "published")
    .gte("transitioned_at", desdeISO);

  if (error) console.error("[okr-historico]", error.message);

  type Linha = { card_id: string; transitioned_at: string; duration_ms: number | null; metadata: Record<string, unknown> | null; content_cards: { due_date: string | null; social_media: string | null } | null };
  const porMes = new Map<string, { cards: Set<string>; duracoes: number[]; noPrazo: number; comPrazo: number; membros: Record<string, number> }>();

  for (const r of ((data ?? []) as unknown as Linha[])) {
    const mes = ymd(spNow(new Date(r.transitioned_at))).slice(0, 7);
    if (!porMes.has(mes)) porMes.set(mes, { cards: new Set(), duracoes: [], noPrazo: 0, comPrazo: 0, membros: {} });
    const b = porMes.get(mes)!;
    if (b.cards.has(r.card_id)) continue;
    b.cards.add(r.card_id);
    const quem = r.content_cards?.social_media?.trim();
    if (quem) b.membros[quem] = (b.membros[quem] || 0) + 1;
    // Backfill não tem duração medida — não entra na média de SLA (senão inventa tempo).
    const ehBackfill = r.metadata?.backfill === true;
    if (!ehBackfill && typeof r.duration_ms === "number" && r.duration_ms > 0) b.duracoes.push(r.duration_ms);
    const due = r.content_cards?.due_date;
    if (due) {
      b.comPrazo++;
      if (ymd(spNow(new Date(r.transitioned_at))) <= due) b.noPrazo++;
    }
  }

  const saida: MesOperacao[] = [];
  for (let i = 0; i < nMeses; i++) {
    const d = new Date(agora.getFullYear(), agora.getMonth() - (nMeses - 1) + i, 1);
    const mes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const b = porMes.get(mes);
    saida.push({
      mes,
      label: `${MESES_PT[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`,
      postsEntregues: b?.cards.size ?? 0,
      slaMedioHoras: b?.duracoes.length
        ? Math.round(b.duracoes.reduce((s, x) => s + x, 0) / b.duracoes.length / 3_600_000)
        : null,
      entregasNoPrazo: b?.comPrazo ? Math.round((b.noPrazo / b.comPrazo) * 100) : null,
      porMembro: b?.membros ?? {},
    });
  }
  return saida;
}
