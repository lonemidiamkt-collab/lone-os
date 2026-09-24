// lib/conteudo/mix.ts — MIX DE CONTEÚDO POR CLIENTE (Leva 7B, N15): formato e tema dos últimos 30
// dias, o que FOI AO AR (Instagram real) contra o que foi PLANEJADO no quadro.
//
// Serve à pergunta de planejamento: "esse cliente está só postando oferta?", "o Reels que a gente
// planeja sai mesmo?". Formato do real vem da Meta (media_type); o tema vem do card que casou com o
// post — a regra de casamento é a mesma do "No ar" e dos Resultados (lib/conteudo/no-ar.ts). Post
// sem card não tem tema conhecido e aparece como tal, em vez de ser chutado.
//
// O tema é lido do título do card por palavras-chave — o guia de legendas da Lone separa post de
// PRODUTO de INSTITUCIONAL; o resto são os tipos que a pauta usa (dica, data, prova, bastidor).
// Módulo puro (testado em tests/conteudo-mix.test.ts).

import { spDateStr } from "@/lib/utils";
import {
  casarPostsECards, dataPlanejada, estaNoAr, formatoDoCard, formatoDoInstagram, reservarPostsDeQuemJaEstaNoAr,
  somarDias, vaiProFeed, JANELA_DIAS, type CardCasavel, type FormatoPost, type LinhaCard, type LinhaPost,
} from "./no-ar";

export const DIAS_DO_MIX = 30;

export type Tema = "produto" | "institucional" | "educativo" | "data" | "prova" | "bastidor" | "outro";

export const TEMAS: readonly Tema[] = ["produto", "institucional", "educativo", "data", "prova", "bastidor", "outro"];

export const ROTULO_TEMA: Record<Tema, string> = {
  produto: "Produto e oferta",
  institucional: "Institucional",
  educativo: "Dica e educativo",
  data: "Data comemorativa",
  prova: "Prova social",
  bastidor: "Bastidor",
  outro: "Outro",
};

export const FORMATOS_DO_MIX: readonly FormatoPost[] = ["post", "carrossel", "reel", "outro"];

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// A ordem importa: "Dia das Mães — promoção" é data comemorativa antes de ser oferta.
const REGRAS: readonly [Tema, RegExp][] = [
  ["data", /\b(dia d[aeo]s? |natal|pascoa|black ?friday|feriado|carnaval|ano novo|reveillon|independencia|consciencia negra|dia do cliente|aniversario d[ae] cidade|festa junina|sao joao|outubro rosa|novembro azul|setembro amarelo)/],
  ["prova", /\b(depoimento|avaliac|antes e depois|cliente satisfeit|prova social|feedback|resultado d[eo] cliente|case)/],
  ["bastidor", /\b(bastidor|nossa equipe|nosso time|conheca a equipe|making of|por tras|rotina da loja|dia a dia)/],
  ["educativo", /\b(dica|como (usar|escolher|fazer|limpar|cuidar)|passo a passo|voce sabia|sabia que|erro|guia|tutorial|entenda|diferenca entre|mito|curiosidade|aprenda)/],
  ["produto", /\b(promo|oferta|preco|r\$|desconto|lancamento|chegou|novidade|produto|colecao|estoque|condicao|a vista|pix|parcel|queima|liquida|imperdivel|garanta)/],
  ["institucional", /\b(institucional|nossa historia|quem somos|missao|valores|anos de|tradicao|confianca|nossa loja|localizacao|endereco|inauguracao|estrutura)/],
];

/** O tema de um post pelo título/briefing do card. */
export function temaDoTexto(texto: string | null | undefined): Tema {
  const t = semAcento(texto ?? "");
  if (!t.trim()) return "outro";
  for (const [tema, re] of REGRAS) if (re.test(t)) return tema;
  return "outro";
}

export type ContagemFormato = Record<FormatoPost, number>;
export type ContagemTema = Record<Tema, number>;

export interface LadoDoMix {
  total: number;
  formatos: ContagemFormato;
  temas: ContagemTema;
}

export interface MixCliente {
  clientId: string;
  cliente: string;
  temInstagram: boolean;
  real: LadoDoMix & { semCard: number };
  planejado: LadoDoMix;
}

export interface ClienteDoMix {
  id: string;
  nome: string;
  temInstagram: boolean;
}

const vazioFormato = (): ContagemFormato => ({ reel: 0, carrossel: 0, post: 0, story: 0, outro: 0 });
const vazioTema = (): ContagemTema => ({ produto: 0, institucional: 0, educativo: 0, data: 0, prova: 0, bastidor: 0, outro: 0 });
const lado = (): LadoDoMix => ({ total: 0, formatos: vazioFormato(), temas: vazioTema() });

/** Primeiro e último dia da janela (hoje incluído). */
export function janelaDoMix(hoje: string, dias = DIAS_DO_MIX): { inicio: string; fim: string } {
  return { inicio: somarDias(hoje, -(dias - 1)), fim: hoje };
}

export function montarMix(args: {
  clientes: readonly ClienteDoMix[];
  posts: readonly LinhaPost[];
  cards: readonly LinhaCard[];
  hoje: string;
  dias?: number;
}): MixCliente[] {
  const { inicio, fim } = janelaDoMix(args.hoje, args.dias);
  const ids = new Set(args.clientes.map((c) => c.id));
  const cards = args.cards.filter((c) => !c.archived_at && ids.has(c.client_id) && vaiProFeed(c));
  const posts = args.posts.filter((p) => ids.has(p.client_id));
  const dataDoCard = new Map(cards.map((c) => [c.id, dataPlanejada({ dueDate: c.due_date, scheduledAt: c.scheduled_at })]));
  const tituloDoCard = new Map(cards.map((c) => [c.id, c.title ?? ""]));

  // Casamento card ↔ post: o mesmo dos Resultados (quem já está no ar segura o seu post primeiro).
  const { usados, donoDoPost } = reservarPostsDeQuemJaEstaNoAr(cards, posts, JANELA_DIAS);
  const abertos: CardCasavel[] = cards
    .filter((c) => !estaNoAr(c.status) && dataDoCard.get(c.id))
    .map((c) => ({ id: c.id, clientId: c.client_id, data: dataDoCard.get(c.id)!, hora: c.due_time ?? null, formato: formatoDoCard(c.format) }));
  const casados = casarPostsECards(abertos, posts.map((p) => ({
    mediaId: p.media_id, clientId: p.client_id, postedAt: p.posted_at, formato: formatoDoInstagram(p.tipo),
  })), { janelaDias: JANELA_DIAS, postsJaUsados: usados });
  const cardDoPost = new Map<string, string>();
  for (const [cardId, mediaId] of donoDoPost) cardDoPost.set(mediaId, cardId);
  for (const par of casados.pares) cardDoPost.set(par.mediaId, par.cardId);

  const porCliente = new Map<string, MixCliente>();
  for (const c of args.clientes) {
    porCliente.set(c.id, { clientId: c.id, cliente: c.nome, temInstagram: c.temInstagram, real: { ...lado(), semCard: 0 }, planejado: lado() });
  }

  for (const p of posts) {
    const dia = spDateStr(p.posted_at);
    if (dia < inicio || dia > fim) continue;
    const m = porCliente.get(p.client_id)!;
    m.real.total++;
    m.real.formatos[formatoDoInstagram(p.tipo)]++;
    const cardId = cardDoPost.get(p.media_id);
    if (!cardId) { m.real.semCard++; continue; }
    m.real.temas[temaDoTexto(tituloDoCard.get(cardId))]++;
  }

  for (const c of cards) {
    const d = dataDoCard.get(c.id);
    if (!d || d < inicio || d > fim) continue;
    const m = porCliente.get(c.client_id)!;
    m.planejado.total++;
    m.planejado.formatos[formatoDoCard(c.format)]++;
    m.planejado.temas[temaDoTexto(c.title)]++;
  }

  return [...porCliente.values()].sort((a, b) => a.cliente.localeCompare(b.cliente, "pt-BR"));
}

/** Percentual inteiro (0 quando o total é 0). */
export function pct(n: number, total: number): number {
  return total > 0 ? Math.round((n / total) * 100) : 0;
}

/**
 * Uma frase sobre o desvio mais forte, para o topo do bloco — ou null quando está equilibrado.
 * Só fala com base mínima (5 posts), para não tirar conclusão de 2 posts.
 */
export function leituraDoMix(m: MixCliente): string | null {
  const base = m.real.total >= 5 ? m.real : m.planejado.total >= 5 ? m.planejado : null;
  if (!base) return null;
  const origem = base === m.real ? "do que foi ao ar" : "do planejado";
  const produto = pct(base.temas.produto, base.total);
  if (produto >= 70) return `${produto}% ${origem} é produto e oferta — pouco conteúdo que gera relacionamento.`;
  const reels = pct(base.formatos.reel, base.total);
  if (m.planejado.total >= 5 && m.real.total >= 5) {
    const reelsPlan = pct(m.planejado.formatos.reel, m.planejado.total);
    const reelsReal = pct(m.real.formatos.reel, m.real.total);
    if (reelsPlan - reelsReal >= 25) return `Reels planejados não estão saindo: ${reelsPlan}% no plano, ${reelsReal}% no ar.`;
  }
  if (base.total >= 8 && reels === 0) return `Nenhum Reels ${origem} nos últimos 30 dias.`;
  return null;
}
