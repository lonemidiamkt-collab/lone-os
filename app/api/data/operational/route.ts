export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import * as db from "@/lib/supabase/queries";

export async function GET(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [
    timeline, onboardingItems, globalChat, tasks, notices,
    creativeAssets, socialProofs, crisisNotes, quinzReports,
    moodEntries, clientAccess,
  ] = await Promise.all([
    db.fetchTimeline(),
    db.fetchOnboardingItems(),
    db.fetchGlobalChat(),
    db.fetchTasks(),
    db.fetchNotices(),
    db.fetchCreativeAssets(),
    db.fetchSocialProofs(),
    db.fetchCrisisNotes(),
    db.fetchQuinzReports(),
    db.fetchMoodEntries(),
    db.fetchClientAccess(),
  ]);

  return NextResponse.json({
    timeline, onboardingItems, globalChat, tasks, notices,
    creativeAssets, socialProofs, crisisNotes, quinzReports,
    moodEntries, clientAccess,
  });
}
