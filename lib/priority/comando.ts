// lib/priority/comando.ts — "Lone, o que preciso fazer hoje?" no WhatsApp. Nível A (leitura), mas
// pessoal: precisa saber QUEM pergunta (lib/cs/autoridade) para devolver a lista dela.

import type { Recomendacao } from "./tipos";

const CHAMA = /\b(lone|loninho)\b/i;
const PEDE = /\b(o que|oque|q)\s+(eu\s+)?(preciso|tenho|devo)\s+(pra\s+|para\s+|que\s+)?(fazer|resolver|ver)\b|\b(minhas?|meus?)\s+(prioridades?|pend[êe]ncias?|tarefas?)\s*(de\s+)?(hoje)?\b|\bpor onde (eu )?come[çc]o\b|\bo que t[áa] (mais )?urgente\b|\bprioridades? (de|pra|para) hoje\b/i;

export function ehPedidoPrioridades(texto: string): boolean {
  const t = (texto ?? "").trim();
  return CHAMA.test(t) && PEDE.test(t);
}

const dinheiro = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).replace(/\u00a0/g, " ");

/** Top N em texto de WhatsApp: FATO e O QUE FAZER separados, como o plano exige. */
export function formatarTop(recs: Pick<Recomendacao, "cliente" | "fato" | "recomendacao" | "exposicaoRs" | "fonte">[], nome: string, escopo: "suas" | "da equipe" = "suas"): string {
  const primeiro = nome.split(" ")[0];
  if (!recs.length) return `${primeiro}, nada aberto ${escopo === "suas" ? "no seu nome" : "na equipe"} agora. 🙌 Se algo surgir, eu aviso.`;
  const linhas = recs.map((r, i) => {
    const rs = r.exposicaoRs ? ` (${dinheiro(r.exposicaoRs)}/dia)` : "";
    return `*${i + 1}. ${r.cliente}*${rs}\n   Fato: ${r.fato[0]}\n   Faça: ${r.recomendacao}`;
  });
  return `${primeiro}, ${escopo === "suas" ? "suas" : "as"} ${recs.length === 1 ? "prioridade" : "prioridades"} ${escopo === "da equipe" ? "da equipe " : ""}agora:\n\n${linhas.join("\n\n")}\n\n_Detalhes e decisão em /agente._`;
}
