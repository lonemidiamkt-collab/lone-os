// lib/meta/igSnapshot.ts — server-only. Monta o "relatório" de Instagram orgânico de um cliente:
// seguidores + seguidores GANHOS no período + alcance + visualizações + curtidas/comentários +
// engajamento, e os posts do período ORDENADOS por engajamento (curtidas+comentários). Cacheado em
// client_ig_snapshots pra NÃO bater na Meta a cada visita do portal (o que causava rate limit).

import { supabaseAdmin } from "@/lib/supabase/server";

const GRAPH = "https://graph.facebook.com/v21.0";
export type IgPeriod = "7d" | "14d" | "30d";
export const IG_PERIODS: IgPeriod[] = ["7d", "14d", "30d"];
const DAYS: Record<IgPeriod, number> = { "7d": 7, "14d": 14, "30d": 30 };
export const IG_PERIOD_LABEL: Record<IgPeriod, string> = { "7d": "7 dias", "14d": "14 dias", "30d": "30 dias" };
export function normalizeIgPeriod(v?: string | null): IgPeriod {
  return v === "7d" || v === "14d" || v === "30d" ? v : "7d";
}

async function getMetaToken(): Promise<string | null> {
  const { data } = await supabaseAdmin.from("agency_settings").select("key, value").in("key", ["meta_token", "meta_token_expires_at"]);
  const map = new Map((data ?? []).map((r) => [r.key as string, r.value as string]));
  const token = map.get("meta_token");
  const exp = map.get("meta_token_expires_at") ? parseInt(map.get("meta_token_expires_at")!, 10) : null;
  if (!token || (exp && exp < Date.now())) return null;
  return token;
}

export interface IgPost {
  id: string; tipo: string; thumb: string | null; permalink: string | null;
  curtidas: number | null; comentarios: number | null; views: number | null;
  alcance: number | null; engajamento: number; data: string | null;
}
export interface IgAudiencia {
  generoMascPct: number | null;
  generoFemPct: number | null;
  idades: { faixa: string; pct: number }[]; // ordenado desc
  cidades: { nome: string; pct: number }[]; // top 3
}
export interface IgSnapshot {
  mapped: boolean;
  error?: string;
  needsReconnect?: boolean;
  periodo: IgPeriod;
  periodoLabel?: string;
  conta?: { username: string; seguidores: number | null; posts: number | null };
  resumo?: {
    alcance: number | null;
    seguidoresGanhos: number | null;
    curtidas: number;
    comentarios: number;
    engajamento: number;
    postsNoPeriodo: number;
  };
  audiencia?: IgAudiencia;
  posts?: IgPost[];
}

// Demografia dos seguidores por breakdown (city | age | gender). follower_demographics é lifetime,
// metric_type=total_value. Best-effort → null se a conta não libera (ex.: <100 seguidores) ou erro.
async function fetchFollowerBreakdown(igId: string, breakdown: string, token: string): Promise<{ key: string; value: number }[] | null> {
  try {
    const r = await fetch(`${GRAPH}/${igId}/insights?metric=follower_demographics&period=lifetime&metric_type=total_value&breakdown=${breakdown}&access_token=${token}`);
    const j = await r.json().catch(() => ({}));
    if (j?.error) return null;
    const results = j.data?.[0]?.total_value?.breakdowns?.[0]?.results;
    if (!Array.isArray(results)) return null;
    return results.map((x: { dimension_values?: string[]; value?: number }) => ({ key: (x.dimension_values || [])[0] || "?", value: x.value || 0 }));
  } catch { return null; }
}

async function buildAudiencia(igId: string, token: string): Promise<IgAudiencia | undefined> {
  const [cityBd, ageBd, genderBd] = await Promise.all([
    fetchFollowerBreakdown(igId, "city", token),
    fetchFollowerBreakdown(igId, "age", token),
    fetchFollowerBreakdown(igId, "gender", token),
  ]);
  if (!cityBd && !ageBd && !genderBd) return undefined;

  let generoMascPct: number | null = null, generoFemPct: number | null = null;
  if (genderBd) {
    const m = genderBd.find((x) => x.key === "M")?.value || 0;
    const f = genderBd.find((x) => x.key === "F")?.value || 0;
    const tot = m + f;
    if (tot > 0) { generoMascPct = Math.round((m / tot) * 1000) / 10; generoFemPct = Math.round((f / tot) * 1000) / 10; }
  }

  let idades: { faixa: string; pct: number }[] = [];
  if (ageBd) {
    const tot = ageBd.reduce((s, x) => s + x.value, 0);
    if (tot > 0) idades = ageBd.slice().sort((a, b) => b.value - a.value).map((x) => ({ faixa: x.key, pct: Math.round((x.value / tot) * 1000) / 10 }));
  }

  let cidades: { nome: string; pct: number }[] = [];
  if (cityBd) {
    const tot = cityBd.reduce((s, x) => s + x.value, 0);
    if (tot > 0) cidades = cityBd.slice().sort((a, b) => b.value - a.value).slice(0, 3).map((x) => ({ nome: x.key, pct: Math.round((x.value / tot) * 1000) / 10 }));
  }

  return { generoMascPct, generoFemPct, idades, cidades };
}

// Soma uma série diária de insight (reach, follower_count…) num intervalo. Best-effort → null se falhar.
async function somaInsightDiario(igId: string, metric: string, since: string, until: string, token: string): Promise<number | null> {
  try {
    const r = await fetch(`${GRAPH}/${igId}/insights?metric=${metric}&period=day&since=${since}&until=${until}&access_token=${token}`);
    const j = await r.json().catch(() => ({}));
    if (j?.error) return null;
    const vals = (j.data?.[0]?.values ?? []) as { value: number }[];
    if (!vals.length) return null;
    return vals.reduce((s, v) => s + (v.value || 0), 0);
  } catch { return null; }
}

export async function buildIgSnapshot(clientId: string, periodo: IgPeriod): Promise<IgSnapshot> {
  const { data: cli } = await supabaseAdmin.from("clients").select("ig_business_account_id").eq("id", clientId).maybeSingle();
  const igId = cli?.ig_business_account_id as string | null;
  if (!igId) return { mapped: false, periodo };

  const token = await getMetaToken();
  if (!token) return { mapped: true, periodo, error: "Token Meta não configurado ou expirado" };

  const acctRes = await fetch(`${GRAPH}/${igId}?fields=username,followers_count,media_count&access_token=${token}`);
  const acct = await acctRes.json().catch(() => ({}));
  if (!acctRes.ok || acct.error) {
    const err = acct?.error;
    return { mapped: true, periodo, error: err?.message || `HTTP ${acctRes.status}`, needsReconnect: err?.code === 190 || err?.code === 200 || err?.code === 10 };
  }

  const dias = DAYS[periodo];
  const desde = new Date(Date.now() - dias * 86400000);
  const sinceStr = desde.toISOString().slice(0, 10);
  const untilStr = new Date().toISOString().slice(0, 10);

  // Insights de conta no período (best-effort): alcance (reach) e seguidores ganhos (follower_count).
  // + demografia do público (gênero/idade/cidades) — lifetime, não depende do período.
  const [alcance, seguidoresGanhos, audiencia] = await Promise.all([
    somaInsightDiario(igId, "reach", sinceStr, untilStr, token),
    somaInsightDiario(igId, "follower_count", sinceStr, untilStr, token),
    buildAudiencia(igId, token),
  ]);

  // Posts do período.
  const mediaRes = await fetch(`${GRAPH}/${igId}/media?fields=id,media_type,thumbnail_url,media_url,permalink,timestamp,like_count,comments_count&limit=50&access_token=${token}`);
  const mediaJson = await mediaRes.json().catch(() => ({}));
  const media = ((mediaJson.data ?? []) as Array<Record<string, unknown>>).filter((m) => {
    const ts = (m.timestamp as string) || "";
    return ts >= desde.toISOString();
  });

  const posts: IgPost[] = await Promise.all(media.map(async (m) => {
    const tipo = (m.media_type as string) || "";
    const metricas = tipo === "VIDEO" || tipo === "REELS" ? "reach,video_views" : "reach";
    let reach: number | null = null, views: number | null = null;
    try {
      const ir = await fetch(`${GRAPH}/${m.id}/insights?metric=${metricas}&access_token=${token}`);
      const ij = await ir.json().catch(() => ({}));
      for (const row of (ij.data ?? []) as Array<{ name: string; values: { value: number }[] }>) {
        const v = row.values?.[0]?.value ?? null;
        if (row.name === "reach") reach = v; else if (row.name === "video_views") views = v;
      }
    } catch { /* ok */ }
    const curtidas = (m.like_count as number) ?? null;
    const comentarios = (m.comments_count as number) ?? null;
    return {
      id: m.id as string, tipo,
      thumb: (m.thumbnail_url as string) || (m.media_url as string) || null,
      permalink: (m.permalink as string) || null,
      curtidas, comentarios, views, alcance: reach,
      engajamento: (curtidas || 0) + (comentarios || 0),
      data: (m.timestamp as string) || null,
    };
  }));

  // Ordena por engajamento (mais engajados primeiro) — o relatório mostra os destaques do período.
  posts.sort((a, b) => b.engajamento - a.engajamento);

  const resumo = {
    alcance,
    seguidoresGanhos,
    curtidas: posts.reduce((s, p) => s + (p.curtidas || 0), 0),
    comentarios: posts.reduce((s, p) => s + (p.comentarios || 0), 0),
    engajamento: posts.reduce((s, p) => s + p.engajamento, 0),
    postsNoPeriodo: posts.length,
  };

  return {
    mapped: true, periodo, periodoLabel: IG_PERIOD_LABEL[periodo],
    conta: { username: acct.username as string, seguidores: (acct.followers_count as number) ?? null, posts: (acct.media_count as number) ?? null },
    resumo, audiencia, posts,
  };
}

const TTL_MS = 6 * 60 * 60 * 1000; // 6h

// Lê do cache (client_ig_snapshots); se velho/ausente, monta fresco e grava. force=true ignora o cache.
export async function getIgSnapshotCached(clientId: string, periodo: IgPeriod, force = false): Promise<IgSnapshot> {
  if (!force) {
    const { data: cached } = await supabaseAdmin
      .from("client_ig_snapshots").select("data, generated_at")
      .eq("client_id", clientId).eq("period_kind", periodo).maybeSingle();
    if (cached && Date.now() - new Date(cached.generated_at as string).getTime() < TTL_MS) {
      return cached.data as unknown as IgSnapshot;
    }
  }
  const snap = await buildIgSnapshot(clientId, periodo);
  // Só cacheia resultado útil (mapeado, sem erro) pra não gravar erro transitório (ex: rate limit).
  if (snap.mapped && !snap.error) {
    await supabaseAdmin.from("client_ig_snapshots").upsert(
      { client_id: clientId, period_kind: periodo, data: snap as unknown as Record<string, unknown>, generated_at: new Date().toISOString() },
      { onConflict: "client_id,period_kind" },
    );
  }
  return snap;
}
