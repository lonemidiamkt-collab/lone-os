export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

// GET /api/ai/audits?clientId=<uuid>&limit=10
// Returns AI audit history for a client (newest first).
export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get("clientId");
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") || "10", 10), 50);

  if (!clientId) {
    return NextResponse.json({ error: "clientId obrigatorio" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("ai_audits")
    .select("id, type, score, status, summary, insights, triggered_by, visible_to_client, created_at")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ audits: data ?? [] });
}
