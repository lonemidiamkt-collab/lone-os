// POST /api/cs/calendario/pdf — PDF branded do calendário pra download. HTML em lib/cs/calendario-pdf.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { htmlToPdf } from "@/lib/traffic/renderPdf";
import { calendarioPdfHtml } from "@/lib/cs/calendario-pdf";
import type { PecaFinal } from "@/lib/cs/motor";

export async function POST(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const cliente = (body?.cliente as string) || "Cliente";
  const pecas = (body?.pecas as PecaFinal[]) || [];
  if (!pecas.length) return NextResponse.json({ error: "sem conteúdo pra gerar" }, { status: 400 });

  const html = calendarioPdfHtml({ cliente, nicho: body?.nicho, periodo: body?.periodo || "", modo: body?.modo || "semana", pecas });
  const pdf = await htmlToPdf(html);
  if (!pdf.ok || !pdf.buffer) return NextResponse.json({ error: pdf.error ?? "Falha ao gerar PDF" }, { status: 502 });

  const fname = `calendario-${cliente.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.pdf`;
  return new NextResponse(new Uint8Array(pdf.buffer), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${fname}"` },
  });
}
