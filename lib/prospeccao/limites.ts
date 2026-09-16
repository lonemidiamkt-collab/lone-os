// lib/prospeccao/limites.ts — o freio. O número do Loninho é o mesmo dos 40 grupos de clientes:
// se o WhatsApp bloquear por prospecção fria, o Agente CS cai junto. Por isso o teto é duro
// (§5: 10 novas/dia, só 09–11), o intervalo entre envios é aleatório e o kill-switch é global.
//
// Tudo aqui é puro (recebe estado, devolve decisão) — o cron e o inbound só consultam.

import type { CampanhaRow } from "./tipos";
import type { ProspectConfig } from "./config";
import { dentroDaJanela, proximaAberturaDaJanela, type Janela } from "./tempo";
import { pilotoRodando } from "./piloto";

export interface Decisao { ok: boolean; motivo?: string }

export const JANELA_ABORDAGEM_PADRAO: Janela = { ini: "09:00", fim: "11:00" };
export const JANELA_RESPOSTA_PADRAO: Janela = { ini: "09:00", fim: "18:00" };

export const janelaAbordagem = (c: CampanhaRow | null): Janela => c?.janela_abordagem ?? JANELA_ABORDAGEM_PADRAO;
export const janelaResposta = (c: CampanhaRow | null): Janela => c?.janela_resposta ?? JANELA_RESPOSTA_PADRAO;

/** Pode iniciar uma NOVA prospecção agora? (kill-switch → piloto → janela 09–11 → teto do dia) */
export function podeAbordarAgora(p: { cfg: ProspectConfig; campanha: CampanhaRow | null; abordagensHoje: number; agora?: Date; forcarJanela?: boolean }): Decisao {
  const agora = p.agora ?? new Date();
  if (!p.cfg.ligado) return { ok: false, motivo: "agente desligado (kill-switch)" };
  if (!pilotoRodando(p.campanha, agora)) return { ok: false, motivo: p.campanha ? `piloto ${p.campanha.status === "running" ? "vencido" : p.campanha.status}` : "sem piloto ativo" };
  const j = janelaAbordagem(p.campanha);
  // `forcarJanela` = o Roberto mandou completar o dia fora do horário; teto e gate continuam valendo.
  if (!p.forcarJanela && !dentroDaJanela(j, agora)) return { ok: false, motivo: `fora da janela de abordagem (${j.ini}–${j.fim}, dias úteis)` };
  const limite = p.campanha?.limite_dia ?? 10;
  if (p.abordagensHoje >= limite) return { ok: false, motivo: `teto do dia atingido (${p.abordagensHoje}/${limite})` };
  return { ok: true };
}

/** Pode responder/fazer follow-up de uma conversa EXISTENTE agora? (09–18, dias úteis) */
export function podeResponderAgora(p: { cfg: ProspectConfig; campanha: CampanhaRow | null; agora?: Date }): Decisao {
  const agora = p.agora ?? new Date();
  if (!p.cfg.ligado) return { ok: false, motivo: "agente desligado (kill-switch)" };
  if (!pilotoRodando(p.campanha, agora)) return { ok: false, motivo: p.campanha ? `piloto ${p.campanha.status === "running" ? "vencido" : p.campanha.status}` : "sem piloto ativo" };
  const j = janelaResposta(p.campanha);
  if (!dentroDaJanela(j, agora)) return { ok: false, motivo: `fora do horário de resposta (${j.ini}–${j.fim}, dias úteis)` };
  return { ok: true };
}

/** Quando a resposta que não pôde sair agora deve sair. */
export function proximaHoraDeResposta(c: CampanhaRow | null, agora = new Date()): Date {
  return proximaAberturaDaJanela(janelaResposta(c), agora);
}
export function proximaHoraDeAbordagem(c: CampanhaRow | null, agora = new Date()): Date {
  return proximaAberturaDaJanela(janelaAbordagem(c), agora);
}

export function tetoDisponivel(c: CampanhaRow | null, abordagensHoje: number): number {
  return Math.max(0, (c?.limite_dia ?? 10) - abordagensHoje);
}

/** Intervalo aleatório entre envios, em ms (4–9 min por padrão). */
export function intervaloAleatorioMs(cfg: ProspectConfig, rand = Math.random): number {
  const min = Math.max(0, cfg.intervalo_min_s), max = Math.max(min, cfg.intervalo_max_s);
  return Math.round((min + rand() * (max - min)) * 1000);
}

/** O último envio foi há tempo suficiente? */
export function respeitaIntervalo(ultimoEnvioEm: string | null, cfg: ProspectConfig, agora = new Date()): boolean {
  if (!ultimoEnvioEm) return true;
  const passou = agora.getTime() - new Date(ultimoEnvioEm).getTime();
  return passou >= cfg.intervalo_min_s * 1000;
}

// ─── Contadores (banco) ───────────────────────────────────────────────────────

export async function abordagensHoje(): Promise<number> {
  const { supabaseAdmin } = await import("@/lib/supabase/server");
  const { ymdSP } = await import("./tempo");
  const { count } = await supabaseAdmin.from("prospect_messages")
    .select("id", { count: "exact", head: true })
    .eq("dia", ymdSP()).eq("eh_primeira_abordagem", true).eq("enviado", true);
  return count ?? 0;
}

export async function ultimoEnvioDoAgente(): Promise<string | null> {
  const { supabaseAdmin } = await import("@/lib/supabase/server");
  const { data } = await supabaseAdmin.from("prospect_messages").select("created_at")
    .eq("direcao", "out").eq("autor", "agente").eq("enviado", true)
    .order("created_at", { ascending: false }).limit(1);
  return ((data ?? [])[0]?.created_at as string | undefined) ?? null;
}
