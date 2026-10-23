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

// ── Já é cliente? (out/2026) ─────────────────────────────────────────────────
// Os dois primeiros ganhos da aba já existiam como clientes no Lone OS (cadastrados antes do Comercial, sem ligação
// com o lead). "Converter" criaria um cliente DUPLICADO — o servidor só barra quando a ligação já existe. Antes de
// criar, a ficha mostra os clientes de nome parecido para LIGAR (clients.source_lead_id), sem criar nada.

/** Nome de empresa comparável: sem acento, pontuação, espaços e sufixos societários. */
export function chaveDeEmpresa(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(ltda|me|eireli|epp|sa|s a|cia)\b/g, " ")
    .replace(/\s+/g, "");
}

/** Mesmo nome, ou um contido no outro com 6+ letras ("xyzmultimarcasconceito" × "XYZ MULTIMARCAS"). */
export function empresasParecidas(a: string, b: string): boolean {
  const x = chaveDeEmpresa(a);
  const y = chaveDeEmpresa(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [curto, longo] = x.length <= y.length ? [x, y] : [y, x];
  return curto.length >= 6 && longo.includes(curto);
}

export function clientesParecidos<C extends { id: string; nome: string }>(empresa: string, clientes: C[]): C[] {
  return clientes.filter((c) => empresasParecidas(empresa, c.nome));
}
