import * as Sentry from "@sentry/nextjs";
import { supabaseAdmin } from "@/lib/supabase/server";
import {
  getInsightsByDateRange,
  getTopAdInsights,
  getAdThumbnail,
  getDemographicBreakdown,
} from "@/lib/meta/api";
import { countMessagesFromActions } from "@/lib/meta/messages";
import { fetchAccountReach } from "@/lib/meta/insights-server";
import { hojeSP } from "@/lib/clients/pausa";
import type { PeriodKind, SnapshotData, CreativeItem, DemographicRow, AdsStatus } from "./types";

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

// ── Datas do período ──────────────────────────────────────────────────────
// Tudo em "YYYY-MM-DD" de São Paulo: o container roda em UTC, e a conta com setDate/setMonth no
// relógio local fazia "ontem" e "começo do mês" pularem um dia à noite.
function somaDias(ymd: string, n: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function inicioDoMes(ymd: string, offset = 0): string {
  const [y, m] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + offset, 1, 12)).toISOString().slice(0, 10);
}

function fimDoMes(ymd: string, offset = 0): string {
  const [y, m] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m + offset, 0, 12)).toISOString().slice(0, 10);
}

function diasNoIntervalo(inicio: string, fim: string): number {
  return Math.round((Date.parse(`${fim}T12:00:00Z`) - Date.parse(`${inicio}T12:00:00Z`)) / 86_400_000) + 1;
}

const LABELS: Record<PeriodKind, string> = {
  last_week: "Últimos 7 dias",
  last_2_weeks: "Últimas 2 semanas",
  this_month: "Este mês",
  last_month: "Mês passado",
};

/** Janela do período e a janela de comparação, no calendário de São Paulo. Pura (testada). */
export function calcPeriod(kind: PeriodKind, now: Date) {
  const hoje = hojeSP(now);
  const ontem = somaDias(hoje, -1);

  let start: string, end: string, prevStart: string, prevEnd: string;

  if (kind === "last_week" || kind === "last_2_weeks") {
    const dias = kind === "last_week" ? 7 : 14;
    end = ontem;
    start = somaDias(ontem, -(dias - 1));
    prevEnd = somaDias(start, -1);
    prevStart = somaDias(prevEnd, -(dias - 1));
  } else if (kind === "this_month") {
    start = inicioDoMes(hoje);
    // Dia 1º: "ontem" é do mês passado — a janela vira só hoje, nunca início depois do fim.
    end = ontem < start ? hoje : ontem;
    // Compara com os MESMOS dias do mês passado (1º a N), que é o que "que o mês passado" promete.
    prevStart = inicioDoMes(hoje, -1);
    const fimMesPassado = fimDoMes(hoje, -1);
    const candidato = somaDias(prevStart, diasNoIntervalo(start, end) - 1);
    prevEnd = candidato < fimMesPassado ? candidato : fimMesPassado;
  } else {
    start = inicioDoMes(hoje, -1);
    end = fimDoMes(hoje, -1);
    prevStart = inicioDoMes(hoje, -2);
    prevEnd = fimDoMes(hoje, -2);
  }

  return {
    start,
    end,
    label: LABELS[kind],
    previous_start: prevStart,
    previous_end: prevEnd,
  };
}

function delta(current: number, previous: number): { delta_pct: number | null; direction: "up" | "down" | "neutral" } {
  if (previous === 0) return { delta_pct: null, direction: "neutral" };
  const pct = ((current - previous) / previous) * 100;
  return { delta_pct: Math.round(pct * 10) / 10, direction: pct > 1 ? "up" : pct < -1 ? "down" : "neutral" };
}

/** `erro` = não deu pra saber (banco falhou); `null` = não há token válido (ausente ou vencido). */
async function getMetaToken(): Promise<{ token: string | null; erro: boolean }> {
  const { data, error } = await supabaseAdmin
    .from("agency_settings")
    .select("key, value")
    .in("key", ["meta_token", "meta_token_expires_at"]);
  if (error) return { token: null, erro: true };
  const map = new Map((data ?? []).map((r: { key: string; value: string }) => [r.key, r.value]));
  const token = map.get("meta_token");
  const expiresAt = map.get("meta_token_expires_at") ? parseInt(map.get("meta_token_expires_at")!, 10) : null;
  if (!token) return { token: null, erro: false };
  if (expiresAt && expiresAt < Date.now()) return { token: null, erro: false };
  return { token, erro: false };
}

/**
 * Conta de anúncio do cliente. `indefinida` = existe conta, mas não dá pra afirmar qual/ler agora
 * (consulta falhou, ou duas contas sem a principal marcada). Isso NÃO é "sem conta".
 */
async function contaDoCliente(clientId: string): Promise<{ conta: string | null; indefinida: string | null }> {
  const [{ data: linhas, error }, { data: cli, error: errCli }] = await Promise.all([
    supabaseAdmin.from("ad_accounts").select("meta_account_id").eq("client_id", clientId),
    supabaseAdmin.from("clients").select("meta_ad_account_id").eq("id", clientId).maybeSingle(),
  ]);
  if (error || errCli) return { conta: null, indefinida: `consulta: ${(error ?? errCli)?.message}` };
  const principal = (cli?.meta_ad_account_id as string | null) || null;
  const contas = [...new Set((linhas ?? []).map((l) => l.meta_account_id as string).filter(Boolean))];
  if (contas.length === 1) return { conta: contas[0], indefinida: null };
  if (contas.length === 0) return { conta: principal, indefinida: null };
  // Duas contas: a do cadastro do cliente é a principal (é ela que o /clients mantém em ad_accounts).
  if (principal && contas.includes(principal)) return { conta: principal, indefinida: null };
  return { conta: null, indefinida: `${contas.length} contas sem principal` };
}

/** Snapshot "não sei agora": números null (nunca 0) para nenhuma tela ler como "não rodou nada". */
function snapshotIndisponivel(
  periodKind: PeriodKind,
  period: ReturnType<typeof calcPeriod>,
  agency_actions: SnapshotData["agency_actions"],
): SnapshotData {
  const nada = { value: null, delta_pct: null, direction: "neutral" as const };
  return {
    ads_status: "indisponivel",
    period: { kind: periodKind, ...period },
    kpis: { messages: nada, spend: nada, cpa: nada, reach: nada },
    chart: { days: [], series: { messages: [], clicks: [], spend: [], reach: [] }, peak: null },
    top_creatives: [],
    demographics: { gender: null, age_ranges: [] },
    agency_actions,
    generated_at: new Date().toISOString(),
  };
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
  // Antes: `.single()` + token vencido caíam todos em "sem_conta" (zeros de verdade) e iam pro cache
  // de 6h. Falha de consulta, duas contas ou token vencido agora são "indisponível": não é zero.
  const { conta: metaAccountId, indefinida } = await contaDoCliente(params.clientId);
  const tk = metaAccountId ? await getMetaToken() : { token: null, erro: false };
  const metaToken = tk.token;

  const emptyKpi = { value: 0, delta_pct: null, direction: "neutral" as const };
  const emptyChart = {
    days: [],
    series: { messages: [], clicks: [], spend: [], reach: [] },
    peak: null,
  };

  if (indefinida || (metaAccountId && !metaToken)) {
    const motivo = indefinida ?? (tk.erro ? "token: consulta falhou" : "token Meta ausente ou vencido");
    console.error(`[buildSnapshot] ${params.clientId} ${params.periodKind} → indisponivel: ${motivo}`);
    Sentry.captureMessage("Portal: snapshot indisponivel", {
      level: "error",
      extra: { clientId: params.clientId, periodKind: params.periodKind, motivos: motivo },
    });
    return snapshotIndisponivel(params.periodKind, period, agency_actions);
  }

  if (!metaToken || !metaAccountId) {
    return {
      // Zero aqui é a verdade: o cliente não tem tráfego conosco (ex.: pacote só de social).
      ads_status: "sem_conta",
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
  const [currentInsights, prevInsights, adInsights, demographics, curReachR, prevReachR] = await Promise.allSettled([
    getInsightsByDateRange(metaAccountId, metaToken, period.start, period.end),
    getInsightsByDateRange(metaAccountId, metaToken, period.previous_start, period.previous_end),
    getTopAdInsights(metaAccountId, metaToken, period.start, period.end, 10),
    getDemographicBreakdown(metaAccountId, metaToken, period.start, period.end),
    // Alcance DEDUPLICADO no nível da conta (Meta dedup numa chamada só). Somar o reach diário
    // super-conta (mesma pessoa atingida em 2 dias = 2). Usa a janela exata do período.
    fetchAccountReach(metaToken, metaAccountId, 7, period.start, period.end),
    fetchAccountReach(metaToken, metaAccountId, 7, period.previous_start, period.previous_end),
  ]);

  const cur = currentInsights.status === "fulfilled" ? currentInsights.value : [];
  const prev = prevInsights.status === "fulfilled" ? prevInsights.value : [];
  const ads = adInsights.status === "fulfilled" ? adInsights.value : [];
  const demo = demographics.status === "fulfilled" ? demographics.value : [];
  const curReachDedup  = curReachR.status === "fulfilled" ? curReachR.value : null;
  const prevReachDedup = prevReachR.status === "fulfilled" ? prevReachR.value : null;

  // ── Este snapshot é confiável? ────────────────────────────────────────────
  // O período ATUAL é o que o cliente lê na tela. Se ele falhou, o snapshot inteiro é lixo: verba
  // R$0, 0 mensagens, gráfico vazio — indistinguível de "não anunciamos nada essa semana". Foi o
  // que aconteceu em 19/07 e 10/08 com todos os clientes de uma vez.
  //
  // Repare que o comparativo (período anterior) NÃO entra aqui: sem ele o painel perde só a seta
  // de variação, e isso não justifica esconder os números do cliente.
  const falhouEssencial = currentInsights.status === "rejected";
  const falhouSecundario = adInsights.status === "rejected" || demographics.status === "rejected";

  const ads_status: AdsStatus = falhouEssencial ? "indisponivel" : falhouSecundario ? "parcial" : "ok";

  if (falhouEssencial || falhouSecundario) {
    const motivos = [
      currentInsights.status === "rejected" && `atual: ${currentInsights.reason}`,
      prevInsights.status === "rejected" && `anterior: ${prevInsights.reason}`,
      adInsights.status === "rejected" && `criativos: ${adInsights.reason}`,
      demographics.status === "rejected" && `demografia: ${demographics.reason}`,
    ].filter(Boolean).join(" | ");
    console.error(`[buildSnapshot] ${params.clientId} ${params.periodKind} → ${ads_status}: ${motivos}`);
    Sentry.captureMessage(`Portal: snapshot ${ads_status}`, {
      level: falhouEssencial ? "error" : "warning",
      extra: { clientId: params.clientId, periodKind: params.periodKind, motivos },
    });
  }
  if (falhouEssencial) return snapshotIndisponivel(params.periodKind, period, agency_actions);

  // ── KPIs período atual ────────────────────────────────────────────────────
  const sumNum = (rows: typeof cur, field: keyof typeof cur[0]) =>
    rows.reduce((acc, r) => acc + (parseFloat(r[field] as string) || 0), 0);

  const curMessages = cur.reduce((acc, r) => acc + countMessagesFromActions(r.actions), 0);
  const curSpend    = sumNum(cur, "spend");
  // Alcance: usa o dedup da conta; só cai na soma diária (super-conta) se a API falhar.
  const curReach    = curReachDedup ?? sumNum(cur, "reach");
  const curCpa: number | null  = curMessages > 0 ? curSpend / curMessages : null;

  const prevMessages = prev.reduce((acc, r) => acc + countMessagesFromActions(r.actions), 0);
  const prevSpend    = sumNum(prev, "spend");
  const prevReach    = prevReachDedup ?? sumNum(prev, "reach");
  const prevCpa: number | null = prevMessages > 0 ? prevSpend / prevMessages : null;

  // ── Chart (série diária) ──────────────────────────────────────────────────
  const sortedDays = [...cur].sort((a, b) => a.date_start.localeCompare(b.date_start));
  const days = sortedDays.map((r) => r.date_start);
  const msgSeries  = sortedDays.map((r) => countMessagesFromActions(r.actions));
  // Mesmo dia relativo do período anterior (a Meta omite dia sem veiculação: ausente = 0; dia além
  // do fim do período anterior, ex. 31/mar × fevereiro, não existe = null).
  const prevPorDia = new Map(prev.map((r) => [r.date_start, countMessagesFromActions(r.actions)]));
  const previous_messages = prevInsights.status === "fulfilled"
    ? days.map((d) => {
        const par = somaDias(period.previous_start, diasNoIntervalo(period.start, d) - 1);
        return par > period.previous_end ? null : prevPorDia.get(par) ?? 0;
      })
    : null;
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
    ads_status,
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
      previous_messages,
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
