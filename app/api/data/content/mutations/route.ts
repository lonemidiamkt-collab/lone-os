export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import * as db from "@/lib/supabase/queries";

export async function POST(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { action } = body;

  switch (action) {
    case "insertSocialReport": {
      await db.insertSocialReport(body.report);
      const socialReports = await db.fetchSocialReports();
      return NextResponse.json({ socialReports });
    }
    case "updateSocialReport": {
      await db.updateSocialReportDb(body.id, body.updates);
      return NextResponse.json({ ok: true });
    }
    case "upsertContentApproval": {
      await db.upsertContentApproval(body.approval);
      return NextResponse.json({ ok: true });
    }
    case "addCardComment": {
      console.log("[mutations] addCardComment card=", body.cardId, "author=", body.author, "role=", body.role);
      try {
        await db.insertCardComment(body.cardId, body.author, body.text, body.role);
        return NextResponse.json({ ok: true });
      } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : "erro ao salvar comentário" }, { status: 500 });
      }
    }
    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}
