export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import { lerConfig } from "@/lib/automacoes/painel";
import { estaPausado as jobPausado } from "@/lib/automacoes/saude";
import { carregarRevisao } from "@/lib/reports/revisaoSemanalDados";
import { legendaRevisao } from "@/lib/reports/revisaoSemanal";
import { revisaoSemanalPdfHtml } from "@/lib/reports/revisaoSemanalPdf";
import { loadLoneLogo } from "@/lib/cs/roteiro-pdf";
import { htmlToPdf } from "@/lib/traffic/renderPdf";
import { csSendGroupDocument } from "@/lib/cs/notify";

// POST /api/system/revisao-semanal — REVISÃO SEMANAL DE OPERAÇÃO (N31, Leva 7D). Segunda de manhã.
//
// A semana que fechou (segunda a domingo) numa folha: posts planejados × no ar (Instagram) ×
// registrados no quadro, atrasos, reuniões feitas e pendentes, e as pendências de cada responsável.
// Vai como PDF para o grupo INTERNO do time (CS_TEAM_GROUP_JID) com uma legenda de três linhas —
// o CEO não quer textão no grupo. Nunca para grupo de cliente. Regras em lib/reports/revisaoSemanal.ts.
//
// NASCE DESLIGADO: a migration 20260926120000_gestao_portal.sql grava enabled=false na Central, e
// esta rota exige o job LIGADO EXPLICITAMENTE (sem linha na Central = desligado, o contrário dos
// outros jobs). Para ligar: Central de Automações (/automations).
//
//   ?dry=1     não gera PDF nem manda nada: devolve os números, a legenda e se está ligado.
//   ?baixar=1  devolve o PDF (para conferir antes de ligar). Não manda nada.
//
// Cron: `15 12 * * 1` (segunda, 9h15 BRT).

const JOB = "revisao-semanal";

async function ligado(agora: Date): Promise<{ ligado: boolean; motivo: string }> {
  try {
    const c = await lerConfig(JOB);
    if (!c) return { ligado: false, motivo: "nunca foi ligado na Central de Automações (nasce desligado)" };
    if (c.enabled !== true) return { ligado: false, motivo: "desligado na Central de Automações" };
    if (jobPausado(c, agora)) return { ligado: false, motivo: "pausado na Central de Automações" };
    return { ligado: true, motivo: "ligado na Central de Automações" };
  } catch (e) {
    return { ligado: false, motivo: `não consegui ler a Central (${e instanceof Error ? e.message : String(e)}) — sem envio, por segurança` };
  }
}

export async function POST(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;
  const dry = req.nextUrl.searchParams.get("dry") !== null;
  const baixar = req.nextUrl.searchParams.get("baixar") !== null;
  const agora = new Date();

  let dados: Awaited<ReturnType<typeof carregarRevisao>>;
  try {
    dados = await carregarRevisao(agora);
  } catch (e) {
    return NextResponse.json({ ok: false, job: JOB, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
  const { revisao, falhas } = dados;
  const legenda = legendaRevisao(revisao) + (falhas.length ? "\n⚠️ Parte dos dados não carregou (ver rodapé do PDF)." : "");
  const trava = await ligado(agora);

  if (dry) {
    return NextResponse.json({
      ok: true, job: JOB, dry: true, ligado: trava.ligado, situacao: trava.motivo,
      semana: revisao.semana, totais: revisao.totais, legenda, falhas,
      pessoas: revisao.pessoas.map((p) => ({
        pessoa: p.pessoa, posts: p.posts, cardsAtrasados: p.cardsAtrasados.length,
        reunioesFeitas: p.reunioesFeitas.length, reunioesPendentes: p.reunioesPendentes.length,
        tarefasVencidas: p.tarefasVencidas.length,
      })),
    });
  }

  const logo = await loadLoneLogo().catch(() => "");
  const pdf = await htmlToPdf(revisaoSemanalPdfHtml(revisao, logo, falhas));
  if (!pdf.ok || !pdf.buffer) {
    return NextResponse.json({ ok: false, job: JOB, error: `PDF: ${pdf.error ?? "falhou"}` }, { status: 502 });
  }
  const nomeArquivo = `Revisão da semana ${revisao.semana.rotulo.replace(/\//g, "-")}.pdf`;

  if (baixar) {
    return new NextResponse(new Uint8Array(pdf.buffer), {
      headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="revisao-${revisao.semana.inicio}.pdf"` },
    });
  }

  if (!trava.ligado) {
    return NextResponse.json({ ok: true, job: JOB, enviado: false, desligado: true, situacao: trava.motivo, semana: revisao.semana.rotulo });
  }

  // Grupo INTERNO do time. Sem ele configurado, não cai em outro grupo.
  const jid = process.env.CS_TEAM_GROUP_JID || "";
  if (!jid) return NextResponse.json({ ok: false, job: JOB, error: "grupo interno não configurado (CS_TEAM_GROUP_JID)" }, { status: 500 });

  const r = await csSendGroupDocument(jid, pdf.buffer.toString("base64"), nomeArquivo, legenda);
  if (!r.ok) return NextResponse.json({ ok: false, job: JOB, error: r.error }, { status: 502 });
  return NextResponse.json({ ok: true, job: JOB, enviado: true, semana: revisao.semana.rotulo, totais: revisao.totais, falhas });
}
