export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";

/**
 * GET /api/contracts/list
 * Lista global de contratos (admin-only), com join em clients pra nome/CNPJ.
 *
 * Query params opcionais:
 *   ?status=pending|signed|active|expired|archived   (filtra estado; arquivado só aparece em "archived")
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

  // Busca contratos + join leve com clients. d4sign_assinado_em vem da migration 20261026150000
  // (contrato assinado na D4Sign): sem a coluna, a lista sai sem ela em vez de cair.
  // Arquivado (migration 20261026210000) sai da lista e das contagens; só o filtro "archived" mostra.
  const montar = (extra: string, comArquivo: boolean) => {
    const colunas: string = `
        id, client_id, version, service_type, monthly_value,
        start_date, end_date, duration_months, status,
        signed_pdf_path, signed_at, signed_uploaded_by, signature_method,
        pdf_url, generated_by, generated_at, has_renewal, renewal_value,
        payment_day, created_at${extra}${comArquivo ? ", archived_at, archived_by" : ""},
        clients:client_id ( name, nome_fantasia, cnpj )
      `;
    let query = supabaseAdmin
      .from("contracts")
      .select(colunas)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (serviceFilter) query = query.eq("service_type", serviceFilter);
    if (comArquivo) {
      query = statusFilter === "archived" ? query.not("archived_at", "is", null) : query.is("archived_at", null);
    }

    if (statusFilter === "pending") {
      query = query.is("signed_at", null);
    } else if (statusFilter === "signed") {
      query = query.not("signed_at", "is", null);
    } else if (statusFilter === "active" || statusFilter === "expired" || statusFilter === "draft") {
      query = query.eq("status", statusFilter);
    }
    return query;
  };

  let { data, error } = await montar(", d4sign_assinado_em", true);
  let semArquivo = false;
  if (error && error.message.includes("archived_")) { semArquivo = true; ({ data, error } = await montar(", d4sign_assinado_em", false)); }
  if (error && error.message.includes("d4sign_assinado_em")) { semArquivo = true; ({ data, error } = await montar("", false)); }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // Sem a coluna ainda não existe arquivado: o filtro "Arquivados" volta vazio, não a lista inteira.
  if (semArquivo && statusFilter === "archived") data = [];

  // Filtra search em memória (busca por nome/CNPJ). O Supabase REST não faz
  // ILIKE em relação aninhada facilmente sem rpc.
  const contracts = (data ?? []).filter((c) => {
    if (!search) return true;
    const client = (c as unknown as Record<string, unknown>).clients as { name?: string; nome_fantasia?: string; cnpj?: string } | null;
    const name = (client?.nome_fantasia ?? client?.name ?? "").toLowerCase();
    const cnpj = (client?.cnpj ?? "").replace(/\D/g, "");
    const s = search.replace(/\D/g, "");
    return name.includes(search) || (s.length >= 4 && cnpj.includes(s));
  });

  // Summary: apenas contagem de contratos por estado. Nada financeiro agregado.
  // Por regra do CEO, valores como MRR/ARR/LTV não são exibidos no sistema — apenas
  // o valor por contrato individual (que é parte do documento, não métrica agregada).
  const resumo = await supabaseAdmin.from("contracts").select("status, signed_at, archived_at");
  const summaryData: unknown = resumo.error?.message.includes("archived_at")
    ? (await supabaseAdmin.from("contracts").select("status, signed_at")).data
    : resumo.data;

  const all = ((summaryData as { status: string; signed_at: string | null; archived_at?: string | null }[] | null) ?? [])
    .filter((c) => !c.archived_at);
  const summary = {
    total: all.length,
    signed: all.filter((c) => c.signed_at !== null).length,
    pending: all.filter((c) => c.signed_at === null && c.status !== "expired").length,
    active: all.filter((c) => c.status === "active").length,
    expired: all.filter((c) => c.status === "expired").length,
  };

  return NextResponse.json({ contracts, total: contracts.length, summary });
}
