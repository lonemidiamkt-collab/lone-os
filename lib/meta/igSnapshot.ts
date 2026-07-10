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
export interface IgSnapshot {
  mapped: boolean;
  error?: string;
  needsReconnect?: boolean;
  periodo: IgPeriod;
  periodoLabel?: string;
  conta?: { username: string; seguidores: number | null; posts: number | null };
  resumo?: {
    alcance: number | null;
    visualizacoes: number;
    seguidoresGanhos: number | null;
    curtidas: number;
    comentarios: number;
    engajamento: number;
    postsNoPeriodo: number;
  };
  posts?: IgPost[];
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
  const [alcance, seguidoresGanhos] = await Promise.all([
    somaInsightDiario(igId, "reach", sinceStr, untilStr, token),
    somaInsightDiario(igId, "follower_count", sinceStr, untilStr, token),
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
    visualizacoes: posts.reduce((s, p) => s + (p.views || 0), 0),
    seguidoresGanhos,
    curtidas: posts.reduce((s, p) => s + (p.curtidas || 0), 0),
    comentarios: posts.reduce((s, p) => s + (p.comentarios || 0), 0),
    engajamento: posts.reduce((s, p) => s + p.engajamento, 0),
    postsNoPeriodo: posts.length,
  };

  return {
    mapped: true, periodo, periodoLabel: IG_PERIOD_LABEL[periodo],
    conta: { username: acct.username as string, seguidores: (acct.followers_count as number) ?? null, posts: (acct.media_count as number) ?? null },
    resumo, posts,
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
