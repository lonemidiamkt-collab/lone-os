// Meta Marketing API client — server-side only

import { META_CONFIG, getGraphUrl } from "./config";

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
}

interface MetaAdAccount {
  id: string;         // "act_123456789"
  name: string;
  account_id: string;
  currency: string;
  account_status: number;
}

interface MetaCampaign {
  id: string;
  name: string;
  objective: string;
  status: string;
  daily_budget?: string;
  lifetime_budget?: string;
  start_time?: string;
  stop_time?: string;
}

interface MetaInsight {
  date_start: string;
  date_stop: string;
  spend: string;
  impressions: string;
  reach: string;
  clicks: string;
  ctr: string;
  cpc: string;
  cpm: string;
  actions?: { action_type: string; value: string }[];
}

// Exchange auth code for access token
export async function exchangeCodeForToken(code: string): Promise<TokenResponse> {
  const url = getGraphUrl("/oauth/access_token");
  const params = new URLSearchParams({
    client_id: META_CONFIG.appId,
    client_secret: META_CONFIG.appSecret,
    redirect_uri: META_CONFIG.redirectUri,
    code,
  });

  const res = await fetch(`${url}?${params}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Meta token exchange failed: ${JSON.stringify(err)}`);
  }
  return res.json();
}

// Exchange short-lived token for long-lived token (60 days)
export async function getLongLivedToken(shortToken: string): Promise<TokenResponse> {
  const url = getGraphUrl("/oauth/access_token");
  const params = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: META_CONFIG.appId,
    client_secret: META_CONFIG.appSecret,
    fb_exchange_token: shortToken,
  });

  const res = await fetch(`${url}?${params}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Meta long-lived token failed: ${JSON.stringify(err)}`);
  }
  return res.json();
}

// Fetch all ad accounts the user has access to
export async function getAdAccounts(accessToken: string): Promise<MetaAdAccount[]> {
  const url = getGraphUrl("/me/adaccounts");
  const params = new URLSearchParams({
    access_token: accessToken,
    fields: "id,name,account_id,currency,account_status",
    limit: "100",
  });

  const res = await fetch(`${url}?${params}`);
  if (!res.ok) throw new Error("Failed to fetch ad accounts");
  const data = await res.json();
  return data.data ?? [];
}

// Fetch campaigns for an ad account
export async function getCampaigns(accountId: string, accessToken: string): Promise<MetaCampaign[]> {
  const url = getGraphUrl(`/${accountId}/campaigns`);
  const params = new URLSearchParams({
    access_token: accessToken,
    fields: "id,name,objective,status,daily_budget,lifetime_budget,start_time,stop_time",
    limit: "100",
  });

  const res = await fetch(`${url}?${params}`);
  if (!res.ok) throw new Error(`Failed to fetch campaigns for ${accountId}`);
  const data = await res.json();
  return data.data ?? [];
}

// Fetch insights for a campaign (last N days)
export async function getCampaignInsights(
  campaignId: string,
  accessToken: string,
  days: number = 7,
): Promise<MetaInsight[]> {
  const url = getGraphUrl(`/${campaignId}/insights`);
  const today = new Date();
  const since = new Date(today);
  since.setDate(since.getDate() - days);

  const params = new URLSearchParams({
    access_token: accessToken,
    fields: "date_start,date_stop,spend,impressions,reach,clicks,ctr,cpc,cpm,actions",
    time_range: JSON.stringify({
      since: since.toISOString().slice(0, 10),
      until: today.toISOString().slice(0, 10),
    }),
    time_increment: "1", // daily breakdown
    limit: "100",
  });

  const res = await fetch(`${url}?${params}`);
  if (!res.ok) throw new Error(`Failed to fetch insights for ${campaignId}`);
  const data = await res.json();
  return data.data ?? [];
}

// Fetch account-level insights (aggregated)
export async function getAccountInsights(
  accountId: string,
  accessToken: string,
  days: number = 30,
): Promise<MetaInsight[]> {
  const url = getGraphUrl(`/${accountId}/insights`);
  const today = new Date();
  const since = new Date(today);
  since.setDate(since.getDate() - days);

  const params = new URLSearchParams({
    access_token: accessToken,
    fields: "date_start,date_stop,spend,impressions,reach,clicks,ctr,cpc,cpm,actions",
    time_range: JSON.stringify({
      since: since.toISOString().slice(0, 10),
      until: today.toISOString().slice(0, 10),
    }),
    time_increment: "1",
    limit: "100",
  });

  const res = await fetch(`${url}?${params}`);
  if (!res.ok) throw new Error(`Failed to fetch account insights for ${accountId}`);
  const data = await res.json();
  return data.data ?? [];
}

// Helper: extract conversions from actions array
export function extractConversions(actions?: { action_type: string; value: string }[]): number {
  if (!actions) return 0;
  const convTypes = ["offsite_conversion", "lead", "onsite_conversion.messaging_conversation_started_7d", "omni_purchase"];
  let total = 0;
  for (const action of actions) {
    if (convTypes.some((t) => action.action_type.includes(t))) {
      total += parseInt(action.value, 10) || 0;
    }
  }
  // fallback: use "results" or any messaging action
  if (total === 0) {
    for (const action of actions) {
      if (action.action_type === "onsite_conversion.messaging_conversation_started_7d" || action.action_type === "link_click") {
        total += parseInt(action.value, 10) || 0;
      }
    }
  }
  return total;
}
