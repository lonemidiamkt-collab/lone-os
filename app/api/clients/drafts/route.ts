// GET /api/clients/drafts — rascunhos de cadastro (draft_status != null) COMPLETOS, pra tela de
// aprovação (/clients/pending). Gated: exige login. A lista magra (fetchDraftClients) não traz
// PII/docs; a aprovação precisa deles, então vêm por aqui, no servidor (service_role).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole, GESTAO } from "@/lib/api/require-role";
import { fetchDraftClientsFull } from "@/lib/supabase/queries";

// Só GESTÃO: é o cadastro inteiro (CPF, documentos, endereço) de quem ainda nem foi aprovado.
export async function GET(req: NextRequest) {
  const gate = await requireRole(req, GESTAO);
  if (gate instanceof NextResponse) return gate;
  try {
    const drafts = await fetchDraftClientsFull();
    return NextResponse.json({ drafts });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
    return NextResponse.json({ error: `Não consegui ler os cadastros pendentes: ${msg}` }, { status: 500 });
  }
}
