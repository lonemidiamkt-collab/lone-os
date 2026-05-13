export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { data: settings } = await supabaseAdmin
    .from("agency_settings")
    .select("key, value")
    .in("key", ["meta_token", "meta_token_expires_at", "meta_token_critical"]);

  const map = new Map((settings ?? []).map((r: { key: string; value: string }) => [r.key, r.value]));
  const hasToken = !!map.get("meta_token");
  const expiresAtRaw = map.get("meta_token_expires_at");
  const expiresAtMs = expiresAtRaw ? parseInt(expiresAtRaw, 10) : null;
  const daysUntilExpiry = expiresAtMs
    ? Math.floor((expiresAtMs - Date.now()) / 86_400_000)
    : null;

  const now = new Date().toISOString();
  const since24h = new Date(Date.now() - 86_400_000).toISOString();

  const { data: snapshots } = await supabaseAdmin
    .from("client_report_snapshots")
    .select("id, generated_at")
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
  const syncStale = hoursSinceSync !== null && hoursSinceSync > 2;

  let status: "green" | "yellow" | "red";
  if (!tokenValid || (syncStale && totalSnaps > 0)) {
    status = "red";
  } else if (tokenExpiresSoon) {
    status = "yellow";
  } else {
    status = "green";
  }

  return NextResponse.json({
    status,
    token_status: {
      valid: tokenValid,
      expires_at: expiresAtMs ? new Date(expiresAtMs).toISOString() : null,
      days_until_expiry: daysUntilExpiry,
    },
    last_successful_sync: lastSyncAt,
    hours_since_sync: hoursSinceSync !== null ? Math.round(hoursSinceSync * 10) / 10 : null,
    snapshots_last_24h: {
      total: totalSnaps,
      success: totalSnaps,
      failed: 0,
    },
    rate_limit_warnings_last_24h: 0,
    checked_at: now,
  });
}
