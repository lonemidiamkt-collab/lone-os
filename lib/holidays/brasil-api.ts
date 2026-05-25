/**
 * Brasil API integration — feriados nacionais.
 * Cache via agency_settings (key=holidays_<year>).
 *
 * Resiliência: se a Brasil API falhar (timeout, 5xx, network), cai pro static-fallback.
 * Isso garante que o time SEMPRE tem feriados disponíveis, mesmo offline.
 */

import { getStaticHolidays, type StaticHoliday } from "./static-fallback";
import { getCommemorativeDates, filterByNichos, type CommemorativeDate, type CommemorativeCategory } from "./commemorative-dates";
import { getStateHolidaysForYear, getMunicipalHolidaysForYear, normalizeRegionKey } from "./regional-dates";
import { supabaseAdmin } from "@/lib/supabase/server";

export type HolidayCategory = "national" | "estadual" | "municipal" | CommemorativeCategory;

export interface Holiday {
  date: string;       // YYYY-MM-DD
  name: string;
  type: string;       // legado: "national" | "estadual" | "municipal" — mantido pra retrocompatibilidade
  category: HolidayCategory;
  source: "api" | "fallback" | "static";
  nichos?: string[];
  monthLong?: boolean;
  uf?: string;        // pra estaduais e municipais
  cities?: string[];  // pra municipais
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
    const raw = JSON.parse(data.value as string) as Array<Holiday | (Omit<Holiday, "category"> & { category?: HolidayCategory })>;
    // Retrocompat: cache antigo não tinha `category`, usa "national" como default
    const holidays: Holiday[] = raw.map((h) => ({
      date: h.date,
      name: h.name,
      type: h.type ?? "national",
      category: h.category ?? "national",
      source: h.source,
      nichos: h.nichos,
      monthLong: h.monthLong,
    }));
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
      category: "national" as const,
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
    category: "national" as const,
    source: "fallback" as const,
  }));
}

function commemorativeToHoliday(c: CommemorativeDate): Holiday {
  return {
    date: c.date,
    name: c.name,
    type: c.category,        // legado: type repete category pras comemorativas (callers antigos não filtram por type)
    category: c.category,
    source: "static",
    nichos: c.nichos,
    monthLong: c.monthLong,
  };
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
 * Retorna feriados oficiais (nacionais + estaduais + municipais) + datas
 * comemorativas, ordenados por data.
 *
 * É a função canônica que o calendário e os banners de mês devem consumir.
 */
export async function getAllObservances(year: number): Promise<Holiday[]> {
  const [feriados, comemorativas] = await Promise.all([
    getHolidays(year),
    Promise.resolve(getCommemorativeDates(year).map(commemorativeToHoliday)),
  ]);

  const estaduais: Holiday[] = getStateHolidaysForYear(year).map((s) => ({
    date: s.date, name: s.name, type: "estadual",
    category: "estadual" as const, source: "static" as const, uf: s.uf,
  }));
  const municipais: Holiday[] = getMunicipalHolidaysForYear(year).map((m) => ({
    date: m.date, name: m.name, type: "municipal",
    category: "municipal" as const, source: "static" as const, uf: m.uf, cities: m.cities,
  }));

  return [...feriados, ...estaduais, ...municipais, ...comemorativas]
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Filtra observances pra uma localização específica (estado/cidade).
 *
 * Comportamento:
 *   - national, comercial, cultural, awareness_month, profissao: sempre incluídos
 *   - estadual: incluído se o `uf` da observance bate com o `uf` passado
 *   - municipal: incluído se a cidade do cliente está em `cities` da observance
 *
 * Quando opts é vazio/sem campos, retorna tudo (ex.: calendário geral).
 */
export function observancesForLocation(
  observances: Holiday[],
  opts: { uf?: string; city?: string } = {},
): Holiday[] {
  const targetUf = opts.uf?.toUpperCase();
  const targetCityKey = normalizeRegionKey(opts.city);

  return observances.filter((o) => {
    if (o.category === "estadual") {
      if (!targetUf) return false; // sem filtro estadual → não mostra estaduais (estamos filtrando p/ cliente)
      return o.uf?.toUpperCase() === targetUf;
    }
    if (o.category === "municipal") {
      if (!targetCityKey) return false;
      return (o.cities ?? []).some((c) => normalizeRegionKey(c) === targetCityKey);
    }
    return true;
  });
}

/**
 * Filtra os feriados do mês especificado (1-12).
 */
export function holidaysInMonth(holidays: Holiday[], year: number, month: number): Holiday[] {
  const prefix = `${year}-${String(month).padStart(2, "0")}-`;
  return holidays.filter((h) => h.date.startsWith(prefix));
}

/**
 * Filtra observances pra um conjunto de nichos (deixa todos exceto profissões
 * que não casam com o cliente). Reusa a lógica de commemorative-dates.
 */
export function observancesForNichos(observances: Holiday[], nichos: string[]): Holiday[] {
  if (nichos.length === 0) return observances;
  return observances.filter((h) => {
    if (h.category !== "profissao") return true;
    if (!h.nichos || h.nichos.length === 0) return true;
    return h.nichos.some((n) => nichos.includes(n));
  });
}

// Re-export para componentes
export { filterByNichos };
export type { CommemorativeDate, CommemorativeCategory };

/**
 * Helper pra exibir dia da semana em PT-BR.
 */
export function weekdayPtBr(isoDate: string): string {
  const d = new Date(isoDate + "T12:00:00Z");
  return d.toLocaleDateString("pt-BR", { weekday: "long", timeZone: "America/Sao_Paulo" });
}
