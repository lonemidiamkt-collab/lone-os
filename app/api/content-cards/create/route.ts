export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";

/**
 * POST /api/content-cards/create
 *
 * Cria um content_card via service_role (bypassa RLS).
 * Aceita LocalSession — não exige Supabase auth real.
 */
export async function POST(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Sessão inválida" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || !body.clientId || !body.title) {
    return NextResponse.json({ error: "clientId e title são obrigatórios" }, { status: 400 });
  }

  try {
    const { data, error } = await supabaseAdmin.from("content_cards").insert({
      title: body.title,
      client_id: body.clientId,
      client_name: body.clientName ?? "",
      social_media: body.socialMedia ?? null,
      status: body.status ?? "ideas",
      priority: body.priority ?? "medium",
      format: body.format ?? null,
      platform: body.platform ?? null,
      due_date: body.dueDate ?? null,
      due_time: body.dueTime ?? null,
      briefing: body.briefing ?? null,
      caption: body.caption ?? null,
      requested_by_traffic: body.requestedByTraffic ?? null,
      status_changed_at: new Date().toISOString(),
      column_entered_at: { [body.status ?? "ideas"]: new Date().toISOString() },
    }).select("id").single();

    if (error) {
      console.error("[content-cards/create]", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // ALERTA direcionado ao social responsável pelo card (bell + toast + notificação do SO).
    if (body.socialMedia && body.socialMedia !== body.createdBy) {
      const quando = body.dueDate ? ` (${String(body.dueDate).slice(8, 10)}/${String(body.dueDate).slice(5, 7)})` : "";
      await supabaseAdmin.from("notifications").insert({
        type: "content",
        title: "🖼️ Novo card de conteúdo pra você",
        body: `${body.title}${body.clientName ? ` — ${body.clientName}` : ""}${quando}`,
        client_id: body.clientId,
        target_user: body.socialMedia,
      }).then(() => {}, () => {});
    }

    return NextResponse.json({ id: data.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("[content-cards/create] unhandled:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
