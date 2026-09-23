// lib/clients/pausa.ts — o estado PAUSADO (23/09/2026).
//
// Até aqui só existia ativo × desativado, e desativar tirava o cliente de tudo — inclusive da
// carteira do time, que é justamente o que NÃO se quer quando a pausa é temporária (férias do
// cliente, pagamento atrasado, campanha suspensa). Pausado é o meio-termo:
//   • não recebe NADA (mensagem no grupo, relatório, alerta de verba, portal, Loninho)
//   • CONTINUA na carteira do social/designer/tráfego, com o motivo à vista
//
// Uma função pura decide, para que a mesma regra valha em toda tela e todo cron.

export interface ClienteComPausa {
  active?: boolean | null;
  churned_at?: string | null;
  paused_at?: string | null;
  paused_until?: string | null;
}

/** Hoje em São Paulo, no formato YYYY-MM-DD (a data de retomada é do calendário, não do relógio). */
export function hojeSP(agora: Date = new Date()): string {
  return agora.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

/**
 * O cliente está pausado AGORA?
 *
 * `paused_until` no passado = a pausa venceu e o cliente volta sozinho — ninguém precisa lembrar de
 * despausar. Sem data, a pausa vale até alguém tirar.
 */
export function estaPausado(c: ClienteComPausa | null | undefined, agora: Date = new Date()): boolean {
  if (!c?.paused_at) return false;
  if (!c.paused_until) return true;
  return c.paused_until >= hojeSP(agora);
}

/** Pode receber mensagem, relatório, alerta e portal? Ex-cliente e pausado, não. */
export function podeReceber(c: ClienteComPausa | null | undefined, agora: Date = new Date()): boolean {
  if (!c) return false;
  if (c.active === false || c.churned_at) return false;
  return !estaPausado(c, agora);
}

/** Aparece na carteira do time? Pausado SIM (é o ponto); ex-cliente não. */
export function apareceParaEquipe(c: ClienteComPausa | null | undefined): boolean {
  if (!c) return false;
  return !(c.active === false || c.churned_at);
}

/** Texto curto para a tela: "Pausado até 15/10 — férias" */
export function rotuloPausa(c: ClienteComPausa & { paused_reason?: string | null }): string | null {
  if (!estaPausado(c)) return null;
  const ate = c.paused_until ? ` até ${c.paused_until.split("-").reverse().join("/")}` : "";
  const motivo = c.paused_reason?.trim() ? ` — ${c.paused_reason.trim()}` : "";
  return `Pausado${ate}${motivo}`;
}
