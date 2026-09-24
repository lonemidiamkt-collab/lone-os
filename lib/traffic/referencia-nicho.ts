// lib/traffic/referencia-nicho.ts — REFERÊNCIA POR NICHO (Leva 7A, N6). Regras puras.
//
// "Esse custo por conversa é bom?" depende do ramo: R$ 15 é ótimo para móveis planejados e caro para
// açaí. Aqui sai a MEDIANA do nicho — custo por resultado, CTR e CPM dos últimos 30 dias fechados —
// para pôr ao lado dos números de cada cliente.
//
// ANÔNIMA: a referência é só a mediana; nenhum nome nem número de outro cliente sai daqui. E só existe
// quando o nicho tem pelo menos MIN_CLIENTES clientes com dado — com 2, a mediana entregaria o
// número do outro. O custo compara só clientes com o MESMO tipo de resultado (conversa com conversa,
// lead com lead): misturar os dois produz um número que não serve para nenhum.
//
// Nicho vem de clients.nicho normalizado (lib/cs/nicho.ts). Testado em tests/ranking-criativos.test.ts.

import { mediana } from "@/lib/traffic/ranking-criativos";
import type { TipoResultadoConta } from "@/lib/meta/resultado";

export const MIN_CLIENTES = 3;
/** Gasto mínimo em 30 dias para o cliente entrar na conta (conta quase parada distorce a mediana). */
export const GASTO_MINIMO_30D = 150;

export interface DiaCliente {
  metric_date: string;
  spend: number | string | null;
  impressions: number | string | null;
  clicks: number | string | null;
  conversions: number | string | null;
  results?: number | string | null;
  result_kind?: string | null;
}

export interface Metricas30d {
  gasto: number;
  resultados: number;
  impressoes: number;
  cliques: number;
  custo: number | null;
  ctr: number | null;
  cpm: number | null;
  tipo: TipoResultadoConta;
}

const num = (v: unknown) => { const n = typeof v === "number" ? v : parseFloat(String(v ?? "")); return Number.isFinite(n) ? n : 0; };

/** Soma os dias (uma linha por dia; a última cópia do dia vence). */
export function metricasDoCliente(dias: DiaCliente[]): Metricas30d {
  const porDia = new Map<string, DiaCliente>();
  for (const d of dias) porDia.set(d.metric_date.slice(0, 10), d);
  let gasto = 0, resultados = 0, impressoes = 0, cliques = 0;
  const tipos: Record<string, number> = {};
  for (const d of porDia.values()) {
    gasto += num(d.spend);
    impressoes += num(d.impressions);
    cliques += num(d.clicks);
    const r = d.results != null && d.results !== "" ? num(d.results) : num(d.conversions);
    resultados += r;
    const t = d.result_kind || "mensagens";
    tipos[t] = (tipos[t] ?? 0) + r;
  }
  const total = Object.values(tipos).reduce((s, v) => s + v, 0);
  let tipo: TipoResultadoConta = "mensagens";
  if (total > 0) {
    const dom = (["mensagens", "leads", "compras"] as const).find((t) => (tipos[t] ?? 0) / total >= 0.8);
    tipo = dom ?? "misto";
  }
  return {
    gasto, resultados, impressoes, cliques, tipo,
    custo: resultados > 0 ? gasto / resultados : null,
    ctr: impressoes > 0 ? (cliques / impressoes) * 100 : null,
    cpm: impressoes > 0 ? (gasto / impressoes) * 1000 : null,
  };
}

export interface ReferenciaNicho {
  nicho: string;
  /** Clientes que entraram na mediana de CTR/CPM. */
  clientes: number;
  ctr: number | null;
  cpm: number | null;
  /** Mediana do custo por tipo de resultado (só tipos com MIN_CLIENTES ou mais). */
  custo: Partial<Record<TipoResultadoConta, { valor: number; clientes: number }>>;
}

export function referenciasPorNicho(
  clientes: { nicho: string | null; m: Metricas30d }[],
  minClientes = MIN_CLIENTES,
): Map<string, ReferenciaNicho> {
  const grupos = new Map<string, Metricas30d[]>();
  for (const c of clientes) {
    if (!c.nicho || c.m.gasto < GASTO_MINIMO_30D) continue;
    const l = grupos.get(c.nicho) ?? [];
    l.push(c.m);
    grupos.set(c.nicho, l);
  }
  const out = new Map<string, ReferenciaNicho>();
  for (const [nicho, ms] of grupos) {
    if (ms.length < minClientes) continue;
    const custo: ReferenciaNicho["custo"] = {};
    for (const t of ["mensagens", "leads", "compras"] as const) {
      const vals = ms.filter((m) => m.tipo === t && m.custo != null).map((m) => m.custo!);
      if (vals.length >= minClientes) custo[t] = { valor: mediana(vals)!, clientes: vals.length };
    }
    out.set(nicho, {
      nicho, clientes: ms.length,
      ctr: mediana(ms.filter((m) => m.ctr != null).map((m) => m.ctr!)),
      cpm: mediana(ms.filter((m) => m.cpm != null).map((m) => m.cpm!)),
      custo,
    });
  }
  return out;
}

/** O custo do cliente contra a mediana do nicho: "abaixo" (melhor), "na_media" ou "acima" (±15%). */
export function compararComNicho(custo: number | null, ref: number | null | undefined): "abaixo" | "na_media" | "acima" | null {
  if (custo == null || ref == null || ref <= 0) return null;
  const r = custo / ref;
  return r < 0.85 ? "abaixo" : r > 1.15 ? "acima" : "na_media";
}

// ─── O que /api/trafego/referencia-nicho devolve ────────────────────────────

export interface RespostaReferencias {
  desde: string;
  ate: string;
  nichos: { chave: string; rotulo: string; clientes: number; ctr: number | null; cpm: number | null; custo: ReferenciaNicho["custo"] }[];
}
