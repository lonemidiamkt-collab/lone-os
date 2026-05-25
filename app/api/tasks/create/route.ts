export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";

export async function POST(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Sessão inválida" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.title || !body?.clientId) {
    return NextResponse.json({ error: "title e clientId são obrigatórios" }, { status: 400 });
  }

  try {
    const { data, error } = await supabaseAdmin.from("tasks").insert({
      title: body.title,
      client_id: body.clientId,
      client_name: body.clientName ?? "",
      assigned_to: body.assignedTo ?? null,
      role: body.role ?? null,
      status: body.status ?? "pending",
      priority: body.priority ?? "medium",
      start_date: body.startDate ?? null,
      due_date: body.dueDate ?? null,
      description: body.description ?? null,
    }).select("id").single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ id: data.id });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
