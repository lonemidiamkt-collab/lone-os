// lib/meta/publico.ts — gênero e faixa etária das pessoas alcançadas, a partir das linhas de
// /act_X/insights?breakdowns=age,gender. Puro. Usado pelo relatório do cliente
// (lib/reports/relatorioCliente.ts) e pela aba Anúncios (fetchAccountDemographics).
// Testado em tests/relatorio-cliente.test.ts com as linhas no formato da Meta.

/** breakdowns=age,gender. A Meta escreve `gender` em minúsculas ("female", "male", "unknown") e
 *  `age` com a faixa ("18-24", "65+") ou "Unknown" com maiúscula. */
export interface LinhaDemografia {
  age?: string;
  gender?: string;
  reach?: string;
  impressions?: string;
}

const num = (v: string | number | undefined | null): number => {
  if (v === undefined || v === null || v === "") return 0;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};
const umaCasa = (n: number) => Math.round(n * 10) / 10;

export interface Publico {
  /** null quando a Meta não soube o gênero de ninguém. NUNCA 50/50 inventado. */
  genero: { mulheres: number; homens: number } | null;
  /** Em ordem de idade. As faixas adultas aparecem SEMPRE (0% quando ninguém daquela idade viu). */
  idades: { faixa: string; pct: number }[];
  /** Base das porcentagens: pessoas alcançadas (preferido) ou impressões (quando a Meta não dá alcance). */
  base: "alcance" | "impressoes";
}

const FAIXAS_ADULTAS = ["18-24", "25-34", "35-44", "45-54", "55-64", "65+"];
const inicioFaixa = (f: string) => parseInt(f, 10) || 0;

/**
 * Gênero e idade das pessoas alcançadas.
 *
 * O que mudou em relação à leitura antiga (lib/meta/insights-server.ts, que também passa a usar esta):
 *   - Sem gênero conhecido devolvia 50/50 INVENTADO. Agora é null e o PDF não mostra gênero.
 *   - A faixa "Unknown" (com maiúscula, como a Meta escreve) virava uma barra "Unknown" e entrava
 *     no denominador — as faixas de verdade somavam menos de 100%.
 *   - Faixa sem ninguém alcançado simplesmente não vinha, e o cliente lia "sumiu o 18-24" como erro
 *     do relatório. Agora as seis faixas adultas aparecem sempre, com 0% quando é o caso.
 *   - Base = pessoas alcançadas (como o portal), não impressões.
 *
 * O caso do Horto Naenc (14–20/09, "Homens 0% · Mulheres 100%", sem 18-24) NÃO era erro de leitura:
 * as cinco faixas somavam exatamente 100% e também faltava a faixa 18-24 feminina — os anúncios da
 * semana só entregaram para mulheres de 25+. O que enganava era o desenho: a rosca pintava "mulheres"
 * com a cor do trilho vazio, e 100% virava um anel cinza com cara de gráfico quebrado.
 */
export function lerPublico(linhas: readonly LinhaDemografia[]): Publico | null {
  if (!linhas.length) return null;
  const somaAlcance = linhas.reduce((s, r) => s + num(r.reach), 0);
  const base: Publico["base"] = somaAlcance > 0 ? "alcance" : "impressoes";
  const valor = (r: LinhaDemografia) => (base === "alcance" ? num(r.reach) : num(r.impressions));

  let mulheres = 0, homens = 0;
  const porIdade = new Map<string, number>();
  for (const r of linhas) {
    const v = valor(r);
    if (v <= 0) continue;
    const g = (r.gender ?? "").trim().toLowerCase();
    if (g === "female") mulheres += v;
    else if (g === "male") homens += v;
    const idade = (r.age ?? "").trim();
    if (/^\d{2}-\d{2}$|^\d{2}\+$/.test(idade)) porIdade.set(idade, (porIdade.get(idade) ?? 0) + v);
  }

  const totalGenero = mulheres + homens;
  const pctMulheres = totalGenero > 0 ? umaCasa((mulheres / totalGenero) * 100) : 0;
  const genero = totalGenero > 0 ? { mulheres: pctMulheres, homens: umaCasa(100 - pctMulheres) } : null;

  const totalIdade = [...porIdade.values()].reduce((s, v) => s + v, 0);
  let idades: Publico["idades"] = [];
  if (totalIdade > 0) {
    const faixas = new Set([...FAIXAS_ADULTAS, ...porIdade.keys()]);
    idades = [...faixas]
      .sort((a, b) => inicioFaixa(a) - inicioFaixa(b))
      .map((faixa) => ({ faixa, pct: umaCasa(((porIdade.get(faixa) ?? 0) / totalIdade) * 100) }));
  }

  if (!genero && !idades.length) return null;
  return { genero, idades, base };
}

