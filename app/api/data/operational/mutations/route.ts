export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import * as db from "@/lib/supabase/queries";
import type { Role } from "@/lib/types";

export async function POST(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { action } = body;

  switch (action) {
    case "insertTimeline": {
      await db.insertTimelineEntry(body.entry);
      const timeline = await db.fetchTimeline();
      return NextResponse.json({ timeline });
    }
    case "updateOnboarding": {
      await db.updateOnboardingItemDb(body.itemId, body.completed, body.actor);
      return NextResponse.json({ ok: true });
    }
    case "insertGlobalChat": {
      await db.insertGlobalChatMessage(body.user, body.role as Role, body.text);
      return NextResponse.json({ ok: true });
    }
    case "insertMood": {
      await db.insertMoodEntry(body.clientId, body.mood, body.note, body.actor);
      return NextResponse.json({ ok: true });
    }
    case "upsertClientAccess": {
      await db.upsertClientAccess(body.clientId, body.access, body.actor);
      return NextResponse.json({ ok: true });
    }
    case "insertCreativeAsset": {
      await db.insertCreativeAsset(body.asset);
      const creativeAssets = await db.fetchCreativeAssets();
      return NextResponse.json({ creativeAssets });
    }
    case "insertSocialProof": {
      await db.insertSocialProof(body.entry);
      const socialProofs = await db.fetchSocialProofs();
      return NextResponse.json({ socialProofs });
    }
    case "insertCrisisNote": {
      await db.insertCrisisNote(body.clientId, body.note, body.actor);
      const crisisNotes = await db.fetchCrisisNotes();
      return NextResponse.json({ crisisNotes });
    }
    case "insertQuinzReport": {
      await db.insertQuinzReport(body.report);
      const quinzReports = await db.fetchQuinzReports();
      return NextResponse.json({ quinzReports });
    }
    case "insertNotice": {
      await db.insertNotice(body.data);
      const notices = await db.fetchNotices();
      return NextResponse.json({ notices });
    }
    case "deleteNotice": {
      await db.deleteNoticeDb(body.id);
      const notices = await db.fetchNotices();
      return NextResponse.json({ notices });
    }
    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}
