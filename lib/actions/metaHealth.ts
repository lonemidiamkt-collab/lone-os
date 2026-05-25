"use server";

import { supabaseAdmin } from "@/lib/supabase/server";

export interface MetaHealthData {
  status: "green" | "yellow" | "red";
  token_status: {
    valid: boolean;
    expires_at: string | null;
    days_until_expiry: number | null;
  };
  last_successful_sync: string | null;
  hours_since_sync: number | null;
  snapshots_last_24h: { total: number; success: number; failed: number };
  rate_limit_warnings_last_24h: number;
  checked_at: string;
}

export async function getMetaHealth(): Promise<MetaHealthData> {
  const { data: settings } = await supabaseAdmin
    .from("agency_settings")
    .select("key, value")
    .in("key", ["meta_token", "meta_token_expires_at"]);

  const map = new Map((settings ?? []).map((r: { key: string; value: string }) => [r.key, r.value]));
  const hasToken = !!map.get("meta_token");
  const expiresAtRaw = map.get("meta_token_expires_at");
  const expiresAtMs = expiresAtRaw ? parseInt(expiresAtRaw, 10) : null;
  const daysUntilExpiry = expiresAtMs
    ? Math.floor((expiresAtMs - Date.now()) / 86_400_000)
    : null;

  const since24h = new Date(Date.now() - 86_400_000).toISOString();

  const { data: snapshots } = await supabaseAdmin
    .from("client_report_snapshots")
    .select("id")
    .gte("generated_at", since24h);

  const totalSnaps = snapshots?.length ?? 0;

  const { data: lastSnap } = await supabaseAdmin
    .from("client_report_snapshots")
    .select("generated_at")
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const lastSyncAt = lastSnap?.generated_at ?? null;
  const hoursSinceSync = lastSyncAt
    ? (Date.now() - new Date(lastSyncAt).getTime()) / 3_600_000
    : null;

  const tokenValid = hasToken && (daysUntilExpiry === null || daysUntilExpiry > 0);
  const tokenExpiresSoon = daysUntilExpiry !== null && daysUntilExpiry <= 14;
  const syncStale = hoursSinceSync !== null && hoursSinceSync > 2 && totalSnaps > 0;

  let status: "green" | "yellow" | "red";
  if (!tokenValid || syncStale) {
    status = "red";
  } else if (tokenExpiresSoon) {
    status = "yellow";
  } else {
    status = "green";
  }

  return {
    status,
    token_status: {
      valid: tokenValid,
      expires_at: expiresAtMs ? new Date(expiresAtMs).toISOString() : null,
      days_until_expiry: daysUntilExpiry,
    },
    last_successful_sync: lastSyncAt,
    hours_since_sync: hoursSinceSync !== null ? Math.round(hoursSinceSync * 10) / 10 : null,
    snapshots_last_24h: { total: totalSnaps, success: totalSnaps, failed: 0 },
    rate_limit_warnings_last_24h: 0,
    checked_at: new Date().toISOString(),
  };
}
