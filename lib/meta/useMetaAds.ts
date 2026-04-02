"use client";

import { useState, useEffect, useCallback } from "react";

export class TokenExpiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TokenExpiredError";
  }
}

const STORAGE_KEY = "meta_access_token";
const STORAGE_EXPIRY_KEY = "meta_token_expires_at";
const STORAGE_TOKEN_TYPE_KEY = "meta_token_type"; // "short" | "long"
const META_APP_ID = process.env.NEXT_PUBLIC_META_APP_ID ?? "";
const REDIRECT_URI = typeof window !== "undefined" ? `${window.location.origin}/traffic` : "";
const SCOPES = "ads_read,business_management";

function isTokenExpired(): boolean {
  const expiresAt = localStorage.getItem(STORAGE_EXPIRY_KEY);
  if (!expiresAt) return false;
  return Date.now() > parseInt(expiresAt, 10);
}

function storeToken(token: string, expiresIn?: number, tokenType: "short" | "long" = "short") {
  localStorage.setItem(STORAGE_KEY, token);
  localStorage.setItem(STORAGE_TOKEN_TYPE_KEY, tokenType);
  if (expiresIn) {
    // 5-min safety margin
    localStorage.setItem(STORAGE_EXPIRY_KEY, String(Date.now() + (expiresIn - 300) * 1000));
  }
}

function clearToken() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(STORAGE_EXPIRY_KEY);
  localStorage.removeItem(STORAGE_TOKEN_TYPE_KEY);
}

/** Exchange a short-lived token for a long-lived one (~60 days) via server-side API route */
async function exchangeForLongLivedToken(shortToken: string): Promise<void> {
  try {
    const res = await fetch("/api/meta/exchange-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ short_lived_token: shortToken }),
    });
    if (!res.ok) return; // silently skip — keep the short-lived token working

    const data = await res.json();
    if (data.access_token) {
      storeToken(data.access_token, data.expires_in, "long");
    }
  } catch {
    // Network error or missing config — keep short-lived token
  }
}

interface MetaConnectionState {
  connected: boolean;
  loading: boolean;
  token: string | null;
  tokenExpired: boolean;
  tokenType: "short" | "long" | null;
  tokenExpiresAt: number | null; // ms timestamp
}

export function useMetaConnection() {
  const [state, setState] = useState<MetaConnectionState>({
    connected: false,
    loading: true,
    token: null,
    tokenExpired: false,
    tokenType: null,
    tokenExpiresAt: null,
  });

  useEffect(() => {
    // Check if we're returning from OAuth (token in URL hash)
    if (typeof window !== "undefined" && window.location.hash) {
      const params = new URLSearchParams(window.location.hash.slice(1));
      const token = params.get("access_token");
      const expiresIn = params.get("expires_in");
      if (token) {
        const expiresInNum = expiresIn ? parseInt(expiresIn, 10) : undefined;
        storeToken(token, expiresInNum, "short");
        const expiresAt = expiresInNum ? Date.now() + (expiresInNum - 300) * 1000 : null;
        setState({ connected: true, loading: false, token, tokenExpired: false, tokenType: "short", tokenExpiresAt: expiresAt });
        window.history.replaceState(null, "", window.location.pathname + window.location.search);

        // Silently exchange for long-lived token (~60 days) in the background
        exchangeForLongLivedToken(token).then(() => {
          const upgraded = localStorage.getItem(STORAGE_KEY);
          const upgradedExpiry = localStorage.getItem(STORAGE_EXPIRY_KEY);
          const upgradedType = localStorage.getItem(STORAGE_TOKEN_TYPE_KEY) as "short" | "long" | null;
          if (upgraded) {
            setState((prev) => ({
              ...prev,
              token: upgraded,
              tokenType: upgradedType ?? prev.tokenType,
              tokenExpiresAt: upgradedExpiry ? parseInt(upgradedExpiry, 10) : prev.tokenExpiresAt,
            }));
          }
        });
        return;
      }
    }

    // Check localStorage for existing token
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      if (isTokenExpired()) {
        clearToken();
        setState({ connected: false, loading: false, token: null, tokenExpired: true, tokenType: null, tokenExpiresAt: null });
        return;
      }
      const storedExpiry = localStorage.getItem(STORAGE_EXPIRY_KEY);
      const storedType = localStorage.getItem(STORAGE_TOKEN_TYPE_KEY) as "short" | "long" | null;
      setState({
        connected: true,
        loading: false,
        token: stored,
        tokenExpired: false,
        tokenType: storedType,
        tokenExpiresAt: storedExpiry ? parseInt(storedExpiry, 10) : null,
      });
      return;
    }

    setState({ connected: false, loading: false, token: null, tokenExpired: false, tokenType: null, tokenExpiresAt: null });
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

  const disconnect = useCallback(() => {
    clearToken();
    setState({ connected: false, loading: false, token: null, tokenExpired: false, tokenType: null, tokenExpiresAt: null });
  }, []);

  // Call this when an API call returns 401/expired — auto-disconnects
  const handleTokenError = useCallback(() => {
    clearToken();
    setState({ connected: false, loading: false, token: null, tokenExpired: true, tokenType: null, tokenExpiresAt: null });
  }, []);

  return { ...state, connect, disconnect, handleTokenError };
}

// Fetch ALL ad accounts — personal + business manager
export async function fetchAdAccounts(token: string) {
  const allAccounts: any[] = [];
  const seenIds = new Set<string>();

  // 1. Fetch personal ad accounts (/me/adaccounts)
  try {
    const personalParams = new URLSearchParams({
      access_token: token,
      fields: "id,name,account_id,currency,account_status",
      limit: "100",
    });
    const personalRes = await fetch(`https://graph.facebook.com/v21.0/me/adaccounts?${personalParams}`);
    if (personalRes.ok) {
      const personalData = await personalRes.json();
      for (const acc of personalData.data ?? []) {
        if (!seenIds.has(acc.id)) {
          seenIds.add(acc.id);
          allAccounts.push(acc);
        }
      }
    }
  } catch {}

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
            // Also fetch client ad accounts (accounts shared with the business)
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

// ═══════════════════════════════════════════════════════════
// ACTION TYPE DEFINITIONS — authoritative source of truth
// ═══════════════════════════════════════════════════════════

// Mensagens: conversas iniciadas no WhatsApp/Messenger (NÃO cliques em link)
const MESSAGE_ACTION_TYPES = [
  "onsite_conversion.messaging_conversation_started_7d",  // principal — 7-day window
  "onsite_conversion.messaging_first_conversation_started", // first-time conversations
  "onsite_conversion.messaging_first_reply",               // fallback — first reply
] as const;

// Leads: formulários nativos do Meta + pixel de lead
const LEAD_ACTION_TYPES = [
  "lead",                                    // formulário nativo (Lead Ads)
  "onsite_conversion.lead_grouped",          // leads agrupados (formulário)
  "offsite_conversion.fb_pixel_lead",        // pixel de lead no site
  "offsite_conversion.fb_pixel_complete_registration", // registro completo via pixel
] as const;

// Compras/conversões de venda
const PURCHASE_ACTION_TYPES = [
  "offsite_conversion.fb_pixel_purchase",    // compra via pixel
  "onsite_conversion.purchase",              // compra on-platform
  "omni_purchase",                           // compra omnichannel
] as const;

/** Parse string numérica da API Meta para number, com fallback seguro */
function safeFloat(val: string | number | undefined | null): number {
  if (val === undefined || val === null || val === "") return 0;
  const n = typeof val === "number" ? val : parseFloat(val);
  return isFinite(n) ? n : 0;
}

function safeInt(val: string | number | undefined | null): number {
  if (val === undefined || val === null || val === "") return 0;
  const n = typeof val === "number" ? val : parseInt(val as string, 10);
  return isFinite(n) ? n : 0;
}

/** Count actions by type from a single insight row */
function countActions(
  actions: { action_type: string; value: string }[] | undefined,
  types: readonly string[],
): number {
  if (!actions) return 0;
  let total = 0;
  for (const action of actions) {
    if (types.includes(action.action_type)) {
      total += safeInt(action.value);
    }
  }
  return total;
}

/** Count messages with dedup: prefer conversation_started_7d > first_conversation > first_reply */
function countMessages(actions: { action_type: string; value: string }[] | undefined): number {
  if (!actions) return 0;
  // Priority order — use the first match found
  for (const type of MESSAGE_ACTION_TYPES) {
    const found = actions.find((a) => a.action_type === type);
    if (found) return safeInt(found.value);
  }
  return 0;
}

// Fetch campaigns + insights for an ad account
export async function fetchCampaignInsights(
  token: string,
  accountId: string,
  days: number = 7,
  dateFrom?: string,
  dateTo?: string,
) {
  const syncTimestamp = new Date().toISOString();

  // Fetch campaigns
  const campParams = new URLSearchParams({
    access_token: token,
    fields: "id,name,objective,status,daily_budget,lifetime_budget,start_time,stop_time",
    // Only fetch ACTIVE + PAUSED (exclude DELETED/ARCHIVED to avoid garbage data)
    effective_status: '["ACTIVE","PAUSED"]',
    limit: "100",
  });
  const campRes = await fetch(`https://graph.facebook.com/v21.0/${accountId}/campaigns?${campParams}`);
  if (!campRes.ok) {
    const err = await campRes.json().catch(() => ({}));
    if (campRes.status === 401 || err?.error?.code === 190) {
      throw new TokenExpiredError("Token expirado ou inválido");
    }
    throw new Error("Failed to fetch campaigns");
  }
  const campData = await campRes.json();
  const campaigns = campData.data ?? [];

  // Calculate date range
  const todayDate = dateFrom && dateTo ? new Date(dateTo) : new Date();
  const sinceDate = dateFrom && dateTo ? new Date(dateFrom) : new Date(todayDate);
  if (!dateFrom || !dateTo) {
    sinceDate.setDate(sinceDate.getDate() - days);
  }
  const sinceStr = sinceDate.toISOString().slice(0, 10);
  const untilStr = todayDate.toISOString().slice(0, 10);

  // Fetch insights per campaign (parallel)
  return Promise.all(
    campaigns.map(async (campaign: any) => {
      try {
        // Request daily breakdown + aggregated total in parallel
        const timeRange = JSON.stringify({ since: sinceStr, until: untilStr });

        // Daily breakdown (for charts)
        const dailyParams = new URLSearchParams({
          access_token: token,
          fields: "date_start,date_stop,spend,impressions,reach,clicks,actions",
          time_range: timeRange,
          time_increment: "1",
          limit: "100",
        });

        // Aggregated total (for accurate totals — avoids summing daily reach)
        const totalParams = new URLSearchParams({
          access_token: token,
          fields: "spend,impressions,reach,clicks,ctr,cpc,cpm,frequency,actions",
          time_range: timeRange,
          limit: "1",
        });

        const [dailyRes, totalRes] = await Promise.all([
          fetch(`https://graph.facebook.com/v21.0/${campaign.id}/insights?${dailyParams}`),
          fetch(`https://graph.facebook.com/v21.0/${campaign.id}/insights?${totalParams}`),
        ]);

        const dailyData = dailyRes.ok ? await dailyRes.json() : { data: [] };
        const totalData = totalRes.ok ? await totalRes.json() : { data: [] };

        const dailyInsights = dailyData.data ?? [];
        const total = totalData.data?.[0]; // single aggregated row

        const hasData = !!total;

        // ═══ AGGREGATED TOTALS (from the total query — accurate reach/frequency) ═══
        const totalSpend = safeFloat(total?.spend);
        const totalImpressions = safeInt(total?.impressions);
        const totalReach = safeInt(total?.reach);           // accurate — not summed per day
        const totalClicks = safeInt(total?.clicks);
        const frequency = safeFloat(total?.frequency);       // weighted average from API

        // Use API-provided weighted averages (NOT recalculated from daily sums)
        const ctr = safeFloat(total?.ctr);
        const cpc = safeFloat(total?.cpc);
        const cpm = safeFloat(total?.cpm);

        // ═══ ACTION COUNTS (from aggregated total — no double-counting) ═══
        const totalActions = total?.actions as { action_type: string; value: string }[] | undefined;
        const totalMessages = countMessages(totalActions);
        const totalLeads = countActions(totalActions, LEAD_ACTION_TYPES);
        const totalPurchases = countActions(totalActions, PURCHASE_ACTION_TYPES);
        const totalConversions = totalLeads + totalPurchases; // leads + purchases, NOT messages

        // ═══ COST PER RESULT — varies by objective ═══
        const objective = (campaign.objective ?? "").toUpperCase();
        let results = 0;
        let costPerResult = 0;
        if (objective.includes("MESSAGE") || objective.includes("OUTCOME_ENGAGEMENT")) {
          results = totalMessages;
        } else if (objective.includes("LEAD") || objective.includes("OUTCOME_LEADS")) {
          results = totalLeads;
        } else if (objective.includes("CONVERSION") || objective.includes("SALES") || objective.includes("OUTCOME_SALES")) {
          results = totalPurchases > 0 ? totalPurchases : totalConversions;
        } else {
          results = totalConversions > 0 ? totalConversions : totalMessages;
        }
        costPerResult = results > 0 ? totalSpend / results : 0;

        // ═══ DAILY METRICS (from daily query — for charts) ═══
        const dailyMetrics = dailyInsights.map((i: any) => {
          const dayActions = i.actions as { action_type: string; value: string }[] | undefined;
          return {
            date: i.date_start,
            spend: safeFloat(i.spend),
            impressions: safeInt(i.impressions),
            clicks: safeInt(i.clicks),
            conversions: countActions(dayActions, [...LEAD_ACTION_TYPES, ...PURCHASE_ACTION_TYPES]),
            messages: countMessages(dayActions),
            leads: countActions(dayActions, LEAD_ACTION_TYPES),
          };
        });

        return {
          id: campaign.id,
          name: campaign.name,
          objective: campaign.objective,
          status: campaign.status?.toLowerCase() ?? "unknown",
          dailyBudget: campaign.daily_budget ? safeFloat(campaign.daily_budget) / 100 : 0,
          totalBudget: campaign.lifetime_budget ? safeFloat(campaign.lifetime_budget) / 100 : 0,
          startDate: campaign.start_time?.slice(0, 10) ?? "",
          endDate: campaign.stop_time?.slice(0, 10) ?? undefined,
          spend: totalSpend,
          impressions: totalImpressions,
          reach: totalReach,
          clicks: totalClicks,
          ctr,
          cpc,
          cpm,
          frequency,
          conversions: totalConversions,
          costPerConversion: totalConversions > 0 ? totalSpend / totalConversions : 0,
          messages: totalMessages,
          costPerMessage: totalMessages > 0 ? totalSpend / totalMessages : 0,
          leads: totalLeads,
          costPerLead: totalLeads > 0 ? totalSpend / totalLeads : 0,
          results,
          costPerResult,
          dailyMetrics,
          hasData,
          lastSyncAt: syncTimestamp,
        };
      } catch {
        return { id: campaign.id, name: campaign.name, error: true };
      }
    })
  );
}
