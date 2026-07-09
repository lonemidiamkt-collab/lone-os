export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";

const KEY_MAP: Record<string, string> = {
  status: "status", priority: "priority", imageUrl: "image_url",
  statusChangedAt: "status_changed_at", columnEnteredAt: "column_entered_at",
  designRequestId: "design_request_id", designerDeliveredAt: "designer_delivered_at",
  designerDeliveredBy: "designer_delivered_by", socialConfirmedAt: "social_confirmed_at",
  socialConfirmedBy: "social_confirmed_by", caption: "caption", hashtags: "hashtags",
  observations: "observations", platform: "platform", dueDate: "due_date", dueTime: "due_time",
  nonDeliveryReason: "non_delivery_reason", nonDeliveryReportedBy: "non_delivery_reported_by",
  nonDeliveryReportedAt: "non_delivery_reported_at", workStartedAt: "work_started_at",
  totalTimeSpentMs: "total_time_spent_ms", publishVerifiedAt: "publish_verified_at",
  publishVerifiedBy: "publish_verified_by", blockedReason: "blocked_reason",
  blockedBy: "blocked_by", blockedAt: "blocked_at", scheduledAt: "scheduled_at",
  requestedByTraffic: "requested_by_traffic", trafficSuggestion: "traffic_suggestion",
  lastKanbanActivity: "last_kanban_activity", archivedAt: "archived_at",
};

export async function POST(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Sessão inválida" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  const { id, ...updates } = body as Record<string, unknown>;

  // contentApproval NÃO é coluna de content_cards — é uma linha na tabela
  // content_approvals (aprovar/reprovar arte). Separa antes de montar o update,
  // senão o Postgres rejeita a query inteira (coluna inexistente) → "Falha ao confirmar a arte".
  const contentApproval = updates.contentApproval as
    | { status: string; reviewedBy?: string; reviewedAt?: string; reason?: string }
    | undefined;
  delete updates.contentApproval;

  const row: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(updates)) {
    row[KEY_MAP[key] ?? key] = val;
  }

  if (Object.keys(row).length === 0 && !contentApproval) {
    return NextResponse.json({ success: true });
  }

  try {
    if (Object.keys(row).length > 0) {
      const { error } = await supabaseAdmin.from("content_cards").update(row).eq("id", id as string);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Sincroniza briefing E prazo pro card do DESIGNER: ele lê design_requests.briefing/deadline
    // (uma CÓPIA feita quando a arte foi solicitada). Sem isso, o social edita o briefing ou remarca
    // a data e o designer continua vendo o texto/prazo antigo — foi o bug reportado. O card mostra a
    // data nova e a fila do designer a antiga → duas datas divergentes. Best-effort: não derruba o save.
    if (row.briefing !== undefined || row.due_date !== undefined || row.title !== undefined) {
      try {
        const drUpdate: Record<string, unknown> = {};
        if (row.briefing !== undefined) drUpdate.briefing = row.briefing;
        if (row.due_date !== undefined) drUpdate.deadline = row.due_date;
        // O design_request guarda o título como "Arte: <título do card>" — espelha ao renomear.
        if (row.title !== undefined) drUpdate.title = `Arte: ${row.title}`;
        const { data: card } = await supabaseAdmin
          .from("content_cards").select("design_request_id").eq("id", id as string).maybeSingle();
        const drId = (card?.design_request_id as string) || null;
        if (drId) {
          await supabaseAdmin.from("design_requests").update(drUpdate).eq("id", drId);
        } else {
          await supabaseAdmin.from("design_requests").update(drUpdate).eq("content_card_id", id as string);
        }
      } catch (e) {
        console.error("[content-cards/update] sync briefing/prazo→design_request falhou (ignorado):", e);
      }
    }

    if (contentApproval) {
      // Uma aprovação vigente por card. INSERT-FIRST (não delete-first): grava a nova e SÓ ENTÃO
      // apaga as anteriores. Antes o delete vinha primeiro — se o insert falhasse, o card ficava
      // SEM aprovação nenhuma; e 2 revisores juntos geravam 2 linhas. Assim nunca fica sem, nem dupla.
      const { data: novaAppr, error: apprErr } = await supabaseAdmin.from("content_approvals").insert({
        card_id:     id as string,
        status:      contentApproval.status,
        reviewed_by: contentApproval.reviewedBy ?? null,
        reviewed_at: contentApproval.reviewedAt ?? null,
        reason:      contentApproval.reason ?? null,
      }).select("id").single();
      if (apprErr) return NextResponse.json({ error: apprErr.message }, { status: 500 });
      if (novaAppr?.id) {
        await supabaseAdmin.from("content_approvals").delete().eq("card_id", id as string).neq("id", novaAppr.id as string);
      }

      // Log append-only de retrabalho: o delete acima apaga o histórico de reprovações, então
      // cada reprovação é registrada à parte (denormalizada) pra medir taxa de retrabalho por
      // social/cliente. Best-effort — não derruba a reprovação se o log falhar.
      if (contentApproval.status === "rejected") {
        try {
          const { data: card } = await supabaseAdmin
            .from("content_cards").select("client_id, client_name, social_media").eq("id", id as string).maybeSingle();
          await supabaseAdmin.from("cs_rework_events").insert({
            card_id:      id as string,
            client_id:    card?.client_id ?? null,
            client_name:  card?.client_name ?? null,
            social_media: card?.social_media ?? null,
            reviewed_by:  contentApproval.reviewedBy ?? null,
            reason:       contentApproval.reason ?? null,
          });
        } catch (e) {
          console.error("[content-cards/update] rework log falhou (ignorado):", e);
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
