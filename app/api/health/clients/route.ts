export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";

/**
 * GET /api/health
 *   → Lista de clientes com score atual + sparkline (14 dias).
 *   Admin-only (dados sensíveis agregados: time não deve ver pipeline de risco).
 *
 * Retorna:
 *   { clients: [{ id, name, score, level, breakdown, computed_at, sparkline: [{date, score}] }], summary: {...} }
 */
export async function GET(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "Acesso restrito a administradores" }, { status: 403 });

  // Todos clientes não-onboarding com score calculado
  const { data: clients, error } = await supabaseAdmin
    .from("clients")
    .select("id, name, nome_fantasia, current_health_score, current_health_level, health_computed_at")
    .neq("status", "onboarding")
    .not("current_health_score", "is", null)
    .order("current_health_score", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 14 dias de histórico em um único query
  const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
  const clientIds = (clients ?? []).map((c) => c.id);
  let historyByClient: Record<string, Array<{ date: string; score: number; level: string }>> = {};
  let breakdownByClient: Record<string, Record<string, number>> = {};

  if (clientIds.length > 0) {
    const { data: history } = await supabaseAdmin
      .from("client_health_scores")
      .select("client_id, score, level, breakdown, computed_for_date")
      .in("client_id", clientIds)
      .gte("computed_for_date", fourteenDaysAgo)
      .order("computed_for_date", { ascending: true });

    for (const row of (history ?? []) as Array<Record<string, unknown>>) {
      const cid = row.client_id as string;
      if (!historyByClient[cid]) historyByClient[cid] = [];
      historyByClient[cid].push({
        date: row.computed_for_date as string,
        score: Number(row.score),
        level: row.level as string,
      });
      // Mantém breakdown do snapshot mais recente
      breakdownByClient[cid] = row.breakdown as Record<string, number>;
    }
  }

  const enriched = (clients ?? []).map((c) => ({
    id: c.id,
    name: c.nome_fantasia || c.name,
    score: c.current_health_score ? Number(c.current_health_score) : null,
    level: c.current_health_level,
    computed_at: c.health_computed_at,
    sparkline: historyByClient[c.id as string] ?? [],
    breakdown: breakdownByClient[c.id as string] ?? {},
  }));

  const summary = {
    total: enriched.length,
    critical: enriched.filter((c) => c.level === "critical").length,
    high: enriched.filter((c) => c.level === "high").length,
    attention: enriched.filter((c) => c.level === "attention").length,
    safe: enriched.filter((c) => c.level === "safe").length,
  };

  return NextResponse.json({ clients: enriched, summary });
}
