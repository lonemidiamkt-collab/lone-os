export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import * as Sentry from "@sentry/nextjs";
import { NextRequest, NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { canWrite, fetchBriefingVersion } from "../../_lib";

// ── GET /api/clients/[id]/briefing/version/[versionId] ────────
// Roles: admin, manager
// Retorna conteúdo completo de uma versão específica pelo UUID.

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> },
) {
  const { id: clientId, versionId } = await params;

  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Sessão inválida" }, { status: 401 });
  if (!canWrite(user)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  Sentry.setContext("briefing_version_get", { client_id: clientId, version_id: versionId, user_email: user.email });

  try {
    const briefing = await fetchBriefingVersion(versionId, clientId);
    if (!briefing) {
      return NextResponse.json({ error: "Versão não encontrada" }, { status: 404 });
    }
    return NextResponse.json({ briefing });
  } catch (err) {
    Sentry.captureException(err, {
      extra: { client_id: clientId, version_id: versionId, user_email: user.email },
    });
    return NextResponse.json({ error: "Erro interno ao buscar versão" }, { status: 500 });
  }
}
