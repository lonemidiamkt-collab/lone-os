export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { erroDaEdicao } from "@/lib/tarefas/editar";

export async function POST(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Sessão inválida" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  const { id, ...updates } = body as Record<string, unknown>;

  // 25/10/2026 (auditoria 13.5): "Editar" a tarefa — título, cliente e papel passam a ser aceitos (antes só status,
  // prioridade, pessoa, prazo e detalhes). Campo limpo chega como "" e vira null: prazo apagado sai de verdade.
  const invalida = erroDaEdicao(updates);
  if (invalida) return NextResponse.json({ error: invalida }, { status: 400 });

  const row: Record<string, unknown> = {};
  if (updates.status !== undefined) row.status = updates.status;
  if (updates.priority !== undefined) row.priority = updates.priority;
  if (updates.assignedTo !== undefined) row.assigned_to = updates.assignedTo;
  if (updates.role !== undefined) row.role = updates.role;
  if (updates.title !== undefined) row.title = String(updates.title).trim();
  if (updates.clientId !== undefined) row.client_id = updates.clientId || null;
  if (updates.clientName !== undefined) row.client_name = updates.clientName || null;
  if (updates.dueDate !== undefined) row.due_date = updates.dueDate || null;
  if (updates.description !== undefined) row.description = updates.description || null;
  if (updates.workStartedAt !== undefined) row.work_started_at = updates.workStartedAt;
  if (updates.totalTimeSpentMs !== undefined) row.total_time_spent_ms = updates.totalTimeSpentMs;

  if (Object.keys(row).length === 0) return NextResponse.json({ success: true });

  try {
    // Passou para outra pessoa? Quem recebe é avisado, como na criação (sem avisar quem passou para si mesmo).
    const trocouDono = typeof updates.assignedTo === "string" && updates.assignedTo.trim() !== "";
    const antes = trocouDono
      ? (await supabaseAdmin.from("tasks").select("title, assigned_to, client_id, client_name, due_date").eq("id", id as string).maybeSingle()).data
      : null;

    const { error } = await supabaseAdmin.from("tasks").update(row).eq("id", id as string);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    if (trocouDono && antes && antes.assigned_to !== updates.assignedTo) {
      const { data: eu } = await supabaseAdmin.from("team_members").select("name").eq("email", user.email).maybeSingle();
      if (eu?.name !== updates.assignedTo) {
        const titulo = (row.title as string) ?? (antes.title as string);
        const cliente = (row.client_name as string | null | undefined) ?? (antes.client_name as string | null);
        const prazo = (row.due_date as string | null | undefined) ?? (antes.due_date as string | null);
        const quando = prazo ? ` (prazo ${String(prazo).slice(8, 10)}/${String(prazo).slice(5, 7)})` : "";
        const { error: eNot } = await supabaseAdmin.from("notifications").insert({
          type: "content",
          title: "📋 Tarefa passada pra você",
          body: `${titulo}${cliente ? ` — ${cliente}` : ""}${quando}`,
          client_id: (row.client_id as string | null | undefined) ?? (antes.client_id as string | null) ?? null,
          target_user: updates.assignedTo,
        });
        if (eNot) console.warn("[tasks/update] aviso ao novo responsável não gravado:", eNot.message);
      }
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
