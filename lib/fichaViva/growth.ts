// lib/fichaViva/growth.ts — cálculo de crescimento do NEGÓCIO do cliente a partir das
// linhas de client_financial_results (faturamento/vendas/ticket por mês). Versão server,
// usada na página pública /ficha/[token] pra mostrar ao cliente a evolução dele. Mesma
// lógica de tendência da aba Resultados (média recente vs. anterior).

export interface GrowthRow {
  month: string;              // "YYYY-MM"
  revenue: number;            // faturamento
  vendas: number | null;
  ticket: number | null;      // faturamento / vendas (coluna gerada)
}

export type GrowthLevel = "up" | "flat" | "down" | "unknown";

export interface GrowthSeriesPoint { month: string; faturamento: number; ticket: number | null; }

export interface GrowthSummary {
  level: GrowthLevel;
  label: string;              // Crescendo | Estável | Em queda | Sem dados
  pct: number | null;         // variação % da janela recente vs. anterior
  reading: string;            // leitura em 1 frase (linguagem pro cliente)
  series: GrowthSeriesPoint[];
  last: GrowthSeriesPoint | null;
  totalFaturamento: number;
  mesesRegistrados: number;
}

/** Recebe as linhas cruas ordenadas por mês asc. Nunca lança. */
export function computeGrowth(rows: GrowthRow[]): GrowthSummary {
  const ordered = [...rows].sort((a, b) => a.month.localeCompare(b.month));
  const series: GrowthSeriesPoint[] = ordered.map((r) => ({
    month: r.month, faturamento: r.revenue, ticket: r.ticket,
  }));
  const last = series.length ? series[series.length - 1] : null;
  const totalFaturamento = ordered.reduce((s, r) => s + (r.revenue || 0), 0);

  const rev = ordered.filter((r) => r.revenue > 0);
  const base = { series, last, totalFaturamento, mesesRegistrados: ordered.length };

  if (rev.length < 2) {
    return { ...base, level: "unknown", label: "Sem dados", pct: null,
      reading: "Ainda estamos reunindo os primeiros meses de resultado." };
  }
  const n = Math.min(3, Math.floor(rev.length / 2));
  const recent = rev.slice(-n);
  const prior = rev.slice(-2 * n, -n);
  const avg = (arr: GrowthRow[]) => arr.reduce((s, r) => s + r.revenue, 0) / arr.length;
  const pAvg = avg(prior);
  if (pAvg <= 0) {
    return { ...base, level: "unknown", label: "Sem base", pct: null,
      reading: "Ainda estamos reunindo os primeiros meses de resultado." };
  }
  const pct = Math.round(((avg(recent) - pAvg) / pAvg) * 100);
  const janela = n > 1 ? "nos últimos meses" : "no último mês";
  if (pct >= 10) return { ...base, level: "up", label: "Crescendo", pct,
    reading: `Seu faturamento cresceu ${pct}% ${janela}. Vamos manter o ritmo!` };
  if (pct <= -8) return { ...base, level: "down", label: "Atenção", pct,
    reading: `Seu faturamento recuou ${Math.abs(pct)}% ${janela} — bora reverter isso juntos.` };
  return { ...base, level: "flat", label: "Estável", pct,
    reading: `Seu faturamento está estável (${pct >= 0 ? "+" : ""}${pct}%) ${janela}.` };
}
