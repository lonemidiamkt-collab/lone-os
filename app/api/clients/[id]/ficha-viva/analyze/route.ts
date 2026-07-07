// app/api/clients/[id]/ficha-viva/analyze/route.ts — dispara a IA sobre o diagnóstico mais
// recente do cliente, cruzando as respostas com o crescimento (faturamento) que a Lone já
// acompanha. Admin apenas. Persiste a análise (SWOT/prioridades/scripts) na linha do diagnóstico.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { analisarDiagnostico } from "@/lib/cs/diagnostico-comercial";
import { computeGrowth, type GrowthRow } from "@/lib/fichaViva/growth";

function fmtBRL(v: number): string {
  return `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Sessão inválida" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const { id: clientId } = await params;

  const { data: client } = await supabaseAdmin
    .from("clients").select("id, name, nome_fantasia, industry").eq("id", clientId).single();
  if (!client) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });

  // Diagnóstico mais recente do cliente
  const { data: diag } = await supabaseAdmin
    .from("client_diagnostics")
    .select("id, respostas")
    .eq("client_id", clientId)
    .order("answered_at", { ascending: false })
    .limit(1)
    .single();
  if (!diag) return NextResponse.json({ error: "O cliente ainda não respondeu o diagnóstico." }, { status: 404 });

  // Contexto de crescimento (faturamento que a Lone acompanha)
  const { data: fin } = await supabaseAdmin
    .from("client_financial_results")
    .select("month, revenue, vendas, ticket")
    .eq("client_id", clientId)
    .order("month");
  const rows: GrowthRow[] = (fin ?? []).map((r) => ({
    month: r.month as string,
    revenue: Number(r.revenue) || 0,
    vendas: r.vendas != null ? Number(r.vendas) : null,
    ticket: r.ticket != null ? Number(r.ticket) : null,
  }));
  const g = computeGrowth(rows);
  const crescimento = g.mesesRegistrados > 0
    ? `${g.label}${g.pct !== null ? ` (${g.pct >= 0 ? "+" : ""}${g.pct}%)` : ""}. ` +
      `Faturamento total registrado ${fmtBRL(g.totalFaturamento)} em ${g.mesesRegistrados} ${g.mesesRegistrados === 1 ? "mês" : "meses"}` +
      (g.last ? `; último mês ${fmtBRL(g.last.faturamento)}${g.last.ticket ? `, ticket ${fmtBRL(g.last.ticket)}` : ""}.` : ".")
    : undefined;

  const result = await analisarDiagnostico({
    clienteNome: (client.nome_fantasia as string) || (client.name as string),
    clienteNicho: (client.industry as string) || undefined,
    respostas: (diag.respostas ?? {}) as Record<string, string>,
    crescimento,
  });

  if (!result.ok || !result.data) {
    return NextResponse.json({ error: result.error ?? "A IA não conseguiu analisar agora." }, { status: 502 });
  }

  const { error: updErr } = await supabaseAdmin
    .from("client_diagnostics")
    .update({ analise: result.data, status: "analisado", analyzed_at: new Date().toISOString() })
    .eq("id", diag.id);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  return NextResponse.json({ success: true, analise: result.data });
}
