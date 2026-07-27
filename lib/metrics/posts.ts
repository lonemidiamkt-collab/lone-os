// lib/metrics/posts.ts — FONTE ÚNICA de "quantos posts esse cliente teve".
//
// Por que existir: em 26/07/2026 a plataforma tinha TRÊS respostas diferentes pra mesma pergunta,
// e as duas que apareciam na tela estavam erradas:
//
//   clients.posts_this_month .... 0 na base inteira (ninguém escreve) → todo mundo "0/12"
//   clients.last_post_date ...... 22 de 46 preenchidos e desatualizados → "sem post há 21 dias"
//                                 pra cliente que postou 2 dias atrás
//   content_cards published ..... 3 cards na base inteira, contra 307 posts reais no Instagram
//
// A verdade é o Instagram: o post ou está no perfil, ou não está. `client_ig_posts` acumula
// isso (migration 082). Cliente sem Instagram vinculado cai no board — que é fraco, mas é o
// que existe, e a resposta diz de qual fonte veio pra ninguém confundir uma coisa com a outra.

import { supabaseAdmin } from "@/lib/supabase/server";

export type FontePost = "instagram" | "board" | "sem-fonte";

export interface SemanaDoMes {
  /** 1..5 — a "semana 1" é a que contém o dia 1º. */
  numero: number;
  inicio: string; // YYYY-MM-DD
  fim: string;    // YYYY-MM-DD
  label: string;  // "01–05/07"
  posts: number;
  /** A semana já terminou? Semana em curso sem post ainda não é buraco. */
  encerrada: boolean;
}

export interface PostsDoMes {
  clientId: string;
  mes: string;   // "2026-07"
  label: string; // "julho/2026"
  fonte: FontePost;
  total: number;
  meta: number | null;
  semanas: SemanaDoMes[];
  /** Semanas ENCERRADAS que ficaram sem nenhum post — é o que o dono quer ver. */
  semanasSemPost: SemanaDoMes[];
  ultimoPost: string | null;      // YYYY-MM-DD
  diasSemPostar: number | null;   // null = nunca postou / sem fonte
}

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

const ymdLocal = (d: Date) => d.toISOString().slice(0, 10);
const dd = (s: string) => s.slice(8, 10);
const mm = (s: string) => s.slice(5, 7);

/** Chave "YYYY-MM" do mês corrente em horário de São Paulo (o servidor roda em UTC). */
export function mesAtualBRT(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).slice(0, 7);
}

export function labelMes(mes: string): string {
  const [ano, m] = mes.split("-").map(Number);
  return `${MESES[(m || 1) - 1]}/${ano}`;
}

/**
 * Divide o mês em semanas de segunda a domingo, cortadas nas bordas do mês.
 * Segunda a domingo porque é o calendário do playbook (post seg/qua/sex) — semana que começa
 * no domingo faria a sexta e a segunda seguinte caírem em "semanas" diferentes do combinado.
 */
export function semanasDoMes(mes: string, hojeIso: string): SemanaDoMes[] {
  const [ano, m] = mes.split("-").map(Number);
  const primeiro = new Date(Date.UTC(ano, m - 1, 1));
  const ultimo = new Date(Date.UTC(ano, m, 0));
  const semanas: SemanaDoMes[] = [];

  let cursor = new Date(primeiro);
  let numero = 1;
  while (cursor <= ultimo) {
    // Domingo (getUTCDay()===0) fecha a semana; senão anda até domingo ou até o fim do mês.
    const diasAteDomingo = (7 - cursor.getUTCDay()) % 7;
    const fim = new Date(cursor);
    fim.setUTCDate(fim.getUTCDate() + diasAteDomingo);
    if (fim > ultimo) fim.setTime(ultimo.getTime());

    const inicioIso = ymdLocal(cursor);
    const fimIso = ymdLocal(fim);
    semanas.push({
      numero,
      inicio: inicioIso,
      fim: fimIso,
      label: `${dd(inicioIso)}–${dd(fimIso)}/${mm(fimIso)}`,
      posts: 0,
      encerrada: fimIso < hojeIso,
    });

    cursor = new Date(fim);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    numero++;
  }
  return semanas;
}

/** Distribui as datas de post nas semanas. Puro — testável sem banco. */
export function distribuir(semanas: SemanaDoMes[], datas: string[]): SemanaDoMes[] {
  const out = semanas.map((s) => ({ ...s, posts: 0 }));
  for (const d of datas) {
    const s = out.find((x) => d >= x.inicio && d <= x.fim);
    if (s) s.posts++;
  }
  return out;
}

/**
 * Posts de UM cliente num mês. `mes` no formato "YYYY-MM" (default: mês corrente em BRT).
 * Nunca lança: erro de leitura vira fonte "sem-fonte" e zero — melhor admitir que não sabe
 * do que inventar zero como se fosse medição.
 */
export async function postsDoMes(clientId: string, mes = mesAtualBRT()): Promise<PostsDoMes> {
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const inicio = `${mes}-01`;
  const [ano, m] = mes.split("-").map(Number);
  const fim = ymdLocal(new Date(Date.UTC(ano, m, 0)));

  const base: PostsDoMes = {
    clientId, mes, label: labelMes(mes), fonte: "sem-fonte", total: 0, meta: null,
    semanas: semanasDoMes(mes, hoje), semanasSemPost: [], ultimoPost: null, diasSemPostar: null,
  };

  try {
    const [{ data: cli }, { data: igPosts }] = await Promise.all([
      supabaseAdmin.from("clients").select("posts_goal, ig_business_account_id, ig_public_username").eq("id", clientId).maybeSingle(),
      supabaseAdmin.from("client_ig_posts").select("posted_at").eq("client_id", clientId)
        .gte("posted_at", `${inicio}T00:00:00-03:00`).lte("posted_at", `${fim}T23:59:59-03:00`),
    ]);
    base.meta = (cli?.posts_goal as number) ?? null;

    let datas: string[] = [];
    let fonte: FontePost = "sem-fonte";

    if (igPosts && igPosts.length > 0) {
      datas = igPosts.map((p) => new Date(p.posted_at as string).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }));
      fonte = "instagram";
    } else if (!cli?.ig_business_account_id && !cli?.ig_public_username) {
      // Sem Instagram vinculado: o board é o que existe. É fraco (3 published na base inteira),
      // por isso a fonte vem marcada — quem exibe deve dizer de onde veio.
      const { data: cards } = await supabaseAdmin
        .from("content_cards").select("status_changed_at")
        .eq("client_id", clientId).eq("status", "published").is("archived_at", null)
        .gte("status_changed_at", `${inicio}T00:00:00-03:00`).lte("status_changed_at", `${fim}T23:59:59-03:00`);
      if (cards?.length) {
        datas = cards.map((c) => new Date(c.status_changed_at as string).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }));
        fonte = "board";
      }
    } else {
      // Tem Instagram vinculado e zero post no mês: isso é uma medição de verdade, não ausência
      // de dado. Marca como instagram pra tela poder dizer "não postou" com segurança.
      fonte = "instagram";
    }

    const semanas = distribuir(base.semanas, datas);
    const ultimoPost = await ultimoPostDe(clientId);

    return {
      ...base, fonte, total: datas.length, semanas,
      semanasSemPost: semanas.filter((s) => s.encerrada && s.posts === 0),
      ultimoPost,
      diasSemPostar: ultimoPost
        ? Math.floor((new Date(`${hoje}T12:00:00Z`).getTime() - new Date(`${ultimoPost}T12:00:00Z`).getTime()) / 86400000)
        : null,
    };
  } catch {
    return base;
  }
}

/** Data do último post do cliente (qualquer mês). null = nunca postou ou não temos fonte. */
export async function ultimoPostDe(clientId: string): Promise<string | null> {
  try {
    const { data } = await supabaseAdmin
      .from("client_ig_posts").select("posted_at").eq("client_id", clientId)
      .order("posted_at", { ascending: false }).limit(1).maybeSingle();
    if (data?.posted_at) {
      return new Date(data.posted_at as string).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    }
    const { data: card } = await supabaseAdmin
      .from("content_cards").select("status_changed_at")
      .eq("client_id", clientId).eq("status", "published").is("archived_at", null)
      .order("status_changed_at", { ascending: false }).limit(1).maybeSingle();
    if (card?.status_changed_at) {
      return new Date(card.status_changed_at as string).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    }
    return null;
  } catch { return null; }
}

export interface ResumoPostsCliente {
  clientId: string;
  total: number;
  fonte: FontePost;
  ultimoPost: string | null;
  diasSemPostar: number | null;
}

/**
 * Versão em LOTE pro dashboard: uma consulta pra todo mundo, em vez de uma por cliente.
 * (A tela lista 46 clientes — 46 idas ao banco por render era o caminho pra travar tudo.)
 */
export async function postsDoMesEmLote(clientIds: string[], mes = mesAtualBRT()): Promise<Map<string, ResumoPostsCliente>> {
  const out = new Map<string, ResumoPostsCliente>();
  if (!clientIds.length) return out;

  const [ano, m] = mes.split("-").map(Number);
  const inicio = `${mes}-01T00:00:00-03:00`;
  const fim = `${ymdLocal(new Date(Date.UTC(ano, m, 0)))}T23:59:59-03:00`;
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

  try {
    const [{ data: doMes }, { data: todos }] = await Promise.all([
      supabaseAdmin.from("client_ig_posts").select("client_id").in("client_id", clientIds).gte("posted_at", inicio).lte("posted_at", fim),
      supabaseAdmin.from("client_ig_posts").select("client_id, posted_at").in("client_id", clientIds).order("posted_at", { ascending: false }),
    ]);

    const totalPor = new Map<string, number>();
    for (const r of doMes ?? []) {
      const id = r.client_id as string;
      totalPor.set(id, (totalPor.get(id) ?? 0) + 1);
    }
    const ultimoPor = new Map<string, string>();
    for (const r of todos ?? []) {
      const id = r.client_id as string;
      if (ultimoPor.has(id)) continue; // já veio ordenado desc
      ultimoPor.set(id, new Date(r.posted_at as string).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }));
    }

    for (const id of clientIds) {
      const ultimo = ultimoPor.get(id) ?? null;
      out.set(id, {
        clientId: id,
        total: totalPor.get(id) ?? 0,
        fonte: ultimoPor.has(id) || totalPor.has(id) ? "instagram" : "sem-fonte",
        ultimoPost: ultimo,
        diasSemPostar: ultimo
          ? Math.floor((new Date(`${hoje}T12:00:00Z`).getTime() - new Date(`${ultimo}T12:00:00Z`).getTime()) / 86400000)
          : null,
      });
    }
  } catch { /* devolve o que deu */ }
  return out;
}
