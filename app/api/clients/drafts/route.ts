// GET /api/clients/drafts — rascunhos de cadastro (draft_status != null) COMPLETOS, pra tela de
// aprovação (/clients/pending). Gated: exige login. A lista magra (fetchDraftClients) não traz
// PII/docs; a aprovação precisa deles, então vêm por aqui, no servidor (service_role).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { fetchDraftClientsFull } from "@/lib/supabase/queries";

export async function GET(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const drafts = await fetchDraftClientsFull();
  return NextResponse.json({ drafts });
}
