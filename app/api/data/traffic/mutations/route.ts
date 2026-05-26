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
    case "insertTrafficReport": {
      await db.insertTrafficReport(body.report);
      const trafficReports = await db.fetchTrafficReports();
      return NextResponse.json({ trafficReports });
    }
    case "updateTrafficReport": {
      await db.updateTrafficReportDb(body.id, body.updates);
      const trafficReports = await db.fetchTrafficReports();
      return NextResponse.json({ trafficReports });
    }
    case "insertTrafficCheck": {
      await db.insertTrafficRoutineCheck(body.check);
      const trafficRoutineChecks = await db.fetchTrafficRoutineChecks();
      return NextResponse.json({ trafficRoutineChecks });
    }
    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}
