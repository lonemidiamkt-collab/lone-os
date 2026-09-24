export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import type { NivelSaude } from "@/lib/scores/health";

/**
 * GET /api/health/clients
 *   → Clientes ativos com a saúde atual + sparkline (14 dias). Admin-only.
 *
 * Escala do escritor único (/api/scores?gravar=1): 100 = saudável; nível saudavel | atencao | risco |
 * sem_dado. Pior primeiro — é quem precisa de conversa.
 */
export async function GET(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "Acesso restrito a administradores" }, { status: 403 });

  const { data: clients, error } = await supabaseAdmin
    .from("clients")
    .select("id, name, nome_fantasia, current_health_score, current_health_level, health_computed_at")
    .is("draft_status", null)
    .or("active.is.null,active.eq.true")
    .not("current_health_level", "is", null)
    .order("current_health_score", { ascending: true, nullsFirst: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000)
    .toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const clientIds = (clients ?? []).map((c) => c.id as string);
  const historyByClient: Record<string, Array<{ date: string; score: number; level: string }>> = {};
  const breakdownByClient: Record<string, unknown> = {};

  if (clientIds.length > 0) {
    const { data: history, error: hErr } = await supabaseAdmin
      .from("client_health_scores")
      .select("client_id, score, level, breakdown, computed_for_date")
      .in("client_id", clientIds)
      .gte("computed_for_date", fourteenDaysAgo)
      .order("computed_for_date", { ascending: true });
    if (hErr) return NextResponse.json({ error: `histórico: ${hErr.message}` }, { status: 500 });

    for (const row of (history ?? []) as Array<Record<string, unknown>>) {
      const cid = row.client_id as string;
      (historyByClient[cid] ??= []).push({
        date: row.computed_for_date as string,
        score: Number(row.score),
        level: row.level as string,
      });
      breakdownByClient[cid] = row.breakdown;
    }
  }

  const enriched = (clients ?? []).map((c) => ({
    id: c.id as string,
    name: (c.nome_fantasia as string) || (c.name as string),
    score: c.current_health_score != null ? Number(c.current_health_score) : null,
    level: c.current_health_level as NivelSaude,
    computed_at: c.health_computed_at as string | null,
    sparkline: historyByClient[c.id as string] ?? [],
    breakdown: breakdownByClient[c.id as string] ?? null,
  }));

  const conta = (n: NivelSaude) => enriched.filter((c) => c.level === n).length;
  const summary = {
    total: enriched.length,
    risco: conta("risco"),
    atencao: conta("atencao"),
    saudavel: conta("saudavel"),
    sem_dado: conta("sem_dado"),
  };

  return NextResponse.json({ clients: enriched, summary });
}
