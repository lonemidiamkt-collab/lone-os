// app/api/clients/[id]/crescimento-pdf/route.ts — PDF navy de CRESCIMENTO do cliente (faturamento/
// ticket/vendas mês a mês, gráficos, destaques). Dados reais de client_financial_results.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { htmlToPdf } from "@/lib/traffic/renderPdf";
import { loadLoneLogo } from "@/lib/cs/roteiro-pdf";
import { crescimentoPdfHtml, type CrescimentoRow } from "@/lib/fichaViva/crescimento-pdf";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Sessão inválida" }, { status: 401 });

  const { id } = await params;
  const { data: client } = await supabaseAdmin.from("clients").select("name, nome_fantasia").eq("id", id).single();
  if (!client) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });

  const { data: fin } = await supabaseAdmin
    .from("client_financial_results")
    .select("month, revenue, vendas, ticket")
    .eq("client_id", id)
    .order("month", { ascending: true });
  const rows: CrescimentoRow[] = (fin ?? []).map((r) => ({
    month: r.month as string,
    revenue: Number(r.revenue) || 0,
    vendas: r.vendas != null ? Number(r.vendas) : null,
    ticket: r.ticket != null ? Number(r.ticket) : null,
  }));
  if (rows.length === 0) {
    return NextResponse.json({ error: "Este cliente ainda não tem faturamento cadastrado pra gerar o relatório." }, { status: 404 });
  }

  // Meta de faturamento (opcional) — guardada em agency_settings key growth_goal:<id>. Se houver,
  // o PDF ganha a página de projeção "caminho até a meta".
  let goal: { value: number; month: string } | null = null;
  try {
    const { data: g } = await supabaseAdmin.from("agency_settings").select("value").eq("key", `growth_goal:${id}`).maybeSingle();
    if (g?.value) goal = JSON.parse(g.value as string);
  } catch { goal = null; }

  const nome = (client.nome_fantasia as string) || (client.name as string);
  const dataLabel = new Date().toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "America/Sao_Paulo" });
  const logo = await loadLoneLogo();
  const html = crescimentoPdfHtml(nome, rows, dataLabel, logo, goal);

  const pdf = await htmlToPdf(html);
  if (!pdf.ok || !pdf.buffer) return NextResponse.json({ error: pdf.error ?? "Falha ao gerar PDF" }, { status: 502 });

  const fname = `crescimento-${nome.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.pdf`;
  return new NextResponse(new Uint8Array(pdf.buffer), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${fname}"` },
  });
}
