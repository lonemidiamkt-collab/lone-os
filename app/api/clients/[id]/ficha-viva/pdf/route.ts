// app/api/clients/[id]/ficha-viva/pdf/route.ts — gera o PDF navy da estrutura comercial (Ficha
// Viva) do cliente. Admin apenas. Documento INTERNO da Lone (identidade da marca + logo).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { htmlToPdf } from "@/lib/traffic/renderPdf";
import { loadLoneLogo } from "@/lib/cs/roteiro-pdf";
import { estruturaPdfHtml, type EstruturaAnalise } from "@/lib/fichaViva/estrutura-pdf";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Sessão inválida" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const { id } = await params;
  const { data: client } = await supabaseAdmin.from("clients").select("name, nome_fantasia").eq("id", id).single();
  if (!client) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });

  const { data: diag } = await supabaseAdmin
    .from("client_diagnostics").select("analise")
    .eq("client_id", id).order("answered_at", { ascending: false }).limit(1).single();
  if (!diag?.analise) return NextResponse.json({ error: "Ainda não há estrutura gerada." }, { status: 404 });

  const nome = (client.nome_fantasia as string) || (client.name as string);
  const dataLabel = new Date().toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "America/Sao_Paulo" });
  const logo = await loadLoneLogo();
  const html = estruturaPdfHtml(nome, diag.analise as EstruturaAnalise, dataLabel, logo);

  const pdf = await htmlToPdf(html);
  if (!pdf.ok || !pdf.buffer) return NextResponse.json({ error: pdf.error ?? "Falha ao gerar PDF" }, { status: 502 });

  const fname = `estrutura-comercial-${nome.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.pdf`;
  return new NextResponse(new Uint8Array(pdf.buffer), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${fname}"` },
  });
}
