// app/api/clients/[id]/lifecycle/route.ts
//
// Arquivar (churn) / reativar um cliente. Admin/manager apenas.
//   archive    → active=false, churned_at=now, churn_reason=<motivo>
//   reactivate → active=true,  churned_at=null, churn_reason=null
//
// Offboarding de ex-cliente NÃO apaga histórico — só tira da operação (todos os
// filtros de cliente ativo exigem active=true). Base das métricas de churn.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";

const Schema = z.object({
  action: z.enum(["archive", "reactivate"]),
  reason: z.string().max(512).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Sessão inválida" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "Acesso restrito a admin/manager" }, { status: 403 });

  const { id } = await params;
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos", issues: parsed.error.issues }, { status: 422 });
  }

  const { action, reason } = parsed.data;
  const row =
    action === "archive"
      ? { active: false, churned_at: new Date().toISOString(), churn_reason: reason?.trim() || null }
      : { active: true, churned_at: null, churn_reason: null };

  const { data, error } = await supabaseAdmin
    .from("clients")
    .update(row)
    .eq("id", id)
    .select("id, name, active, churned_at, churn_reason")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, client: data });
}
