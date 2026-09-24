export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireRole, GESTAO } from "@/lib/api/require-role";
import { podeAtualizarDemanda } from "../permissao";

export async function POST(req: NextRequest) {
  const gate = await requireRole(req, [...GESTAO, "social", "designer"]);
  if (gate instanceof NextResponse) return gate;

  const body = await req.json().catch(() => null);
  if (!body?.id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  const { id, ...updates } = body as Record<string, unknown>;
  const row: Record<string, unknown> = {};
  if (updates.status !== undefined) row.status = updates.status;
  if (updates.priority !== undefined) row.priority = updates.priority;
  if (updates.briefing !== undefined) row.briefing = updates.briefing;
  if (updates.format !== undefined) row.format = updates.format;
  if (updates.deadline !== undefined) row.deadline = updates.deadline;
  if (updates.attachments !== undefined) row.attachments = updates.attachments;
  if (updates.designerNote !== undefined) row.designer_note = updates.designerNote;
  // "Assumir demanda": string vazia devolve à carteira do cliente (NULL), não grava "" — vazio no
  // banco faria a regra de dono achar que alguém assumiu e não achar quem.
  if (updates.assignedDesigner !== undefined) {
    const nome = String(updates.assignedDesigner ?? "").trim();
    row.assigned_designer = nome || null;
  }

  if (Object.keys(row).length === 0) return NextResponse.json({ success: true });

  try {
    const { data: dr, error: erroDr } = await supabaseAdmin.from("design_requests")
      .select("client_id, assigned_designer, attachments").eq("id", id as string).maybeSingle();
    if (erroDr) return NextResponse.json({ error: erroDr.message }, { status: 500 });
    if (!dr) return NextResponse.json({ error: "Demanda não encontrada." }, { status: 404 });

    const [{ data: cli }, { data: membro }] = await Promise.all([
      supabaseAdmin.from("clients").select("assigned_designer").eq("id", dr.client_id as string).maybeSingle(),
      supabaseAdmin.from("team_members").select("name").eq("email", (gate.user.email || "").toLowerCase()).maybeSingle(),
    ]);
    const decisao = podeAtualizarDemanda(gate.papel, (membro?.name as string) ?? "", {
      clientId: dr.client_id as string,
      assignedDesigner: (dr.assigned_designer as string) ?? null,
      clienteDesigner: (cli?.assigned_designer as string) ?? null,
      anexosAtuais: (dr.attachments as string[]) ?? [],
    }, updates);
    if (!decisao.ok) return NextResponse.json({ error: decisao.erro }, { status: decisao.status });

    const { error } = await supabaseAdmin.from("design_requests").update(row).eq("id", id as string);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
