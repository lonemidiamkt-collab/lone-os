export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import * as db from "@/lib/supabase/queries";

// email → NOME do colaborador (mesmo nome usado em tasks.assigned_to / notifications.target_user).
// Espelha USER_PROFILES; se entrar gente nova no time, adicionar aqui.
const EMAIL_TO_NAME: Record<string, string> = {
  "lonemidiamkt@gmail.com": "Roberto Lino",
  "lucas@lonemidia.com": "Lucas Bueno",
  "julio@lonemidia.com": "Julio",
  "carlos@lonemidia.com": "Carlos Augusto",
  "pedro@lonemidia.com": "Pedro Henrique",
  "rodrigo@lonemidia.com": "Rodrigo",
  "marialuiza@lonemidia.com": "Maria Luiza",
};

export async function GET(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const nome = EMAIL_TO_NAME[user.email];
  const notifications = await db.fetchNotifications(nome);
  return NextResponse.json({ notifications });
}

export async function POST(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { action, id, type, title, body: msgBody, clientId, cardId } = body;

  if (action === "markRead") {
    await db.markNotificationReadDb(id);
  } else if (action === "markAllRead") {
    await db.markAllNotificationsReadDb();
  } else {
    await db.insertNotification({ type, title, body: msgBody, clientId, cardId, read: false });
  }

  return NextResponse.json({ ok: true });
}
