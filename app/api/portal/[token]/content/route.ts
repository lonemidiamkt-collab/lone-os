export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

// GET /api/portal/[token]/content — conteúdo/artes ENTREGUES do cliente (pro portal de quem tem
// pacote de social/design). Público via token, igual ao snapshot. Retorna posts com arte, recentes.
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const { data: client } = await supabaseAdmin
    .from("clients")
    .select("id, public_report_enabled, public_report_token_revoked_at")
    .eq("public_report_token", token)
    .single();
  if (!client || !client.public_report_enabled || client.public_report_token_revoked_at) {
    return NextResponse.json({ error: "Token inválido ou revogado" }, { status: 404 });
  }

  // Cards ENTREGUES (arte pronta): tem capa (image_url) OU já publicado/agendado. Não traz rascunho.
  const { data: cards } = await supabaseAdmin
    .from("content_cards")
    .select("id, title, format, status, image_url, due_date, scheduled_at, published_at")
    .eq("client_id", client.id as string)
    .not("image_url", "is", null)
    .neq("image_url", "")
    .order("due_date", { ascending: false })
    .limit(24);

  const items = (cards ?? [])
    .filter((c) => (c.image_url as string)?.startsWith("http") || (c.image_url as string)?.startsWith("/"))
    .slice(0, 12)
    .map((c) => ({
      id: c.id as string,
      title: (c.title as string) || "Post",
      format: (c.format as string) || "",
      status: (c.status as string) || "",
      imageUrl: c.image_url as string,
      date: (c.published_at as string) || (c.scheduled_at as string) || (c.due_date as string) || null,
    }));

  return NextResponse.json({ items });
}
