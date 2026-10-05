export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// POST /api/system/destaques-trafego — DESTAQUES DO TRÁFEGO, toda segunda 11h, no grupo de tráfego.
//
// Roberto (05/10/2026): "colocar isso pra ocorrer toda segunda, esse relatório dos melhores
// clientes com essas métricas e os piores também ... toda segunda, 11 horas, no grupo tráfego".
// Semana fechada (seg a dom) contra a anterior; regra em lib/traffic/destaques-semana.ts.
//
//   ?dry=1     → devolve as listas e a legenda, não envia
//   ?baixar=1  → devolve o PDF, não envia
//   ?forcar=1  → envia mesmo se a semana já foi enviada (o cron nunca passa)

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireCron } from "@/lib/api/cron-guard";
import { responsavelDeTrafego } from "@/lib/cs/mencao";
import { spNow, ymd } from "@/lib/cs/vigilancia";
import { carregarDestaques } from "@/lib/traffic/destaques-dados";
import { destaquesSemanaHtml, legendaDestaques } from "@/lib/reports/destaquesSemanaPdf";

export async function POST(req: NextRequest) {
  const negado = requireCron(req);
  if (negado) return negado;
  const q = req.nextUrl.searchParams;
  const dry = q.get("dry") === "1";
  const baixar = q.get("baixar") === "1";
  const forcar = q.get("forcar") === "1";

  const hoje = ymd(spNow());
  // Os dados moram em lib/traffic/destaques-dados.ts — o Loninho monta o mesmo relatório sob pedido.
  let opcoes: Awaited<ReturnType<typeof carregarDestaques>>;
  try { opcoes = await carregarDestaques(hoje); }
  catch (e) { return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 }); }
  if (!opcoes) return NextResponse.json({ ok: true, skip: "nenhum cliente de tráfego ativo" });
  const { dados, atual, anterior } = opcoes;
  const resumo = {
    semana: atual, anterior, avaliados: dados.avaliados, mistos: dados.mistos,
    melhoraram: dados.melhoraram.map((l) => l.cliente), pioraram: dados.pioraram.map((l) => l.cliente),
    pararam: dados.pararam.map((p) => p.cliente), carteira: dados.carteira,
  };

  if (dry) return NextResponse.json({ ok: true, dry: true, ...resumo, legenda: legendaDestaques(opcoes) });

  const { htmlToPdf } = await import("@/lib/traffic/renderPdf");
  const pdf = await htmlToPdf(destaquesSemanaHtml(opcoes));
  if (!pdf.ok || !pdf.buffer) return NextResponse.json({ ok: false, error: `PDF: ${pdf.error ?? "falhou"}` }, { status: 502 });
  if (baixar) {
    return new NextResponse(new Uint8Array(pdf.buffer), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="destaques-${atual.de}.pdf"`, "Cache-Control": "no-store" },
    });
  }

  let jid = process.env.CS_TRAFFIC_GROUP_JID || "";
  if (!jid) {
    const { data: cfg } = await supabaseAdmin.from("agency_settings").select("value").eq("key", "traffic_alert_group_jid").maybeSingle();
    jid = (cfg?.value as string) || "";
  }
  if (!jid) return NextResponse.json({ ok: false, error: "grupo de tráfego não configurado" }, { status: 500 });

  // Uma vez por semana: o nome do arquivo carrega a semana, e o envio fica em cs_outbound.
  const arquivo = `Destaques do tráfego ${atual.de} a ${atual.ate}.pdf`;
  if (!forcar) {
    const { data: ja } = await supabaseAdmin.from("cs_outbound").select("id")
      .eq("group_jid", jid).eq("enviado", true).like("texto", `[documento] ${arquivo}%`).limit(1);
    if (ja?.length) return NextResponse.json({ ok: true, skip: "semana já enviada", ...resumo });
  }

  const gestor = await responsavelDeTrafego().catch(() => ({ trecho: "", jids: [] as string[], notifica: false }));
  const { csSendGroupDocument } = await import("@/lib/cs/notify");
  const r = await csSendGroupDocument(jid, pdf.buffer.toString("base64"), arquivo, legendaDestaques(opcoes, gestor.trecho), "application/pdf", gestor.jids);
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error ?? "envio falhou", ...resumo }, { status: 502 });

  console.log(`[destaques-trafego] ${atual.de}→${atual.ate} melhoraram=${dados.melhoraram.length} pioraram=${dados.pioraram.length} pararam=${dados.pararam.length}`);
  return NextResponse.json({ ok: true, enviado: true, ...resumo });
}
