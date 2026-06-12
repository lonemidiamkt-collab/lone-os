// GET /api/system/meta-token-status
// Retorna apenas se o token está em estado crítico (flag no DB).
// Leve — sem chamar Meta API, apenas lê agency_settings.
// Consumido pelo SystemAlertBanner a cada 10min.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireCronOrUser } from "@/lib/api/cron-guard";

export async function GET(req: NextRequest) {
  const denied = await requireCronOrUser(req);
  if (denied) return denied;

  try {
    const { data } = await supabaseAdmin
      .from("agency_settings")
      .select("value")
      .eq("key", "meta_token_critical")
      .single();

    return NextResponse.json({ critical: data?.value === "true" });
  } catch {
    return NextResponse.json({ critical: false });
  }
}
