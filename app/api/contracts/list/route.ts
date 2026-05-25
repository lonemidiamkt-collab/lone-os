export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";

/**
 * GET /api/contracts/list
 * Lista global de contratos (admin-only), com join em clients pra nome/CNPJ.
 *
 * Query params opcionais:
 *   ?status=pending|signed|active|expired   (filtra estado)
 *   ?serviceType=assessoria_trafego|assessoria_social|lone_growth
 *   ?search=termo                             (busca em client_name ou cnpj)
 *   ?limit=50                                 (default 100)
 *
 * Retorna:
 *   { contracts: [...], total, summary: { total, signed, pending, active, expired } }
 */
export async function GET(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "Acesso restrito a administradores" }, { status: 403 });

  const url = new URL(req.url);
  const statusFilter = url.searchParams.get("status");
  const serviceFilter = url.searchParams.get("serviceType");
  const search = url.searchParams.get("search")?.trim().toLowerCase();
  const limit = Math.min(200, parseInt(url.searchParams.get("limit") || "100", 10));

  // Busca contratos + join leve com clients
  let query = supabaseAdmin
    .from("contracts")
    .select(`
      id, client_id, version, service_type, monthly_value,
      start_date, end_date, duration_months, status,
      signed_pdf_path, signed_at, signed_uploaded_by, signature_method,
      pdf_url, generated_by, generated_at, has_renewal, renewal_value,
      payment_day, created_at,
      clients:client_id ( name, nome_fantasia, cnpj )
    `)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (serviceFilter) query = query.eq("service_type", serviceFilter);

  if (statusFilter === "pending") {
    query = query.is("signed_at", null);
  } else if (statusFilter === "signed") {
    query = query.not("signed_at", "is", null);
  } else if (statusFilter === "active" || statusFilter === "expired" || statusFilter === "draft") {
    query = query.eq("status", statusFilter);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Filtra search em memória (busca por nome/CNPJ). O Supabase REST não faz
  // ILIKE em relação aninhada facilmente sem rpc.
  const contracts = (data ?? []).filter((c) => {
    if (!search) return true;
    const client = (c as Record<string, unknown>).clients as { name?: string; nome_fantasia?: string; cnpj?: string } | null;
    const name = (client?.nome_fantasia ?? client?.name ?? "").toLowerCase();
    const cnpj = (client?.cnpj ?? "").replace(/\D/g, "");
    const s = search.replace(/\D/g, "");
    return name.includes(search) || (s.length >= 4 && cnpj.includes(s));
  });

  // Summary: apenas contagem de contratos por estado. Nada financeiro agregado.
  // Por regra do CEO, valores como MRR/ARR/LTV não são exibidos no sistema — apenas
  // o valor por contrato individual (que é parte do documento, não métrica agregada).
  const { data: summaryData } = await supabaseAdmin
    .from("contracts")
    .select("status, signed_at");

  const all = (summaryData as { status: string; signed_at: string | null }[]) ?? [];
  const summary = {
    total: all.length,
    signed: all.filter((c) => c.signed_at !== null).length,
    pending: all.filter((c) => c.signed_at === null && c.status !== "expired").length,
    active: all.filter((c) => c.status === "active").length,
    expired: all.filter((c) => c.status === "expired").length,
  };

  return NextResponse.json({ contracts, total: contracts.length, summary });
}
