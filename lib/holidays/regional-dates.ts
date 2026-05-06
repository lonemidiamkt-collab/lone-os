/**
 * Feriados estaduais (UF) e municipais (cidades) curados.
 *
 * Por enquanto cobre apenas:
 *   - Estado do Rio de Janeiro (UF=RJ)
 *   - Região dos Lagos / cidades onde a Lone Mídia atende
 *
 * Pra adicionar uma nova cidade ou estado:
 *   1. Adicione entrada no array STATE_HOLIDAYS ou MUNICIPAL_HOLIDAYS
 *   2. Use forma canônica do nome da cidade (sem acento batendo, ex.: "Saquarema")
 *   3. O matching contra `client.enderecoCidade` é case-insensitive +
 *      tolerante a acentos (ver normalize() em lib/holidays/match.ts)
 *
 * Datas com `mmdd` repetem todo ano. Pra datas variáveis (raras pra
 * feriados regionais), usar a forma `date: YYYY-MM-DD` direto.
 */

export interface StateHoliday {
  mmdd: string;     // "MM-DD" — repete todo ano
  name: string;
  uf: string;       // sigla do estado, ex.: "RJ"
}

export interface MunicipalHoliday {
  mmdd: string;
  name: string;
  uf: string;
  cities: string[]; // canonical city names (lookup é case-insensitive)
}

// ─── Feriados ESTADUAIS ─────────────────────────────────────
export const STATE_HOLIDAYS: ReadonlyArray<StateHoliday> = [
  // Rio de Janeiro — feriado estadual oficial pela Lei nº 5.198/2008
  { mmdd: "04-23", name: "Dia de São Jorge", uf: "RJ" },
];

// ─── Feriados/Datas MUNICIPAIS ──────────────────────────────
// Foco inicial: Região dos Lagos, RJ. Expandir conforme necessidade.
export const MUNICIPAL_HOLIDAYS: ReadonlyArray<MunicipalHoliday> = [
  // Saquarema — confirmado pelo time
  { mmdd: "05-08", name: "Aniversário de Saquarema", uf: "RJ", cities: ["Saquarema"] },

  // ⚠️ As datas abaixo são pré-cadastradas como TODO. Confirmar com o time
  // antes de exibir publicamente. Se incertas, comente a linha.
  // { mmdd: "11-13", name: "Aniversário de Cabo Frio", uf: "RJ", cities: ["Cabo Frio"] },
  // { mmdd: "05-26", name: "Aniversário de Maricá", uf: "RJ", cities: ["Maricá"] },
  // { mmdd: "04-30", name: "Aniversário de Araruama", uf: "RJ", cities: ["Araruama"] },
  // { mmdd: "05-16", name: "Aniversário de São Pedro da Aldeia", uf: "RJ", cities: ["São Pedro da Aldeia"] },
];

/**
 * Normaliza string pra matching tolerante:
 *   - lowercase
 *   - remove acentos
 *   - trim + colapsa whitespace
 */
export function normalizeRegionKey(s: string | undefined | null): string {
  if (!s) return "";
  return s.toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .trim()
    .replace(/\s+/g, " ");
}

export function getStateHolidaysForYear(year: number): Array<{ date: string; name: string; uf: string }> {
  return STATE_HOLIDAYS.map((h) => ({ date: `${year}-${h.mmdd}`, name: h.name, uf: h.uf }));
}

export function getMunicipalHolidaysForYear(year: number): Array<{ date: string; name: string; uf: string; cities: string[] }> {
  return MUNICIPAL_HOLIDAYS.map((h) => ({ date: `${year}-${h.mmdd}`, name: h.name, uf: h.uf, cities: h.cities }));
}
