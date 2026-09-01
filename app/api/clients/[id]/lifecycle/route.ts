// app/api/clients/[id]/lifecycle/route.ts
//
// Arquivar (churn) / reativar um cliente. Admin/manager apenas.
//   archive    → active=false, churned_at=now, churn_category=<motivo>, churn_reason=<detalhe>
//   reactivate → active=true,  churned_at=null, ambos limpos
//
// MOTIVO É OBRIGATÓRIO ao arquivar (Roberto: "gostei do motivo de saída obrigatório"). Antes era
// opcional e o resultado apareceu no banco: 6 clientes arquivados, 1 com motivo. Cinco saíram e
// ninguém sabe por quê. Sem isso não dá pra responder se a perda é por preço, por resultado ou por
// atendimento — e cada resposta dessas muda uma decisão diferente.
//
// Offboarding de ex-cliente NÃO apaga histórico — só tira da operação (todos os
// filtros de cliente ativo exigem active=true). Base das métricas de churn.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { MOTIVOS_SAIDA } from "@/lib/clients/churn";

const Schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("archive"),
    category: z.enum(Object.keys(MOTIVOS_SAIDA) as [string, ...string[]], {
      message: "Escolha o motivo da saída.",
    }),
    // Em "outro" o rótulo não explica nada sozinho, então o detalhe passa a ser exigido.
    reason: z.string().max(512).optional(),
  }).refine((d) => d.category !== "outro" || (d.reason?.trim().length ?? 0) >= 3, {
    message: "Com motivo \"Outro\", descreva o que aconteceu.", path: ["reason"],
  }),
  z.object({ action: z.literal("reactivate") }),
]);

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

  const d = parsed.data;
  const row =
    d.action === "archive"
      ? {
          active: false, churned_at: new Date().toISOString(),
          churn_category: d.category,
          churn_reason: d.reason?.trim() || null,
        }
      : { active: true, churned_at: null, churn_category: null, churn_reason: null };

  const { data, error } = await supabaseAdmin
    .from("clients")
    .update(row)
    .eq("id", id)
    .select("id, name, active, churned_at, churn_category, churn_reason")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, client: data });
}
