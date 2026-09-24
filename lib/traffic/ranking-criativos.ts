// lib/traffic/ranking-criativos.ts — RANKING DE CRIATIVOS por cliente e por nicho (Leva 7A, N5).
// Regras puras (a rota /api/traffic/criativos/ranking lê o banco e chama isto).
//
// Estilo Motion: uma grade de miniaturas, do criativo que traz resultado mais barato para o mais caro,
// com o que o gestor precisa para decidir de relance — custo por resultado, frequência de 7 dias
// (cansaço) e há quantos dias está no ar. Quem gastou pouco não entra no ranking (custo com 1
// resultado não quer dizer nada); quem gastou e não trouxe nada vai para uma faixa separada.
//
// Fonte: meta_entity_snapshots (nível anúncio, um dia por linha; `conversions` já é o resultado do
// objetivo — conversa, lead ou compra) + meta_ad_period (frequência real de 7 dias) + creative_snapshots
// (miniatura). Testado em tests/ranking-criativos.test.ts.

import type { TipoResultadoConta } from "@/lib/meta/resultado";

export interface LinhaAnuncioDia {
  client_id: string | null;
  /** "<adId>_<AAAA-MM-DD>" (é assim que o meta-granular grava). */
  entity_id: string;
  entity_name: string | null;
  campaign_name: string | null;
  metric_date: string;
  spend: number | string | null;
  impressions: number | string | null;
  clicks: number | string | null;
  conversions: number | string | null;
  result_kind?: string | null;
}

export interface AnuncioAgregado {
  adId: string;
  clientId: string | null;
  nome: string | null;
  campanha: string | null;
  gasto: number;
  impressoes: number;
  cliques: number;
  resultados: number;
  tipos: Record<string, number>;
  primeiroDia: string | null;
  ultimoDia: string | null;
}

export interface CriativoRank {
  adId: string;
  clientId: string | null;
  nome: string | null;
  campanha: string | null;
  gasto: number;
  resultados: number;
  tipoResultado: TipoResultadoConta;
  /** Gasto ÷ resultados. null = sem resultado. */
  custo: number | null;
  ctr: number | null;
  cpm: number | null;
  /** Frequência real dos últimos 7 dias (meta_ad_period). */
  frequencia7d: number | null;
  diasNoAr: number | null;
  /** Custo ÷ mediana do grupo (0,6 = 40% mais barato). null sem custo. */
  vsMediana: number | null;
  posicao: number | null;
}

const num = (v: unknown) => { const n = typeof v === "number" ? v : parseFloat(String(v ?? "")); return Number.isFinite(n) ? n : 0; };

export const adIdDe = (entityId: string) => String(entityId).split("_")[0];

export function agregarPorAnuncio(linhas: LinhaAnuncioDia[]): Map<string, AnuncioAgregado> {
  // Uma linha por anúncio+dia (o upsert do meta-granular garante; aqui a última vence por segurança).
  const porChave = new Map<string, LinhaAnuncioDia>();
  for (const l of linhas) porChave.set(`${adIdDe(l.entity_id)}|${l.metric_date}`, l);
  const out = new Map<string, AnuncioAgregado>();
  for (const l of porChave.values()) {
    const adId = adIdDe(l.entity_id);
    const a = out.get(adId) ?? {
      adId, clientId: l.client_id, nome: l.entity_name, campanha: l.campaign_name,
      gasto: 0, impressoes: 0, cliques: 0, resultados: 0, tipos: {}, primeiroDia: null, ultimoDia: null,
    };
    const gasto = num(l.spend);
    a.gasto += gasto;
    a.impressoes += num(l.impressions);
    a.cliques += num(l.clicks);
    const r = num(l.conversions);
    a.resultados += r;
    const tipo = l.result_kind || "mensagens";
    if (r > 0) a.tipos[tipo] = (a.tipos[tipo] ?? 0) + r;
    if (gasto > 0) {
      if (!a.primeiroDia || l.metric_date < a.primeiroDia) a.primeiroDia = l.metric_date;
      if (!a.ultimoDia || l.metric_date > a.ultimoDia) a.ultimoDia = l.metric_date;
    }
    if (l.entity_name) a.nome = l.entity_name;
    out.set(adId, a);
  }
  return out;
}

export function mediana(xs: number[]): number | null {
  const v = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

function tipoDe(tipos: Record<string, number>): TipoResultadoConta {
  const total = Object.values(tipos).reduce((s, v) => s + v, 0);
  if (!total) return "mensagens";
  for (const t of ["mensagens", "leads", "compras"] as const) if ((tipos[t] ?? 0) / total >= 0.8) return t;
  return "misto";
}

export interface ResultadoRanking {
  ranqueados: CriativoRank[];
  /** Gastaram ≥ o mínimo e não trouxeram resultado — do que mais gastou pro que menos. */
  semResultado: CriativoRank[];
  /** Quantos ficaram de fora por gasto baixo. */
  poucoGasto: number;
  medianaCusto: number | null;
}

export function ranquear(
  agregados: AnuncioAgregado[],
  extra: { frequencia?: Map<string, number>; diasNoAr?: Map<string, number>; hoje: string },
  opcoes: { gastoMinimo: number; resultadosMinimos?: number } = { gastoMinimo: 30 },
): ResultadoRanking {
  const minRes = opcoes.resultadosMinimos ?? 2;
  const paraRank = (a: AnuncioAgregado): CriativoRank => {
    const dias = extra.diasNoAr?.get(a.adId)
      ?? (a.primeiroDia ? Math.round((Date.parse(`${extra.hoje}T12:00:00Z`) - Date.parse(`${a.primeiroDia}T12:00:00Z`)) / 864e5) + 1 : null);
    return {
      adId: a.adId, clientId: a.clientId, nome: a.nome, campanha: a.campanha,
      gasto: a.gasto, resultados: a.resultados, tipoResultado: tipoDe(a.tipos),
      custo: a.resultados > 0 ? a.gasto / a.resultados : null,
      ctr: a.impressoes > 0 ? (a.cliques / a.impressoes) * 100 : null,
      cpm: a.impressoes > 0 ? (a.gasto / a.impressoes) * 1000 : null,
      frequencia7d: extra.frequencia?.get(a.adId) ?? null,
      diasNoAr: dias, vsMediana: null, posicao: null,
    };
  };
  let poucoGasto = 0;
  const comGasto: CriativoRank[] = [];
  for (const a of agregados) {
    if (a.gasto < opcoes.gastoMinimo) { if (a.gasto > 0) poucoGasto++; continue; }
    comGasto.push(paraRank(a));
  }
  const ranqueados = comGasto.filter((c) => c.custo != null && c.resultados >= minRes)
    .sort((x, y) => (x.custo! - y.custo!) || (y.resultados - x.resultados));
  const med = mediana(ranqueados.map((c) => c.custo!));
  ranqueados.forEach((c, i) => { c.posicao = i + 1; c.vsMediana = med ? c.custo! / med : null; });
  const semResultado = comGasto.filter((c) => c.resultados === 0).sort((x, y) => y.gasto - x.gasto);
  // Com 1 resultado (abaixo do mínimo) e gasto relevante: fica fora dos dois — amostra pequena.
  return { ranqueados, semResultado, poucoGasto, medianaCusto: med };
}

// ─── O que /api/traffic/criativos/ranking devolve ───────────────────────────

export interface ItemRanking extends CriativoRank {
  cliente: string;
  nicho: string | null;
  thumb: string | null;
  tipo: string | null;
  status: string | null;
}

export interface RespostaRanking {
  dias: number;
  desde: string;
  ate: string;
  ranqueados: ItemRanking[];
  semResultado: ItemRanking[];
  poucoGasto: number;
  medianaCusto: number | null;
  /** Para os filtros: clientes com anúncio na janela e os nichos deles. */
  clientes: { id: string; nome: string; nicho: string | null }[];
  nichos: { chave: string; rotulo: string }[];
}
