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
  "thiago@lonemidia.com": "Thiago",
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
    // RESOLVE O CARD NO SERVIDOR QUANDO NÃO VEIO.
    //
    // A tela já manda o cardId, mas depender disso significa depender de TODA aba do time estar
    // com o JS novo — e aba velha não recarrega sozinha. Enquanto isso, cada aviso nascia sem
    // vínculo e levava o designer pro cadastro do cliente em vez da arte.
    //
    // O corpo do aviso sempre cita o item entre aspas: "TER 28" (Cliente) — arte pronta…
    // Esse título é o da DEMANDA nos avisos do designer e o do CARD nos do social, então tento os
    // dois caminhos. Só aceita casamento ÚNICO: mandar pro card errado é pior que pro cadastro.
    let resolvido = cardId as string | undefined;
    if (!resolvido && clientId && typeof msgBody === "string") {
      const m = /"([^"]+)"/.exec(msgBody);
      if (m) resolvido = (await db.resolverCardPorTitulo(clientId as string, m[1])) ?? undefined;
    }
    const criada = await db.insertNotification({ type, title, body: msgBody, clientId, cardId: resolvido, read: false });
    // Devolve a linha pra tela trocar o item otimista pelo real (id e horário do SERVIDOR).
    return NextResponse.json({ ok: true, notification: criada });
  }

  return NextResponse.json({ ok: true });
}
