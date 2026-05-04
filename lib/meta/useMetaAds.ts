"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";

export class TokenExpiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TokenExpiredError";
  }
}

const META_APP_ID = process.env.NEXT_PUBLIC_META_APP_ID ?? "";
const REDIRECT_URI = typeof window !== "undefined" ? `${window.location.origin}/traffic` : "";
const SCOPES = "ads_read,business_management";

// ─── Supabase-backed global token storage ─────────────────────────────────

async function loadGlobalToken(): Promise<{ token: string; expiresAt: number | null; tokenType: "short" | "long" } | null> {
  try {
    const { data } = await supabase.from("agency_settings").select("key, value").in("key", ["meta_token", "meta_token_expires_at", "meta_token_type"]);
    if (!data || data.length === 0) return null;
    const map = new Map(data.map((r: { key: string; value: string }) => [r.key, r.value]));
    const token = map.get("meta_token");
    if (!token) return null;
    const expiresAt = map.get("meta_token_expires_at") ? parseInt(map.get("meta_token_expires_at")!, 10) : null;
    const tokenType = (map.get("meta_token_type") as "short" | "long") ?? "short";
    return { token, expiresAt, tokenType };
  } catch {
    return null;
  }
}

async function saveGlobalToken(token: string, expiresIn?: number, tokenType: "short" | "long" = "short") {
  const expiresAt = expiresIn ? String(Date.now() + (expiresIn - 300) * 1000) : null;
  const rows = [
    { key: "meta_token", value: token, updated_at: new Date().toISOString() },
    { key: "meta_token_type", value: tokenType, updated_at: new Date().toISOString() },
  ];
  if (expiresAt) {
    rows.push({ key: "meta_token_expires_at", value: expiresAt, updated_at: new Date().toISOString() });
  }
  await supabase.from("agency_settings").upsert(rows, { onConflict: "key" }).then(({ error }) => {
    if (error) console.error("[Meta] Failed to save global token:", error);
  });
  // Also cache in localStorage for faster reads
  localStorage.setItem("meta_access_token", token);
  localStorage.setItem("meta_token_type", tokenType);
  if (expiresAt) localStorage.setItem("meta_token_expires_at", expiresAt);
}

async function clearGlobalToken() {
  await supabase.from("agency_settings").delete().in("key", ["meta_token", "meta_token_expires_at", "meta_token_type"]).then(({ error }) => {
    if (error) console.error("[Meta] Failed to clear global token:", error);
  });
  localStorage.removeItem("meta_access_token");
  localStorage.removeItem("meta_token_expires_at");
  localStorage.removeItem("meta_token_type");
}

/** Exchange a short-lived token for a long-lived one (~60 days) via server-side API route */
async function exchangeForLongLivedToken(shortToken: string): Promise<void> {
  try {
    const res = await fetch("/api/meta/exchange-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ short_lived_token: shortToken }),
    });
    if (!res.ok) return;

    const data = await res.json();
    if (data.access_token) {
      await saveGlobalToken(data.access_token, data.expires_in, "long");
    }
  } catch {}
}

interface MetaConnectionState {
  connected: boolean;
  loading: boolean;
  token: string | null;
  tokenExpired: boolean;
  tokenType: "short" | "long" | null;
  tokenExpiresAt: number | null;
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
            setState({ connected: true, loading: false, token, tokenExpired: false, tokenType: "short", tokenExpiresAt: expiresAt });
          }
          window.history.replaceState(null, "", window.location.pathname + window.location.search);
          // Exchange for long-lived token in background, update state when done
          exchangeForLongLivedToken(token).then(async () => {
            const upgraded = await loadGlobalToken();
            if (upgraded && !cancelled) {
              setState({
                connected: true, loading: false, token: upgraded.token, tokenExpired: false,
                tokenType: upgraded.tokenType, tokenExpiresAt: upgraded.expiresAt,
              });
            }
          });
          return;
        }
      }

      // 2. Load from Supabase first (source of truth — shared across all users)
      const global = await loadGlobalToken();
      if (global) {
        if (global.expiresAt && Date.now() > global.expiresAt) {
          await clearGlobalToken();
          if (!cancelled) setState({ connected: false, loading: false, token: null, tokenExpired: true, tokenType: null, tokenExpiresAt: null });
          return;
        }
        if (!cancelled) setState({
          connected: true, loading: false, token: global.token, tokenExpired: false,
          tokenType: global.tokenType, tokenExpiresAt: global.expiresAt,
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
          if (!cancelled) setState({ connected: false, loading: false, token: null, tokenExpired: true, tokenType: null, tokenExpiresAt: null });
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
          tokenType: legacyType, tokenExpiresAt: legacyExpiry ? parseInt(legacyExpiry, 10) : null,
        });
        return;
      }

      // 4. No token anywhere
      if (!cancelled) setState({ connected: false, loading: false, token: null, tokenExpired: false, tokenType: null, tokenExpiresAt: null });
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
    setState({ connected: false, loading: false, token: null, tokenExpired: false, tokenType: null, tokenExpiresAt: null });
  }, []);

  const handleTokenError = useCallback(async () => {
    await clearGlobalToken();
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

// ─── Mensagens / WhatsApp / Messenger ────────────────────────────────────────
// A Meta usa tipos diferentes dependendo do canal e da versão da API.
// Usamos o PRIMEIRO tipo encontrado (prioridade: mais específico primeiro).
const MESSAGE_ACTION_TYPES = [
  // WhatsApp Business (Click-to-WhatsApp)
  "onsite_conversion.messaging_conversation_started_7d",
  // Messenger e Instagram DM
  "onsite_conversion.messaging_first_conversation_started",
  "onsite_conversion.messaging_first_reply",
  // Formato legado (sem prefixo onsite_conversion)
  "messaging_conversation_started_7d",
  // WhatsApp — formato alternativo mais novo
  "onsite_conversion.whatsapp_business_messaging_conversation_started_7d",
  // Click-to-WhatsApp via objetivo Engajamento
  "onsite_conversion.engagement",
] as const;

// ─── Leads ───────────────────────────────────────────────────────────────────
const LEAD_ACTION_TYPES = [
  "lead",
  "onsite_conversion.lead_grouped",
  "offsite_conversion.fb_pixel_lead",
  "offsite_conversion.fb_pixel_complete_registration",
  "onsite_conversion.lead",
] as const;

// ─── Compras / Conversões ────────────────────────────────────────────────────
const PURCHASE_ACTION_TYPES = [
  "offsite_conversion.fb_pixel_purchase",
  "onsite_conversion.purchase",
  "omni_purchase",
] as const;

// ─── Tráfego (link clicks) ───────────────────────────────────────────────────
const TRAFFIC_ACTION_TYPES = [
  "link_click",
  "inline_link_click",
  "landing_page_view",
] as const;

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

function countMessages(actions: { action_type: string; value: string }[] | undefined): number {
  if (!actions) return 0;
  for (const type of MESSAGE_ACTION_TYPES) {
    const found = actions.find((a) => a.action_type === type);
    if (found) return safeInt(found.value);
  }
  return 0;
}

export async function fetchCampaignInsights(
  token: string,
  accountId: string,
  days: number = 7,
  dateFrom?: string,
  dateTo?: string,
) {
  const syncTimestamp = new Date().toISOString();

  const campParams = new URLSearchParams({
    access_token: token,
    fields: "id,name,objective,status,daily_budget,lifetime_budget,start_time,stop_time",
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

  const todayDate = dateFrom && dateTo ? new Date(dateTo) : new Date();
  const sinceDate = dateFrom && dateTo ? new Date(dateFrom) : new Date(todayDate);
  if (!dateFrom || !dateTo) {
    sinceDate.setDate(sinceDate.getDate() - days);
  }
  const sinceStr = sinceDate.toISOString().slice(0, 10);
  const untilStr = todayDate.toISOString().slice(0, 10);

  return Promise.all(
    campaigns.map(async (campaign: any) => {
      try {
        const timeRange = JSON.stringify({ since: sinceStr, until: untilStr });

        const dailyParams = new URLSearchParams({
          access_token: token,
          fields: "date_start,date_stop,spend,impressions,reach,clicks,inline_link_clicks,actions",
          time_range: timeRange,
          time_increment: "1",
          limit: "100",
        });

        const totalParams = new URLSearchParams({
          access_token: token,
          fields: "spend,impressions,reach,clicks,inline_link_clicks,ctr,cpc,cpm,frequency,actions",
          time_range: timeRange,
          limit: "1",
        });

        // Insights por conjunto de anúncios — usado para encontrar o conjunto mais barato de mensagens
        const adsetParams = new URLSearchParams({
          access_token: token,
          fields: "adset_id,adset_name,spend,actions",
          time_range: timeRange,
          level: "adset",
          limit: "50",
        });

        const [dailyRes, totalRes, adsetRes] = await Promise.all([
          fetch(`https://graph.facebook.com/v21.0/${campaign.id}/insights?${dailyParams}`),
          fetch(`https://graph.facebook.com/v21.0/${campaign.id}/insights?${totalParams}`),
          fetch(`https://graph.facebook.com/v21.0/${campaign.id}/insights?${adsetParams}`),
        ]);

        const dailyData = dailyRes.ok ? await dailyRes.json() : { data: [] };
        const totalData = totalRes.ok ? await totalRes.json() : { data: [] };
        const adsetData = adsetRes.ok ? await adsetRes.json() : { data: [] };

        const dailyInsights = dailyData.data ?? [];
        const total = totalData.data?.[0];

        const hasData = !!total;

        const totalSpend = safeFloat(total?.spend);
        const totalImpressions = safeInt(total?.impressions);
        const totalReach = safeInt(total?.reach);
        const totalClicks = safeInt(total?.clicks);
        // inline_link_clicks = somente cliques em links (exclui reações, comentários, etc.)
        // Usado para CTR e CPC mais precisos.
        const inlineLinkClicks = safeInt(total?.inline_link_clicks);
        const frequency = safeFloat(total?.frequency);

        // Preferimos ctr/cpc da Meta quando disponíveis (calculados sobre inline_link_clicks).
        // Se a Meta não retornar, calculamos manualmente com inline_link_clicks.
        const linkClicks = inlineLinkClicks > 0 ? inlineLinkClicks : totalClicks;
        const ctr = safeFloat(total?.ctr) || (totalImpressions > 0 ? (linkClicks / totalImpressions) * 100 : 0);
        const cpc = safeFloat(total?.cpc) || (linkClicks > 0 ? totalSpend / linkClicks : 0);
        const cpm = safeFloat(total?.cpm) || (totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : 0);

        const totalActions = total?.actions as { action_type: string; value: string }[] | undefined;
        const totalMessages = countMessages(totalActions);
        const totalLeads = countActions(totalActions, LEAD_ACTION_TYPES);
        const totalPurchases = countActions(totalActions, PURCHASE_ACTION_TYPES);
        const totalConversions = totalLeads + totalPurchases;
        const totalLinkClicks = countActions(totalActions, TRAFFIC_ACTION_TYPES) || linkClicks;

        const objective = (campaign.objective ?? "").toUpperCase();
        let results = 0;
        let costPerResult = 0;
        if (objective.includes("MESSAGE") || objective.includes("OUTCOME_ENGAGEMENT")) {
          results = totalMessages > 0 ? totalMessages : totalLinkClicks;
        } else if (objective.includes("LEAD") || objective.includes("OUTCOME_LEADS")) {
          results = totalLeads > 0 ? totalLeads : totalMessages;
        } else if (objective.includes("CONVERSION") || objective.includes("SALES") || objective.includes("OUTCOME_SALES")) {
          results = totalPurchases > 0 ? totalPurchases : totalConversions;
        } else if (objective.includes("TRAFFIC") || objective.includes("OUTCOME_TRAFFIC") || objective.includes("LINK_CLICKS")) {
          results = totalLinkClicks;
        } else if (objective.includes("AWARENESS") || objective.includes("OUTCOME_AWARENESS") || objective.includes("REACH")) {
          results = totalReach;
        } else {
          // Fallback: usa o resultado mais relevante disponível
          results = totalMessages > 0 ? totalMessages
            : totalLeads > 0 ? totalLeads
            : totalConversions > 0 ? totalConversions
            : totalLinkClicks;
        }
        costPerResult = results > 0 ? totalSpend / results : 0;

        // Conjunto mais barato de mensagens ativo no período.
        // level=adset retorna um row por conjunto que teve atividade no período.
        // Filtramos os que tiveram mensagens e achamos o menor custo/mensagem.
        const adsetRows: { name: string; spend: number; messages: number; cpm: number }[] =
          (adsetData.data ?? [])
            .map((a: any) => ({
              name: (a.adset_name as string) ?? "",
              spend: safeFloat(a.spend),
              messages: countMessages(a.actions as { action_type: string; value: string }[] | undefined),
              cpm: safeFloat(a.cpm),
            }))
            .filter((a: { spend: number; messages: number }) => a.messages > 0 && a.spend > 0);

        let cheapestAdSetCostPerMessage = totalMessages > 0 ? totalSpend / totalMessages : 0;
        let cheapestAdSetName = "";
        if (adsetRows.length > 0) {
          const best = adsetRows.reduce((min, a) =>
            a.spend / a.messages < min.spend / min.messages ? a : min
          );
          cheapestAdSetCostPerMessage = best.spend / best.messages;
          cheapestAdSetName = best.name;
        }

        const dailyMetrics = dailyInsights.map((i: any) => {
          const dayActions = i.actions as { action_type: string; value: string }[] | undefined;
          const dayInlineLinkClicks = safeInt(i.inline_link_clicks);
          return {
            date: i.date_start,
            spend: safeFloat(i.spend),
            impressions: safeInt(i.impressions),
            clicks: safeInt(i.clicks),
            linkClicks: dayInlineLinkClicks,
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
          costPerMessage: cheapestAdSetCostPerMessage,
          cheapestAdSetName,
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
