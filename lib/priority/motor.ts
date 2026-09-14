// lib/priority/motor.ts — o RANKING é função pura. O LLM não decide ordem; explica.
//
// score = confiança × (severidade·0,35 + urgência·0,25 + exposição·0,20 + importância·0,10 + irreversibilidade·0,10)
// Cada fator em 0–100, explicado item a item (explicacaoScore) — quem olha o feed vê POR QUE aquilo
// está no topo, e um teste com dado real prova que a ordem é a esperada.
//
// Exposição em R$/dia vira 0–100 por escala logarítmica: R$ 10/dia ≈ 33, R$ 100 ≈ 67, R$ 1.000 ≈ 100.
// Linear deixaria uma conta grande engolir todas as outras, sempre.

import type { ItemBruto, ContextoRanking, Recomendacao, FonteRecomendacao } from "./tipos";

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

export function exposicaoNormalizada(rsDia: number | null | undefined): number {
  if (!rsDia || rsDia <= 0) return 0;
  return clamp(Math.round((Math.log10(rsDia) / 3) * 100));
}

export function fingerprintDe(i: Pick<ItemBruto, "fonte" | "clientId" | "entityRef" | "motivo">): string {
  return [i.fonte, i.clientId ?? "-", i.entityRef ?? "-", i.motivo].join("|");
}

export const PESOS = { severidade: 0.35, urgencia: 0.25, exposicao: 0.2, importancia: 0.1, irreversibilidade: 0.1 } as const;

export function pontuar(i: ItemBruto, ctx: ContextoRanking): { score: number; explicacao: Record<string, number> } {
  const importancia = clamp(ctx.importanciaCliente[i.clientId ?? ""] ?? 70, 50, 100);
  const exposicao = exposicaoNormalizada(i.exposicaoRs);
  const irreversibilidade = i.reversivel ? 0 : 100;
  const confianca = clamp(i.confianca, 0, 1);
  const bruto =
    clamp(i.severidade) * PESOS.severidade +
    clamp(i.urgencia) * PESOS.urgencia +
    exposicao * PESOS.exposicao +
    importancia * PESOS.importancia +
    irreversibilidade * PESOS.irreversibilidade;
  const score = Math.round(bruto * confianca * 10) / 10;
  return {
    score,
    explicacao: { severidade: clamp(i.severidade), urgencia: clamp(i.urgencia), exposicao, importancia, irreversibilidade, confianca: Math.round(confianca * 100) },
  };
}

/** Item sem evidência não vira recomendação — é a regra que impede o feed de virar ruído. */
export function valido(i: ItemBruto): boolean {
  return i.fato.length > 0 && i.fato.every((f) => f.trim().length > 0) && i.recomendacao.trim().length > 0 && i.titulo.trim().length > 0;
}

export function ranquear(itens: ItemBruto[], ctx: ContextoRanking): Recomendacao[] {
  const vistos = new Set<string>();
  const out: Recomendacao[] = [];
  for (const i of itens) {
    if (!valido(i)) continue;
    const fingerprint = fingerprintDe(i);
    if (vistos.has(fingerprint)) continue; // mesma coisa reportada duas vezes na mesma rodada
    vistos.add(fingerprint);
    const { score, explicacao } = pontuar(i, ctx);
    out.push({ ...i, fingerprint, score, explicacaoScore: explicacao });
  }
  return out.sort((a, b) => b.score - a.score || a.cliente.localeCompare(b.cliente));
}

/** Top N de UMA pessoa: o que é dela pelo nome, ou do papel dela quando ninguém foi nomeado. */
export function paraPessoa(recs: Recomendacao[], pessoa: { nome: string; papel: string }, n = 5): Recomendacao[] {
  const nome = pessoa.nome.trim().toLowerCase();
  const minhas = recs.filter((r) => {
    if (r.owner && r.owner.trim().toLowerCase() === nome) return true;
    if (!r.owner && r.ownerRole === pessoa.papel) return true;
    return false;
  });
  return minhas.slice(0, n);
}

/**
 * Reconcilia a rodada nova com o que está aberto no banco:
 *   fingerprint aberto E na rodada → atualizar (score, fato, urgência — o estado fica)
 *   fingerprint só na rodada        → inserir como "nova"
 *   fingerprint só aberto           → a fonte parou de reportar: "resolvida"
 */
export function reconciliar(abertas: { id: string; fingerprint: string }[], novas: Recomendacao[]) {
  const porFp = new Map(abertas.map((a) => [a.fingerprint, a.id]));
  const naRodada = new Set(novas.map((n) => n.fingerprint));
  return {
    inserir: novas.filter((n) => !porFp.has(n.fingerprint)),
    atualizar: novas.filter((n) => porFp.has(n.fingerprint)).map((n) => ({ id: porFp.get(n.fingerprint)!, rec: n })),
    resolver: abertas.filter((a) => !naRodada.has(a.fingerprint)).map((a) => a.id),
  };
}

export const ROTULO_FONTE: Record<FonteRecomendacao, string> = {
  trafego: "Tráfego", saude: "Saúde do cliente", producao: "Produção", cs: "Atendimento", tarefa: "Tarefa",
};
