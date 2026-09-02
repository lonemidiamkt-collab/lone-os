// PERFORMANCE SCORE POR FUNÇÃO.
//
// PRA QUE (Roberto, 02/09, sobre "Produção dos Colaboradores"): "o score hoje não mede realmente
// o colaborador. No Social, aparentemente Score = saúde média da carteira. Isso é perigoso. Um
// cliente pode estar insatisfeito porque o tráfego está ruim, demora para gravar, comercial não
// atende, cliente não aprova, agência errou, produto do cliente está ruim. E o social media
// recebe nota 67."
//
// Ele tem razão e o problema é de responsabilidade: a nota tem que medir o que a PESSOA controla.
// A saúde da carteira continua no score do social — é responsabilidade dela cuidar do cliente —
// mas com peso de 15%, não como o score inteiro.
//
// A segunda diferença importante: "Rodrigo produz muito, mas tem retrabalho alto" tem que ser
// distinguível de "Rodrigo produz pouco". Por isso volume e qualidade entram separados, e o
// resultado mostra o GARGALO — o indicador que mais puxou a nota para baixo.

import { avaliar, type Avaliacao, type Indicador, type Situacao } from "./indicador";

export type Funcao = "designer" | "social" | "traffic";

export interface PesoIndicador {
  chave: string;
  peso: number;   // soma 100 dentro da função
}

/**
 * Os pesos, exatamente como o Roberto especificou.
 *
 * DESIGNER: entregas no prazo 30 · tempo médio 20 · aprovação de primeira 20 · retrabalho 15 ·
 *   volume/capacidade 10 · erros 5.
 * SOCIAL: entregas no prazo 30 · produção 20 · aprovação 15 · qualidade da carteira 15 ·
 *   SLA 10 · organização 10.
 * TRÁFEGO: saúde das contas 25 · contas na meta 20 · execução de orçamento 15 · testes 15 ·
 *   SLA operacional 10 · tracking/erros 10 · organização 5.
 */
export const PESOS_FUNCAO: Record<Funcao, PesoIndicador[]> = {
  designer: [
    { chave: "entregas_no_prazo", peso: 30 },
    { chave: "tempo_medio", peso: 20 },
    { chave: "aprovacao_primeira", peso: 20 },
    { chave: "retrabalho", peso: 15 },
    { chave: "capacidade", peso: 10 },
    { chave: "erros", peso: 5 },
  ],
  social: [
    { chave: "entregas_no_prazo", peso: 30 },
    { chave: "producao", peso: 20 },
    { chave: "aprovacao", peso: 15 },
    { chave: "saude_carteira", peso: 15 },
    { chave: "sla", peso: 10 },
    { chave: "organizacao", peso: 10 },
  ],
  traffic: [
    { chave: "saude_contas", peso: 25 },
    { chave: "contas_na_meta", peso: 20 },
    { chave: "execucao_orcamento", peso: 15 },
    { chave: "testes", peso: 15 },
    { chave: "sla", peso: 10 },
    { chave: "tracking", peso: 10 },
    { chave: "organizacao", peso: 5 },
  ],
};

export interface ResultadoPessoa {
  pessoa: string;
  funcao: Funcao;
  /** null quando nada pôde ser medido — melhor lacuna visível que nota inventada. */
  score: number | null;
  situacao: Situacao;
  indicadores: Avaliacao[];
  /** O indicador que mais puxou a nota para baixo, com o peso considerado. */
  gargalo: { titulo: string; leitura: string } | null;
  /** % do peso da função que tinha dado. Nota com cobertura baixa não deve ser cobrada de ninguém. */
  cobertura: number;
  /** Clientes sob responsabilidade — contexto obrigatório: 18 clientes pequenos ≠ 18 grandes. */
  carteira?: number;
  /** 0..1 — quanto da capacidade planejada está em uso. */
  utilizacao?: number | null;
}

function situacaoDeScore(s: number | null): Situacao {
  if (s === null) return "sem_dado";
  if (s >= 90) return "otimo";
  if (s >= 75) return "no_alvo";
  if (s >= 60) return "atencao";
  return "critico";
}

/**
 * Calcula o score de uma pessoa.
 *
 * Indicador sem dado sai do cálculo e o peso se redistribui — mesma regra do Lone Score, pelo
 * mesmo motivo: "tempo médio 0,0 d" do Rodrigo era ausência de dado sendo exibida como
 * desempenho perfeito, e qualquer nota construída em cima disso é ficção.
 */
export function scorePessoa(p: {
  pessoa: string; funcao: Funcao; indicadores: Indicador[];
  carteira?: number; utilizacao?: number | null;
}): ResultadoPessoa {
  const pesos = new Map(PESOS_FUNCAO[p.funcao].map((x) => [x.chave, x.peso]));
  const avaliados = p.indicadores.map(avaliar);

  const comDado = avaliados.filter((a) => a.score !== null && pesos.has(a.chave));
  const pesoMedido = comDado.reduce((s, a) => s + (pesos.get(a.chave) ?? 0), 0);
  const pesoTotal = [...pesos.values()].reduce((s, v) => s + v, 0) || 1;

  const score = pesoMedido > 0
    ? Math.round(comDado.reduce((s, a) => s + Math.min(100, a.score as number) * (pesos.get(a.chave) ?? 0), 0) / pesoMedido)
    : null;

  // Gargalo = o que mais custou pontos, considerando o peso. Um indicador ruim de peso 5 não é o
  // problema principal de ninguém; um de peso 30 é.
  const gargalo = comDado
    .map((a) => ({ a, perda: (100 - Math.min(100, a.score as number)) * (pesos.get(a.chave) ?? 0) }))
    .filter((x) => x.perda > 0)
    .sort((x, y) => y.perda - x.perda)[0];

  return {
    pessoa: p.pessoa, funcao: p.funcao, score, situacao: situacaoDeScore(score),
    indicadores: avaliados,
    gargalo: gargalo ? { titulo: gargalo.a.titulo, leitura: gargalo.a.leitura } : null,
    cobertura: Math.round((pesoMedido / pesoTotal) * 100),
    carteira: p.carteira,
    utilizacao: p.utilizacao ?? null,
  };
}

// ── CAPACIDADE ────────────────────────────────────────────────────────────
//
// Roberto: "Capacidade planejada 50, atual 47, utilização 94% 🔴 … o Lone OS poderia avisar:
// Social atingirá capacidade máxima com +3 clientes. Isso te ajuda a contratar antes da operação
// quebrar."

export interface Capacidade {
  funcao: Funcao;
  planejada: number;      // quantos clientes a equipe suporta
  atual: number;
  utilizacao: number;     // 0..1
  vagasRestantes: number;
  situacao: Situacao;
  aviso: string | null;
}

/** Quantos clientes cada função suporta por pessoa. Ajustável em agency_settings. */
export const CAPACIDADE_PADRAO: Record<Funcao, number> = {
  designer: 30,
  social: 25,
  traffic: 30,
};

export function capacidade(funcao: Funcao, atual: number, pessoas: number, porPessoa?: number): Capacidade {
  const planejada = Math.max(1, pessoas) * (porPessoa ?? CAPACIDADE_PADRAO[funcao]);
  const utilizacao = planejada > 0 ? atual / planejada : 0;
  const vagas = planejada - atual;
  const situacao: Situacao = utilizacao >= 1 ? "critico" : utilizacao >= 0.9 ? "atencao" : utilizacao >= 0.5 ? "no_alvo" : "otimo";
  const aviso = utilizacao >= 1
    ? `${funcao} está ACIMA da capacidade: ${atual} clientes para ${planejada} planejados.`
    : utilizacao >= 0.9
      ? `${funcao} atinge a capacidade máxima com +${vagas} cliente${vagas === 1 ? "" : "s"}.`
      : null;
  return { funcao, planejada, atual, utilizacao, vagasRestantes: vagas, situacao, aviso };
}
