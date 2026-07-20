// GET /api/cs/calendario/recentes — últimos calendários gerados (jobs done), pro board.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { data } = await supabaseAdmin.from("content_calendar_jobs")
    .select("id, client_id, modo, created_at, result")
    .eq("status", "done").order("created_at", { ascending: false }).limit(30);

  const items = (data ?? []).map((j) => {
    const r = (j.result ?? {}) as { cliente?: string; periodo?: string; pecas?: unknown[] };
    return {
      jobId: j.id as string, clientId: j.client_id as string, modo: j.modo as string,
      cliente: r.cliente ?? "", periodo: r.periodo ?? "", nPecas: Array.isArray(r.pecas) ? r.pecas.length : 0,
      createdAt: j.created_at as string,
    };
  });
  return NextResponse.json({ items });
}
