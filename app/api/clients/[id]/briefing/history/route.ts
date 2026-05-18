export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import * as Sentry from "@sentry/nextjs";
import { NextRequest, NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { canWrite, fetchBriefingHistory } from "../_lib";

// ── GET /api/clients/[id]/briefing/history ────────────────────
// Roles: admin, manager
// Retorna metadados de versões históricas (sem conteúdo completo).
// Query params: ?limit=20&offset=0

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: clientId } = await params;

  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Sessão inválida" }, { status: 401 });
  if (!canWrite(user)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const limit  = Math.min(Math.max(Number(searchParams.get("limit")  ?? "20"), 1), 100);
  const offset = Math.max(Number(searchParams.get("offset") ?? "0"), 0);

  Sentry.setContext("briefing_history", { client_id: clientId, user_email: user.email, limit, offset });

  try {
    const result = await fetchBriefingHistory(clientId, limit, offset);
    return NextResponse.json(result);
  } catch (err) {
    Sentry.captureException(err, {
      extra: { client_id: clientId, user_email: user.email },
    });
    return NextResponse.json({ error: "Erro interno ao buscar histórico" }, { status: 500 });
  }
}
