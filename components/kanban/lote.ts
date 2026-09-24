// Criação em lote: datas sugeridas e chave de idempotência por linha.

const SEG_QUA_SEX = [0, 2, 4]; // deslocamento a partir da segunda: postagem é seg/qua/sex

function somaDias(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

/** Dia da semana (0=dom) de um "YYYY-MM-DD" — calendário puro, sem fuso. */
function diaDaSemana(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Seg/qua/sex da PRÓXIMA semana a partir de `hoje` (YYYY-MM-DD em São Paulo). */
export function slotsSegQuaSex(hoje: string): string[] {
  const dow = diaDaSemana(hoje);
  const ateSegunda = ((8 - dow) % 7) || 7;
  const segunda = somaDias(hoje, ateSegunda);
  return SEG_QUA_SEX.map((n) => somaDias(segunda, n));
}

/** Próximo dia de postagem (seg/qua/sex) depois de `ymd`. */
export function proximoSlot(ymd: string): string {
  let d = somaDias(ymd, 1);
  while (![1, 3, 5].includes(diaDaSemana(d))) d = somaDias(d, 1);
  return d;
}

/** Chave estável por linha do lote: repetir o envio não duplica, títulos iguais não se fundem. */
export function chaveDaLinha(loteId: string, linhaId: string): string {
  return `lote|${loteId}|${linhaId}`;
}
