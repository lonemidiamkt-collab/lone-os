export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";

export async function POST(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Sessão inválida" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  const { id, ...updates } = body as Record<string, unknown>;

  const row: Record<string, unknown> = {};
  if (updates.status !== undefined) row.status = updates.status;
  if (updates.priority !== undefined) row.priority = updates.priority;
  if (updates.assignedTo !== undefined) row.assigned_to = updates.assignedTo;
  if (updates.dueDate !== undefined) row.due_date = updates.dueDate;
  if (updates.description !== undefined) row.description = updates.description;
  if (updates.workStartedAt !== undefined) row.work_started_at = updates.workStartedAt;
  if (updates.totalTimeSpentMs !== undefined) row.total_time_spent_ms = updates.totalTimeSpentMs;

  if (Object.keys(row).length === 0) return NextResponse.json({ success: true });

  try {
    const { error } = await supabaseAdmin.from("tasks").update(row).eq("id", id as string);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
