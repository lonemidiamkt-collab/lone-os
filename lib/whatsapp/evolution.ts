// lib/whatsapp/evolution.ts — client da Evolution API (WhatsApp).
// Usado para disparar alertas de saldo a um grupo do gestor de tráfego.
//
// Config por env (segredos NÃO vão pro banco):
//   EVOLUTION_API_URL   — base da instância, ex: https://evo.lonemidia.com
//   EVOLUTION_API_KEY   — apikey global/da instância
//   EVOLUTION_INSTANCE  — nome da instância conectada
//
// Princípios: timeout + 1 retry, retorno estruturado { ok, error }, NUNCA lança
// pra dentro do cron (um WhatsApp fora do ar não pode derrubar o digest).

export interface EvoResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  status?: number;
}

interface EvoConfig {
  baseUrl: string;
  apiKey: string;
  instance: string;
}

export function getEvolutionConfig(): EvoConfig | null {
  const baseUrl = process.env.EVOLUTION_API_URL?.replace(/\/+$/, "");
  const apiKey = process.env.EVOLUTION_API_KEY;
  const instance = process.env.EVOLUTION_INSTANCE;
  if (!baseUrl || !apiKey || !instance) return null;
  return { baseUrl, apiKey, instance };
}

export function isEvolutionConfigured(): boolean {
  return getEvolutionConfig() !== null;
}

async function evoFetch<T>(
  path: string,
  init: RequestInit,
  cfg: EvoConfig,
  { retries = 1, timeoutMs = 10_000 } = {},
): Promise<EvoResult<T>> {
  let lastError = "erro desconhecido";
  let lastStatus: number | undefined;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 1000 * attempt));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${cfg.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers: { "Content-Type": "application/json", apikey: cfg.apiKey },
      });
      clearTimeout(timeout);
      lastStatus = res.status;

      const text = await res.text();
      let json: unknown = null;
      try { json = text ? JSON.parse(text) : null; } catch { /* corpo não-JSON */ }

      if (!res.ok) {
        const msg =
          (json as { message?: string; error?: string } | null)?.message ??
          (json as { error?: string } | null)?.error ??
          `HTTP ${res.status}`;
        // 4xx (config/destino inválido) não adianta repetir
        if (res.status >= 400 && res.status < 500) {
          return { ok: false, error: String(msg), status: res.status };
        }
        lastError = String(msg);
        continue;
      }
      return { ok: true, data: (json as T) ?? undefined, status: res.status };
    } catch (err) {
      clearTimeout(timeout);
      lastError = err instanceof Error
        ? (err.name === "AbortError" ? `timeout (${timeoutMs}ms)` : err.message)
        : String(err);
    }
  }
  return { ok: false, error: lastError, status: lastStatus };
}

/**
 * Envia texto para um número (só dígitos, DDI+DDD) ou JID de grupo (`...@g.us`).
 * `delayMs` opcional: a Evolution exibe "digitando" por esse tempo antes de enviar.
 */
export async function sendText(to: string, text: string, delayMs?: number): Promise<EvoResult> {
  const cfg = getEvolutionConfig();
  if (!cfg) return { ok: false, error: "Evolution não configurada (env ausente)" };
  if (!to) return { ok: false, error: "destino (número/JID) vazio" };
  const body: Record<string, unknown> = { number: to, text };
  if (delayMs && delayMs > 0) body.delay = delayMs;
  // instance pode ter espaço (ex: "Ph lone midia") → SEMPRE encode na rota.
  return evoFetch(`/message/sendText/${encodeURIComponent(cfg.instance)}`, {
    method: "POST",
    body: JSON.stringify(body),
  }, cfg);
}

/** Atalho semântico: envia para o JID de um grupo. */
export async function sendGroupText(groupJid: string, text: string): Promise<EvoResult> {
  return sendText(groupJid, text);
}

/** Estado da conexão da instância. `connected=true` quando state==="open". */
export async function checkInstance(): Promise<EvoResult<{ state: string; connected: boolean }>> {
  const cfg = getEvolutionConfig();
  if (!cfg) return { ok: false, error: "Evolution não configurada (env ausente)" };
  const res = await evoFetch<{ instance?: { state?: string }; state?: string }>(
    `/instance/connectionState/${encodeURIComponent(cfg.instance)}`,
    { method: "GET" },
    cfg,
    { retries: 0 },
  );
  if (!res.ok) return { ok: false, error: res.error, status: res.status };
  const state = res.data?.instance?.state ?? res.data?.state ?? "unknown";
  return { ok: true, data: { state, connected: state === "open" } };
}

export interface EvoGroup { id: string; subject: string }

/** Lista os grupos da instância — para descobrir o JID do grupo do gestor. */
export async function listGroups(): Promise<EvoResult<EvoGroup[]>> {
  const cfg = getEvolutionConfig();
  if (!cfg) return { ok: false, error: "Evolution não configurada (env ausente)" };
  const res = await evoFetch<Array<{ id: string; subject: string }> | { groups?: Array<{ id: string; subject: string }> }>(
    `/group/fetchAllGroups/${encodeURIComponent(cfg.instance)}?getParticipants=false`,
    { method: "GET" },
    cfg,
    { retries: 0, timeoutMs: 20_000 },
  );
  if (!res.ok) return { ok: false, error: res.error, status: res.status };
  const raw = Array.isArray(res.data) ? res.data : (res.data?.groups ?? []);
  const groups = raw.map((g) => ({ id: g.id, subject: g.subject })).filter((g) => g.id);
  return { ok: true, data: groups };
}
