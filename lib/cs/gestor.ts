// lib/cs/gestor.ts — "Raio-X do Gestor": visão de operação do time a partir do que o sistema já
// coleta (columnEnteredAt). Aponta o gargalo do fluxo e QUEM/QUAL card está travando, pra o gestor
// cobrar sem ficar rolando o board. Funções puras (o "parado há X horas úteis" é injetado → testável).

import type { ContentCard } from "@/lib/types";
import { type OperationalKpis, stageLabel } from "@/lib/kpis/operational";

// Etapas COMPROMETIDAS onde tempo parado = problema. "ideas" fica de fora de propósito: é backlog,
// não trabalho comprometido (mesma régua do atraso/encalhado — ideia parada não é atraso do social).
const ATIVOS = new Set(["script", "in_production", "approval", "client_approval"]);

export interface CardParado { titulo: string; social: string; etapa: string; horasUteis: number; }

/**
 * Cards travados: em etapa comprometida e parados há mais de `thresholdHorasUteis` na coluna atual.
 * `horasParado` é injetada (o route passa businessHoursSince c/ o relógio real) → mantém puro.
 * Ordenado do mais travado pro menos.
 */
export function cardsParados(
  cards: ContentCard[],
  horasParado: (c: ContentCard) => number,
  thresholdHorasUteis = 16, // ~2 dias úteis (8h/dia)
): CardParado[] {
  return cards
    .filter((c) => ATIVOS.has(c.status))
    .map((c) => ({ c, h: horasParado(c) }))
    .filter(({ h }) => Number.isFinite(h) && h >= thresholdHorasUteis)
    .map(({ c, h }) => ({
      titulo: c.title, social: c.socialMedia?.trim() || "sem responsável", etapa: stageLabel(c.status), horasUteis: h,
    }))
    .sort((a, b) => b.horasUteis - a.horasUteis);
}

// ── Retrabalho (social reprova a arte do designer) — lido do log append-only cs_rework_events ──
export interface ReworkEvent { social_media?: string | null; client_name?: string | null; }

/** Reprovações agrupadas por social (mais reprovações primeiro). */
export function retrabalhoPorSocial(events: ReworkEvent[]): { social: string; count: number }[] {
  const map = new Map<string, number>();
  for (const e of events) {
    const s = e.social_media?.trim() || "sem responsável";
    map.set(s, (map.get(s) ?? 0) + 1);
  }
  return [...map.entries()].map(([social, count]) => ({ social, count })).sort((a, b) => b.count - a.count);
}

/**
 * Mensagem WhatsApp enxuta: fluxo (global) + travados por social (só o pior de cada) + retrabalho.
 * `retrabalho` opcional: se passado (mesmo vazio) renderiza a seção; se undefined, omite.
 */
export function formatRaioXGestor(
  kpis: OperationalKpis,
  parados: CardParado[],
  dataLabel: string,
  retrabalho?: { social: string; count: number }[],
): string {
  const linhas = [`🧭 *Raio-X do Gestor* — ${dataLabel}`, ``, `⏱️ *Fluxo*`];

  linhas.push(`Lead time: *${kpis.leadTimeDays ?? "—"}* dias (ideia → publicado)`);
  const prazo = kpis.onTimeRate != null ? `${kpis.onTimeRate}% no prazo` : "prazo: sem dados";
  const gargalo = kpis.bottleneck
    ? `gargalo: *${stageLabel(kpis.bottleneck.stage)}* (${kpis.bottleneck.avgDays}d em média)`
    : "sem gargalo claro";
  linhas.push(`${prazo}  ·  ${gargalo}`);

  linhas.push(``);
  if (parados.length === 0) {
    linhas.push(`🎯 *Nada travado* — nenhum card parado há +2 dias úteis. Fluxo em dia!`);
  } else {
    linhas.push(`🐢 *Travados há +2 dias úteis* (${parados.length}):`);
    const porSocial = new Map<string, CardParado[]>();
    for (const p of parados) {
      const arr = porSocial.get(p.social) ?? [];
      arr.push(p);
      porSocial.set(p.social, arr);
    }
    // Social com mais travados primeiro; dentro de cada um, o pior já vem no topo (lista global ordenada).
    const ordenados = [...porSocial.entries()].sort((a, b) => b[1].length - a[1].length);
    for (const [social, lista] of ordenados) {
      const pior = lista[0];
      const dias = Math.max(1, Math.round(pior.horasUteis / 8)); // horas úteis → dias úteis
      const extra = lista.length > 1 ? ` (+${lista.length - 1})` : "";
      linhas.push(`• *${social}*: ${lista.length}${extra} — pior: "${pior.titulo}" (${pior.etapa}, ${dias}d úteis parado)`);
    }
  }

  if (retrabalho) {
    const total = retrabalho.reduce((a, b) => a + b.count, 0);
    linhas.push(``);
    if (total === 0) {
      linhas.push(`🔁 *Retrabalho (7 dias)*: 0 — ninguém precisou refazer 👏`);
    } else {
      linhas.push(`🔁 *Retrabalho (7 dias)*: ${total} reprovaç${total === 1 ? "ão" : "ões"} do social`);
      linhas.push(retrabalho.map((r) => `${r.social}: ${r.count}`).join(" · "));
    }
  }

  linhas.push(``, `_Tempo real de cada card no fluxo. Cobra quem tá travando 😉_`);
  return linhas.join("\n");
}
