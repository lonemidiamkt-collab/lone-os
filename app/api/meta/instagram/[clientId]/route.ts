export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { getIgSnapshotCached, type IgPeriod } from "@/lib/meta/igSnapshot";

// GET /api/meta/instagram/[clientId]?period=week|month — relatório orgânico do Instagram do cliente
// (seguidores + alcance do período + posts com curtidas/comentários/views). CACHEADO (6h) pra não
// bater na Meta a cada visita (evita rate limit). Auth: staff logado OU ?token=<portal_token>.
export async function GET(req: NextRequest, { params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const portalToken = req.nextUrl.searchParams.get("token");
  const period = (req.nextUrl.searchParams.get("period") === "week" ? "week" : "month") as IgPeriod;
  const force = req.nextUrl.searchParams.get("force") !== null && !portalToken; // portal nunca força (evita rate limit)

  let ok = false;
  if (portalToken) {
    const { data: c } = await supabaseAdmin.from("clients").select("id, public_report_enabled, public_report_token_revoked_at").eq("public_report_token", portalToken).eq("id", clientId).maybeSingle();
    ok = !!c && !!c.public_report_enabled && !c.public_report_token_revoked_at;
  } else {
    ok = !!(await getServerUser(req));
  }
  if (!ok) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const snap = await getIgSnapshotCached(clientId, period, force);
  if (!snap.mapped) return NextResponse.json({ mapped: false, error: "Instagram não mapeado pra este cliente" }, { status: 404 });
  if (snap.error) return NextResponse.json({ error: snap.error, needsReconnect: snap.needsReconnect }, { status: 502 });
  return NextResponse.json(snap);
}
