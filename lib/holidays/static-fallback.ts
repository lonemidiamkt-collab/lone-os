/**
 * Lista estática de feriados nacionais brasileiros — fallback caso a Brasil API esteja fora.
 * Inclui datas fixas (1º/jan, 7/set, etc.) e algumas datas móveis pré-calculadas (Carnaval, Páscoa, Corpus Christi).
 *
 * Atualizar anualmente até 2030. Após isso, dependerá só da Brasil API
 * (que sempre estará atualizada).
 *
 * Os feriados móveis foram pré-calculados pelos algoritmos de Páscoa Gauss/Computus.
 */

export interface StaticHoliday {
  date: string;       // YYYY-MM-DD
  name: string;
  type: "national";
}

const FIXED_HOLIDAYS_TEMPLATE = [
  { mmdd: "01-01", name: "Confraternização Universal" },
  { mmdd: "04-21", name: "Tiradentes" },
  { mmdd: "05-01", name: "Dia do Trabalho" },
  { mmdd: "09-07", name: "Independência do Brasil" },
  { mmdd: "10-12", name: "Nossa Senhora Aparecida" },
  { mmdd: "11-02", name: "Finados" },
  { mmdd: "11-15", name: "Proclamação da República" },
  { mmdd: "11-20", name: "Consciência Negra" },           // nacional desde 2024
  { mmdd: "12-25", name: "Natal" },
];

// Feriados móveis pré-calculados (data + nome) por ano
const MOVABLE_HOLIDAYS: Record<number, Array<{ date: string; name: string }>> = {
  2025: [
    { date: "2025-03-03", name: "Carnaval (segunda)" },
    { date: "2025-03-04", name: "Carnaval (terça)" },
    { date: "2025-04-18", name: "Sexta-feira Santa" },
    { date: "2025-06-19", name: "Corpus Christi" },
  ],
  2026: [
    { date: "2026-02-16", name: "Carnaval (segunda)" },
    { date: "2026-02-17", name: "Carnaval (terça)" },
    { date: "2026-04-03", name: "Sexta-feira Santa" },
    { date: "2026-06-04", name: "Corpus Christi" },
  ],
  2027: [
    { date: "2027-02-08", name: "Carnaval (segunda)" },
    { date: "2027-02-09", name: "Carnaval (terça)" },
    { date: "2027-03-26", name: "Sexta-feira Santa" },
    { date: "2027-05-27", name: "Corpus Christi" },
  ],
  2028: [
    { date: "2028-02-28", name: "Carnaval (segunda)" },
    { date: "2028-02-29", name: "Carnaval (terça)" },
    { date: "2028-04-14", name: "Sexta-feira Santa" },
    { date: "2028-06-15", name: "Corpus Christi" },
  ],
  2029: [
    { date: "2029-02-12", name: "Carnaval (segunda)" },
    { date: "2029-02-13", name: "Carnaval (terça)" },
    { date: "2029-03-30", name: "Sexta-feira Santa" },
    { date: "2029-05-31", name: "Corpus Christi" },
  ],
  2030: [
    { date: "2030-03-04", name: "Carnaval (segunda)" },
    { date: "2030-03-05", name: "Carnaval (terça)" },
    { date: "2030-04-19", name: "Sexta-feira Santa" },
    { date: "2030-06-20", name: "Corpus Christi" },
  ],
};

export function getStaticHolidays(year: number): StaticHoliday[] {
  const fixed: StaticHoliday[] = FIXED_HOLIDAYS_TEMPLATE.map((h) => ({
    date: `${year}-${h.mmdd}`,
    name: h.name,
    type: "national",
  }));
  const movable: StaticHoliday[] = (MOVABLE_HOLIDAYS[year] ?? []).map((h) => ({
    date: h.date,
    name: h.name,
    type: "national",
  }));
  return [...fixed, ...movable].sort((a, b) => a.date.localeCompare(b.date));
}
