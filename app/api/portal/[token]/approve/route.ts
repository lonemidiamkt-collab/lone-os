export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

// POST /api/portal/[token]/approve — o CLIENTE aprova (ou pede ajuste em) uma arte entregue, pelo
// próprio link do portal. Valida token + que o card é DELE. Aprovar → client_approved_at + notifica o
// time. Ajuste → salva o comentário + notifica. Público via token; rate-limit por token.

const RATE = new Map<string, { count: number; reset: number }>();
function limited(token: string): boolean {
  const now = Date.now();
  const e = RATE.get(token);
  if (!e || e.reset < now) { RATE.set(token, { count: 1, reset: now + 60_000 }); return false; }
  if (e.count >= 20) return true; // até 20 ações/min por token
  e.count++; return false;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (limited(token)) return NextResponse.json({ error: "Muitas ações. Aguarde 1 minuto." }, { status: 429 });

  const { data: client } = await supabaseAdmin
    .from("clients").select("id, name, nome_fantasia, public_report_enabled, public_report_token_revoked_at")
    .eq("public_report_token", token).single();
  if (!client || !client.public_report_enabled || client.public_report_token_revoked_at) {
    return NextResponse.json({ error: "Link inválido ou expirado" }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as { cardId?: string; action?: string; comment?: string };
  const cardId = (body.cardId || "").trim();
  const action = body.action === "ajuste" ? "ajuste" : "approve";
  const comment = (body.comment || "").trim().slice(0, 500);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cardId)) {
    return NextResponse.json({ error: "Card inválido" }, { status: 400 });
  }
  if (action === "ajuste" && !comment) {
    return NextResponse.json({ error: "Diga o que ajustar." }, { status: 422 });
  }

  // O card TEM que ser deste cliente (não dá pra aprovar arte de outro).
  const { data: card } = await supabaseAdmin
    .from("content_cards").select("id, title, designer_delivered_at, client_approved_at")
    .eq("id", cardId).eq("client_id", client.id as string).maybeSingle();
  if (!card) return NextResponse.json({ error: "Arte não encontrada" }, { status: 404 });
  if (!card.designer_delivered_at) return NextResponse.json({ error: "Essa arte ainda não foi entregue." }, { status: 409 });

  const nome = (client.nome_fantasia as string) || (client.name as string) || "Cliente";
  const titulo = (card.title as string) || "arte";

  if (action === "approve") {
    // Atômico: só marca (e notifica) se ainda NÃO estava aprovada — evita duplo aviso no clique repetido.
    const { data: upd } = await supabaseAdmin.from("content_cards")
      .update({ client_approved_at: new Date().toISOString() })
      .eq("id", cardId).is("client_approved_at", null).select("id");
    if (upd && upd.length > 0) {
      await supabaseAdmin.from("notifications").insert({
        type: "content", title: `🎉 ${nome} aprovou a arte`,
        body: `"${titulo}" — o cliente aprovou pelo portal. Já pode agendar/postar.`,
        client_id: client.id as string,
      }).then(() => {}, () => {});
    }
    return NextResponse.json({ ok: true, action: "approve" });
  }

  // Ajuste: guarda o comentário (best-effort no card_comments) e notifica o time.
  await supabaseAdmin.from("card_comments").insert({
    card_id: cardId, author: nome, role: "client", text: `(pelo portal) ${comment}`,
  }).then(() => {}, () => {});
  await supabaseAdmin.from("notifications").insert({
    type: "content", title: `✏️ ${nome} pediu ajuste`,
    body: `"${titulo}": ${comment}`,
    client_id: client.id as string,
  }).then(() => {}, () => {});
  return NextResponse.json({ ok: true, action: "ajuste" });
}
