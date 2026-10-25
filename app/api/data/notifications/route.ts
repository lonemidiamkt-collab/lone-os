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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const nome = EMAIL_TO_NAME[user.email];
  // Falha ≠ "Tudo em dia" (24/10/2026, auditoria 4.11): sem ler o banco, o sino diz que não carregou.
  const r = await db.lerNotificacoes(nome);
  if (!r.ok) return NextResponse.json({ error: "Não consegui carregar os avisos agora." }, { status: 503 });
  return NextResponse.json({ notifications: r.notifications });
}

export async function POST(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  const { action, id, ids, type, title, body: msgBody, clientId, cardId } = body;

  if (action === "markRead" || action === "markAllRead" || action === "markUnread") {
    // SÓ OS IDS DA TELA, SÓ OS DESTA PESSOA (21/10/2026). "markAllRead" sem lista era o botão velho
    // que marcava a tabela inteira: aba antiga (JS de antes do deploy) recebe o pedido de recarregar
    // em vez de limpar o sino do time. "markUnread" é o Desfazer.
    const lista: unknown[] = action === "markRead" ? [id] : Array.isArray(ids) ? ids : [];
    const validos = [...new Set(lista.filter((x): x is string => typeof x === "string" && UUID.test(x)))].slice(0, 200);
    if (!validos.length) {
      return NextResponse.json({ error: "Não recebi quais avisos marcar. Recarregue a página e tente de novo." }, { status: 400 });
    }
    const r = await db.marcarAvisosLidosDb(validos, EMAIL_TO_NAME[user.email] ?? null, action !== "markUnread");
    if (r.error) {
      return NextResponse.json({ error: action === "markUnread"
        ? "Não consegui desfazer: os avisos continuam como lidos. Tente de novo."
        : "Não consegui marcar como lidos agora — os avisos continuam não lidos. Tente de novo." }, { status: 500 });
    }
    return NextResponse.json({ ok: true, marcados: r.marcados });
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
}
