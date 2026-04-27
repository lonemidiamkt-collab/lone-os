/**
 * Brasil API integration — feriados nacionais.
 * Cache via agency_settings (key=holidays_<year>).
 *
 * Resiliência: se a Brasil API falhar (timeout, 5xx, network), cai pro static-fallback.
 * Isso garante que o time SEMPRE tem feriados disponíveis, mesmo offline.
 */

import { getStaticHolidays, type StaticHoliday } from "./static-fallback";
import { supabaseAdmin } from "@/lib/supabase/server";

export interface Holiday {
  date: string;       // YYYY-MM-DD
  name: string;
  type: string;       // "national" | "estadual" | "municipal" — Brasil API retorna "national" sempre
  source: "api" | "fallback";
}

interface BrasilApiHoliday {
  date: string;
  name: string;
  type: string;
}

const CACHE_PREFIX = "holidays_";
const CACHE_TTL_MS = 30 * 24 * 3600 * 1000; // 30 dias — feriados não mudam
const FETCH_TIMEOUT_MS = 5000;

async function readCache(year: number): Promise<{ holidays: Holiday[]; ageMs: number } | null> {
  const { data } = await supabaseAdmin
    .from("agency_settings")
    .select("value, updated_at")
    .eq("key", `${CACHE_PREFIX}${year}`)
    .maybeSingle();
  if (!data?.value) return null;
  try {
    const holidays = JSON.parse(data.value as string) as Holiday[];
    const ageMs = data.updated_at ? Date.now() - new Date(data.updated_at as string).getTime() : Infinity;
    return { holidays, ageMs };
  } catch {
    return null;
  }
}

async function writeCache(year: number, holidays: Holiday[]): Promise<void> {
  await supabaseAdmin.from("agency_settings").upsert({
    key: `${CACHE_PREFIX}${year}`,
    value: JSON.stringify(holidays),
    updated_at: new Date().toISOString(),
  }, { onConflict: "key" });
}

async function fetchFromApi(year: number): Promise<Holiday[] | null> {
  const url = `https://brasilapi.com.br/api/feriados/v1/${year}`;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    const data = (await res.json()) as BrasilApiHoliday[];
    if (!Array.isArray(data) || data.length === 0) return null;
    return data.map((h) => ({
      date: h.date,
      name: h.name,
      type: h.type ?? "national",
      source: "api" as const,
    }));
  } catch (err) {
    console.warn(`[holidays] Brasil API failed for ${year}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

function fromStatic(year: number): Holiday[] {
  return getStaticHolidays(year).map((h: StaticHoliday) => ({
    date: h.date,
    name: h.name,
    type: h.type,
    source: "fallback" as const,
  }));
}

/**
 * Retorna feriados do ano. Estratégia:
 *   1. Se cache fresco (<= 30d), retorna cache.
 *   2. Senão, tenta Brasil API (timeout 5s).
 *   3. Se API ok, atualiza cache + retorna.
 *   4. Se API falhar mas cache existir (mesmo velho), retorna cache (stale-while-error).
 *   5. Senão, fallback estático (sempre tem algo).
 */
export async function getHolidays(year: number): Promise<Holiday[]> {
  const cached = await readCache(year);
  if (cached && cached.ageMs < CACHE_TTL_MS) {
    return cached.holidays;
  }

  const fresh = await fetchFromApi(year);
  if (fresh && fresh.length > 0) {
    await writeCache(year, fresh).catch((e) => console.warn("[holidays] cache write failed:", e));
    return fresh;
  }

  // API falhou. Se temos cache velho, melhor que nada.
  if (cached) return cached.holidays;

  // Sem nada: usa static. Não cacheia (pra tentar API de novo na próxima request).
  return fromStatic(year);
}

/**
 * Filtra os feriados do mês especificado (1-12).
 */
export function holidaysInMonth(holidays: Holiday[], year: number, month: number): Holiday[] {
  const prefix = `${year}-${String(month).padStart(2, "0")}-`;
  return holidays.filter((h) => h.date.startsWith(prefix));
}

/**
 * Helper pra exibir dia da semana em PT-BR.
 */
export function weekdayPtBr(isoDate: string): string {
  const d = new Date(isoDate + "T12:00:00Z");
  return d.toLocaleDateString("pt-BR", { weekday: "long", timeZone: "America/Sao_Paulo" });
}
