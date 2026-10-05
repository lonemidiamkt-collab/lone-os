export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// POST /api/system/pedido-loninho?frase=...&quem=Roberto%20Lino — ENSAIO de um pedido ao Loninho
// (lib/loninho/pedidos) sem WhatsApp: diz o que o detector entendeu e devolve o conteúdo montado
// (texto/legenda e o tamanho do PDF). NUNCA envia nada. ?pdf=1 devolve o próprio PDF pra conferir.

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import { lerPedidoDoTime } from "@/lib/loninho/pedidos/detectar";
import { montar } from "@/lib/loninho/pedidos/atender";

export async function POST(req: NextRequest) {
  const negado = requireCron(req);
  if (negado) return negado;
  const q = req.nextUrl.searchParams;
  const frase = q.get("frase") ?? "";
  const pedido = lerPedidoDoTime(frase);
  if (!pedido) return NextResponse.json({ ok: true, entendeu: null, frase });
  const nome = q.get("quem") ?? "Roberto Lino";
  const { data: m } = await supabaseAdmin.from("team_members").select("name, role").eq("name", nome).eq("is_active", true).maybeSingle();
  if (!m) return NextResponse.json({ error: `'${nome}' não está no time ativo` }, { status: 400 });
  const r = await montar(pedido, { groupJid: "ensaio", autor: { nome: m.name as string, papel: m.role as string } }, new Date());
  if ("texto" in r) return NextResponse.json({ ok: true, entendeu: pedido, texto: r.texto });
  if (q.get("pdf") === "1") {
    const { htmlToPdf } = await import("@/lib/traffic/renderPdf");
    const pdf = await htmlToPdf(r.html);
    if (!pdf.ok || !pdf.buffer) return NextResponse.json({ error: pdf.error ?? "PDF falhou" }, { status: 502 });
    return new NextResponse(new Uint8Array(pdf.buffer), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${encodeURIComponent(r.arquivo)}"` } });
  }
  return NextResponse.json({ ok: true, entendeu: pedido, arquivo: r.arquivo, legenda: r.legenda, texto: r.textoReserva.slice(0, 4000), htmlBytes: r.html.length });
}
