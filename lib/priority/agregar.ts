// lib/priority/agregar.ts — UMA recomendação por problema, não uma por linha.
//
// Primeiro feed real (14/09): Império com 10 posts atrasados virou 10 itens no topo; 44 "pronta sem
// postar"; 33 sugestões sem decisão. Quem lê não precisa de dez cartões dizendo a mesma coisa —
// precisa de um: "Império: 10 posts atrasados (11–26 dias)", com a lista dentro. A mesma coisa
// (fingerprint) passa a ser o cliente+motivo, então a recomendação continua a mesma enquanto o
// problema durar, mesmo que os cards mudem.

import type { ItemBruto } from "./tipos";

/** Motivos em que vários itens do mesmo cliente são o MESMO problema. */
const POR_CLIENTE = new Set(["card_atrasado", "pronta_sem_postar", "sugestao_sem_decisao"]);
/** Motivos em que vários itens da mesma PESSOA são o mesmo problema (tarefa não tem cliente fixo). */
const POR_PESSOA = new Set(["tarefa_atrasada"]);

const plural = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`;

function juntar(grupo: ItemBruto[], chaveTexto: string, porPessoa: boolean): ItemBruto {
  const base = grupo[0];
  const n = grupo.length;
  const dias = grupo.map((g) => /há (\d+) dia/.exec(g.titulo)?.[1]).filter(Boolean).map(Number);
  const faixa = dias.length ? (Math.min(...dias) === Math.max(...dias) ? `${dias[0]} dias` : `${Math.min(...dias)}–${Math.max(...dias)} dias`) : "";
  const itens = grupo.map((g) => g.entityRef ?? g.titulo).slice(0, 6);
  const resto = n - itens.length;
  const rotulo: Record<string, [string, string]> = {
    card_atrasado: ["post atrasado", "posts atrasados"],
    pronta_sem_postar: ["arte pronta sem postar", "artes prontas sem postar"],
    sugestao_sem_decisao: ["pedido esperando ok/não", "pedidos esperando ok/não"],
    tarefa_atrasada: ["tarefa vencida", "tarefas vencidas"],
  };
  const [s, p] = rotulo[base.motivo] ?? ["item", "itens"];
  const titulo = `${chaveTexto}: ${plural(n, s, p)}${faixa ? ` (${faixa})` : ""}`;
  const fato = [`${plural(n, s, p)}${faixa ? `, ${faixa === `${dias[0]} dias` ? "há " + faixa : "entre " + faixa}` : ""}: ${itens.map((i) => `"${String(i).slice(0, 50)}"`).join(", ")}${resto > 0 ? ` e mais ${resto}` : ""}`];
  const maxSev = Math.max(...grupo.map((g) => g.severidade));
  return {
    ...base,
    // Por pessoa: a "coisa" é a pessoa (fingerprint precisa distinguir o Carlos do Thiago) e não há
    // cliente único. Por cliente: a coisa é o cliente+motivo.
    clientId: porPessoa ? null : base.clientId,
    cliente: porPessoa ? "Equipe" : base.cliente,
    entityRef: porPessoa ? `pessoa:${base.owner ?? base.ownerRole}` : null,
    titulo,
    fato,
    // Mais itens = problema maior, mas com teto: dez cards atrasados não são cinco vezes piores que dois.
    severidade: Math.min(100, maxSev + Math.min(15, 3 * (n - 1))),
    urgencia: Math.max(...grupo.map((g) => g.urgencia)),
    confianca: Math.min(...grupo.map((g) => g.confianca)),
    exposicaoRs: grupo.some((g) => g.exposicaoRs) ? grupo.reduce((a, g) => a + (g.exposicaoRs ?? 0), 0) : null,
    reversivel: grupo.every((g) => g.reversivel),
    acaoProposta: { ...(base.acaoProposta ?? {}), tipo: base.fonte === "tarefa" ? "abrir_tarefa" : "abrir_board", itens: n },
  };
}

export function agregar(itens: ItemBruto[]): ItemBruto[] {
  const grupos = new Map<string, ItemBruto[]>();
  const soltos: ItemBruto[] = [];
  for (const i of itens) {
    let chave: string | null = null;
    if (POR_CLIENTE.has(i.motivo)) chave = ["c", i.fonte, i.clientId ?? i.cliente, i.motivo, i.owner ?? i.ownerRole].join("|");
    else if (POR_PESSOA.has(i.motivo)) chave = ["p", i.fonte, i.motivo, i.owner ?? i.ownerRole].join("|");
    if (!chave) { soltos.push(i); continue; }
    (grupos.get(chave) ?? grupos.set(chave, []).get(chave)!).push(i);
  }
  const out: ItemBruto[] = [...soltos];
  for (const [chave, grupo] of grupos) {
    if (grupo.length === 1) { out.push(grupo[0]); continue; }
    const porPessoa = chave.startsWith("p|");
    out.push(juntar(grupo, porPessoa ? (grupo[0].owner ?? "Equipe") : grupo[0].cliente, porPessoa));
  }
  return out;
}
