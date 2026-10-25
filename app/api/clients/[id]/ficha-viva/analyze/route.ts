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
import { refazerComIa } from "@/lib/fichaViva/analise";

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

  // Diagnóstico mais recente do cliente. Falha de leitura não vira "ainda não respondeu" (25/10/2026, 12.1).
  const { data: diag, error: eDiag } = await supabaseAdmin
    .from("client_diagnostics")
    .select("id, respostas, analise")
    .eq("client_id", clientId)
    .order("answered_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (eDiag) return NextResponse.json({ error: "Não consegui ler o diagnóstico agora. Tente de novo em instantes." }, { status: 503 });
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

  // 25/10/2026 (onda 6, 12.2): "Refazer" trocava a estrutura (às vezes editada à mão) sem guardar nada. A
  // versão que estava fica em `anterior` — a tela oferece "Desfazer" e "Voltar à anterior".
  const agora = new Date().toISOString();
  const analise = refazerComIa(result.data, diag.analise, agora);
  const { error: updErr } = await supabaseAdmin
    .from("client_diagnostics")
    .update({ analise, status: "analisado", analyzed_at: agora })
    .eq("id", diag.id);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  return NextResponse.json({ success: true, analise, diagId: diag.id, guardouAnterior: !!analise.anterior });
}
