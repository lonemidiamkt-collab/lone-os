export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import * as db from "@/lib/supabase/queries";

export async function GET(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const socialMedia = url.searchParams.get("socialMedia") ?? undefined;

  // archived=1 → tela "Arquivadas": devolve só as demandas arquivadas (sem o resto do payload).
  if (url.searchParams.get("archived") === "1") {
    const contentCards = await db.fetchContentCards({ ...(socialMedia ? { socialMedia } : {}), archived: true });
    return NextResponse.json({ contentCards });
  }

  const [contentCards, designRequests, contentApprovals, socialReports] = await Promise.all([
    db.fetchContentCards(socialMedia ? { socialMedia } : undefined),
    db.fetchDesignRequests(),
    db.fetchContentApprovals(),
    db.fetchSocialReports(),
  ]);

  return NextResponse.json({ contentCards, designRequests, contentApprovals, socialReports });
}
