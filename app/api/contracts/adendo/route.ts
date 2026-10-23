export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/contracts/adendo — registra um adendo num contrato.
//
// 21/10/2026 (auditoria de erro recuperável, 3.6): o navegador inseria direto, ignorava o erro e
// limpava o texto digitado do mesmo jeito — o adendo sumia e o texto também. Agora só gestão grava,
// a resposta diz se gravou, e a tela só limpa o formulário com `ok`.
//
// Body: { contractId, changeType, description, oldValue?, newValue?, effectiveDate }

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireRole, GESTAO } from "@/lib/api/require-role";
import { validarAdendo } from "@/lib/contracts/registro";

export async function POST(req: NextRequest) {
  const gate = await requireRole(req, GESTAO);
  if (gate instanceof NextResponse) return gate;
  const { user } = gate;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const v = validarAdendo(body);
  if (!v.ok) return NextResponse.json({ error: v.erro }, { status: 400 });
  const a = v.dados;

  const { data: contrato, error: eC } = await supabaseAdmin.from("contracts").select("id").eq("id", a.contractId).maybeSingle();
  if (eC) return NextResponse.json({ error: "Não consegui conferir o contrato agora. Seu texto continua na tela — tente de novo." }, { status: 503 });
  if (!contrato) return NextResponse.json({ error: "Contrato não encontrado." }, { status: 404 });

  const { data: membro } = await supabaseAdmin.from("team_members").select("name").eq("email", (user.email || "").toLowerCase()).maybeSingle();
  const autor = (membro?.name as string) || user.email || "Equipe";

  const { data: criado, error: eIns } = await supabaseAdmin.from("contract_addendums").insert({
    contract_id: a.contractId, change_type: a.changeType, description: a.description,
    old_value: a.oldValue, new_value: a.newValue, effective_date: a.effectiveDate, generated_by: autor,
  }).select("id").single();
  if (eIns || !criado) {
    console.error("[contracts/adendo] insert:", eIns?.message);
    return NextResponse.json({ error: `Não consegui gravar o adendo: ${eIns?.message ?? "sem resposta do banco"}. Seu texto continua na tela.` }, { status: 500 });
  }

  const avisos: string[] = [];
  const { error: eAud } = await supabaseAdmin.from("contract_audit_log").insert({
    contract_id: a.contractId, action: "addendum", actor: autor, details: `Adendo: ${a.changeType} — ${a.description}`,
  });
  if (eAud) avisos.push("o histórico do contrato não registrou o adendo");

  return NextResponse.json({ ok: true, id: criado.id, avisos });
}
