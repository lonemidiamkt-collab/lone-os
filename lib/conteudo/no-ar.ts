// lib/conteudo/no-ar.ts — "No ar" automático: o post real do Instagram fecha o card planejado.
//
// POR QUE EXISTE (Leva 5a, set/2026). O board tinha ~24 cards em "publicado" contra ~451 posts
// reais no Instagram. Ninguém arrasta o card depois que o post sai — e aí o board mente (tudo
// "agendado" para sempre), o portal mostra o cliente sem publicação e as métricas de pessoa medem
// um clique que ninguém dá. O Instagram a gente já sincroniza todo dia (client_ig_posts); este
// módulo casa cada post real com o card que o planejou e diz qual card fechar.
//
// A REGRA (pedido do Roberto):
//   · mesmo cliente;
//   · post publicado até 1 dia antes ou depois da data planejada do card;
//   · vários candidatos: primeiro o de mesmo formato (reel/carrossel/post), depois o horário mais
//     perto;
//   · um post fecha no máximo UM card (e um card recebe no máximo um post).
//
// Módulo PURO: sem banco, sem React. Tudo o que depende do nome das etapas do board fica nas
// funções pequenas logo abaixo (estaNoAr, prontoParaIrAoAr) — a Leva 5b troca as etapas e só
// precisa remapear aqui.

import { spDateStr } from "@/lib/utils";

// ─── Formatos ──────────────────────────────────────────────────────────────

export type FormatoPost = "reel" | "carrossel" | "post" | "story" | "outro";

export const ROTULO_FORMATO: Record<FormatoPost, string> = {
  reel: "Reels", carrossel: "Carrossel", post: "Post", story: "Story", outro: "Outro",
};

/** O `media_type` que a Meta devolve (IMAGE, VIDEO, CAROUSEL_ALBUM…) → formato do board. */
export function formatoDoInstagram(tipo: string | null | undefined): FormatoPost {
  const t = (tipo ?? "").toUpperCase();
  // Vídeo no feed hoje é Reels: a Meta só separa pelo media_product_type, que não guardamos.
  if (t === "VIDEO" || t === "REELS" || t === "REEL") return "reel";
  if (t === "CAROUSEL_ALBUM" || t === "CAROUSEL") return "carrossel";
  if (t === "IMAGE") return "post";
  if (t === "STORY") return "story";
  return "outro";
}

/** O formato do card é texto livre ("Reels", "Post Feed", "Carrossel 5 lâminas"…). */
export function formatoDoCard(format: string | null | undefined): FormatoPost {
  const f = (format ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (!f.trim()) return "outro";
  if (/reel|video/.test(f)) return "reel";
  if (/carross/.test(f)) return "carrossel";
  if (/stor(y|ies)/.test(f)) return "story";
  if (/post|feed|imagem|foto|estatico|arte/.test(f)) return "post";
  return "outro"; // BTS, Destaque…
}

// ─── Etapas (remapear aqui na Leva 5b) ──────────────────────────────────────

/** O card já está "No ar"? Hoje isso é o status `published`. */
export function estaNoAr(status: string | null | undefined): boolean {
  return status === "published";
}

export interface EstadoDoCard {
  status: string;
  designerDeliveredAt?: string | null;
  clientApprovedAt?: string | null;
}

/** Nome da etapa para a tela (a Leva 5b troca os nomes aqui, num lugar só). */
const ROTULO_ETAPA: Record<string, string> = {
  ideas: "ideia", script: "roteiro", in_production: "em produção", blocked: "bloqueado",
  approval: "revisão interna", client_approval: "com o cliente", scheduled: "agendado", published: "no ar",
};
export function rotuloEtapa(status: string | null | undefined): string {
  return ROTULO_ETAPA[status ?? ""] ?? (status ?? "").replace(/_/g, " ");
}

/**
 * Card PRONTO para ir ao ar — o único que o Instagram pode fechar sozinho. Ideia solta ou roteiro
 * sem arte não fecha: um post no mesmo dia pode ser outra coisa, e fechar card que nem tinha arte
 * seria inventar entrega.
 *
 * Hoje: agendado, com o cliente, ou com arte entregue / aprovada pelo cliente em qualquer etapa.
 * (Leva 5b: "Agendado" e "Com o cliente" entram; "Revisão interna" só com arte entregue.)
 */
export function prontoParaIrAoAr(c: EstadoDoCard): boolean {
  if (estaNoAr(c.status)) return false;
  if (c.status === "blocked") return false;
  if (c.status === "scheduled" || c.status === "client_approval") return true;
  return !!c.clientApprovedAt || !!c.designerDeliveredAt;
}

/** Só o que sai no FEED entra na conta: story não aparece na lista de posts da Meta. */
export function vaiProFeed(c: { format?: string | null; platform?: string | null }): boolean {
  if (c.platform && c.platform !== "instagram") return false;
  return formatoDoCard(c.format) !== "story";
}

// ─── Datas ─────────────────────────────────────────────────────────────────

/** Dias entre duas datas "YYYY-MM-DD" (b − a). Calendário puro, sem fuso. */
export function diasEntre(a: string, b: string): number {
  const [ya, ma, da] = a.split("-").map(Number);
  const [yb, mb, db] = b.split("-").map(Number);
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86_400_000);
}

/** Soma dias a "YYYY-MM-DD" (meio-dia UTC: nunca escorrega pro dia vizinho). */
export function somarDias(ymd: string, n: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * A data em que o card deveria ir ao ar. `due_date` é a data de postagem que o social define;
 * sem ela, o dia em que o card foi agendado. Sem nenhuma das duas, não há o que comparar.
 */
export function dataPlanejada(c: { dueDate?: string | null; scheduledAt?: string | null }): string | null {
  if (c.dueDate) return c.dueDate.slice(0, 10);
  if (c.scheduledAt) return spDateStr(c.scheduledAt);
  return null;
}

/** Instante planejado (ms): data + hora em São Paulo (sem hora = meio-dia, o meio do dia de post). */
function instantePlanejado(data: string, hora?: string | null): number {
  const hhmm = /^\d{2}:\d{2}/.test(hora ?? "") ? (hora as string).slice(0, 5) : "12:00";
  // São Paulo não tem horário de verão desde 2019: −03:00 fixo.
  return Date.parse(`${data}T${hhmm}:00-03:00`);
}

// ─── O casamento ───────────────────────────────────────────────────────────

export const JANELA_DIAS = 1;

export interface CardCasavel {
  id: string;
  clientId: string;
  /** Data planejada, "YYYY-MM-DD". */
  data: string;
  /** "HH:mm" (ou "HH:mm:ss"), opcional. */
  hora?: string | null;
  formato: FormatoPost;
}

export interface PostCasavel {
  mediaId: string;
  clientId: string;
  /** ISO do Instagram. */
  postedAt: string;
  formato: FormatoPost;
}

export interface Par {
  cardId: string;
  mediaId: string;
  mesmoFormato: boolean;
  /** Distância absoluta entre o horário planejado e o do post, em minutos. */
  distanciaMin: number;
  /** Dia do post − dia planejado (−1, 0 ou +1 com a janela padrão). Positivo = saiu depois. */
  dias: number;
}

export interface Casamento {
  pares: Par[];
  cardsSemPost: string[];
  postsSemCard: string[];
}

/**
 * Casa cards e posts, um a um. Guloso sobre a lista de candidatos ordenada pela regra (mesmo
 * formato primeiro, depois horário mais perto; empate decidido pelo id, para o resultado não
 * mudar de uma execução para outra).
 *
 * `postsJaUsados`: posts que já pertencem a outro card (ligados antes, ou reservados por um card
 * que alguém marcou "no ar" à mão) — não entram na disputa.
 */
export function casarPostsECards(
  cards: readonly CardCasavel[],
  posts: readonly PostCasavel[],
  opts: { janelaDias?: number; postsJaUsados?: Iterable<string> } = {},
): Casamento {
  const janela = opts.janelaDias ?? JANELA_DIAS;
  const usados = new Set(opts.postsJaUsados ?? []);

  const postsPorCliente = new Map<string, PostCasavel[]>();
  for (const p of posts) {
    if (usados.has(p.mediaId)) continue;
    const lista = postsPorCliente.get(p.clientId) ?? [];
    lista.push(p);
    postsPorCliente.set(p.clientId, lista);
  }

  const candidatos: Par[] = [];
  for (const card of cards) {
    const instante = instantePlanejado(card.data, card.hora);
    for (const post of postsPorCliente.get(card.clientId) ?? []) {
      const dias = diasEntre(card.data, spDateStr(post.postedAt));
      if (Math.abs(dias) > janela) continue;
      candidatos.push({
        cardId: card.id,
        mediaId: post.mediaId,
        mesmoFormato: card.formato === post.formato,
        distanciaMin: Math.round(Math.abs(Date.parse(post.postedAt) - instante) / 60_000),
        dias,
      });
    }
  }

  candidatos.sort((a, b) =>
    Number(b.mesmoFormato) - Number(a.mesmoFormato)
    || a.distanciaMin - b.distanciaMin
    || a.cardId.localeCompare(b.cardId)
    || a.mediaId.localeCompare(b.mediaId));

  const cardFeito = new Set<string>();
  const postFeito = new Set<string>();
  const pares: Par[] = [];
  for (const c of candidatos) {
    if (cardFeito.has(c.cardId) || postFeito.has(c.mediaId)) continue;
    cardFeito.add(c.cardId);
    postFeito.add(c.mediaId);
    pares.push(c);
  }

  return {
    pares,
    cardsSemPost: cards.filter((c) => !cardFeito.has(c.id)).map((c) => c.id),
    postsSemCard: posts.filter((p) => !usados.has(p.mediaId) && !postFeito.has(p.mediaId)).map((p) => p.mediaId),
  };
}

// ─── Do banco para o casamento ─────────────────────────────────────────────

/** Linha de content_cards (snake_case, como vem do Supabase). */
export interface LinhaCard {
  id: string;
  client_id: string;
  title?: string | null;
  status: string;
  format?: string | null;
  platform?: string | null;
  due_date?: string | null;
  due_time?: string | null;
  scheduled_at?: string | null;
  designer_delivered_at?: string | null;
  client_approved_at?: string | null;
  publish_verified_at?: string | null;
  status_changed_at?: string | null;
  social_media?: string | null;
  archived_at?: string | null;
  /** Coluna da migration 20260924190000 — ausente antes dela. */
  ig_media_id?: string | null;
}

/** Linha de client_ig_posts. */
export interface LinhaPost {
  media_id: string;
  client_id: string;
  posted_at: string;
  tipo?: string | null;
  permalink?: string | null;
}

function paraCasavel(c: LinhaCard, data: string): CardCasavel {
  return { id: c.id, clientId: c.client_id, data, hora: c.due_time ?? null, formato: formatoDoCard(c.format) };
}

function postCasavel(p: LinhaPost): PostCasavel {
  return { mediaId: p.media_id, clientId: p.client_id, postedAt: p.posted_at, formato: formatoDoInstagram(p.tipo) };
}

/** Mesmo instante (o fechamento automático grava publish_verified_at = posted_at). */
function mesmoInstante(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  const ta = Date.parse(a), tb = Date.parse(b);
  return Number.isFinite(ta) && ta === tb;
}

export interface Reserva {
  /** Posts que já têm dono. */
  usados: Set<string>;
  /** card → post, para quem já estava no ar (ligado, mesmo instante ou reservado por proximidade). */
  donoDoPost: Map<string, string>;
}

/**
 * Quem JÁ está no ar segura o próprio post antes de qualquer card aberto disputar:
 *   1. o card que guardou o id do post (ig_media_id);
 *   2. o card com publish_verified_at no mesmo instante do post (fechado por aqui antes da coluna existir);
 *   3. o card marcado "no ar" à mão, que reserva o post mais parecido dentro da janela.
 * Sem o passo 3, o post de um card fechado à mão ontem fecharia o card de hoje também.
 */
export function reservarPostsDeQuemJaEstaNoAr(cards: readonly LinhaCard[], posts: readonly LinhaPost[], janelaDias = JANELA_DIAS): Reserva {
  const usados = new Set<string>();
  const donoDoPost = new Map<string, string>();
  const noAr = cards.filter((c) => estaNoAr(c.status));

  // Primeiro TODOS os ligados (por id), depois o mesmo instante — senão a ordem dos cards decidiria
  // quem fica com o post.
  for (const c of noAr) {
    if (!c.ig_media_id) continue;
    usados.add(c.ig_media_id);
    donoDoPost.set(c.id, c.ig_media_id);
  }
  const semLigacao: LinhaCard[] = [];
  for (const c of noAr) {
    if (c.ig_media_id) continue;
    const exato = posts.find((p) => p.client_id === c.client_id && !usados.has(p.media_id) && mesmoInstante(p.posted_at, c.publish_verified_at));
    if (exato) { usados.add(exato.media_id); donoDoPost.set(c.id, exato.media_id); continue; }
    semLigacao.push(c);
  }

  const reservaveis = semLigacao
    .map((c) => {
      const data = dataPlanejada({ dueDate: c.due_date, scheduledAt: c.scheduled_at })
        ?? (c.publish_verified_at ? spDateStr(c.publish_verified_at) : null)
        ?? (c.status_changed_at ? spDateStr(c.status_changed_at) : null);
      return data && vaiProFeed(c) ? paraCasavel(c, data) : null;
    })
    .filter((x): x is CardCasavel => !!x);
  const r = casarPostsECards(reservaveis, posts.map(postCasavel), { janelaDias, postsJaUsados: usados });
  for (const p of r.pares) { usados.add(p.mediaId); donoDoPost.set(p.cardId, p.mediaId); }
  return { usados, donoDoPost };
}

export interface Fechamento {
  cardId: string;
  clientId: string;
  titulo: string;
  dataPlanejada: string;
  mediaId: string;
  permalink: string | null;
  postedAt: string;
  formatoCard: FormatoPost;
  formatoPost: FormatoPost;
  mesmoFormato: boolean;
  dias: number;
}

/**
 * O plano do dia: quais cards prontos fecham e com qual post. Não grava nada — quem chama decide
 * (o ensaio só mostra; o job grava).
 */
export function planejarNoAr(cards: readonly LinhaCard[], posts: readonly LinhaPost[], janelaDias = JANELA_DIAS): Fechamento[] {
  const ativos = cards.filter((c) => !c.archived_at);
  const { usados } = reservarPostsDeQuemJaEstaNoAr(ativos, posts, janelaDias);

  const abertos: CardCasavel[] = [];
  const porCard = new Map<string, { linha: LinhaCard; data: string }>();
  for (const c of ativos) {
    if (!prontoParaIrAoAr({ status: c.status, designerDeliveredAt: c.designer_delivered_at, clientApprovedAt: c.client_approved_at })) continue;
    if (!vaiProFeed(c)) continue;
    const data = dataPlanejada({ dueDate: c.due_date, scheduledAt: c.scheduled_at });
    if (!data) continue;
    abertos.push(paraCasavel(c, data));
    porCard.set(c.id, { linha: c, data });
  }

  const porPost = new Map(posts.map((p) => [p.media_id, p]));
  const r = casarPostsECards(abertos, posts.map(postCasavel), { janelaDias, postsJaUsados: usados });
  return r.pares.map((par) => {
    const { linha: card, data } = porCard.get(par.cardId)!;
    const post = porPost.get(par.mediaId)!;
    return {
      cardId: card.id,
      clientId: card.client_id,
      titulo: card.title ?? "",
      dataPlanejada: data,
      mediaId: post.media_id,
      permalink: post.permalink ?? null,
      postedAt: post.posted_at,
      formatoCard: formatoDoCard(card.format),
      formatoPost: formatoDoInstagram(post.tipo),
      mesmoFormato: par.mesmoFormato,
      dias: par.dias,
    };
  }).sort((a, b) => a.postedAt.localeCompare(b.postedAt));
}

/** Quem fechou, gravado em publish_verified_by — a tela mostra "conferido pelo Instagram". */
export const VERIFICADO_PELO_INSTAGRAM = "Instagram (automático)";
