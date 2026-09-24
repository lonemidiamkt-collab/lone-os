// lib/inicio/feed.ts — de regras para o feed de UMA pessoa: deduplica, filtra por papel e por
// dono, ordena e tira o que é interno. PURO.

import { GESTAO } from "@/lib/api/require-role";
import type { ItemAtencao, ItemInterno, Problema, Severidade, Viewer, RespostaInicio } from "./tipos";
import { type Dados, montarContexto, mesmaPessoa } from "./dados";
import { gerarItens } from "./regras";
import { montarResumo } from "./resumos";

const ORDEM: Record<Severidade, number> = { critical: 0, warning: 1, info: 2 };

/**
 * UM item por (cliente, problema). Se duas regras (ou duas contas do mesmo cliente) disserem a
 * mesma coisa, fica o mais grave — e quem é dono de qualquer um dos dois continua vendo.
 */
export function deduplicar(itens: ItemInterno[]): ItemInterno[] {
  const mapa = new Map<string, ItemInterno>();
  for (const i of itens) {
    const k = `${i.chave}|${i.problema}`;
    const atual = mapa.get(k);
    if (!atual) { mapa.set(k, i); continue; }
    const vence = ORDEM[i.severidade] < ORDEM[atual.severidade]
      || (ORDEM[i.severidade] === ORDEM[atual.severidade] && i.peso > atual.peso);
    const base = vence ? i : atual;
    mapa.set(k, {
      ...base,
      donos: [...new Set([...atual.donos, ...i.donos])],
      papeis: [...new Set([...atual.papeis, ...i.papeis])],
      doPapel: !!(atual.doPapel || i.doPapel),
    });
  }
  return [...mapa.values()];
}

/**
 * Quem vê o quê. Gestão vê tudo. Os demais veem o que é DELES: o papel precisa estar no item e o
 * nome precisa estar entre os donos — ou o item não tem dono e é do papel inteiro (`doPapel`).
 * Item sem dono e sem `doPapel` (cliente sem social atribuído, contrato, token) só a gestão vê.
 */
export function visivelPara(i: ItemInterno, v: Viewer): boolean {
  if (GESTAO.includes(v.papel)) return true;
  if (!i.papeis.includes(v.papel)) return false;
  if (i.donos.length === 0) return !!i.doPapel;
  return !!v.nome && i.donos.some((d) => mesmaPessoa(d, v.nome));
}

/** O que cada papel já vê em outro bloco do Início — não repete no feed. */
export const JA_NO_RESUMO: Partial<Record<Viewer["papel"], Problema[]>> = {
  designer: ["arte_atrasada", "alteracao"],
};

export function ordenar(itens: ItemInterno[]): ItemInterno[] {
  return [...itens].sort((a, b) =>
    ORDEM[a.severidade] - ORDEM[b.severidade] || b.peso - a.peso || a.sujeito.localeCompare(b.sujeito, "pt-BR"));
}

/** Só o que a tela precisa. Donos, papéis, peso e chave ficam no servidor. */
export function publico(i: ItemInterno): ItemAtencao {
  return {
    id: i.id, severidade: i.severidade, area: i.area, cliente: i.cliente, sujeito: i.sujeito,
    titulo: i.titulo, motivo: i.motivo, acao: { label: i.acao.label, href: i.acao.href },
  };
}

export function feedPara(itens: ItemInterno[], v: Viewer): ItemInterno[] {
  const fora = new Set(JA_NO_RESUMO[v.papel] ?? []);
  return ordenar(deduplicar(itens).filter((i) => visivelPara(i, v) && !fora.has(i.problema)));
}

/**
 * Tudo o que a rota devolve, a partir dos dados já lidos. `ocultar` tira itens antes de deduplicar —
 * é por onde entra o "visto" do Tráfego (lib/traffic/hoje/visto.ts): alerta visto no Hoje não repete
 * aqui por 24h, a menos que piore.
 */
export function montarInicio(
  d: Dados, v: Viewer, agora: Date, falhas: string[] = [], ocultar?: (i: ItemInterno) => boolean,
): RespostaInicio {
  const ctx = montarContexto(d, agora);
  const meus = feedPara(ocultar ? gerarItens(d, ctx).filter((i) => !ocultar(i)) : gerarItens(d, ctx), v);
  return {
    papel: v.papel,
    nome: v.nome,
    geradoEm: agora.toISOString(),
    itens: meus.map(publico),
    resumo: montarResumo(d, ctx, v, meus),
    falhas,
  };
}
