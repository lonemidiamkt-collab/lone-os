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
import { temTrafego } from "@/lib/clients/servico";
import { estaPausado } from "@/lib/clients/pausa";
import { responsavelDeTrafego } from "@/lib/cs/mencao";
import { spNow, ymd } from "@/lib/cs/vigilancia";
import { destaquesDaSemana, semanasFechadas, type SemanaCliente } from "@/lib/traffic/destaques-semana";
import { destaquesSemanaHtml, legendaDestaques } from "@/lib/reports/destaquesSemanaPdf";

export async function POST(req: NextRequest) {
  const negado = requireCron(req);
  if (negado) return negado;
  const q = req.nextUrl.searchParams;
  const dry = q.get("dry") === "1";
  const baixar = q.get("baixar") === "1";
  const forcar = q.get("forcar") === "1";

  const hoje = ymd(spNow());
  const { atual, anterior } = semanasFechadas(hoje);

  const { data: clientes, error: eCli } = await supabaseAdmin.from("clients")
    .select("id, name, nome_fantasia, service_type, active, churned_at, paused_at, paused_until")
    .or("active.is.null,active.eq.true").is("churned_at", null);
  if (eCli) return NextResponse.json({ ok: false, error: eCli.message }, { status: 500 });
  const alvo = (clientes ?? []).filter((c) =>
    temTrafego({ service_type: c.service_type as string | null })
    && !estaPausado(c as { paused_at: string | null; paused_until: string | null })
    && !/🧪|\(teste\)/i.test(String(c.name ?? "")));
  const ids = alvo.map((c) => c.id as string);
  if (!ids.length) return NextResponse.json({ ok: true, skip: "nenhum cliente de tráfego ativo" });

  // metric_snapshots já teve dezenas de capturas por dia: vale a ÚLTIMA de cada cliente×dia.
  const { data: met, error: eMet } = await supabaseAdmin.from("metric_snapshots")
    .select("client_id, metric_date, spend, conversions, captured_at")
    .in("client_id", ids).gte("metric_date", anterior.de).lte("metric_date", atual.ate)
    .order("captured_at", { ascending: false }).limit(20000);
  if (eMet) return NextResponse.json({ ok: false, error: eMet.message }, { status: 500 });
  const visto = new Set<string>();
  const porCliente = new Map<string, SemanaCliente>();
  const nome = new Map(alvo.map((c) => [c.id as string, ((c.nome_fantasia as string) || (c.name as string) || "Cliente").trim()]));
  for (const id of ids) porCliente.set(id, { cliente: nome.get(id)!, gastoAtual: 0, conversasAtual: 0, gastoAnterior: 0, conversasAnterior: 0 });
  for (const m of met ?? []) {
    const chave = `${m.client_id}|${m.metric_date}`;
    if (visto.has(chave)) continue;
    visto.add(chave);
    const l = porCliente.get(m.client_id as string);
    if (!l) continue;
    const dia = String(m.metric_date);
    const s = Number(m.spend) || 0, c = Number(m.conversions) || 0;
    if (dia >= atual.de && dia <= atual.ate) { l.gastoAtual += s; l.conversasAtual += c; }
    else if (dia >= anterior.de && dia <= anterior.ate) { l.gastoAnterior += s; l.conversasAnterior += c; }
  }

  const dados = destaquesDaSemana([...porCliente.values()]);
  const geradoEm = spNow().toLocaleDateString("pt-BR");
  const opcoes = { dados, atual, anterior, geradoEm };
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
