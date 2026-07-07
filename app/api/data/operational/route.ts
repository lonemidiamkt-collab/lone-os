export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { supabaseAdmin } from "@/lib/supabase/server";
import * as db from "@/lib/supabase/queries";

export async function GET(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Cofre (client_access — senhas em texto plano) só pra admin/manager/social. Tráfego, designer
  // e comercial/SDR NÃO recebem — antes qualquer logado puxava o cofre inteiro por aqui.
  const { data: tm } = await supabaseAdmin.from("team_members").select("role").eq("email", user.email).maybeSingle();
  const role = ((tm?.role as string) || "").toLowerCase();
  const canSeeCofre = user.isAdmin || ["admin", "manager", "social"].includes(role);

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
    canSeeCofre ? db.fetchClientAccess() : Promise.resolve({}),
  ]);

  return NextResponse.json({
    timeline, onboardingItems, globalChat, tasks, notices,
    creativeAssets, socialProofs, crisisNotes, quinzReports,
    moodEntries, clientAccess,
  });
}
