// GET /api/health/deep — deep health check (all subsystems)
// Admin-only. Checks DB latency, storage, and key agency_settings.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";

export async function GET(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user?.isAdmin) return NextResponse.json({ error: "Acesso restrito" }, { status: 403 });

  const checks: Record<string, unknown> = {};

  // DB latency
  const dbStart = Date.now();
  try {
    const { error } = await supabaseAdmin.from("clients").select("id").limit(1).single();
    checks.db = error && error.code !== "PGRST116"
      ? { ok: false, error: error.message }
      : { ok: true, ms: Date.now() - dbStart };
  } catch (err) {
    checks.db = { ok: false, error: String(err) };
  }

  // Meta token status
  try {
    const { data } = await supabaseAdmin
      .from("agency_settings")
      .select("value")
      .eq("key", "meta_token_expires_at")
      .single();
    const exp = data?.value ? new Date(data.value as string) : null;
    const daysLeft = exp ? Math.floor((exp.getTime() - Date.now()) / 86400000) : null;
    checks.meta_token = { ok: daysLeft === null || daysLeft > 1, days_left: daysLeft };
  } catch {
    checks.meta_token = { ok: false, error: "unable to read" };
  }

  // Notification queue depth
  try {
    const { count } = await supabaseAdmin
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("read", false);
    checks.notifications = { ok: true, unread: count ?? 0 };
  } catch {
    checks.notifications = { ok: false };
  }

  const allOk = Object.values(checks).every((c) => (c as { ok: boolean }).ok);
  return NextResponse.json(
    { status: allOk ? "healthy" : "degraded", checks, ts: Date.now() },
    { status: allOk ? 200 : 207 }
  );
}
