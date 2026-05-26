export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import * as db from "@/lib/supabase/queries";

export async function GET(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [trafficReports, trafficRoutineChecks] = await Promise.all([
    db.fetchTrafficReports(),
    db.fetchTrafficRoutineChecks(),
  ]);

  return NextResponse.json({ trafficReports, trafficRoutineChecks });
}
