// GET /api/health — liveness probe (uptime check, no DB)
// Used by load balancers and monitoring systems to verify the process is alive.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ status: "ok", ts: Date.now() });
}
