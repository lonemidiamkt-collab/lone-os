// lib/obs/ator.ts — QUEM está por trás desta request, sem consulta nova.
//
// O painel grava pelo service_role (supabaseAdmin) em 175 rotas — e o trigger de auditoria via
// "service_role", sem nome, em 11.904 de 12.347 linhas. Corrigir rota a rota não acontece. Aqui a
// identidade sai do próprio JWT que a request já trouxe (Authorization ou cookie sb-*): o payload
// é decodificado SEM verificar assinatura — serve para ATRIBUIR a escrita, não para AUTORIZAR;
// autorização continua sendo getServerUser (que verifica no GoTrue) e requireRole.
//
// Lê next/headers, que só funciona dentro do ciclo de uma request. Fora dele (script, build,
// teste) devolve null e pronto.

export interface AtorDaRequest { email: string; papel: string | null; aal: string | null }

const cache = new Map<string, AtorDaRequest | null>();
const MAX = 300;

function decodificar(token: string): AtorDaRequest | null {
  if (cache.has(token)) return cache.get(token) ?? null;
  let r: AtorDaRequest | null = null;
  try {
    const parte = token.split(".")[1];
    if (parte) {
      const json = JSON.parse(Buffer.from(parte.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")) as Record<string, unknown>;
      const email = typeof json.email === "string" ? json.email.toLowerCase() : null;
      const app = (json.app_metadata ?? {}) as Record<string, unknown>;
      const papel = (typeof app.user_role === "string" && app.user_role) || (typeof json.user_role === "string" && json.user_role) || null;
      const aal = typeof json.aal === "string" ? json.aal : null;
      if (email) r = { email, papel, aal };
    }
  } catch { r = null; }
  if (cache.size >= MAX) cache.delete(cache.keys().next().value as string);
  cache.set(token, r);
  return r;
}

function tokenDoCookie(pares: { name: string; value: string }[]): string | null {
  const pedacos = pares
    .filter((c) => c.name.startsWith("sb-") && c.name.includes("-auth-token"))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => c.value);
  if (!pedacos.length) return null;
  try {
    const raw = pedacos.join("");
    const limpo = raw.startsWith("base64-") ? Buffer.from(raw.slice(7), "base64").toString("utf8") : raw;
    const t = (JSON.parse(limpo) as { access_token?: string }).access_token;
    return typeof t === "string" && t ? t : null;
  } catch { return null; }
}

export async function atorDaRequest(): Promise<AtorDaRequest | null> {
  let h: Headers;
  try {
    const mod = await import("next/headers");
    h = await mod.headers();
  } catch { return null; }
  let token = /^bearer\s+(\S+)/i.exec(h.get("authorization") ?? "")?.[1] ?? null;
  // CRON_SECRET também vem como Bearer — não é JWT (sem 3 partes), cai fora na decodificação.
  if (!token) {
    try {
      const mod = await import("next/headers");
      const c = await mod.cookies();
      token = tokenDoCookie(c.getAll());
    } catch { token = null; }
  }
  if (!token || token.split(".").length !== 3) return null;
  return decodificar(token);
}

/** Header HTTP só aceita Latin-1; nomes com acento derrubariam o fetch. "Júlio" → "Julio". */
export function asciiSeguro(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7e]+/g, "?").slice(0, 120);
}

/** Só para testes. */
export const _decodificarJwtParaTeste = decodificar;
