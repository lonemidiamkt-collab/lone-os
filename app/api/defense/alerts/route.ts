export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";

/**
 * GET /api/defense/alerts
 *   ?status=unack|ack|all   (default: unack)
 *   ?limit=50
 *
 * Retorna alertas + join com client pra nome.
 */
export async function GET(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? "unack";
  const limit = Math.min(200, parseInt(url.searchParams.get("limit") || "50", 10));

  let query = supabaseAdmin
    .from("anomaly_alerts")
    .select(`
      id, client_id, meta_ad_account_id, metric, severity,
      current_value, baseline_value, percent_change,
      description, metric_date, detected_at,
      acknowledged_at, acknowledged_by,
      clients:client_id ( name, nome_fantasia )
    `)
    .order("detected_at", { ascending: false })
    .limit(limit);

  if (status === "unack") query = query.is("acknowledged_at", null);
  else if (status === "ack") query = query.not("acknowledged_at", "is", null);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Summary (inclui todos, não só filtrados)
  const { data: allAlerts } = await supabaseAdmin
    .from("anomaly_alerts")
    .select("severity, acknowledged_at");

  const all = (allAlerts ?? []) as { severity: string; acknowledged_at: string | null }[];
  const unackAll = all.filter((a) => a.acknowledged_at === null);
  const summary = {
    unack_total: unackAll.length,
    unack_critical: unackAll.filter((a) => a.severity === "critical").length,
    unack_high: unackAll.filter((a) => a.severity === "high").length,
    unack_medium: unackAll.filter((a) => a.severity === "medium").length,
    ack_total: all.length - unackAll.length,
  };

  return NextResponse.json({ alerts: data ?? [], summary });
}
