export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import { montarDiagnostico } from "@/lib/traffic/diagnostico";
import { diagnosticoPdfHtml, legendaDiagnostico } from "@/lib/reports/diagnosticoPdf";
import { htmlToPdf } from "@/lib/traffic/renderPdf";
import { loadLoneLogo } from "@/lib/cs/roteiro-pdf";
import { csSendGroupDocument } from "@/lib/cs/notify";
import { responsavelDeTrafego } from "@/lib/cs/mencao";
import { supabaseAdmin } from "@/lib/supabase/server";

// POST /api/system/traffic-diagnostico — o diagnóstico diário das contas, em PDF, no grupo de tráfego.
//
// Roberto (02/09): "seria interessante esses avisos das 8 funções serem todos os dias em PDF".
//
// Substitui a rotina de abrir conta por conta no Ads Manager procurando o que quebrou. O documento
// chega pronto, ordenado pelo tamanho do estrago, com o que fazer em cada linha.
//
// ?dry=1 devolve o diagnóstico em JSON · ?baixar=1 devolve o PDF sem enviar

export async function POST(req: NextRequest) {
  const denied = requireCron(req); if (denied) return denied;
  const dry = req.nextUrl.searchParams.get("dry") !== null;
  const baixar = req.nextUrl.searchParams.get("baixar") === "1";

  const d = await montarDiagnostico();

  if (dry) {
    return NextResponse.json({
      ok: true, data: d.data, contas: d.contasAtivas, gasto_ontem: Math.round(d.gastoOntem),
      funcoes: d.funcoes.map((f) => ({
        nome: f.nome, itens: f.itens.length,
        topo: f.itens.slice(0, 3).map((i) => `${i.cliente}: ${i.achado.slice(0, 90)}`),
      })),
    });
  }

  const logo = await loadLoneLogo().catch(() => "");
  const pdf = await htmlToPdf(diagnosticoPdfHtml(d, logo));
  if (!pdf.ok || !pdf.buffer) return NextResponse.json({ error: pdf.error }, { status: 500 });

  if (baixar) {
    return new NextResponse(new Uint8Array(pdf.buffer), {
      headers: { "content-type": "application/pdf", "content-disposition": 'inline; filename="diagnostico.pdf"' },
    });
  }

  const { data: cfg } = await supabaseAdmin.from("agency_settings")
    .select("value").eq("key", "traffic_alert_group_jid").single();
  const jid = cfg?.value as string | undefined;
  if (!jid) return NextResponse.json({ error: "grupo de tráfego não configurado" }, { status: 500 });

  // Marca quem responde pelo tráfego: diagnóstico é trabalho de alguém, não informação solta.
  const gestor = await responsavelDeTrafego().catch(() => ({ trecho: "", jids: [], notifica: false }));
  const legenda = gestor.trecho ? `${gestor.trecho}\n${legendaDiagnostico(d)}` : legendaDiagnostico(d);

  const r = await csSendGroupDocument(
    jid, pdf.buffer.toString("base64"),
    `Diagnostico ${d.data.split("-").reverse().join("-")}.pdf`,
    legenda, "application/pdf", gestor.jids,
  );
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 500 });

  const total = d.funcoes.reduce((s, f) => s + f.itens.length, 0);
  return NextResponse.json({ ok: true, enviado: true, data: d.data, pontos: total });
}
