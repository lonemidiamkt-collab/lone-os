// lib/contracts/arquivo-mes.ts — o mês de um contrato assinado, sem nada de servidor (a tela também usa).

/** "2026-10" no fuso de Brasília. Contrato assinado às 22h do dia 31 é do mês do dia 31, não do seguinte. */
export function mesDe(iso: string): string {
  const d = new Date(new Date(iso).getTime() - 3 * 3600_000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
/** "2026-10" → "outubro de 2026". */
export const nomeDoMes = (mes: string) => `${MESES[Number(mes.slice(5, 7)) - 1] ?? mes} de ${mes.slice(0, 4)}`;
