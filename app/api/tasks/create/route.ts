export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";

export async function POST(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Sessão inválida" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.title || !body?.assignedTo) {
    return NextResponse.json({ error: "title e assignedTo são obrigatórios" }, { status: 400 });
  }

  try {
    const { data, error } = await supabaseAdmin.from("tasks").insert({
      title: body.title,
      client_id: body.clientId || null,       // cliente é opcional (tarefa pode ser geral)
      client_name: body.clientName || null,
      assigned_to: body.assignedTo,
      role: body.role ?? "social",
      status: body.status ?? "pending",
      priority: body.priority ?? "medium",
      start_date: body.startDate ?? null,
      due_date: body.dueDate ?? null,
      description: body.description ?? null,
      created_by: body.createdBy ?? null,
    }).select("id").single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // ALERTA direcionado: o colaborador recebe uma notificação (bell + toast + notificação do SO se
    // estiver em outra aba). Não notifica quem criou pra si mesmo. target_user = nome do responsável.
    if (body.assignedTo && body.assignedTo !== body.createdBy) {
      const quando = body.dueDate ? ` (prazo ${String(body.dueDate).slice(8, 10)}/${String(body.dueDate).slice(5, 7)})` : "";
      await supabaseAdmin.from("notifications").insert({
        type: "content",
        title: "📋 Nova tarefa pra você",
        body: `${body.title}${body.clientName ? ` — ${body.clientName}` : ""}${quando}`,
        client_id: body.clientId || null,
        target_user: body.assignedTo,
      }).then(() => {}, () => {});
    }

    return NextResponse.json({ id: data.id });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
