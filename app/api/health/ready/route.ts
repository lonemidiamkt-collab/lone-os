// GET /api/health/ready — readiness probe (verifies DB connection)
// Returns 200 only when the app can serve real traffic.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function GET() {
  const start = Date.now();
  try {
    const { error } = await supabaseAdmin.from("clients").select("id").limit(1).single();
    // PGRST116 = no rows found — that's OK, DB is reachable
    if (error && error.code !== "PGRST116") {
      return NextResponse.json({ status: "not_ready", error: error.message }, { status: 503 });
    }
    return NextResponse.json({ status: "ready", db_ms: Date.now() - start });
  } catch (err) {
    return NextResponse.json({ status: "not_ready", error: String(err) }, { status: 503 });
  }
}
