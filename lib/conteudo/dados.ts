// lib/conteudo/dados.ts — leitura/gravação do "No ar" automático e dos Resultados (servidor).
//
// Separado de no-ar.ts (puro) porque aqui mora o banco. Tudo degrada sem a migration
// 20260924190000_conteudo_no_ar.sql: sem as colunas ig_media_id/ig_permalink o card fecha do mesmo
// jeito (status + publish_verified_at = hora do post), só não guarda o link — e o "mesmo instante"
// de publish_verified_at continua segurando o post para ele (ver reservarPostsDeQuemJaEstaNoAr).

import { statusDaEtapa, statusDasEtapas } from "@/lib/conteudo/etapas";
import { supabaseAdmin } from "@/lib/supabase/server";
import { todaySP } from "@/lib/utils";
import {
  dataPlanejada, estaNoAr, planejarNoAr, somarDias, VERIFICADO_PELO_INSTAGRAM, JANELA_DIAS,
  type Fechamento, type LinhaCard, type LinhaPost,
} from "@/lib/conteudo/no-ar";

const COLS_CARD = "id, client_id, title, status, format, platform, due_date, due_time, scheduled_at, designer_delivered_at, client_approved_at, publish_verified_at, status_changed_at, social_media, archived_at, column_entered_at";
const PAGINA = 1000;
const LOTE_IN = 60; // `in.(…)` longo estoura o header do PostgREST (ver fetchContentCards)

type LinhaComColunas = LinhaCard & { column_entered_at?: Record<string, string> | null };

interface Pagina<T> { data: T[] | null; error: { message: string } | null }

/** Lê todas as páginas (o PostgREST corta em 1000 linhas). */
async function paginar<T>(montar: (de: number, ate: number) => PromiseLike<Pagina<T>>): Promise<{ linhas: T[]; erro: string | null }> {
  const linhas: T[] = [];
  for (let de = 0; de < 50_000; de += PAGINA) {
    const { data, error } = await montar(de, de + PAGINA - 1);
    if (error) return { linhas, erro: error.message };
    linhas.push(...(data ?? []));
    if (!data || data.length < PAGINA) break;
  }
  return { linhas, erro: null };
}

/**
 * As colunas do link do post já existem? Pergunta com `select *` de UMA linha em vez de pedir a
 * coluna: pedir coluna inexistente dá 400, e todo 400 vira alerta no Sentry (lib/obs).
 */
export async function temColunasIg(): Promise<boolean> {
  const { data } = await supabaseAdmin.from("content_cards").select("*").limit(1);
  const linha = (data ?? [])[0] as Record<string, unknown> | undefined;
  return !!linha && "ig_media_id" in linha;
}

/** Posts reais de uma janela de dias (inclusive), em São Paulo. */
export async function carregarPosts(de: string, ate: string, clientIds?: string[]): Promise<{ posts: LinhaPost[]; erro: string | null }> {
  const r = await paginar<LinhaPost>((i, f) => {
    let q = supabaseAdmin.from("client_ig_posts").select("media_id, client_id, posted_at, tipo, permalink")
      .gte("posted_at", `${de}T00:00:00-03:00`).lte("posted_at", `${ate}T23:59:59-03:00`);
    if (clientIds) q = q.in("client_id", clientIds);
    return q.order("posted_at", { ascending: true }).range(i, f) as unknown as PromiseLike<Pagina<LinhaPost>>;
  });
  return { posts: r.linhas, erro: r.erro };
}

/**
 * Cards com data planejada na janela: pela data de postagem; sem ela, pelo dia em que foi
 * agendado; e os que já estão no ar sem data nenhuma, pelo dia em que foram conferidos (eles
 * seguram o post deles). Mais os cards já LIGADOS a algum dos posts carregados, estejam onde
 * estiverem — senão um post já usado voltaria para a disputa.
 */
export async function carregarCards(de: string, ate: string, postIds: string[], comIg: boolean): Promise<{ cards: LinhaComColunas[]; erro: string | null }> {
  const cols = comIg ? `${COLS_CARD}, ig_media_id` : COLS_CARD;
  const deTs = `${de}T00:00:00-03:00`, ateTs = `${ate}T23:59:59-03:00`;
  const consultas = await Promise.all([
    paginar<LinhaComColunas>((i, f) => supabaseAdmin.from("content_cards").select(cols)
      .gte("due_date", de).lte("due_date", ate).order("id").range(i, f) as unknown as PromiseLike<Pagina<LinhaComColunas>>),
    paginar<LinhaComColunas>((i, f) => supabaseAdmin.from("content_cards").select(cols)
      .is("due_date", null).gte("scheduled_at", deTs).lte("scheduled_at", ateTs).order("id").range(i, f) as unknown as PromiseLike<Pagina<LinhaComColunas>>),
    paginar<LinhaComColunas>((i, f) => supabaseAdmin.from("content_cards").select(cols)
      .is("due_date", null).is("scheduled_at", null).in("status", statusDasEtapas("no_ar"))
      .gte("publish_verified_at", deTs).lte("publish_verified_at", ateTs).order("id").range(i, f) as unknown as PromiseLike<Pagina<LinhaComColunas>>),
  ]);
  const erro = consultas.find((c) => c.erro)?.erro ?? null;
  const porId = new Map<string, LinhaComColunas>();
  for (const c of consultas) for (const l of c.linhas) porId.set(l.id, l);

  if (comIg && postIds.length) {
    for (let i = 0; i < postIds.length; i += LOTE_IN) {
      const { data } = await supabaseAdmin.from("content_cards").select(cols).in("ig_media_id", postIds.slice(i, i + LOTE_IN));
      for (const l of (data ?? []) as unknown as LinhaComColunas[]) porId.set(l.id, l);
    }
  }
  return { cards: [...porId.values()], erro };
}

export interface ResultadoNoAr {
  ensaio: boolean;
  janela: { de: string; ate: string };
  guardaLink: boolean;
  /** Cards que casaram com um post e fecham (ou fechariam, no ensaio). */
  aFechar: number;
  fechados: number;
  falhas: { cardId: string; motivo: string }[];
  detalhe: (Fechamento & { cliente: string })[];
  erro?: string;
}

/**
 * Roda o "No ar" automático: carrega a janela, casa e (fora do ensaio) fecha os cards.
 * `dias` = quantos dias para trás olhar (a data planejada do card). Nunca lança.
 */
export async function noArPeloInstagram(opts: { ensaio: boolean; dias?: number; nomes?: Map<string, string> }): Promise<ResultadoNoAr> {
  const dias = Math.min(Math.max(Math.round(opts.dias ?? 60), 2), 400);
  const hoje = todaySP();
  const de = somarDias(hoje, -dias);
  const ate = hoje;
  const base: ResultadoNoAr = { ensaio: opts.ensaio, janela: { de, ate }, guardaLink: false, aFechar: 0, fechados: 0, falhas: [], detalhe: [] };

  try {
    const comIg = await temColunasIg();
    base.guardaLink = comIg;
    // Posts com um dia de folga dos dois lados: o casamento aceita ±1 dia da data planejada.
    const { posts, erro: erroPosts } = await carregarPosts(somarDias(de, -JANELA_DIAS), ate);
    if (erroPosts) return { ...base, erro: `posts: ${erroPosts}` };
    // Cards com folga maior: os que estão no ar perto da borda precisam segurar o post deles.
    const { cards, erro: erroCards } = await carregarCards(somarDias(de, -2), somarDias(ate, 2), posts.map((p) => p.media_id), comIg);
    if (erroCards) return { ...base, erro: `cards: ${erroCards}` };

    // Só card ABERTO com data dentro da janela pedida disputa post; a folga carrega os que já estão
    // no ar perto da borda, para eles segurarem o post deles — não para fechar card de fora.
    const naDisputa = cards.filter((c) => {
      if (estaNoAr(c.status)) return true;
      const d = dataPlanejada({ dueDate: c.due_date, scheduledAt: c.scheduled_at });
      return !!d && d >= de && d <= ate;
    });
    const plano = planejarNoAr(naDisputa, posts);
    base.aFechar = plano.length;
    base.detalhe = plano.map((f) => ({ ...f, cliente: opts.nomes?.get(f.clientId) ?? f.clientId }));
    if (opts.ensaio) return base;

    const porId = new Map(cards.map((c) => [c.id, c]));
    const agora = new Date().toISOString();
    for (const f of plano) {
      const card = porId.get(f.cardId);
      const linha: Record<string, unknown> = {
        status: statusDaEtapa("no_ar"),
        status_changed_at: agora,
        column_entered_at: { ...(card?.column_entered_at ?? {}), [statusDaEtapa("no_ar")]: agora },
        publish_verified_at: f.postedAt,
        publish_verified_by: VERIFICADO_PELO_INSTAGRAM,
      };
      if (comIg) { linha.ig_media_id = f.mediaId; linha.ig_permalink = f.permalink; }
      // Só fecha se ainda está aberto e ativo: alguém pode ter mexido desde a leitura.
      const { data, error } = await supabaseAdmin.from("content_cards").update(linha)
        .eq("id", f.cardId).not("status", "in", `(${statusDasEtapas("no_ar").join(",")})`).is("archived_at", null).select("id");
      if (error) { base.falhas.push({ cardId: f.cardId, motivo: error.message }); continue; }
      if (data?.length) base.fechados++;
    }
    return base;
  } catch (e) {
    return { ...base, erro: e instanceof Error ? e.message : String(e) };
  }
}

/** Mês "YYYY-MM" válido, ou o mês corrente de São Paulo. */
export function mesOuAtual(mes: string | null | undefined): string {
  return mes && /^\d{4}-(0[1-9]|1[0-2])$/.test(mes) ? mes : todaySP().slice(0, 7);
}

