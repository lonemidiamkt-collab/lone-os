// lib/google/marketing-auth.ts — a conexão do Google para GOOGLE ADS e PERFIL DA EMPRESA (Google Meu Negócio).
// Só servidor.
//
// SEPARADA da conexão da Agenda/Drive (lib/prospeccao/google.ts) de propósito:
//   · reconectar uma não derruba a outra (a Agenda do Comercial e a pasta do Drive seguem de pé);
//   · o acesso às contas de anúncio e aos perfis pode estar em OUTRO e-mail do Google — o que é gerente
//     da conta MCC e dos perfis dos clientes —, não necessariamente no da Agenda.
// Usa a MESMA credencial do app (Client ID + segredo) e o mesmo endereço de volta (/api/auth/google/callback);
// o `state` assinado com destino "marketing" diz ao callback onde gravar.
//
// O refresh token fica CIFRADO em agency_settings (`google_marketing_oauth`), como o da Agenda.
// Escopos: adwords (ler as contas de anúncio) e business.manage (ler o Perfil da Empresa). Nada é alterado no
// Google por este código: só leitura (GoogleAdsService.SearchStream e as APIs de desempenho do perfil).

import { encryptVault, decryptVault } from "@/lib/crypto/vault";
import { lerSetting, gravarSetting } from "@/lib/prospeccao/config";
import { credenciaisDoAppGoogle, appUrl } from "@/lib/prospeccao/google";

const CHAVE = "google_marketing_oauth";

export const ESCOPO_ADS = "https://www.googleapis.com/auth/adwords";
export const ESCOPO_PERFIL = "https://www.googleapis.com/auth/business.manage";
const ESCOPOS = [ESCOPO_ADS, ESCOPO_PERFIL, "https://www.googleapis.com/auth/userinfo.email"].join(" ");

interface Tokens { refresh_token: string; email?: string | null; conectado_em: string; escopos?: string | null }

async function lerTokens(): Promise<Tokens | null> {
  const raw = await lerSetting(CHAVE);
  if (!raw) return null;
  try { return JSON.parse(decryptVault(raw) ?? "") as Tokens; } catch { return null; }
}

export interface EstadoMarketing {
  configurado: boolean;
  conectado: boolean;
  email: string | null;
  conectado_em: string | null;
  /** O que a conta aceitou no consentimento (o Google deixa desmarcar cada permissão). */
  ads: boolean;
  perfil: boolean;
}

export async function estadoMarketing(): Promise<EstadoMarketing> {
  const [t, c] = await Promise.all([lerTokens(), credenciaisDoAppGoogle()]);
  const escopos = (t?.escopos ?? "").split(/\s+/);
  return {
    configurado: !!c, conectado: !!t, email: t?.email ?? null, conectado_em: t?.conectado_em ?? null,
    ads: !!t && escopos.includes(ESCOPO_ADS), perfil: !!t && escopos.includes(ESCOPO_PERFIL),
  };
}

export async function urlDeAutorizacaoMarketing(state: string): Promise<string | null> {
  const c = await credenciaisDoAppGoogle();
  if (!c) return null;
  const q = new URLSearchParams({
    client_id: c.id, redirect_uri: `${appUrl()}/api/auth/google/callback`, response_type: "code",
    scope: ESCOPOS, access_type: "offline", prompt: "consent", state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q.toString()}`;
}

export async function trocarCodigoMarketing(code: string): Promise<{ ok: boolean; email?: string | null; error?: string }> {
  const c = await credenciaisDoAppGoogle();
  if (!c) return { ok: false, error: "credencial do Google ausente" };
  const body = new URLSearchParams({
    code, client_id: c.id, client_secret: c.secret, redirect_uri: `${appUrl()}/api/auth/google/callback`, grant_type: "authorization_code",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body, signal: AbortSignal.timeout(15_000) });
  const j = await res.json().catch(() => null) as { refresh_token?: string; access_token?: string; scope?: string; error_description?: string; error?: string } | null;
  if (!res.ok || !j?.refresh_token) return { ok: false, error: j?.error_description || j?.error || `HTTP ${res.status} (sem refresh_token — revogue o acesso em myaccount.google.com e conecte de novo)` };
  let email: string | null = null;
  try {
    const me = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", { headers: { Authorization: `Bearer ${j.access_token}` }, signal: AbortSignal.timeout(8_000) });
    email = ((await me.json().catch(() => null)) as { email?: string } | null)?.email ?? null;
  } catch { /* e-mail é só informativo */ }
  await gravarSetting(CHAVE, encryptVault(JSON.stringify({ refresh_token: j.refresh_token, email, conectado_em: new Date().toISOString(), escopos: j.scope ?? null } satisfies Tokens)));
  cache = null;
  return { ok: true, email };
}

export async function desconectarMarketing(): Promise<void> { await gravarSetting(CHAVE, null); cache = null; }

let cache: { token: string; expira: number } | null = null;

/** Token de acesso da conexão de marketing. null = não conectado ou o Google recusou a renovação. */
export async function tokenMarketing(): Promise<{ token: string | null; motivo: "sem_conexao" | "sem_credencial" | "recusado" | null; detalhe?: string }> {
  if (cache && cache.expira > Date.now() + 30_000) return { token: cache.token, motivo: null };
  const [t, c] = await Promise.all([lerTokens(), credenciaisDoAppGoogle()]);
  if (!c) return { token: null, motivo: "sem_credencial" };
  if (!t) return { token: null, motivo: "sem_conexao" };
  try {
    const body = new URLSearchParams({ refresh_token: t.refresh_token, client_id: c.id, client_secret: c.secret, grant_type: "refresh_token" });
    const res = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body, signal: AbortSignal.timeout(15_000) });
    const j = await res.json().catch(() => null) as { access_token?: string; expires_in?: number; error?: string; error_description?: string } | null;
    if (!res.ok || !j?.access_token) return { token: null, motivo: "recusado", detalhe: j?.error_description || j?.error || `HTTP ${res.status}` };
    cache = { token: j.access_token, expira: Date.now() + (j.expires_in ?? 3600) * 1000 };
    return { token: j.access_token, motivo: null };
  } catch (e) {
    return { token: null, motivo: "recusado", detalhe: e instanceof Error ? e.message : "rede" };
  }
}

export { normalizarIdAds, formatarIdAds } from "./ids";

/** O motivo do token em frase para a ficha, o grupo e a tela de Integrações. Pura. */
export function fraseSemToken(motivo: "sem_conexao" | "sem_credencial" | "recusado" | null, detalhe?: string): string {
  if (motivo === "sem_credencial") return "Falta a credencial do app do Google (Sistema › Integrações › Google).";
  if (motivo === "sem_conexao") return "O Google Ads e o Perfil da Empresa não estão conectados. Conecte em Sistema › Integrações.";
  return `O Google recusou o acesso de Google Ads e Perfil da Empresa${detalhe ? ` (${detalhe})` : ""}. Reconecte em Sistema › Integrações.`;
}
