// lib/prospeccao/envio.ts — o único caminho de saída para o prospect.
//
// Instância: `PROSPECT_OUTBOUND_INSTANCE/KEY` se existirem; senão a do agente (monitor[IA],
// EVOLUTION_*_NEW). Hoje são a mesma; a separação existe para o dia em que o SDR ganhar número
// próprio sem mexer no resto (V2 §22). Registra em prospect_messages E em cs_outbound (origem
// "prospeccao") — a auditoria e o porta-voz continuam enxergando tudo que sai do número.

import type { ProspectRow } from "./tipos";
import { gravarMensagem } from "./db";

interface Inst { baseUrl: string; apiKey: string; instance: string }

export function instanciaOutbound(): Inst | null {
  const baseUrl = process.env.EVOLUTION_API_URL?.replace(/\/+$/, "");
  const apiKey = process.env.PROSPECT_OUTBOUND_KEY || process.env.EVOLUTION_API_KEY_NEW;
  const instance = process.env.PROSPECT_OUTBOUND_INSTANCE || process.env.EVOLUTION_INSTANCE_NEW;
  if (!baseUrl || !apiKey || !instance) return null;
  return { baseUrl, apiKey, instance };
}

export const instanciaOutboundNome = () => instanciaOutbound()?.instance ?? null;

async function evo<T = unknown>(path: string, body: unknown, timeoutMs = 15_000): Promise<{ ok: boolean; data?: T; error?: string; status?: number }> {
  const cfg = instanciaOutbound();
  if (!cfg) return { ok: false, error: "Evolution (outbound) não configurada" };
  try {
    const res = await fetch(`${cfg.baseUrl}${path}${encodeURIComponent(cfg.instance)}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json", apikey: cfg.apiKey },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const txt = await res.text().catch(() => "");
    let json: unknown = null;
    try { json = txt ? JSON.parse(txt) : null; } catch { /* corpo não-JSON */ }
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}: ${txt.slice(0, 160)}`, status: res.status };
    return { ok: true, data: json as T, status: res.status };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "erro de conexão" };
  }
}

export async function checarInstanciaOutbound(): Promise<{ ok: boolean; connected: boolean; state: string; instance: string | null; error?: string }> {
  const cfg = instanciaOutbound();
  if (!cfg) return { ok: false, connected: false, state: "sem_config", instance: null, error: "env ausente" };
  const r = await evo<{ instance?: { state?: string }; state?: string }>("/instance/connectionState/", undefined, 8_000);
  if (!r.ok) return { ok: false, connected: false, state: "erro", instance: cfg.instance, error: r.error };
  const state = r.data?.instance?.state ?? r.data?.state ?? "unknown";
  return { ok: true, connected: state === "open", state, instance: cfg.instance };
}

/** Verifica se números têm WhatsApp SEM mandar nada. Devolve o JID quando existe. */
export async function verificarWhatsapp(numeros: string[]): Promise<{ numero: string; existe: boolean; jid: string | null }[]> {
  if (!numeros.length) return [];
  const r = await evo<Array<{ number?: string; exists?: boolean; jid?: string }>>("/chat/whatsappNumbers/", { numbers: numeros }, 20_000);
  if (!r.ok || !Array.isArray(r.data)) return numeros.map((n) => ({ numero: n, existe: false, jid: null }));
  return numeros.map((n) => {
    const hit = r.data!.find((x) => (x.number ?? "").replace(/\D/g, "") === n || (x.jid ?? "").startsWith(n));
    return { numero: n, existe: !!hit?.exists, jid: hit?.exists ? (hit.jid ?? `${n}@s.whatsapp.net`) : null };
  });
}

export interface ResultadoEnvio { ok: boolean; id?: string; error?: string }

/** Envio cru para um JID/número. `delayMs` = "digitando…" antes de sair. */
export async function enviarTexto(destino: string, texto: string, delayMs?: number): Promise<ResultadoEnvio> {
  if (!destino) return { ok: false, error: "destino vazio" };
  if (!texto.trim()) return { ok: false, error: "texto vazio" };
  const body: Record<string, unknown> = { number: destino, text: texto };
  if (delayMs && delayMs > 0) body.delay = Math.min(delayMs, 15_000);
  const r = await evo<{ key?: { id?: string } }>("/message/sendText/", body, 20_000);
  if (!r.ok) return { ok: false, error: r.error };
  try { (await import("@/lib/obs/correlacao")).contarEnvio(); } catch { /* fora de execução */ }
  return { ok: true, id: r.data?.key?.id };
}

async function registrarCsOutbound(jid: string, texto: string, enviado: boolean, erro: string | null, prospectId: string): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/lib/supabase/server");
    const { idCorrelacao } = await import("@/lib/obs/correlacao");
    const { assinaturaMensagem } = await import("@/lib/cs/notify");
    await supabaseAdmin.from("cs_outbound").insert({
      correlation_id: idCorrelacao(), origem: "prospeccao", group_jid: jid, destino: "cliente",
      client_id: null, texto: texto.slice(0, 8000), assinatura: assinaturaMensagem(texto), fatos: null,
      enviado, erro, dia: new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }),
      idem_key: `prospect:${prospectId}:${Date.now()}`,
    });
  } catch { /* registro é secundário */ }
}

export interface MetaEnvio {
  autor: "agente" | "humano";
  eh_primeira_abordagem?: boolean;
  estagio_antes?: string | null;
  estagio_depois?: string | null;
  delayMs?: number;
  /** Só grava, não manda (modo sombra / simulador / dry-run). */
  dry?: boolean;
}

/** Destino de um prospect: JID do decisor (se veio), senão o da empresa, senão o telefone. */
export function destinoDoProspect(p: ProspectRow): string | null {
  if (p.decisor_telefone) return `${p.decisor_telefone}@s.whatsapp.net`;
  if (p.whatsapp_jid) return p.whatsapp_jid;
  if (p.telefone) return `${p.telefone}@s.whatsapp.net`;
  return null;
}

export async function enviarAoProspect(p: ProspectRow, texto: string, meta: MetaEnvio): Promise<ResultadoEnvio> {
  const destino = destinoDoProspect(p);
  if (!destino) return { ok: false, error: "prospect sem WhatsApp" };
  let r: ResultadoEnvio;
  if (meta.dry) r = { ok: true, id: `dry-${Date.now()}` };
  else r = await enviarTexto(destino, texto, meta.delayMs);
  let correlation: string | null = null;
  try { correlation = (await import("@/lib/obs/correlacao")).idCorrelacao(); } catch { /* fora de execução */ }
  await gravarMensagem({
    prospect_id: p.id, direcao: "out", autor: meta.autor, texto,
    message_id: r.ok && r.id && !meta.dry ? r.id : null,
    estagio_antes: meta.estagio_antes ?? p.estagio, estagio_depois: meta.estagio_depois ?? null,
    enviado: r.ok && !meta.dry, erro: r.ok ? null : (r.error ?? "falhou"),
    correlation_id: correlation, eh_primeira_abordagem: !!meta.eh_primeira_abordagem,
  });
  if (!meta.dry) await registrarCsOutbound(destino, texto, r.ok, r.ok ? null : (r.error ?? null), p.id);
  return r;
}
