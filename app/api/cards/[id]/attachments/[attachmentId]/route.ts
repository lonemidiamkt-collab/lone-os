export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import * as Sentry from "@sentry/nextjs";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";

const BUCKET = "arts";

/**
 * DELETE /api/cards/[id]/attachments/[attachmentId]
 *
 * Remove uma arte de um content_card.
 *
 * Ordem de operações (Garantia 2):
 *   1. Busca o attachment para obter o path no Storage
 *   2. Remove o arquivo do bucket "arts" → se falhar, retorna 500 (banco intacto)
 *   3. Remove a linha de card_attachments → se falhar após Storage OK, loga no
 *      Sentry como ERROR (inconsistência rara: arquivo removido mas linha órfã)
 *
 * Auth: qualquer usuário autenticado. Sem auth → 401.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; attachmentId: string }> },
) {
  const user = await getServerUser(req);
  if (!user) {
    return NextResponse.json({ error: "Sessão inválida ou ausente" }, { status: 401 });
  }

  const { id: cardId, attachmentId } = await params;

  // Busca attachment — valida que pertence ao card correto
  const { data: attachment, error: fetchErr } = await supabaseAdmin
    .from("card_attachments")
    .select("id, path")
    .eq("id", attachmentId)
    .eq("card_id", cardId)
    .maybeSingle();

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }
  if (!attachment) {
    return NextResponse.json({ error: "Attachment não encontrado" }, { status: 404 });
  }

  // Storage delete PRIMEIRO — se falhar, banco não é tocado
  const { error: storageErr } = await supabaseAdmin.storage
    .from(BUCKET)
    .remove([attachment.path]);

  if (storageErr) {
    console.error("[delete-attachment] storage delete failed:", storageErr);
    return NextResponse.json(
      { error: `Falha ao remover arquivo do Storage: ${storageErr.message}` },
      { status: 500 },
    );
  }

  // SQL delete APÓS Storage OK
  const { error: dbErr } = await supabaseAdmin
    .from("card_attachments")
    .delete()
    .eq("id", attachmentId);

  if (dbErr) {
    // Inconsistência crítica: arquivo removido do Storage mas linha persiste no banco.
    // Sentry captura para investigação manual.
    Sentry.captureException(dbErr, {
      level: "error",
      extra: {
        cardId,
        attachmentId,
        path: attachment.path,
        context: "storage_deleted_db_delete_failed",
      },
    });
    console.error("[delete-attachment] db delete failed after storage delete:", dbErr);
    return NextResponse.json(
      { error: `Arquivo removido do Storage mas falha ao remover do banco: ${dbErr.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
