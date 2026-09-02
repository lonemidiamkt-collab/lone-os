// CLIENT HEALTH SCORE — com os componentes visíveis, não só a nota.
//
// PRA QUE (Roberto, 02/09): "hoje você tem Saúde média: 68. Eu quero saber POR QUÊ."
//
// A tabela `client_health_scores` já tinha uma coluna `breakdown` — e ela estava gravando `{}` em
// todas as 4.732 linhas. O número existia sem a explicação, então ninguém conseguia agir sobre
// ele: 68 não diz se o problema é entrega, relacionamento ou resultado.
//
// Pesos definidos por ele:
//   Resultado/Performance 30 · Entrega/SLA 15 · Relacionamento 15 · Sentimento 15 ·
//   Pendências 10 · Engajamento do cliente 10 · Financeiro 5
//
// E o mais importante do pedido: "média esconde problema. 40 clientes com 80 e 3 com 20 dá uma
// média que não parece catastrófica, mas você está com 3 churns potenciais." Por isso
// `distribuicao()` existe — e a Home deve mostrar a distribuição, não a média.

import type { Situacao } from "./indicador";

export type ComponenteSaude =
  | "resultado" | "entrega" | "relacionamento" | "sentimento"
  | "pendencias" | "engajamento" | "financeiro";

export const PESOS_SAUDE: Record<ComponenteSaude, number> = {
  resultado: 30,
  entrega: 15,
  relacionamento: 15,
  sentimento: 15,
  pendencias: 10,
  engajamento: 10,
  financeiro: 5,
};

export const NOME_COMPONENTE: Record<ComponenteSaude, string> = {
  resultado: "Resultado",
  entrega: "Entregas e SLA",
  relacionamento: "Relacionamento",
  sentimento: "Sentimento",
  pendencias: "Pendências",
  engajamento: "Engajamento do cliente",
  financeiro: "Financeiro",
};

/** Cada componente vale 0..100, ou null quando não há como medir. */
export type Componentes = Partial<Record<ComponenteSaude, number | null>>;

export interface SaudeCliente {
  clientId: string;
  cliente: string;
  score: number | null;
  nivel: "saudavel" | "atencao" | "risco" | "sem_dado";
  componentes: { chave: ComponenteSaude; nome: string; valor: number | null; peso: number }[];
  /** Os componentes que mais custaram pontos — é o "por quê" que faltava. */
  motivos: string[];
  cobertura: number;
}

function nivelDe(score: number | null): SaudeCliente["nivel"] {
  if (score === null) return "sem_dado";
  if (score >= 75) return "saudavel";
  if (score >= 60) return "atencao";
  return "risco";
}
// Risco abaixo de 60, calibrado pelo exemplo do Roberto ("Cliente X — 54 🔴"). Um cliente com
// resultado 40 e sentimento 45 não é "atenção": é conversa esta semana.

export function calcularSaude(p: {
  clientId: string; cliente: string; componentes: Componentes;
  /** Fatos observados que explicam a nota, em linguagem humana. */
  observacoes?: string[];
}): SaudeCliente {
  const chaves = Object.keys(PESOS_SAUDE) as ComponenteSaude[];
  const linhas = chaves.map((k) => ({
    chave: k, nome: NOME_COMPONENTE[k],
    valor: p.componentes[k] ?? null, peso: PESOS_SAUDE[k],
  }));

  const comDado = linhas.filter((l) => l.valor !== null && Number.isFinite(l.valor as number));
  const pesoMedido = comDado.reduce((s, l) => s + l.peso, 0);
  const pesoTotal = chaves.reduce((s, k) => s + PESOS_SAUDE[k], 0);

  // Sem nada medido, `null` — nunca 0. Um cliente sem dado não é um cliente em risco; é um
  // cliente que a gente não está olhando, e a diferença muda o que se faz a respeito.
  const score = pesoMedido > 0
    ? Math.round(comDado.reduce((s, l) => s + (l.valor as number) * l.peso, 0) / pesoMedido)
    : null;

  // O "por quê": componentes abaixo de 60, do mais pesado para o mais leve.
  const fracos = comDado
    .filter((l) => (l.valor as number) < 60)
    .sort((a, b) => b.peso * (100 - (b.valor as number)) - a.peso * (100 - (a.valor as number)))
    .map((l) => `${l.nome} em ${l.valor}`);

  return {
    clientId: p.clientId, cliente: p.cliente, score, nivel: nivelDe(score),
    componentes: linhas,
    motivos: [...(p.observacoes ?? []), ...fracos].slice(0, 5),
    cobertura: Math.round((pesoMedido / pesoTotal) * 100),
  };
}

export interface Distribuicao {
  total: number;
  saudaveis: number;
  atencao: number;
  risco: number;
  semDado: number;
  media: number | null;
  /** Os em risco, nomeados. A média esconde; a lista não. */
  emRisco: { cliente: string; score: number | null; motivos: string[] }[];
}

/**
 * A distribuição, que é o que deve aparecer na Home.
 *
 * Roberto: "40 clientes com 80 pontos e 3 clientes com 20 pontos — a média não parece
 * catastrófica, mas você está com 3 churns potenciais."
 */
export function distribuicao(clientes: SaudeCliente[]): Distribuicao {
  const comScore = clientes.filter((c) => c.score !== null);
  return {
    total: clientes.length,
    saudaveis: clientes.filter((c) => c.nivel === "saudavel").length,
    atencao: clientes.filter((c) => c.nivel === "atencao").length,
    risco: clientes.filter((c) => c.nivel === "risco").length,
    semDado: clientes.filter((c) => c.nivel === "sem_dado").length,
    media: comScore.length
      ? Math.round(comScore.reduce((s, c) => s + (c.score as number), 0) / comScore.length)
      : null,
    emRisco: clientes.filter((c) => c.nivel === "risco")
      .sort((a, b) => (a.score ?? 0) - (b.score ?? 0))
      .map((c) => ({ cliente: c.cliente, score: c.score, motivos: c.motivos })),
  };
}

export function situacaoDaDistribuicao(d: Distribuicao): Situacao {
  if (!d.total) return "sem_dado";
  const pctRisco = d.risco / d.total;
  if (pctRisco >= 0.15) return "critico";
  if (pctRisco > 0 || d.atencao / d.total >= 0.3) return "atencao";
  return d.saudaveis / d.total >= 0.8 ? "otimo" : "no_alvo";
}
