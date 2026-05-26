export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import * as db from "@/lib/supabase/queries";

export async function GET(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const notifications = await db.fetchNotifications();
  return NextResponse.json({ notifications });
}

export async function POST(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { action, id, type, title, body: msgBody, clientId } = body;

  if (action === "markRead") {
    await db.markNotificationReadDb(id);
  } else if (action === "markAllRead") {
    await db.markAllNotificationsReadDb();
  } else {
    await db.insertNotification({ type, title, body: msgBody, clientId, read: false });
  }

  return NextResponse.json({ ok: true });
}
