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
  observations: "observations", platform: "platform", dueDate: "due_date",
  nonDeliveryReason: "non_delivery_reason", nonDeliveryReportedBy: "non_delivery_reported_by",
  nonDeliveryReportedAt: "non_delivery_reported_at", workStartedAt: "work_started_at",
  totalTimeSpentMs: "total_time_spent_ms", publishVerifiedAt: "publish_verified_at",
  publishVerifiedBy: "publish_verified_by", blockedReason: "blocked_reason",
  blockedBy: "blocked_by", blockedAt: "blocked_at", scheduledAt: "scheduled_at",
  requestedByTraffic: "requested_by_traffic", trafficSuggestion: "traffic_suggestion",
  lastKanbanActivity: "last_kanban_activity",
};

export async function POST(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Sessão inválida" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  const { id, ...updates } = body as Record<string, unknown>;
  const row: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(updates)) {
    row[KEY_MAP[key] ?? key] = val;
  }

  if (Object.keys(row).length === 0) return NextResponse.json({ success: true });

  try {
    const { error } = await supabaseAdmin.from("content_cards").update(row).eq("id", id as string);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
