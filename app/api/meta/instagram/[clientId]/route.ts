export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import * as Sentry from "@sentry/nextjs";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { getIgSnapshotCached, normalizeIgPeriod, paraOPortal } from "@/lib/meta/igSnapshot";
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

  // Portal: relatório de até 48h sai na hora e atualiza por trás (o cliente nunca espera a Meta).
  const snap = await getIgSnapshotCached(clientId, period, force, { servirVelho: !!portalToken });
  if (!snap.mapped) return NextResponse.json({ mapped: false, estado: "nao_conectado", error: "Instagram não mapeado pra este cliente" }, { status: 404 });
  // FALHA VOLTA 200 COM `estado` (04/11/2026). Era 409/502: o Cloudflare troca o corpo de um 502 pela
  // página de erro dele, e o motivo da Meta sumia no caminho (ACM, Dumar e Veneza só viam "não consegui").
  if (snap.error) {
    Sentry.captureMessage("Instagram: relatório indisponível", { level: "warning", extra: { clientId, period, motivo: snap.error } });
    return NextResponse.json({ mapped: true, estado: snap.needsReconnect ? "reconectar" : "falha", error: snap.error, needsReconnect: !!snap.needsReconnect });
  }
  return NextResponse.json({ ...(portalToken ? paraOPortal(snap) : snap), estado: "ok" });
}
