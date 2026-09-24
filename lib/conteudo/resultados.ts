// lib/conteudo/resultados.ts — a aba "Resultados" do Social, contada no Instagram real.
//
// POR QUE EXISTE (Leva 5a). As abas "Métricas" e "Entregas Mensais" mediam as pessoas por dados
// que o sistema não registra: "publicados" era card arrastado para a coluna (24 na base inteira,
// contra ~451 posts reais), SLA por coluna dependia de um carimbo que quase ninguém gera e "meta de
// posts" lia um contador que ficou meses zerado. Aqui a conta começa no post que está no perfil:
//
//   posts ............ o que foi ao ar no mês (client_ig_posts)
//   no prazo ......... post que casou com um card e saiu no dia planejado (ou antes)
//   atrasado ......... post que casou com um card e saiu depois do dia planejado
//   sem card ......... post que foi ao ar sem ter sido planejado no board
//   planejado sem post  card com data no mês, janela já fechada, e nenhum post que case com ele
//   formatos ......... reel / carrossel / post, pelo tipo que a Meta devolve
//
// O casamento card↔post é o MESMO do "No ar" automático (lib/conteudo/no-ar.ts). Módulo puro.

import { spDateStr } from "@/lib/utils";
import {
  casarPostsECards, dataPlanejada, diasEntre, estaNoAr, formatoDoCard, formatoDoInstagram,
  reservarPostsDeQuemJaEstaNoAr, somarDias, vaiProFeed, JANELA_DIAS,
  type CardCasavel, type FormatoPost, type LinhaCard, type LinhaPost,
} from "@/lib/conteudo/no-ar";

export type MixFormatos = Record<FormatoPost, number>;

export interface ClienteResultado {
  id: string;
  nome: string;
  social: string | null;
  temInstagram: boolean;
  meta: number | null;
  /** clients.last_post_date — mantido pelo sync-posts a partir do Instagram. */
  ultimoPost: string | null;
}

export interface Contagem {
  posts: number;
  noPrazo: number;
  atrasados: number;
  semCard: number;
  planejadosSemPost: number;
  formatos: MixFormatos;
}

export interface LinhaClienteResultado extends Contagem {
  clientId: string;
  cliente: string;
  social: string | null;
  temInstagram: boolean;
  meta: number | null;
  ultimoPost: string | null;
}

export interface LinhaPessoaResultado extends Contagem {
  pessoa: string;
  clientes: number;
  clientesSemInstagram: number;
}

export interface Resultados {
  mes: string;
  inicio: string;
  fim: string;
  totais: Contagem & { clientes: number; clientesSemInstagram: number };
  porCliente: LinhaClienteResultado[];
  porPessoa: LinhaPessoaResultado[];
}

export const SEM_SOCIAL = "Sem social definido";

const mixVazio = (): MixFormatos => ({ reel: 0, carrossel: 0, post: 0, story: 0, outro: 0 });
const contagemVazia = (): Contagem => ({ posts: 0, noPrazo: 0, atrasados: 0, semCard: 0, planejadosSemPost: 0, formatos: mixVazio() });

function somar(a: Contagem, b: Contagem): void {
  a.posts += b.posts; a.noPrazo += b.noPrazo; a.atrasados += b.atrasados;
  a.semCard += b.semCard; a.planejadosSemPost += b.planejadosSemPost;
  for (const k of Object.keys(a.formatos) as FormatoPost[]) a.formatos[k] += b.formatos[k];
}

/** Primeiro e último dia de "YYYY-MM". */
export function limitesDoMes(mes: string): { inicio: string; fim: string } {
  const [ano, m] = mes.split("-").map(Number);
  const fim = new Date(Date.UTC(ano, m, 0)).toISOString().slice(0, 10);
  return { inicio: `${mes}-01`, fim };
}

/** % no prazo entre os posts planejados (null quando nenhum post casou com card). */
export function pctNoPrazo(c: Pick<Contagem, "noPrazo" | "atrasados">): number | null {
  const base = c.noPrazo + c.atrasados;
  return base > 0 ? Math.round((c.noPrazo / base) * 100) : null;
}

export function montarResultados(args: {
  mes: string;
  hoje: string;
  clientes: readonly ClienteResultado[];
  /** Posts do mês com margem de alguns dias dos dois lados (o casamento olha ±1 dia). */
  posts: readonly LinhaPost[];
  /** Cards com data planejada no mês (± margem). */
  cards: readonly LinhaCard[];
  janelaDias?: number;
}): Resultados {
  const janela = args.janelaDias ?? JANELA_DIAS;
  const { inicio, fim } = limitesDoMes(args.mes);
  const clientes = new Map(args.clientes.map((c) => [c.id, c]));

  // Só cards de clientes que estão na conta, que vão pro feed e têm data perto do mês.
  const cards = args.cards.filter((c) => {
    if (c.archived_at || !clientes.has(c.client_id) || !vaiProFeed(c)) return false;
    const d = dataPlanejada({ dueDate: c.due_date, scheduledAt: c.scheduled_at });
    return !!d && d >= somarDias(inicio, -janela) && d <= somarDias(fim, janela);
  });
  const posts = args.posts.filter((p) => clientes.has(p.client_id));
  const dataDoCard = new Map(cards.map((c) => [c.id, dataPlanejada({ dueDate: c.due_date, scheduledAt: c.scheduled_at })!]));

  // 1) Quem já está no ar segura o próprio post; 2) os outros cards disputam o resto.
  const { usados, donoDoPost } = reservarPostsDeQuemJaEstaNoAr(cards, posts, janela);
  const abertos: CardCasavel[] = cards
    .filter((c) => !estaNoAr(c.status))
    .map((c) => ({ id: c.id, clientId: c.client_id, data: dataDoCard.get(c.id)!, hora: c.due_time ?? null, formato: formatoDoCard(c.format) }));
  const casados = casarPostsECards(abertos, posts.map((p) => ({
    mediaId: p.media_id, clientId: p.client_id, postedAt: p.posted_at, formato: formatoDoInstagram(p.tipo),
  })), { janelaDias: janela, postsJaUsados: usados });

  const cardDoPost = new Map<string, string>();
  for (const [cardId, mediaId] of donoDoPost) cardDoPost.set(mediaId, cardId);
  for (const par of casados.pares) cardDoPost.set(par.mediaId, par.cardId);
  const cardComPost = new Set(cardDoPost.values());

  const porCliente = new Map<string, Contagem>();
  const doCliente = (id: string) => {
    let c = porCliente.get(id);
    if (!c) { c = contagemVazia(); porCliente.set(id, c); }
    return c;
  };

  // Posts que foram AO AR no mês.
  for (const p of posts) {
    const dia = spDateStr(p.posted_at);
    if (dia < inicio || dia > fim) continue;
    const c = doCliente(p.client_id);
    c.posts++;
    c.formatos[formatoDoInstagram(p.tipo)]++;
    const cardId = cardDoPost.get(p.media_id);
    const planejado = cardId ? dataDoCard.get(cardId) : undefined;
    if (!cardId || !planejado) { c.semCard++; continue; }
    if (diasEntre(planejado, dia) <= 0) c.noPrazo++; else c.atrasados++;
  }

  // Cards planejados PARA o mês cuja janela já fechou e que não acharam post. Card marcado "no ar"
  // à mão não entra: não dá pra desmentir quem conferiu (pode ter saído bem depois da data).
  // Cliente sem Instagram também não: sem a fonte, "não saiu" seria chute.
  for (const c of cards) {
    const data = dataDoCard.get(c.id)!;
    if (data < inicio || data > fim) continue;
    if (estaNoAr(c.status) || cardComPost.has(c.id)) continue;
    if (somarDias(data, janela) >= args.hoje) continue; // ainda pode sair
    if (!clientes.get(c.client_id)?.temInstagram) continue;
    doCliente(c.client_id).planejadosSemPost++;
  }

  const linhas: LinhaClienteResultado[] = args.clientes.map((cl) => ({
    clientId: cl.id, cliente: cl.nome, social: cl.social, temInstagram: cl.temInstagram,
    meta: cl.meta, ultimoPost: cl.ultimoPost,
    ...(porCliente.get(cl.id) ?? contagemVazia()),
  })).sort((a, b) => (a.social ?? "~").localeCompare(b.social ?? "~") || a.cliente.localeCompare(b.cliente));

  const pessoas = new Map<string, LinhaPessoaResultado>();
  const totais = { ...contagemVazia(), clientes: 0, clientesSemInstagram: 0 };
  for (const l of linhas) {
    const nome = l.social?.trim() || SEM_SOCIAL;
    let p = pessoas.get(nome);
    if (!p) { p = { pessoa: nome, clientes: 0, clientesSemInstagram: 0, ...contagemVazia() }; pessoas.set(nome, p); }
    p.clientes++;
    totais.clientes++;
    if (!l.temInstagram) { p.clientesSemInstagram++; totais.clientesSemInstagram++; }
    somar(p, l);
    somar(totais, l);
  }

  return {
    mes: args.mes, inicio, fim, totais,
    porCliente: linhas,
    porPessoa: [...pessoas.values()].sort((a, b) =>
      Number(a.pessoa === SEM_SOCIAL) - Number(b.pessoa === SEM_SOCIAL) || a.pessoa.localeCompare(b.pessoa)),
  };
}
