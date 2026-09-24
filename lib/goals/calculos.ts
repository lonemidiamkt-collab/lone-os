// lib/goals/calculos.ts — as contas de cada meta sobre as linhas do banco. PURO (testado em
// tests/metas-calculos.test.ts). Quem lê o banco é lib/goals/calcular-server.ts.
//
// Regra: sem fonte, `valor: null` com o porquê em `semFonte`. Zero só quando zero foi medido.

import { spDateStr } from "@/lib/utils";
import { limitesDoMes } from "./catalogo";

export interface ValorMeta {
  valor: number | null;
  /** Por que não há número (a tela mostra no lugar do zero). */
  semFonte?: string;
  /** Base da conta, em poucas palavras ("12 de 40 clientes"). */
  detalhe?: string;
}

export const semFonte = (motivo: string): ValorMeta => ({ valor: null, semFonte: motivo });
const arred = (v: number, casas = 1) => Math.round(v * 10 ** casas) / 10 ** casas;
const pct = (parte: number, total: number, casas = 1) => arred((parte / total) * 100, casas);

// ─── Clientes: entrada, saída, ativos ───────────────────────────────────────

export interface ClienteMetas {
  id: string;
  /** join_date, ou a criação do cadastro. YYYY-MM-DD. */
  entrada: string | null;
  /** churned_at (dia em São Paulo). */
  saida: string | null;
  /** active = false sem data de saída: saiu, mas não se sabe quando — fica fora de todo mês. */
  desativadoSemData: boolean;
  rascunho: boolean;
  temSocial: boolean;
  temInstagram: boolean;
  /** Posts contratados por mês (clients.posts_goal); null = padrão da casa. */
  postsContratados: number | null;
}

/** Ativo num dia: entrou até ele e não tinha saído. */
export function ativoEm(c: ClienteMetas, dia: string): boolean {
  if (c.rascunho || c.desativadoSemData || !c.entrada) return false;
  return c.entrada <= dia && (!c.saida || c.saida > dia);
}

/** Ativo do primeiro ao último dia do mês (base das metas "o mês todo"). */
export function ativoNoMesTodo(c: ClienteMetas, mes: string): boolean {
  const { inicio, fim } = limitesDoMes(mes);
  return ativoEm(c, inicio) && ativoEm(c, fim);
}

export function clientesAtivos(clientes: readonly ClienteMetas[], mes: string): ValorMeta {
  const { fim } = limitesDoMes(mes);
  const n = clientes.filter((c) => ativoEm(c, fim)).length;
  return { valor: n, detalhe: `no dia ${fim.slice(8, 10)}/${fim.slice(5, 7)}` };
}

export function novosClientes(clientes: readonly ClienteMetas[], mes: string): ValorMeta {
  const { inicio, fim } = limitesDoMes(mes);
  const n = clientes.filter((c) => !c.rascunho && c.entrada && c.entrada >= inicio && c.entrada <= fim).length;
  return { valor: n };
}

export function churnDoMes(clientes: readonly ClienteMetas[], mes: string): ValorMeta {
  const { inicio, fim } = limitesDoMes(mes);
  // Base: quem estava ativo no primeiro dia do mês.
  const base = clientes.filter((c) => ativoEm(c, inicio));
  if (!base.length) return semFonte("nenhum cliente ativo no começo do mês");
  const saidas = base.filter((c) => c.saida && c.saida >= inicio && c.saida <= fim).length;
  return { valor: pct(saidas, base.length), detalhe: `${saidas} de ${base.length} clientes` };
}

// ─── NPS ───────────────────────────────────────────────────────────────────

/** NPS = % de notas 9–10 − % de notas 0–6. Uma nota por pesquisa respondida. */
export function npsDasNotas(notas: readonly number[]): ValorMeta {
  const validas = notas.filter((n) => Number.isFinite(n) && n >= 0 && n <= 10);
  if (!validas.length) return semFonte("nenhuma nota de NPS respondida no mês");
  const promotores = validas.filter((n) => n >= 9).length;
  const detratores = validas.filter((n) => n <= 6).length;
  return {
    valor: Math.round(((promotores - detratores) / validas.length) * 100),
    detalhe: `${validas.length} ${validas.length === 1 ? "resposta" : "respostas"}`,
  };
}

// ─── Saúde ─────────────────────────────────────────────────────────────────

/** Níveis da escala NOVA (100 = saudável). Linhas da escala antiga (safe/attention/high/critical,
 *  100 = risco) não entram: misturar as duas foi o que já fez a saúde média mentir. */
const NIVEIS_NOVOS = new Set(["saudavel", "atencao", "risco"]);

export interface LinhaSaude { client_id: string; level: string | null; computed_for_date: string }

export function riscoDoMes(linhas: readonly LinhaSaude[], mes: string): ValorMeta {
  const { inicio, fim } = limitesDoMes(mes);
  const ultima = new Map<string, LinhaSaude>();
  for (const l of linhas) {
    if (!l.level || !NIVEIS_NOVOS.has(l.level)) continue;
    const d = l.computed_for_date.slice(0, 10);
    if (d < inicio || d > fim) continue;
    const atual = ultima.get(l.client_id);
    if (!atual || d > atual.computed_for_date.slice(0, 10)) ultima.set(l.client_id, l);
  }
  if (!ultima.size) return semFonte("nenhuma nota de saúde (escala atual) gravada no mês");
  const risco = [...ultima.values()].filter((l) => l.level === "risco").length;
  return { valor: pct(risco, ultima.size, 0), detalhe: `${risco} de ${ultima.size} clientes` };
}

// ─── Tráfego ───────────────────────────────────────────────────────────────

export function trafegoDoMes(t: { conversas: number | null; investido: number | null; contas: number | null } | null): { conversas: ValorMeta; custo: ValorMeta } {
  if (!t || t.conversas == null || !t.contas) {
    const motivo = !t ? "leitura do tráfego indisponível" : "nenhuma conta com leitura da Meta no mês";
    return { conversas: semFonte(motivo), custo: semFonte(motivo) };
  }
  const detalhe = `${t.contas} ${t.contas === 1 ? "conta" : "contas"}`;
  return {
    conversas: { valor: t.conversas, detalhe },
    custo: t.conversas > 0 && t.investido != null
      ? { valor: arred(t.investido / t.conversas, 2), detalhe: `${t.conversas.toLocaleString("pt-BR")} conversas` }
      : semFonte("nenhuma conversa no mês para dividir o investido"),
  };
}

// ─── Social ────────────────────────────────────────────────────────────────

/** Contratado por mês quando o cliente não tem meta própria: seg/qua/sex = 12. */
export const POSTS_CONTRATADOS_PADRAO = 12;

/**
 * Entrega do contratado: por cliente com social e Instagram vinculado, ativo o mês todo, soma
 * min(posts, contratado) ÷ soma do contratado. O teto por cliente impede que o excesso de um
 * esconda a falta do outro.
 */
export function entregaContratada(clientes: readonly ClienteMetas[], postsPorCliente: ReadonlyMap<string, number>, mes: string): ValorMeta {
  const base = clientes.filter((c) => c.temSocial && c.temInstagram && ativoNoMesTodo(c, mes));
  if (!base.length) return semFonte("nenhum cliente de social com Instagram vinculado o mês todo");
  let contratado = 0, entregue = 0;
  for (const c of base) {
    const alvo = c.postsContratados && c.postsContratados > 0 ? c.postsContratados : POSTS_CONTRATADOS_PADRAO;
    contratado += alvo;
    entregue += Math.min(postsPorCliente.get(c.id) ?? 0, alvo);
  }
  return { valor: pct(entregue, contratado, 0), detalhe: `${entregue} de ${contratado} posts · ${base.length} clientes` };
}

export function postsNoPrazo(noPrazo: number, atrasados: number): ValorMeta {
  const base = noPrazo + atrasados;
  if (!base) return semFonte("nenhum post do mês casou com card planejado");
  return { valor: pct(noPrazo, base, 0), detalhe: `${noPrazo} de ${base} posts planejados` };
}

export interface LinhaReuniao { client_id: string; estado: string; realizada_em: string | null; mes_referencia: string | null }

export function reunioesDoMes(clientes: readonly ClienteMetas[], reunioes: readonly LinhaReuniao[], mes: string): ValorMeta {
  const { inicio, fim } = limitesDoMes(mes);
  const base = clientes.filter((c) => ativoNoMesTodo(c, mes));
  // O ciclo mensal de reuniões começou em set/2026. Mês sem nenhum registro do ciclo não é "0%".
  const temCiclo = reunioes.some((r) => r.mes_referencia === mes || (r.realizada_em && spDateStr(r.realizada_em).slice(0, 7) === mes));
  if (!temCiclo) return semFonte("o ciclo de reuniões mensais não tem registro neste mês");
  if (!base.length) return semFonte("nenhum cliente ativo o mês todo");
  const ids = new Set(base.map((c) => c.id));
  const comReuniao = new Set(reunioes
    .filter((r) => r.estado === "realizada" && r.realizada_em && ids.has(r.client_id))
    .filter((r) => { const d = spDateStr(r.realizada_em!); return d >= inicio && d <= fim; })
    .map((r) => r.client_id));
  return { valor: pct(comReuniao.size, base.length, 0), detalhe: `${comReuniao.size} de ${base.length} clientes` };
}

// ─── Design ────────────────────────────────────────────────────────────────

export interface LinhaEntrega { card_id: string; version: number; delivered_at: string }

/** Entregas do mês, % no prazo (1ª versão até a data de postagem) e % de retrabalho (versão ≥ 2). */
export function designDoMes(entregas: readonly LinhaEntrega[], prazoDoCard: ReadonlyMap<string, string | null>, mes: string): { entregues: ValorMeta; noPrazo: ValorMeta; retrabalho: ValorMeta } {
  const { inicio, fim } = limitesDoMes(mes);
  const doMes = entregas.filter((e) => { const d = spDateStr(e.delivered_at); return d >= inicio && d <= fim; });
  const primeiras = doMes.filter((e) => e.version === 1);
  const comPrazo = primeiras.filter((e) => !!prazoDoCard.get(e.card_id));
  const noPrazo = comPrazo.filter((e) => spDateStr(e.delivered_at) <= (prazoDoCard.get(e.card_id) as string).slice(0, 10)).length;
  const refeitas = doMes.filter((e) => e.version >= 2).length;
  return {
    entregues: { valor: doMes.length, detalhe: `${primeiras.length} artes novas · ${refeitas} ajustes` },
    noPrazo: comPrazo.length
      ? { valor: pct(noPrazo, comPrazo.length, 0), detalhe: `${noPrazo} de ${comPrazo.length} artes com data de postagem` }
      : semFonte("nenhuma arte nova com data de postagem entregue no mês"),
    retrabalho: doMes.length
      ? { valor: pct(refeitas, doMes.length, 0), detalhe: `${refeitas} de ${doMes.length} entregas` }
      : semFonte("nenhuma entrega registrada no mês"),
  };
}
