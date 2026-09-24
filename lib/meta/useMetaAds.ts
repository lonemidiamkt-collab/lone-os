"use client";

import { useState, useEffect, useCallback } from "react";
import { authedFetch } from "@/lib/supabase/authed-fetch";

export class TokenExpiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TokenExpiredError";
  }
}

const META_APP_ID = process.env.NEXT_PUBLIC_META_APP_ID ?? "";
const REDIRECT_URI = typeof window !== "undefined" ? `${window.location.origin}/traffic` : "";
// Inclui Instagram orgânico (permissões já adicionadas ao app na Meta em 10/jul).
// instagram_content_publish = postar no Instagram. Depende do produto Instagram habilitado no
// painel do app; sem isso o Facebook responde "Invalid Scopes" e TRAVA o login inteiro — pedir
// permissão que o app não tem não é inofensivo. Se a tela de consentimento falhar, remova o escopo
// novo daqui antes de qualquer outra coisa: sem isso ninguém reconecta a Meta.
//
// pages_manage_posts (postar no Facebook) foi tentado em 09/08 e continuou inválido mesmo depois do
// produto Instagram — é outro produto/permissão. Fica de fora: publicar no Instagram não precisa
// dele, e mantê-lo na lista impedia a reconexão.
const SCOPES = "ads_read,ads_management,business_management,instagram_basic,instagram_manage_insights,pages_read_engagement,pages_show_list,instagram_content_publish";

// ─── Supabase-backed global token storage ─────────────────────────────────

async function loadGlobalToken(): Promise<{ token: string; expiresAt: number | null; tokenType: "short" | "long" } | null> {
  try {
    const res = await authedFetch("/api/meta/token");
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.token) return null;
    return { token: data.token, expiresAt: data.expiresAt, tokenType: data.tokenType ?? "short" };
  } catch {
    return null;
  }
}

async function saveGlobalToken(token: string, expiresIn?: number, tokenType: "short" | "long" = "short") {
  const expiresAt = expiresIn ? String(Date.now() + (expiresIn - 300) * 1000) : null;
  const rows: { key: string; value: string; updated_at: string }[] = [
    { key: "meta_token", value: token, updated_at: new Date().toISOString() },
    { key: "meta_token_type", value: tokenType, updated_at: new Date().toISOString() },
  ];
  if (expiresAt) {
    rows.push({ key: "meta_token_expires_at", value: expiresAt, updated_at: new Date().toISOString() });
  }
  const res = await authedFetch("/api/meta/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rows }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error("[Meta] Failed to save global token:", err);
  }
}

async function clearGlobalToken() {
  const res = await authedFetch("/api/meta/token", { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error("[Meta] Failed to clear global token:", err);
  }
}

/** Exchange a short-lived token for a long-lived one (~60 days) via server-side API route */
async function exchangeForLongLivedToken(shortToken: string): Promise<"ok" | "failed"> {
  try {
    // authedFetch, NÃO fetch puro: a rota exige admin logado (ela usa o META_APP_SECRET). Com fetch
    // puro ela devolvia 401, a troca falhava em silêncio e ficava salvo o token CURTO do Facebook —
    // que dura ~1h. Era essa a causa do painel de resultados "caindo sozinho": não era o link, era
    // o token da Meta morrendo na mesma tarde em que era criado.
    const res = await authedFetch("/api/meta/exchange-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ short_lived_token: shortToken }),
    });
    const data = await res.json();
    if (!res.ok || !data.access_token) {
      console.error("[Meta] Token exchange failed:", data.error ?? data);
      return "failed";
    }
    await saveGlobalToken(data.access_token, data.expires_in, "long");
    console.log(`[Meta] Long-lived token saved (expires in ~${Math.round((data.expires_in ?? 0) / 86400)}d)`);
    return "ok";
  } catch (err) {
    console.error("[Meta] Token exchange error:", err);
    return "failed";
  }
}

interface MetaConnectionState {
  connected: boolean;
  loading: boolean;
  token: string | null;
  tokenExpired: boolean;
  tokenType: "short" | "long" | null;
  tokenExpiresAt: number | null;
  exchangeFailed: boolean;
}

export function useMetaConnection() {
  const [state, setState] = useState<MetaConnectionState>({
    connected: false,
    loading: true,
    token: null,
    tokenExpired: false,
    tokenType: null,
    tokenExpiresAt: null,
    exchangeFailed: false,
  });

  useEffect(() => {
    let cancelled = false;

    async function init() {
      // 1. Check if we're returning from OAuth (token in URL hash)
      if (typeof window !== "undefined" && window.location.hash) {
        const params = new URLSearchParams(window.location.hash.slice(1));
        const token = params.get("access_token");
        const expiresIn = params.get("expires_in");
        if (token) {
          const expiresInNum = expiresIn ? parseInt(expiresIn, 10) : undefined;
          await saveGlobalToken(token, expiresInNum, "short");
          const expiresAt = expiresInNum ? Date.now() + (expiresInNum - 300) * 1000 : null;
          if (!cancelled) {
            setState({ connected: true, loading: false, token, tokenExpired: false, tokenType: "short", tokenExpiresAt: expiresAt, exchangeFailed: false });
          }
          window.history.replaceState(null, "", window.location.pathname + window.location.search);
          // Exchange for long-lived token in background, update state when done
          exchangeForLongLivedToken(token).then(async (result) => {
            const upgraded = await loadGlobalToken();
            if (!cancelled) {
              if (result === "failed") {
                // Exchange falhou: fica conectado com short token mas avisa
                setState((prev) => ({ ...prev, exchangeFailed: true }));
              } else if (upgraded) {
                setState({
                  connected: true, loading: false, token: upgraded.token, tokenExpired: false,
                  tokenType: upgraded.tokenType, tokenExpiresAt: upgraded.expiresAt,
                  exchangeFailed: false,
                });
              }
            }
          });
          return;
        }
      }

      // 2. Load from Supabase first (source of truth — shared across all users)
      const global = await loadGlobalToken();
      if (global) {
        // Não apaga o token do servidor: o relógio do navegador pode estar errado e esse token é o
        // mesmo que os jobs (saldos, portal, Instagram) usam. Quem invalida é o check-meta-token.
        if (global.expiresAt && Date.now() > global.expiresAt) {
          if (!cancelled) setState({ connected: false, loading: false, token: null, tokenExpired: true, tokenType: null, tokenExpiresAt: null, exchangeFailed: false });
          return;
        }
        if (!cancelled) setState({
          connected: true, loading: false, token: global.token, tokenExpired: false,
          tokenType: global.tokenType, tokenExpiresAt: global.expiresAt, exchangeFailed: false,
        });
        return;
      }

      // 3. Auto-migrate: if localStorage has a token but Supabase doesn't, push it up
      const legacyToken = localStorage.getItem("meta_access_token");
      if (legacyToken) {
        const legacyExpiry = localStorage.getItem("meta_token_expires_at");
        const legacyType = (localStorage.getItem("meta_token_type") as "short" | "long") ?? "short";
        // Check if expired
        if (legacyExpiry && Date.now() > parseInt(legacyExpiry, 10)) {
          localStorage.removeItem("meta_access_token");
          localStorage.removeItem("meta_token_expires_at");
          localStorage.removeItem("meta_token_type");
          if (!cancelled) setState({ connected: false, loading: false, token: null, tokenExpired: true, tokenType: null, tokenExpiresAt: null, exchangeFailed: false });
          return;
        }
        // Push to Supabase so all team members can use it
        console.log("[Meta] Migrating token from localStorage → Supabase...");
        const expiresIn = legacyExpiry ? Math.max(0, Math.round((parseInt(legacyExpiry, 10) - Date.now()) / 1000)) : undefined;
        await saveGlobalToken(legacyToken, expiresIn, legacyType);
        // Clean localStorage
        localStorage.removeItem("meta_access_token");
        localStorage.removeItem("meta_token_expires_at");
        localStorage.removeItem("meta_token_type");
        console.log("[Meta] Migration complete — token now in Supabase");
        if (!cancelled) setState({
          connected: true, loading: false, token: legacyToken, tokenExpired: false,
          tokenType: legacyType, tokenExpiresAt: legacyExpiry ? parseInt(legacyExpiry, 10) : null, exchangeFailed: false,
        });
        return;
      }

      // 4. No token anywhere
      if (!cancelled) setState({ connected: false, loading: false, token: null, tokenExpired: false, tokenType: null, tokenExpiresAt: null, exchangeFailed: false });
    }

    init();
    return () => { cancelled = true; };
  }, []);

  const connect = useCallback(() => {
    if (!META_APP_ID) {
      alert(
        "META_APP_ID não configurado.\n\n" +
        "Para conectar com o Meta Ads:\n" +
        "1. Crie um app em developers.facebook.com\n" +
        "2. Ative a Marketing API\n" +
        "3. Adicione NEXT_PUBLIC_META_APP_ID no .env.local\n" +
        "4. Reinicie o servidor"
      );
      return;
    }

    const params = new URLSearchParams({
      client_id: META_APP_ID,
      redirect_uri: REDIRECT_URI,
      scope: SCOPES,
      response_type: "token",
    });
    window.location.href = `https://www.facebook.com/v21.0/dialog/oauth?${params}`;
  }, []);

  const disconnect = useCallback(async () => {
    await clearGlobalToken();
    setState({ connected: false, loading: false, token: null, tokenExpired: false, tokenType: null, tokenExpiresAt: null, exchangeFailed: false });
  }, []);

  // Um 401 visto num navegador (rede, permissão da conta, rate limit) NÃO pode apagar o token
  // compartilhado: ele alimenta sync de saldos, portal e conferência do Instagram da agência toda.
  // Só marca a sessão local; apagar de verdade é o botão Desconectar (com confirmação).
  const handleTokenError = useCallback(async () => {
    setState({ connected: false, loading: false, token: null, tokenExpired: true, tokenType: null, tokenExpiresAt: null, exchangeFailed: false });
  }, []);

  return { ...state, connect, disconnect, handleTokenError };
}

function isMetaAuthError(status: number, body: { error?: { code?: number } }): boolean {
  return status === 401 || status === 400 && body?.error?.code === 190;
}

// Fetch ALL ad accounts — personal + business manager
export async function fetchAdAccounts(token: string) {
  const allAccounts: any[] = [];
  const seenIds = new Set<string>();

  // 1. Fetch personal ad accounts (/me/adaccounts)
  const personalParams = new URLSearchParams({
    access_token: token,
    fields: "id,name,account_id,currency,account_status",
    limit: "100",
  });
  const personalRes = await fetch(`https://graph.facebook.com/v21.0/me/adaccounts?${personalParams}`);
  if (!personalRes.ok) {
    const err = await personalRes.json().catch(() => ({}));
    if (isMetaAuthError(personalRes.status, err)) {
      throw new TokenExpiredError(`Token inválido ou sem permissão (code ${err?.error?.code ?? personalRes.status})`);
    }
  } else {
    const personalData = await personalRes.json();
    for (const acc of personalData.data ?? []) {
      if (!seenIds.has(acc.id)) {
        seenIds.add(acc.id);
        allAccounts.push(acc);
      }
    }
  }

  // 2. Fetch business ad accounts (/me/businesses → each business's ad accounts)
  try {
    const bizParams = new URLSearchParams({
      access_token: token,
      fields: "id,name",
      limit: "100",
    });
    const bizRes = await fetch(`https://graph.facebook.com/v21.0/me/businesses?${bizParams}`);
    if (bizRes.ok) {
      const bizData = await bizRes.json();
      const businesses = bizData.data ?? [];

      await Promise.all(
        businesses.map(async (biz: any) => {
          try {
            const accParams = new URLSearchParams({
              access_token: token,
              fields: "id,name,account_id,currency,account_status",
              limit: "100",
            });
            const accRes = await fetch(`https://graph.facebook.com/v21.0/${biz.id}/owned_ad_accounts?${accParams}`);
            if (accRes.ok) {
              const accData = await accRes.json();
              for (const acc of accData.data ?? []) {
                if (!seenIds.has(acc.id)) {
                  seenIds.add(acc.id);
                  allAccounts.push({ ...acc, business_name: biz.name });
                }
              }
            }
            const clientParams = new URLSearchParams({
              access_token: token,
              fields: "id,name,account_id,currency,account_status",
              limit: "100",
            });
            const clientRes = await fetch(`https://graph.facebook.com/v21.0/${biz.id}/client_ad_accounts?${clientParams}`);
            if (clientRes.ok) {
              const clientData = await clientRes.json();
              for (const acc of clientData.data ?? []) {
                if (!seenIds.has(acc.id)) {
                  seenIds.add(acc.id);
                  allAccounts.push({ ...acc, business_name: biz.name });
                }
              }
            }
          } catch {}
        })
      );
    }
  } catch {}

  return allAccounts;
}

// fetchCampaignInsights / fetchAccountDemographics saíram daqui (Leva 4): a aba Anúncios Meta não
// chama mais a Meta pelo navegador. A leitura de campanhas mora só em lib/meta/insights-server.ts,
// usada pelo servidor (lib/trafego/anuncios-server.ts e o relatório semanal).
