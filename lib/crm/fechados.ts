// lib/crm/fechados.ts — a aba "Fechados" do Comercial (out/2026).
//
// POR QUE: o Roberto fechava uma venda (Negociação → Ganho) e o lead "não ia para nenhuma aba": os fechados ficavam numa
// lista no pé do Funil, abaixo do quadro inteiro, e ele não achava onde clicar em "Transformar em cliente" ou corrigir.
// Agora: aba própria, e quem ganhou e ainda não virou cliente fica SEMPRE à vista (não some na virada do mês) — é uma
// pendência, não histórico. Puro (sem banco, sem relógio).

import { ehHostComercial } from "@/lib/navegacao/casco";

export interface LeadFechado {
  id: string;
  estagio: string;
  clienteId?: string | null;
  fechadoEm?: string | null;
  updatedAt?: string | null;
}

export interface Fechados<L> {
  /** Ganhos que ainda não viraram cliente — todos, de qualquer mês (pendência). */
  converter: L[];
  /** Ganhos que já viraram cliente (do período). */
  clientes: L[];
  /** Perdidos (do período). */
  perdidos: L[];
}

const quando = (l: LeadFechado) => l.fechadoEm ?? l.updatedAt ?? "";
const recentesPrimeiro = <L extends LeadFechado>(a: L, b: L) => quando(b).localeCompare(quando(a));

/** Separa os fechados. `mes` = "AAAA-MM" para só o mês; null = todos. A pendência de conversão ignora o mês. */
export function separarFechados<L extends LeadFechado>(leads: L[], mes: string | null): Fechados<L> {
  const doPeriodo = (l: L) => mes === null || quando(l).slice(0, 7) === mes;
  return {
    converter: leads.filter((l) => l.estagio === "ganho" && !l.clienteId).sort(recentesPrimeiro),
    clientes: leads.filter((l) => l.estagio === "ganho" && !!l.clienteId && doPeriodo(l)).sort(recentesPrimeiro),
    perdidos: leads.filter((l) => l.estagio === "perdido" && doPeriodo(l)).sort(recentesPrimeiro),
  };
}

/** Ficha do cliente no Lone OS. No comercial.lonemidia.com só o /crm existe — o link precisa ir para o painel. */
export function linkDoCliente(clienteId: string, host: string | null | undefined): string {
  const caminho = `/clients/${encodeURIComponent(clienteId)}`;
  return ehHostComercial(host) ? `https://painel.lonemidia.com${caminho}` : caminho;
}
