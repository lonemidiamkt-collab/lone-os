export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";

// MRR da agência = soma da mensalidade (contracts.monthly_value) do contrato mais recente de cada
// cliente ativo. IMPORTANTE: monthly_value é a RECEITA da agência, não confundir com o monthlyBudget
// do cliente (que é verba de anúncio). Retorna cobertura (quantos ativos têm contrato) pra ser
// transparente — se poucos clientes têm contrato cadastrado, o MRR é parcial, não a verdade.

function monthSP(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).slice(0, 7);
}

export async function GET(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "Acesso restrito" }, { status: 403 });

  const [{ data: clients }, { data: contracts }] = await Promise.all([
    supabaseAdmin.from("clients").select("id, active, churned_at"),
    supabaseAdmin.from("contracts").select("client_id, monthly_value, version, status, created_at"),
  ]);

  // Contrato mais recente (maior version, empate → created_at) por cliente, ignorando cancelados.
  const latestByClient = new Map<string, { value: number }>();
  for (const c of contracts ?? []) {
    if (c.status === "cancelled" || c.status === "canceled") continue;
    const val = Number(c.monthly_value) || 0;
    if (val <= 0) continue;
    const prev = (latestByClient as Map<string, { value: number; version: number; createdAt: string }>).get(c.client_id as string);
    const cur = { value: val, version: Number(c.version) || 0, createdAt: (c.created_at as string) || "" };
    if (!prev || cur.version > prev.version || (cur.version === prev.version && cur.createdAt > prev.createdAt)) {
      (latestByClient as Map<string, { value: number; version: number; createdAt: string }>).set(c.client_id as string, cur);
    }
  }

  const active = (clients ?? []).filter((c) => c.active !== false && !c.churned_at);
  const nowMonth = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).slice(0, 7);

  let mrrActive = 0;
  let withContract = 0;
  for (const c of active) {
    const ct = latestByClient.get(c.id as string);
    if (ct) { mrrActive += ct.value; withContract++; }
  }

  // MRR perdido = mensalidade dos clientes que deram churn neste mês (SP).
  let mrrChurnedThisMonth = 0;
  for (const c of clients ?? []) {
    if (!c.churned_at) continue;
    if (monthSP(c.churned_at as string) !== nowMonth) continue;
    const ct = latestByClient.get(c.id as string);
    if (ct) mrrChurnedThisMonth += ct.value;
  }

  const ticketMedio = withContract > 0 ? Math.round(mrrActive / withContract) : 0;

  return NextResponse.json({
    mrrActive,
    mrrChurnedThisMonth,
    ticketMedio,
    coverage: { withContract, totalActive: active.length },
  });
}
