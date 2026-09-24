export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { getIgSnapshotCached, normalizeIgPeriod } from "@/lib/meta/igSnapshot";
import { estaPausado } from "@/lib/clients/pausa";
import { criarLimite } from "@/lib/portal/limite";

const LIMITE_PORTAL = criarLimite(30, 60_000); // 30 leituras/min por cliente, só no acesso por token

// GET /api/meta/instagram/[clientId]?period=week|month — relatório orgânico do Instagram do cliente
// (seguidores + alcance do período + posts com curtidas/comentários/views). CACHEADO (6h) pra não
// bater na Meta a cada visita (evita rate limit). Auth: staff logado OU ?token=<portal_token>.
export async function GET(req: NextRequest, { params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const portalToken = req.nextUrl.searchParams.get("token");
  const period = normalizeIgPeriod(req.nextUrl.searchParams.get("period"));
  const force = req.nextUrl.searchParams.get("force") !== null && !portalToken; // portal nunca força (evita rate limit)

  let ok = false;
  if (portalToken) {
    const { data: c } = await supabaseAdmin.from("clients")
      .select("id, public_report_enabled, public_report_token_revoked_at, active, churned_at, paused_at, paused_until")
      .eq("public_report_token", portalToken).eq("id", clientId).maybeSingle();
    // Mesmo portão das rotas do portal: ex-cliente e pausado não leem mais o Instagram pelo link.
    ok = !!c && !!c.public_report_enabled && !c.public_report_token_revoked_at
      && c.active !== false && !c.churned_at && !estaPausado(c);
    if (ok && LIMITE_PORTAL.estourou(clientId)) {
      return NextResponse.json({ error: "Muitas buscas seguidas. Tente em 1 minuto." }, { status: 429 });
    }
  } else {
    ok = !!(await getServerUser(req));
  }
  if (!ok) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const snap = await getIgSnapshotCached(clientId, period, force);
  if (!snap.mapped) return NextResponse.json({ mapped: false, error: "Instagram não mapeado pra este cliente" }, { status: 404 });
  // 409 = a conexão com o perfil precisa ser refeita (ação do time); 502 = a Meta falhou agora.
  if (snap.error) return NextResponse.json({ error: snap.error, needsReconnect: snap.needsReconnect }, { status: snap.needsReconnect ? 409 : 502 });
  return NextResponse.json(snap);
}
