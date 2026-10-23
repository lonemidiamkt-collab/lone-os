// lib/system/broadcast.ts — as regras do recado pontual nos grupos dos clientes
// (app/api/system/broadcast). Puro: sem banco, sem rede.
//
// 21/10/2026 (auditoria de erro recuperável, item 5.6). Três furos, todos de "mandou pra quem não
// devia" ou "mandou duas vezes":
//   • `audiencia=trafego` filtrava por conta de anúncio vinculada, não pelo contrato — o mesmo proxy
//     errado que mandou "de olho nas campanhas" pro Dumar, que é só social;
//   • a idempotência era por DIA + chave: a mesma chave rodada no dia seguinte mandava tudo de novo;
//   • o dedup era por cliente dentro da rodada: o cadastro que tinha ficado "skipped" (divide o grupo
//     com outro) fazia o grupo receber de novo numa segunda rodada.

import { podeFalarDeAnuncio, type ClienteServico } from "@/lib/clients/servico";
import { bloqueiaReenvio } from "@/lib/whatsapp/desfecho-envio";

export const AUDIENCIAS = ["trafego", "social", "todos"] as const;
export type Audiencia = (typeof AUDIENCIAS)[number];

/** Lê `?audiencia=`. Vazio = todos. Valor desconhecido = null: um erro de digitação não pode virar "todos". */
export function lerAudiencia(valor: string | null | undefined): Audiencia | null {
  const v = (valor ?? "").trim().toLowerCase();
  if (!v) return "todos";
  return (AUDIENCIAS as readonly string[]).includes(v) ? (v as Audiencia) : null;
}

/**
 * Quem está na audiência — pelo CONTRATO (lib/clients/servico.ts), nunca pela conta vinculada.
 *   trafego → contratou gestão de anúncios
 *   social  → NÃO contratou anúncios (o complemento: recado de tráfego nunca chega a eles)
 *   todos   → todo mundo
 */
export function filtrarAudiencia<T extends ClienteServico>(lista: readonly T[], audiencia: Audiencia): T[] {
  if (audiencia === "trafego") return lista.filter((c) => podeFalarDeAnuncio(c));
  if (audiencia === "social") return lista.filter((c) => !podeFalarDeAnuncio(c));
  return [...lista];
}

/** Chave do registro: SEM data. A mesma chave é o mesmo recado, hoje ou semana que vem. */
export function chaveDoRegistro(chave: string): string {
  return `broadcast:${chave.trim()}`;
}

/**
 * Grupos que já receberam este recado — ou podem ter recebido (envio incerto). O registro é por
 * cadastro; a decisão é por GRUPO: se um cadastro do grupo recebeu, o grupo inteiro recebeu.
 */
export function gruposJaAtendidos(
  registro: readonly { client_id: string; status: string; error?: string | null }[],
  jidPorCliente: ReadonlyMap<string, string>,
): Set<string> {
  const out = new Set<string>();
  for (const l of registro) {
    if (!bloqueiaReenvio(l)) continue;
    const jid = jidPorCliente.get(l.client_id);
    if (jid) out.add(jid);
  }
  return out;
}
