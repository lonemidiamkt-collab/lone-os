// Helpers de timezone para Meta API — todas as datas em BRT (America/Sao_Paulo).
// NUNCA usar toISOString().slice(0,10) para construir datas de relatório:
// isso produz UTC e pode pegar o dia errado entre 21h–00h BRT.

const BRT = "America/Sao_Paulo";

export function toBRTDateStr(d: Date): string {
  return d.toLocaleDateString("sv-SE", { timeZone: BRT }); // "YYYY-MM-DD"
}

export function getDateRangeBRT(
  days: number,
  from: Date = new Date(),
): { since: string; until: string } {
  const until = new Date(from);
  until.setDate(until.getDate() - 1);
  const since = new Date(until);
  since.setDate(since.getDate() - (days - 1));
  return { since: toBRTDateStr(since), until: toBRTDateStr(until) };
}
