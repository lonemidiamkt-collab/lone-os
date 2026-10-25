export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/api/require-role";
import { PAPEIS_COMERCIAL } from "@/lib/crm/acesso";
import { supabaseAdmin } from "@/lib/supabase/server";
import * as db from "@/lib/supabase/queries";
import { montarVisaoRota, type VisitaRota } from "@/lib/crm/rota";
import { buscarCatalogo, PAGINA_DA_ROTA } from "@/lib/crm/rota-catalogo";

// GET /api/crm/rota — a aba Rota do comercial: as lojas da Rota de Prospecção (lista da página da rota),
// quem já foi visitado (rota_visitas) e onde cada loja está no funil. Só quem entra no comercial.

export async function GET(req: NextRequest) {
  const gate = await requireRole(req, PAPEIS_COMERCIAL);
  if (gate instanceof NextResponse) return gate;
  const [visitasQ, leads, catalogo] = await Promise.all([
    supabaseAdmin.from("rota_visitas").select("rota, loja, visitada, por, visitada_em").limit(2000),
    db.fetchCrmLeads().catch((e: unknown) => (e instanceof Error ? e : new Error(String(e)))),
    buscarCatalogo().catch((e: unknown) => e instanceof Error ? e : new Error(String(e))),
  ]);
  if (visitasQ.error) return NextResponse.json({ error: `rota_visitas: ${visitasQ.error.message}` }, { status: 500 });
  // Funil que não carregou não é "nenhuma loja no funil" (24/10/2026).
  if (leads instanceof Error) return NextResponse.json({ error: leads.message }, { status: 503 });
  if (catalogo instanceof Error) {
    console.error("[crm/rota] lista de lojas:", catalogo.message);
    return NextResponse.json({ error: "Não consegui ler a lista de lojas na página da rota. Tente de novo em instantes." }, { status: 502 });
  }
  const visitas: VisitaRota[] = (visitasQ.data ?? []).map((v) => ({
    rota: v.rota as string, loja: Number(v.loja), visitada: !!v.visitada, por: (v.por as string) ?? null, visitadaEm: (v.visitada_em as string) ?? null,
  }));
  const visao = montarVisaoRota(catalogo, visitas, leads.map((l) => ({ id: l.id, estagio: l.estagio, rotaLojaId: l.rotaLojaId, telefone: l.telefone })));
  return NextResponse.json({ ...visao, pagina: PAGINA_DA_ROTA });
}
