// LONE SCORE — o número único da empresa, ponderado por dimensão.
//
// PRA QUE (Roberto, 02/09): "eu evitaria uma média simples, porque os indicadores têm naturezas
// diferentes. Churn de 0% é ótimo, 43 clientes para meta de 40 é ótimo, saúde em 68 é
// preocupante, 0 novos clientes é ruim. E eles não deveriam necessariamente ter o mesmo peso."
//
// O "Progresso Geral 82%" era a média de quatro coisas incomparáveis. O 82 não dizia se a empresa
// ia bem: dizia que a média de números sem relação entre si dava 82.
//
// Pesos definidos por ele:
//   Financeiro 30% · Clientes/Retenção 25% · Comercial 20% · Operação 15% · Qualidade 10%
//
// DUAS DECISÕES QUE MUDAM O RESULTADO:
//
// 1. Dimensão sem dado NÃO vira zero — sai do cálculo e os pesos se redistribuem entre as que
//    sobraram. Comercial hoje é quase vazio (1 lead no banco): contá-lo como zero derrubaria o
//    score da empresa por uma lacuna de cadastro, não por um problema de vendas. O painel diz
//    quantos por cento do peso foi realmente medido — é isso que informa quanto confiar no número.
//
// 2. Uma dimensão crítica não pode ser diluída pelas boas. Quando alguma fica abaixo de 50, o
//    score final é limitado — média alta escondendo um departamento em colapso foi exatamente a
//    queixa que originou este arquivo.

import { avaliar, type Avaliacao, type Indicador, type Situacao } from "./indicador";

export type Dimensao = "financeiro" | "clientes" | "comercial" | "operacao" | "qualidade";

export const PESOS: Record<Dimensao, number> = {
  financeiro: 30,
  clientes: 25,
  comercial: 20,
  operacao: 15,
  qualidade: 10,
};

export const NOME_DIMENSAO: Record<Dimensao, string> = {
  financeiro: "Financeiro",
  clientes: "Clientes & Retenção",
  comercial: "Comercial",
  operacao: "Operação",
  qualidade: "Qualidade",
};

export interface ResultadoDimensao {
  dimensao: Dimensao;
  nome: string;
  peso: number;
  /** null quando NENHUM indicador da dimensão tem dado. */
  score: number | null;
  situacao: Situacao;
  indicadores: Avaliacao[];
  /** Quantos dos indicadores da dimensão tinham dado. */
  medidos: number;
  total: number;
}

export interface LoneScore {
  score: number | null;
  situacao: Situacao;
  dimensoes: ResultadoDimensao[];
  /** % do peso total que foi realmente medido. Abaixo de 90 (uma dimensão inteira faltando) o
   *  número já merece ressalva: não dá para ler como retrato completo da empresa. */
  cobertura: number;
  /** Dimensões abaixo de 50 — o que precisa de atenção antes de olhar o resto. */
  criticas: Dimensao[];
  /** True quando o teto foi aplicado por causa de uma dimensão crítica. */
  limitadoPorCritica: boolean;
  /** True quando menos de 90% do peso foi medido — o score não retrata a empresa inteira. */
  parcial: boolean;
}

function situacaoDeScore(s: number | null): Situacao {
  if (s === null) return "sem_dado";
  if (s >= 90) return "otimo";
  if (s >= 75) return "no_alvo";
  if (s >= 60) return "atencao";
  return "critico";
}

/**
 * Calcula o score de uma dimensão pela média dos indicadores QUE TÊM DADO.
 *
 * Cada indicador entra pelo seu atingimento, limitado a 100: um ROAS 3x acima da meta não pode
 * compensar um SLA quebrado. Superar meta é bom, mas não compra crédito para o que está ruim.
 */
export function scoreDimensao(dimensao: Dimensao, indicadores: Indicador[]): ResultadoDimensao {
  const avaliados = indicadores.map(avaliar);
  const comDado = avaliados.filter((a) => a.score !== null);
  const score = comDado.length
    ? Math.round(comDado.reduce((s, a) => s + Math.min(100, a.score as number), 0) / comDado.length)
    : null;
  return {
    dimensao, nome: NOME_DIMENSAO[dimensao], peso: PESOS[dimensao],
    score, situacao: situacaoDeScore(score), indicadores: avaliados,
    medidos: comDado.length, total: avaliados.length,
  };
}

/** O teto que uma dimensão crítica impõe ao score geral. */
const TETO_COM_CRITICA = 69;

export function loneScore(dims: ResultadoDimensao[]): LoneScore {
  const comDado = dims.filter((d) => d.score !== null);
  const pesoMedido = comDado.reduce((s, d) => s + d.peso, 0);
  const pesoTotal = dims.reduce((s, d) => s + d.peso, 0) || 1;

  if (!comDado.length) {
    return { score: null, situacao: "sem_dado", dimensoes: dims, cobertura: 0, criticas: [], limitadoPorCritica: false, parcial: true };
  }

  // Redistribui: o peso das dimensões sem dado não vira zero, some da conta.
  const bruto = Math.round(
    comDado.reduce((s, d) => s + (d.score as number) * d.peso, 0) / pesoMedido,
  );

  const criticas = comDado.filter((d) => (d.score as number) < 50).map((d) => d.dimensao);
  // COBERTURA BAIXA NÃO PODE VIRAR NOTA ALTA. No primeiro teste real o score deu 97 "ótimo" com
  // 70% do peso medido — e os 30% que faltavam eram o Financeiro inteiro. Um número que ignora a
  // dimensão mais pesada não é ótimo, é parcial, e apresentá-lo em verde é pior que não mostrar.
  const parcial = pesoMedido / pesoTotal < 0.9;
  // Uma dimensão em colapso não pode ficar escondida atrás de uma média boa. O teto força o
  // número a admitir o problema, e a lista `criticas` diz qual é.
  const limitado = criticas.length > 0 && bruto > TETO_COM_CRITICA;
  const score = limitado ? TETO_COM_CRITICA : bruto;

  // Com cobertura incompleta a situação cai um degrau: "ótimo" exige ter olhado o quadro todo.
  const bruta = situacaoDeScore(score);
  const situacao: Situacao = parcial && bruta === "otimo" ? "no_alvo" : bruta;

  return {
    score,
    situacao,
    parcial,
    dimensoes: dims,
    cobertura: Math.round((pesoMedido / pesoTotal) * 100),
    criticas,
    limitadoPorCritica: limitado,
  };
}

/** Frase que explica o número — o score sozinho não diz o que fazer. */
export function leituraLoneScore(r: LoneScore): string {
  if (r.score === null) return "Sem dado suficiente para calcular o score da empresa.";
  const partes: string[] = [];
  if (r.limitadoPorCritica) {
    const nomes = r.criticas.map((d) => NOME_DIMENSAO[d]).join(" e ");
    partes.push(`limitado a ${r.score} porque ${nomes} ${r.criticas.length > 1 ? "estão" : "está"} abaixo de 50`);
  }
  if (r.cobertura < 90) {
    partes.push(`só ${r.cobertura}% do peso foi medido — o número é parcial`);
  }
  const pior = [...r.dimensoes].filter((d) => d.score !== null)
    .sort((a, b) => (a.score as number) - (b.score as number))[0];
  if (pior && !r.limitadoPorCritica) partes.push(`o ponto mais fraco é ${pior.nome} (${pior.score})`);
  return partes.length ? partes.join("; ") : "todas as dimensões medidas estão na meta ou acima.";
}
