// Meta Marketing API client — server-side only

import { META_CONFIG, getGraphUrl } from "./config";
import { getDateRangeBRT } from "./timezone";

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
  const { since: sinceStr, until: untilStr } = getDateRangeBRT(days);
  console.log(`[Meta API] getCampaignInsights ${campaignId}: ${sinceStr} → ${untilStr} (BRT)`);

  const params = new URLSearchParams({
    access_token: accessToken,
    fields: "date_start,date_stop,spend,impressions,reach,clicks,ctr,cpc,cpm,actions",
    time_range: JSON.stringify({ since: sinceStr, until: untilStr }),
    action_attribution_windows: '["7d_click"]',
    time_increment: "1",
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
  const { since: sinceStr, until: untilStr } = getDateRangeBRT(days);
  console.log(`[Meta API] getAccountInsights ${accountId}: ${sinceStr} → ${untilStr} (BRT)`);

  const params = new URLSearchParams({
    access_token: accessToken,
    fields: "date_start,date_stop,spend,impressions,reach,clicks,ctr,cpc,cpm,actions",
    time_range: JSON.stringify({ since: sinceStr, until: untilStr }),
    action_attribution_windows: '["7d_click"]',
    time_increment: "1",
    limit: "100",
  });

  const res = await fetch(`${url}?${params}`);
  if (!res.ok) throw new Error(`Failed to fetch account insights for ${accountId}`);
  const data = await res.json();
  return data.data ?? [];
}

// ── Portal: date-range insights ──────────────────────────────────────────────

export interface MetaAdInsight {
  ad_id: string;
  ad_name: string;
  spend: string;
  impressions: string;
  reach: string;
  clicks: string;
  ctr: string;
  frequency?: string;
  actions?: { action_type: string; value: string }[];
}

export interface MetaDemographicRow {
  age: string;
  gender: string;
  reach: string;
  impressions: string;
}

export async function getInsightsByDateRange(
  accountId: string,
  accessToken: string,
  since: string,
  until: string,
): Promise<MetaInsight[]> {
  const url = getGraphUrl(`/${accountId}/insights`);
  const params = new URLSearchParams({
    access_token: accessToken,
    fields: "date_start,date_stop,spend,impressions,reach,clicks,ctr,cpc,cpm,actions",
    time_range: JSON.stringify({ since, until }),
    action_attribution_windows: '["7d_click"]',
    time_increment: "1",
    limit: "100",
  });
  const res = await fetch(`${url}?${params}`);
  if (!res.ok) throw new Error(`Meta insights failed for ${accountId}`);
  const data = await res.json();
  return data.data ?? [];
}

/** Retorna uma única linha agregada para o período (sem time_increment).
 *  Solicita ambas as janelas de atribuição para comparação com o Ads Manager.
 *  O objeto de cada action inclui os campos "1d_click" e "7d_click" além de "value".
 */
export async function getInsightsTotalByDateRange(
  accountId: string,
  accessToken: string,
  since: string,
  until: string,
): Promise<MetaInsight | null> {
  const url = getGraphUrl(`/${accountId}/insights`);
  const params = new URLSearchParams({
    access_token: accessToken,
    fields: "date_start,date_stop,spend,impressions,reach,clicks,ctr,cpc,cpm,actions",
    time_range: JSON.stringify({ since, until }),
    action_attribution_windows: '["1d_click","7d_click"]',
    limit: "100",
  });
  const res = await fetch(`${url}?${params}`);
  const rawText = await res.text();
  console.log(`[Meta total] ${accountId} ${since}→${until} status=${res.status} body=`, rawText.slice(0, 500));
  if (!res.ok) throw new Error(`Meta insights total failed for ${accountId}: ${rawText.slice(0, 200)}`);
  const data = JSON.parse(rawText);
  return data.data?.[0] ?? null;
}

export async function getTopAdInsights(
  accountId: string,
  accessToken: string,
  since: string,
  until: string,
  limit = 10,
): Promise<MetaAdInsight[]> {
  const url = getGraphUrl(`/${accountId}/insights`);
  const params = new URLSearchParams({
    access_token: accessToken,
    fields: "ad_id,ad_name,spend,impressions,reach,clicks,ctr,frequency,actions",
    time_range: JSON.stringify({ since, until }),
    action_attribution_windows: '["7d_click"]',
    level: "ad",
    sort: "spend_descending",
    limit: String(limit),
  });
  const res = await fetch(`${url}?${params}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.data ?? [];
}

export async function getAdThumbnail(
  adId: string,
  accessToken: string,
): Promise<string | null> {
  const url = getGraphUrl(`/${adId}`);
  const params = new URLSearchParams({
    access_token: accessToken,
    fields: "creative{thumbnail_url}",
  });
  const res = await fetch(`${url}?${params}`);
  if (!res.ok) return null;
  const data = await res.json();
  return data?.creative?.thumbnail_url ?? null;
}

export async function getDemographicBreakdown(
  accountId: string,
  accessToken: string,
  since: string,
  until: string,
): Promise<MetaDemographicRow[]> {
  const url = getGraphUrl(`/${accountId}/insights`);
  const params = new URLSearchParams({
    access_token: accessToken,
    fields: "reach,impressions",
    breakdowns: "gender,age",
    time_range: JSON.stringify({ since, until }),
    limit: "100",
  });
  const res = await fetch(`${url}?${params}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.data ?? [];
}
