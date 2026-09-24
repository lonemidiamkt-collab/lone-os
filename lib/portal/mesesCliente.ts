// lib/portal/mesesCliente.ts — quais meses o CLIENTE pode lançar pelo link da Ficha Viva.
import { hojeSP } from "@/lib/clients/pausa";

/** ["YYYY-MM" do mês anterior, "YYYY-MM" do mês atual], no calendário de São Paulo. Pura (testada). */
export function mesesPermitidosCliente(agora: Date = new Date()): [string, string] {
  const [y, m] = hojeSP(agora).split("-").map(Number);
  const atual = `${y}-${String(m).padStart(2, "0")}`;
  const anterior = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  return [anterior, atual];
}

/** "YYYY-MM" do primeiro mês de uma janela de `n` meses que termina no mês atual (SP). */
export function inicioJanelaMeses(n: number, agora: Date = new Date()): string {
  const [y, m] = hojeSP(agora).split("-").map(Number);
  const total = y * 12 + (m - 1) - (n - 1);
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}
