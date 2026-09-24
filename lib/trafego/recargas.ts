// lib/trafego/recargas.ts — CALENDÁRIO DE RECARGAS Pix/boleto (Leva 7A, N3). Regras puras.
//
// Conta pré-paga (Pix ou boleto) para quando o saldo acaba. Duas datas decidem quando o cliente
// precisa recarregar: o PRÓXIMO APORTE combinado (clients.next_payment_date, editado em Verba e
// alertas) e o dia em que o saldo ACABA no ritmo dos últimos 3 dias. O prazo é a mais cedo das duas.
//
// O lembrete é um RASCUNHO para uma PESSOA mandar (copiar ou abrir no WhatsApp com o texto pronto).
// Nada aqui envia sozinho — é mensagem para o cliente.
//
// Testado em tests/trafego-recargas.test.ts.

import { diasEntre } from "@/components/traffic/investimento";

export interface ContaRecarga {
  id: string;
  clientName: string;
  /** clients.payment_method: "pix" | "boleto" | "cartao" | null. */
  forma: string | null;
  isPrepaid: boolean;
  saldo: number | null;
  /** Média de gasto por dia (3 dias). */
  ritmoDia: number | null;
  proximoAporte: string | null;
  pixKey: string | null;
  telefone: string | null;
}

export type UrgenciaRecarga = "atrasada" | "hoje" | "semana" | "depois" | "sem_data";

export interface Recarga {
  id: string;
  clientName: string;
  forma: "pix" | "boleto" | "pre";
  saldo: number | null;
  ritmoDia: number | null;
  /** Dia em que o saldo acaba no ritmo atual (AAAA-MM-DD). */
  acabaEm: string | null;
  proximoAporte: string | null;
  /** A mais cedo entre o aporte combinado e o fim do saldo. */
  prazo: string | null;
  /** O que define o prazo. */
  motivo: "aporte" | "saldo" | null;
  diasAtePrazo: number | null;
  urgencia: UrgenciaRecarga;
  /** Rascunho do lembrete (uma pessoa manda). */
  mensagem: string;
  /** wa.me com o texto — null sem telefone do financeiro. */
  linkWhatsApp: string | null;
}

function somar(ymd: string, n: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const ddmm = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Só conta pré-paga paga por Pix/boleto tem recarga (cartão a Meta cobra sozinha). */
export function temRecarga(c: Pick<ContaRecarga, "forma" | "isPrepaid">): boolean {
  if (c.forma === "cartao") return false;
  return c.forma === "pix" || c.forma === "boleto" || c.isPrepaid;
}

export function mensagemRecarga(p: { cliente: string; saldo: number | null; acabaEm: string | null; prazo: string | null; forma: Recarga["forma"]; pixKey: string | null }): string {
  const saldo = p.saldo != null ? ` O saldo da conta de anúncios está em ${brl(p.saldo)}` : " Passando pra lembrar da recarga da conta de anúncios";
  const dura = p.acabaEm ? ` e, no ritmo atual, dura até ${ddmm(p.acabaEm)}.` : ".";
  const pedido = p.prazo
    ? ` Consegue programar a recarga até ${ddmm(p.prazo)} pra as campanhas não pausarem?`
    : " Consegue programar a próxima recarga pra as campanhas não pausarem?";
  const como = p.forma === "boleto"
    ? " Se preferir boleto, a gente gera e manda aqui."
    : p.pixKey ? ` Chave Pix: ${p.pixKey}` : "";
  return `Oi, ${p.cliente}! Tudo bem?${saldo}${dura}${pedido}${como}`;
}

export function montarRecargas(contas: ContaRecarga[], hoje: string): Recarga[] {
  const out: Recarga[] = [];
  for (const c of contas) {
    if (!temRecarga(c)) continue;
    const forma: Recarga["forma"] = c.forma === "pix" ? "pix" : c.forma === "boleto" ? "boleto" : "pre";
    const diasSaldo = c.saldo != null && c.ritmoDia && c.ritmoDia > 0 ? Math.floor(Math.max(0, c.saldo) / c.ritmoDia) : null;
    const acabaEm = diasSaldo != null ? somar(hoje, diasSaldo) : null;
    const candidatos: { data: string; motivo: "aporte" | "saldo" }[] = [];
    if (c.proximoAporte) candidatos.push({ data: c.proximoAporte, motivo: "aporte" });
    // Recarregar UM dia antes de acabar: Pix cai na hora, boleto leva até 3 dias úteis.
    if (acabaEm) candidatos.push({ data: somar(acabaEm, forma === "boleto" ? -3 : -1), motivo: "saldo" });
    candidatos.sort((a, b) => a.data.localeCompare(b.data));
    const escolhido = candidatos[0] ?? null;
    const prazo = escolhido ? (escolhido.data < hoje && escolhido.motivo === "saldo" ? hoje : escolhido.data) : null;
    const diasAtePrazo = prazo ? diasEntre(hoje, prazo) : null;
    const saldoZerado = c.saldo != null && c.saldo <= 0;
    const urgencia: UrgenciaRecarga = diasAtePrazo == null
      ? (saldoZerado ? "atrasada" : "sem_data")
      : diasAtePrazo < 0 || saldoZerado ? "atrasada"
      : diasAtePrazo === 0 ? "hoje"
      : diasAtePrazo <= 7 ? "semana"
      : "depois";
    const mensagem = mensagemRecarga({ cliente: c.clientName, saldo: c.saldo, acabaEm, prazo, forma, pixKey: c.pixKey });
    const tel = (c.telefone ?? "").replace(/\D/g, "");
    out.push({
      id: c.id, clientName: c.clientName, forma, saldo: c.saldo, ritmoDia: c.ritmoDia, acabaEm,
      proximoAporte: c.proximoAporte, prazo, motivo: escolhido?.motivo ?? null, diasAtePrazo, urgencia, mensagem,
      linkWhatsApp: tel ? `https://wa.me/${tel}?text=${encodeURIComponent(mensagem)}` : null,
    });
  }
  const ordem: Record<UrgenciaRecarga, number> = { atrasada: 0, hoje: 1, semana: 2, depois: 3, sem_data: 4 };
  return out.sort((a, b) => ordem[a.urgencia] - ordem[b.urgencia] || (a.prazo ?? "9").localeCompare(b.prazo ?? "9") || a.clientName.localeCompare(b.clientName));
}
