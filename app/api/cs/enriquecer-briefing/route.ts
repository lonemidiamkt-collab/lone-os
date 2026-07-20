// GET /api/cs/enriquecer-briefing?clientId=... — gera o RASCUNHO de briefing estratégico de um
// cliente (junta toda a matéria-prima + IA). Suggest-only: retorna pra revisão, NÃO grava.
// Gated: admin. O salvar (nova versão em client_briefings) vem depois do DDL do diagnóstico.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { coletarMateriaPrima, enriquecerBriefing } from "@/lib/cs/enriquecer-briefing";

export async function GET(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user?.isAdmin) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const clientId = req.nextUrl.searchParams.get("clientId");
  if (!clientId) return NextResponse.json({ error: "clientId obrigatório" }, { status: 400 });

  const mp = await coletarMateriaPrima(clientId);
  if (!mp) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });

  // que material foi encontrado (pra UI mostrar a base do rascunho)
  const fontes = {
    fixedBriefing: !!mp.fixedBriefing, campanha: !!mp.campaignBriefing, onboarding: !!mp.onboarding,
    ficha: !!mp.ficha, notas: !!mp.notes, briefingAtual: !!mp.briefingAtual,
  };

  const res = await enriquecerBriefing(mp);
  if (!res.ok || !res.data) return NextResponse.json({ error: res.error ?? "Falha ao gerar rascunho" }, { status: 502 });

  return NextResponse.json({ cliente: mp.nome, fontes, rascunho: res.data });
}
