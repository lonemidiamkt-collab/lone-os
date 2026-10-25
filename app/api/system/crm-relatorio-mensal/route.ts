export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import * as db from "@/lib/supabase/queries";
import { carregarExtras, EXTRAS_VAZIOS } from "@/lib/crm/extras";
import { lerHistoricoDeEtapas } from "@/lib/crm/etapas-historico";
import { DESTINO_AVISOS_COMERCIAL } from "@/lib/crm/acesso";
import { hojeSP } from "@/lib/crm/meta";
import { mesAnterior, montarRelatorioMensal, primeiroDiaUtil, type AtividadeRel, type LeadRel, type ReuniaoRel } from "@/lib/crm/relatorio-mensal";
import { htmlRelatorioMensal } from "@/lib/crm/relatorio-mensal-html";
import { htmlToPdf } from "@/lib/traffic/renderPdf";
import { sendMediaDocument } from "@/lib/whatsapp/evolution";

// POST /api/system/crm-relatorio-mensal — RELATÓRIO MENSAL DE VENDAS do Comercial em PDF (out/2026).
//   Grupo de vendas (CS_VENDAS_GROUP_JID): quantidades e taxas, SEM valor em R$.
//   WhatsApp do Roberto (CS_OWNER_JID): o mesmo PDF + a página "Dinheiro". Sino do Roberto: enviado ou o porquê da falha.
// Cron: dias 1 a 5 às 8h BRT (`0 11 1-5 * *`); só envia no 1º dia útil do mês (sobre o mês anterior). Trava por mês em
// automation_settings (`crm-relatorio-mensal:AAAA-MM`): nunca manda duas vezes.
//   ?mes=AAAA-MM        mês do relatório (padrão: o anterior ao de hoje)
//   ?dry=1 | ?dry=privado        devolve o HTML (grupo | Roberto), sem enviar
//   ?ensaio=1 | ?ensaio=privado  devolve o PDF (grupo | Roberto), sem enviar — para aprovar antes de ligar
//   ?forcar=1           envia fora do 1º dia útil ou de novo (uso manual)

async function carregar(mes: string) {
  const [leadsBrutos, hist, meta] = await Promise.all([db.fetchCrmLeads(), lerHistoricoDeEtapas(), db.fetchCrmMeta(mes)]);
  if (!hist.ok) throw new Error(hist.erro);
  const extras = await carregarExtras(leadsBrutos.map((l) => l.id));
  const leads: LeadRel[] = leadsBrutos.map((l) => ({ ...l, clienteId: (extras.get(l.id) ?? EXTRAS_VAZIOS).clienteId }));
  const desde = new Date(Date.parse(`${mes}-01T03:00:00Z`) - 40 * 86_400_000).toISOString();
  const [ativ, reun] = await Promise.all([
    supabaseAdmin.from("crm_lead_activities").select("lead_id, tipo, created_at").gte("created_at", desde),
    supabaseAdmin.from("crm_reunioes").select("lead_id, inicio, estado, criado_em"),
  ]);
  if (ativ.error) throw new Error(`atividades: ${ativ.error.message}`);
  if (reun.error) throw new Error(`reuniões: ${reun.error.message}`);
  const atividades: AtividadeRel[] = (ativ.data ?? []).map((a) => ({ leadId: a.lead_id as string, tipo: a.tipo as string, createdAt: a.created_at as string }));
  const reunioes: ReuniaoRel[] = (reun.data ?? []).map((r) => ({ leadId: r.lead_id as string, inicio: r.inicio as string, estado: r.estado as string, criadoEm: r.criado_em as string }));
  return { leads, historico: hist.itens, atividades, reunioes, metaValor: meta?.metaValor ?? null };
}

async function avisarNoSino(titulo: string, corpo: string) {
  const { error } = await supabaseAdmin.from("notifications").insert({ type: "content", title: titulo, body: corpo, target_user: DESTINO_AVISOS_COMERCIAL, read: false });
  if (error) console.error("[crm-relatorio-mensal] sino:", error.message);
}

export async function POST(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;
  const q = req.nextUrl.searchParams;
  const agora = new Date();
  const hoje = hojeSP(agora);
  const mesParam = q.get("mes");
  const mes = mesParam && /^\d{4}-(0[1-9]|1[0-2])$/.test(mesParam) ? mesParam : mesAnterior(hoje.slice(0, 7));
  const dry = q.get("dry");
  const ensaio = q.get("ensaio");
  const forcar = q.get("forcar") === "1";

  // Envio real fora do 1º dia útil: nem carrega nada.
  if (!dry && !ensaio && !forcar && hoje !== primeiroDiaUtil(hoje.slice(0, 7))) {
    return NextResponse.json({ ok: true, pulou: `hoje não é o 1º dia útil (${primeiroDiaUtil(hoje.slice(0, 7))})` });
  }
  const CHAVE = `crm-relatorio-mensal:${mes}`;
  if (!dry && !ensaio && !forcar) {
    const { data: trava } = await supabaseAdmin.from("automation_settings").select("ultimo_alerta_em").eq("job", CHAVE).maybeSingle();
    if (trava?.ultimo_alerta_em) return NextResponse.json({ ok: true, jaEnviado: trava.ultimo_alerta_em });
  }

  let r;
  try {
    r = montarRelatorioMensal({ mes, agora, ...(await carregar(mes)) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[crm-relatorio-mensal] dados:", msg);
    if (!dry && !ensaio) await avisarNoSino(`Relatório de vendas de ${mes} não saiu`, `Não consegui montar os números: ${msg}. Rode de novo com ?forcar=1 depois de corrigir.`);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
  const geradoEm = agora.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
  const htmlGrupo = htmlRelatorioMensal(r, { privado: false, geradoEm });
  const htmlRoberto = htmlRelatorioMensal(r, { privado: true, geradoEm });

  if (dry) return new NextResponse(dry === "privado" ? htmlRoberto : htmlGrupo, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
  if (ensaio) {
    const pdf = await htmlToPdf(ensaio === "privado" ? htmlRoberto : htmlGrupo);
    if (!pdf.ok || !pdf.buffer) return NextResponse.json({ ok: false, error: pdf.error ?? "falha no PDF" }, { status: 500 });
    return new NextResponse(new Uint8Array(pdf.buffer), { headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="vendas-${mes}${ensaio === "privado" ? "-roberto" : ""}.pdf"`, "cache-control": "no-store" } });
  }

  // ── Envio real ──
  const grupo = process.env.CS_VENDAS_GROUP_JID || null;
  const dono = process.env.CS_OWNER_JID || null;
  if (!grupo) {
    await avisarNoSino(`Relatório de vendas de ${r.rotulo} não saiu`, "CS_VENDAS_GROUP_JID não está configurado no servidor.");
    return NextResponse.json({ ok: false, error: "CS_VENDAS_GROUP_JID não configurado" }, { status: 500 });
  }
  const [pdfGrupo, pdfRoberto] = await Promise.all([htmlToPdf(htmlGrupo), htmlToPdf(htmlRoberto)]);
  if (!pdfGrupo.ok || !pdfGrupo.buffer) {
    await avisarNoSino(`Relatório de vendas de ${r.rotulo} não saiu`, `O PDF não foi gerado: ${pdfGrupo.error ?? "erro no render"}. Rode de novo com ?forcar=1.`);
    return NextResponse.json({ ok: false, error: pdfGrupo.error ?? "falha no PDF" }, { status: 500 });
  }
  const legenda = `Relatório de vendas — ${r.rotulo}. ${r.resumo.frase}`;
  const envioGrupo = await sendMediaDocument(grupo, pdfGrupo.buffer.toString("base64"), `vendas-${mes}.pdf`, legenda);
  let envioDono: { ok: boolean; error?: string } = { ok: false, error: "CS_OWNER_JID não configurado" };
  if (dono && pdfRoberto.ok && pdfRoberto.buffer) {
    envioDono = await sendMediaDocument(dono, pdfRoberto.buffer.toString("base64"), `vendas-${mes}-roberto.pdf`, `Relatório de vendas — ${r.rotulo} (com os valores, só para você).`);
  }
  if (envioGrupo.ok) await supabaseAdmin.from("automation_settings").upsert({ job: CHAVE, ultimo_alerta_em: agora.toISOString() }, { onConflict: "job" });
  await avisarNoSino(
    envioGrupo.ok ? `Relatório de vendas de ${r.rotulo} enviado` : `Relatório de vendas de ${r.rotulo} não saiu`,
    envioGrupo.ok
      ? `${r.resumo.frase} PDF no grupo de vendas${envioDono.ok ? "; a versão com valores foi para o seu WhatsApp" : ` (a versão com valores não foi: ${envioDono.error})`}.`
      : `O WhatsApp recusou o envio ao grupo: ${envioGrupo.error}. Rode de novo com ?forcar=1.`,
  );
  console.log(`[crm-relatorio-mensal] mes=${mes} grupo=${envioGrupo.ok} dono=${envioDono.ok}`);
  return NextResponse.json({ ok: envioGrupo.ok, mes, grupo: envioGrupo.ok, dono: envioDono.ok, error: envioGrupo.ok ? undefined : envioGrupo.error });
}
