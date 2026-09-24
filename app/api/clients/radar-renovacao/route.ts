export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireRole, GESTAO } from "@/lib/api/require-role";
import { diasAte, montarRadar, temRenovacaoAndando, type ContratoRadarRow } from "@/lib/clientes/radar-renovacao";

// GET /api/clients/radar-renovacao — RADAR DE RENOVAÇÃO (Leva 7C, N22). Só gestão.
//   sem parâmetro   → quem está a 60/30 dias do fim sem renovação andando (Saúde da carteira)
//   ?clientId=…     → o contrato ativo deste cliente: fim, dias e se a renovação já anda (aba Admin)
// SÓ DATAS. O select abaixo não pede valor de contrato de propósito — o que não sai do banco não vaza.

const COLUNAS = "id, client_id, status, end_date, version, renewal_draft_of, previous_contract_id";

export async function GET(req: NextRequest) {
  const gate = await requireRole(req, GESTAO);
  if (gate instanceof NextResponse) return gate;
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const clientId = req.nextUrl.searchParams.get("clientId");

  if (clientId) {
    const { data, error } = await supabaseAdmin.from("contracts").select(COLUNAS).eq("client_id", clientId);
    if (error) return NextResponse.json({ error: `contracts: ${error.message}` }, { status: 500 });
    const lista = (data ?? []) as ContratoRadarRow[];
    const ativo = lista.filter((c) => c.status === "active" && c.end_date).sort((a, b) => (a.end_date! < b.end_date! ? -1 : 1))[0];
    if (!ativo) return NextResponse.json({ contrato: null });
    return NextResponse.json({
      contrato: { fim: ativo.end_date!.slice(0, 10), dias: diasAte(hoje, ativo.end_date!), renovacaoAndando: temRenovacaoAndando(ativo, lista) },
    });
  }

  const [ctr, cli] = await Promise.all([
    supabaseAdmin.from("contracts").select(COLUNAS),
    supabaseAdmin.from("clients").select("id, name, nome_fantasia, assigned_social")
      .or("active.is.null,active.eq.true").is("churned_at", null).is("draft_status", null),
  ]);
  if (ctr.error) return NextResponse.json({ error: `contracts: ${ctr.error.message}` }, { status: 500 });
  if (cli.error) return NextResponse.json({ error: `clients: ${cli.error.message}` }, { status: 500 });

  const radar = montarRadar(
    (ctr.data ?? []) as ContratoRadarRow[],
    (cli.data ?? []).map((c) => ({ id: c.id as string, nome: (c.nome_fantasia as string) || (c.name as string), social: (c.assigned_social as string) ?? null })),
    hoje,
  );
  return NextResponse.json({ ...radar, hoje });
}
