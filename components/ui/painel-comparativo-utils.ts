// components/ui/painel-comparativo-utils.ts — contas puras do PainelComparativo (testadas em
// tests/painel-comparativo-utils.test.ts). Sem React, sem Supabase.

/** "direta": subir é bom (faturamento, conversas). "inversa": cair é bom (custo por conversa, CPL).
 *  "neutra": subir/cair não é bom nem ruim por si (investimento). */
export type Natureza = "direta" | "inversa" | "neutra";
export type Tom = "bom" | "ruim" | "neutro";

/** Variação % de `anterior` para `atual`. null quando não há base honesta de comparação. */
export function variacao(atual: number | null | undefined, anterior: number | null | undefined): number | null {
  if (atual == null || anterior == null) return null;
  if (!Number.isFinite(atual) || !Number.isFinite(anterior)) return null;
  if (anterior === 0) return null;
  // Base negativa (ex.: ROI) inverteria o sinal: divide pelo módulo.
  return ((atual - anterior) / Math.abs(anterior)) * 100;
}

/** Tom da variação conforme a natureza da métrica. Até o limiar (em pontos %) é "neutro". */
export function tomDaVariacao(pct: number | null | undefined, natureza: Natureza = "direta", limiar = 1): Tom {
  if (pct == null || !Number.isFinite(pct)) return "neutro";
  if (natureza === "neutra" || Math.abs(pct) <= limiar) return "neutro";
  const subiu = pct > 0;
  return (natureza === "direta") === subiu ? "bom" : "ruim";
}

/** "+24%", "−8,5%", "0%". Uma casa decimal só abaixo de 10%. */
export function formatarVariacao(pct: number): string {
  const abs = Math.abs(pct);
  const casas = abs < 10 && Math.round(abs * 10) % 10 !== 0 ? 1 : 0;
  const num = abs.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
  if (num === "0") return "0%";
  return `${pct > 0 ? "+" : "−"}${num}%`;
}

/** "YYYY-MM" somado de n meses (n pode ser negativo). */
export function somaMeses(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export interface PontoMensal { mes: string; rotulo: string; atual: number | null; anterior: number | null }

/**
 * Série mensal terminando em `fim` comparada com os mesmos meses do ano anterior. Se o ano anterior
 * não tem ao menos 2 meses na janela (a linha tracejada viraria pontos soltos), compara com o mês
 * anterior. Mês sem valor vira null (buraco no gráfico), nunca zero.
 */
export function serieMensalComparada(
  valores: ReadonlyMap<string, number>,
  fim: string,
  meses: number,
  rotular: (ym: string) => string = (ym) => ym,
): { base: "ano_anterior" | "mes_anterior"; serie: PontoMensal[] } {
  const janela = Array.from({ length: Math.max(1, meses) }, (_, i) => somaMeses(fim, i - meses + 1));
  const comAnoAnterior = janela.filter((ym) => valores.has(somaMeses(ym, -12))).length;
  const base = comAnoAnterior >= 2 ? "ano_anterior" : "mes_anterior";
  const desloc = base === "ano_anterior" ? -12 : -1;
  return {
    base,
    serie: janela.map((ym) => ({
      mes: ym,
      rotulo: rotular(ym),
      atual: valores.get(ym) ?? null,
      anterior: valores.get(somaMeses(ym, desloc)) ?? null,
    })),
  };
}
