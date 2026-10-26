export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { podeArquivar } from "@/lib/contracts/arquivar";

/**
 * POST /api/contracts/arquivar { contractId, desfazer? }
 *
 * Arquiva (ou desarquiva) um contrato que não foi assinado. Não apaga nada: o PDF e o histórico ficam,
 * e o contrato some da lista e das contagens até alguém desfazer. Só admin.
 */
export async function POST(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "Acesso restrito a administradores" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const contractId = String(body?.contractId ?? "");
  const desfazer = body?.desfazer === true;
  if (!contractId) return NextResponse.json({ error: "contractId obrigatório" }, { status: 400 });

  const { data: atual, error: eLer } = await supabaseAdmin
    .from("contracts").select("id, version, signed_at, d4sign_assinado_em, archived_at")
    .eq("id", contractId).maybeSingle();
  if (eLer) return NextResponse.json({ error: `Não consegui ler o contrato: ${eLer.message}` }, { status: 500 });
  if (!atual) return NextResponse.json({ error: "Contrato não encontrado." }, { status: 404 });

  if (desfazer) {
    if (!atual.archived_at) return NextResponse.json({ ok: true, arquivado: false }); // já estava na lista
    const { data, error } = await supabaseAdmin.from("contracts")
      .update({ archived_at: null, archived_by: null })
      .eq("id", contractId).not("archived_at", "is", null).select("id");
    if (error) return NextResponse.json({ error: `Não desarquivou: ${error.message}` }, { status: 500 });
    if (!data?.length) return NextResponse.json({ error: "O contrato mudou enquanto isso. Recarregue a lista." }, { status: 409 });
    await registrar(contractId, "unarchived", user.email, "Voltou para a lista de contratos.");
    return NextResponse.json({ ok: true, arquivado: false });
  }

  const pode = podeArquivar(atual);
  if (!pode.ok) return NextResponse.json({ error: pode.motivo }, { status: 409 });
  // As condições repetem a checagem no próprio UPDATE: se a assinatura chegou no meio, não arquiva.
  const { data, error } = await supabaseAdmin.from("contracts")
    .update({ archived_at: new Date().toISOString(), archived_by: user.email })
    .eq("id", contractId).is("archived_at", null).is("signed_at", null).is("d4sign_assinado_em", null)
    .select("id");
  if (error) return NextResponse.json({ error: `Não arquivou: ${error.message}` }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: "O contrato mudou enquanto isso (assinado ou já arquivado). Recarregue a lista." }, { status: 409 });
  await registrar(contractId, "archived", user.email, `Contrato V${atual.version ?? 1} arquivado: saiu da lista, nada foi apagado.`);
  return NextResponse.json({ ok: true, arquivado: true });
}

/** Histórico do contrato. Falhar aqui não desfaz o arquivamento — só fica sem a linha no histórico. */
async function registrar(contractId: string, action: string, actor: string, details: string) {
  const { error } = await supabaseAdmin.from("contract_audit_log").insert({ contract_id: contractId, action, actor, details });
  if (error) console.error("[contratos/arquivar] histórico não gravou:", error.message);
}
