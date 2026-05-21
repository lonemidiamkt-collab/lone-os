import * as Sentry from "@sentry/nextjs";
import { supabaseAdmin } from "@/lib/supabase/server";
import {
  getInsightsByDateRange,
  getInsightsTotalByDateRange,
  getTopAdInsights,
  getAdThumbnail,
  getDemographicBreakdown,
} from "@/lib/meta/api";
import { countMessagesFromActions } from "@/lib/meta/messages";
import { toBRTDateStr } from "@/lib/meta/timezone";
import type { PeriodKind, SnapshotData, CreativeItem, DemographicRow } from "./types";

const THUMBNAIL_BUCKET = "meta-thumbnails";

/** Baixa thumbnail da Meta CDN e faz cache no nosso Storage.
 *  Retorna o path relativo no bucket (ex: "clientId/adId.jpg") ou null se falhar.
 *  O bucket é público, então a URL final é:
 *    NEXT_PUBLIC_SUPABASE_URL/storage/v1/object/public/meta-thumbnails/{path}
 */
async function cacheMetaThumbnail(
  clientId: string,
  adId: string,
  metaUrl: string,
): Promise<string | null> {
  try {
    const res = await fetch(metaUrl, { signal: AbortSignal.timeout(5_000) });
    if (!res.ok) return null;

    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
    const path = `${clientId}/${adId}.${ext}`;
    const buffer = Buffer.from(await res.arrayBuffer());

    const { error } = await supabaseAdmin.storage
      .from(THUMBNAIL_BUCKET)
      .upload(path, buffer, { contentType, upsert: true });

    if (error) {
      Sentry.captureException(error, { extra: { clientId, adId, source: "meta_thumbnail_cache" } });
      return null;
    }

    return path;
  } catch (err) {
    Sentry.captureException(err, { extra: { clientId, adId, source: "meta_thumbnail_cache" } });
    return null;
  }
}

function toDateStr(d: Date): string {
  return toBRTDateStr(d);
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function startOfMonth(d: Date, offset = 0): Date {
  const s = new Date(d.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  s.setMonth(s.getMonth() + offset, 1);
  s.setHours(0, 0, 0, 0);
  return s;
}

function endOfMonth(d: Date, offset = 0): Date {
  const s = new Date(d.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  s.setMonth(s.getMonth() + offset + 1, 0);
  s.setHours(0, 0, 0, 0);
  return s;
}

function calcPeriod(kind: PeriodKind, now: Date) {
  const yesterday = addDays(now, -1);

  let start: Date, end: Date, prevStart: Date, prevEnd: Date;

  if (kind === "last_week") {
    end = yesterday;
    start = addDays(yesterday, -6);
    prevEnd = addDays(start, -1);
    prevStart = addDays(prevEnd, -6);
  } else if (kind === "last_2_weeks") {
    end = yesterday;
    start = addDays(yesterday, -13);
    prevEnd = addDays(start, -1);
    prevStart = addDays(prevEnd, -13);
  } else if (kind === "this_month") {
    start = startOfMonth(now);
    end = yesterday;
    const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000));
    prevEnd = addDays(start, -1);
    prevStart = addDays(prevEnd, -(days - 1));
  } else {
    // last_month
    start = startOfMonth(now, -1);
    end = endOfMonth(now, -1);
    prevStart = startOfMonth(now, -2);
    prevEnd = endOfMonth(now, -2);
  }

  const LABELS: Record<PeriodKind, string> = {
    last_week: "Últimos 7 dias",
    last_2_weeks: "Últimas 2 semanas",
    this_month: "Este mês",
    last_month: "Mês passado",
  };

  return {
    start: toDateStr(start),
    end: toDateStr(end),
    label: LABELS[kind],
    previous_start: toDateStr(prevStart),
    previous_end: toDateStr(prevEnd),
  };
}

function delta(current: number, previous: number): { delta_pct: number | null; direction: "up" | "down" | "neutral" } {
  if (previous === 0) return { delta_pct: null, direction: "neutral" };
  const pct = ((current - previous) / previous) * 100;
  return { delta_pct: Math.round(pct * 10) / 10, direction: pct > 1 ? "up" : pct < -1 ? "down" : "neutral" };
}

async function getMetaToken(): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("agency_settings")
    .select("key, value")
    .in("key", ["meta_token", "meta_token_expires_at"]);
  const map = new Map((data ?? []).map((r: { key: string; value: string }) => [r.key, r.value]));
  const token = map.get("meta_token");
  const expiresAt = map.get("meta_token_expires_at") ? parseInt(map.get("meta_token_expires_at")!, 10) : null;
  if (!token) return null;
  if (expiresAt && expiresAt < Date.now()) return null;
  return token;
}

export async function buildSnapshot(params: {
  clientId: string;
  periodKind: PeriodKind;
  now?: Date;
}): Promise<SnapshotData> {
  const now = params.now ?? new Date();
  const period = calcPeriod(params.periodKind, now);

  // ── Agency actions (não depende de Meta) ─────────────────────────────────
  const { data: actionsRaw } = await supabaseAdmin
    .from("agency_actions")
    .select("id, action_date, title, description, icon")
    .eq("client_id", params.clientId)
    .eq("visible_to_client", true)
    .gte("action_date", period.start)
    .lte("action_date", period.end)
    .order("action_date", { ascending: false });

  const agency_actions = (actionsRaw ?? []).map((a: Record<string, unknown>) => ({
    id: a.id as string,
    action_date: a.action_date as string,
    title: a.title as string,
    description: (a.description as string) ?? null,
    icon: (a.icon as string) ?? null,
  }));

  // ── Busca conta Meta do cliente ───────────────────────────────────────────
  const { data: account } = await supabaseAdmin
    .from("ad_accounts")
    .select("meta_account_id")
    .eq("client_id", params.clientId)
    .single();

  const metaAccountId = account?.meta_account_id as string | undefined;
  const metaToken = metaAccountId ? await getMetaToken() : null;

  const emptyKpi = { value: 0, delta_pct: null, direction: "neutral" as const };
  const emptyChart = {
    days: [],
    series: { messages: [], clicks: [], spend: [], reach: [] },
    peak: null,
  };

  if (!metaToken || !metaAccountId) {
    return {
      period: { kind: params.periodKind, ...period },
      kpis: { messages: emptyKpi, spend: emptyKpi, cpa: emptyKpi, reach: emptyKpi },
      chart: emptyChart,
      top_creatives: [],
      demographics: { gender: null, age_ranges: [] },
      agency_actions,
      generated_at: new Date().toISOString(),
    };
  }

  // ── Fetch insights em paralelo (período atual + anterior) ─────────────────
  const [currentInsights, prevInsights, currentTotal, prevTotal, adInsights, demographics] = await Promise.allSettled([
    getInsightsByDateRange(metaAccountId, metaToken, period.start, period.end),
    getInsightsByDateRange(metaAccountId, metaToken, period.previous_start, period.previous_end),
    getInsightsTotalByDateRange(metaAccountId, metaToken, period.start, period.end),
    getInsightsTotalByDateRange(metaAccountId, metaToken, period.previous_start, period.previous_end),
    getTopAdInsights(metaAccountId, metaToken, period.start, period.end, 10),
    getDemographicBreakdown(metaAccountId, metaToken, period.start, period.end),
  ]);

  const cur = currentInsights.status === "fulfilled" ? currentInsights.value : [];
  const prev = prevInsights.status === "fulfilled" ? prevInsights.value : [];
  // Totais agregados (sem time_increment) — evitam dupla contagem com janela 7d_click
  const curTotalRow  = currentTotal.status === "fulfilled" ? currentTotal.value : null;
  const prevTotalRow = prevTotal.status === "fulfilled"    ? prevTotal.value    : null;
  const ads = adInsights.status === "fulfilled" ? adInsights.value : [];
  const demo = demographics.status === "fulfilled" ? demographics.value : [];

  // ── KPIs período atual ────────────────────────────────────────────────────
  const sumNum = (rows: typeof cur, field: keyof typeof cur[0]) =>
    rows.reduce((acc, r) => acc + (parseFloat(r[field] as string) || 0), 0);

  // Mensagens: usar total agregado (deduplicado pelo Meta) — fallback para soma diária
  // Nota: curTotalRow != null indica que a chamada retornou uma linha (mesmo se msgs=0).
  // Só cai no fallback se a chamada falhrou completamente (Promise rejected).
  const curMessages  = curTotalRow != null
    ? countMessagesFromActions(curTotalRow.actions)
    : cur.reduce((acc, r) => acc + countMessagesFromActions(r.actions), 0);
  const prevMessages = prevTotalRow != null
    ? countMessagesFromActions(prevTotalRow.actions)
    : prev.reduce((acc, r) => acc + countMessagesFromActions(r.actions), 0);

  const curSpend    = sumNum(cur, "spend");
  const curReach    = sumNum(cur, "reach");
  const curCpa: number | null  = curMessages > 0 ? curSpend / curMessages : null;

  const prevSpend    = sumNum(prev, "spend");
  const prevReach    = sumNum(prev, "reach");
  const prevCpa: number | null = prevMessages > 0 ? prevSpend / prevMessages : null;

  // ── Chart (série diária) ──────────────────────────────────────────────────
  const sortedDays = [...cur].sort((a, b) => a.date_start.localeCompare(b.date_start));
  const days = sortedDays.map((r) => r.date_start);
  const msgSeries  = sortedDays.map((r) => countMessagesFromActions(r.actions));
  const peakIdx    = msgSeries.indexOf(Math.max(...msgSeries));

  // ── Top 5 criativos ───────────────────────────────────────────────────────
  const byMessages = [...ads]
    .map((a) => ({ ...a, msgs: countMessagesFromActions(a.actions) }))
    .sort((a, b) => b.msgs - a.msgs)
    .slice(0, 5);

  const winnerIdx = byMessages.findIndex((a) => {
    const sp = parseFloat(a.spend) || 0;
    const cpa = a.msgs > 5 && sp > 0 ? sp / a.msgs : Infinity;
    return cpa < Infinity;
  });

  const thumbnails = await Promise.allSettled(
    byMessages.map((a) => getAdThumbnail(a.ad_id, metaToken)),
  );

  // Cache thumbnails no nosso Storage para não depender da expiração da Meta CDN
  const thumbnailPaths = await Promise.allSettled(
    byMessages.map((a, i) => {
      const metaUrl = thumbnails[i].status === "fulfilled" ? thumbnails[i].value : null;
      return metaUrl ? cacheMetaThumbnail(params.clientId, a.ad_id, metaUrl) : Promise.resolve(null);
    }),
  );

  const top_creatives: CreativeItem[] = byMessages.map((a, i) => {
    const sp = parseFloat(a.spend) || 0;
    const cpa = a.msgs > 0 ? sp / a.msgs : null;
    return {
      id: a.ad_id,
      name: a.ad_name,
      thumbnail_url: thumbnails[i].status === "fulfilled" ? thumbnails[i].value : null,
      thumbnail_path: thumbnailPaths[i].status === "fulfilled" ? thumbnailPaths[i].value : null,
      messages: a.msgs,
      spend: sp,
      cpa,
      ctr: parseFloat(a.ctr) || 0,
      frequency: parseFloat(a.frequency ?? "0") || 0,
      is_winner: i === winnerIdx && a.msgs > 5,
    };
  });

  // ── Demographics ──────────────────────────────────────────────────────────
  let femalePct = 0, malePct = 0;
  const ageMap = new Map<string, number>();
  let totalReach = 0;

  for (const row of demo as Array<{ age: string; gender: string; reach: string }>) {
    const r = parseInt(row.reach) || 0;
    totalReach += r;
    if (row.gender === "female") femalePct += r;
    if (row.gender === "male")   malePct   += r;

    const age = row.age === "65+" ? "65+" : row.age;
    ageMap.set(age, (ageMap.get(age) ?? 0) + r);
  }

  const genderKnown = femalePct + malePct;
  const gender = genderKnown > 0
    ? {
        female_pct: Math.round((femalePct / genderKnown) * 100),
        male_pct:   Math.round((malePct   / genderKnown) * 100),
      }
    : null;

  const ageOrder = ["18-24", "25-34", "35-44", "45-54", "55-64", "65+"];
  const age_ranges: DemographicRow[] = ageOrder
    .filter((k) => ageMap.has(k))
    .map((k) => ({
      label: k,
      pct: totalReach > 0 ? Math.round(((ageMap.get(k) ?? 0) / totalReach) * 100) : 0,
    }));

  return {
    period: { kind: params.periodKind, ...period },
    kpis: {
      messages: { value: curMessages, ...delta(curMessages, prevMessages) },
      spend:    { value: Math.round(curSpend * 100) / 100, ...delta(curSpend, prevSpend) },
      cpa: curCpa !== null
        ? { value: Math.round(curCpa * 100) / 100, ...delta(curCpa, prevCpa ?? 0) }
        : { value: null, delta_pct: null, direction: "neutral" as const },
      reach:    { value: curReach, ...delta(curReach, prevReach) },
    },
    chart: {
      days,
      series: {
        messages: msgSeries,
        clicks:  sortedDays.map((r) => parseFloat(r.clicks) || 0),
        spend:   sortedDays.map((r) => parseFloat(r.spend)  || 0),
        reach:   sortedDays.map((r) => parseFloat(r.reach)  || 0),
      },
      peak: days.length > 0 && peakIdx >= 0 && msgSeries[peakIdx] > 0
        ? { metric: "messages", day: days[peakIdx], value: msgSeries[peakIdx] }
        : null,
    },
    top_creatives,
    demographics: { gender, age_ranges },
    agency_actions,
    generated_at: new Date().toISOString(),
  };
}
