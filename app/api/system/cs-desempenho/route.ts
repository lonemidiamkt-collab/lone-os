export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import { janelaSemana, desempenhoDesigner, desempenhoSocial, desempenhoTrafego, visaoCeo, relatorioTime, janelaAnterior } from "@/lib/reports/desempenho";
import { ceoPdfHtml, funcaoPdfHtml, timePdfHtml } from "@/lib/reports/desempenhoPdf";
import { loadLoneLogo } from "@/lib/cs/roteiro-pdf";
import { htmlToPdf } from "@/lib/traffic/renderPdf";
import { csSendGroupDocument, csSendGroupText } from "@/lib/cs/notify";

// POST /api/system/cs-desempenho — o PDF de desempenho da semana.
//
// PRA QUE (Roberto, 31/08): "toda sexta um PDF pros funcionários e pra mim, mostrando o desempenho
// deles, personalizado de acordo com a função". E: "muito textão nos grupos — algumas coisas podem
// ser PDF".
//
// Três peças da mesma base:
//   TIME    → um documento com o time inteiro: produção por pessoa, comparação com a semana
//             anterior, e os riscos que só aparecem no conjunto. É o padrão. Vai pro grupo
//             administrativo. Roberto (01/09): "eu queria tipo um PDF como se fosse um relatório
//             de todo o time" — antes eram quatro arquivos que ele tinha que juntar de cabeça.
//   CEO     → o que está bom / o que preocupa, SEM nome de pessoa. Leitura de negócio.
//   FUNÇÃO  → o cartão de UMA pessoa. Existe pra mandar individualmente a quem é da conta.
//
// ?dry=1 gera e devolve sem enviar · ?quem=time|ceo|funcao|ambos · ?jid= manda pra um grupo
// ?baixar=time|ceo|<nome> devolve aquele PDF em vez de enviar — é como se confere antes do envio.
// ?baixar=ceo|<nome da pessoa> devolve aquele PDF em vez de enviar — é como se confere o documento
//   antes que ele chegue num grupo. Sem isso, a única forma de ver o que sai era disparando.

export async function POST(req: NextRequest) {
  const denied = requireCron(req); if (denied) return denied;
  const dry = req.nextUrl.searchParams.get("dry") !== null;
  const quem = req.nextUrl.searchParams.get("quem") || "time";
  const jidManual = req.nextUrl.searchParams.get("jid") || "";
  const baixar = (req.nextUrl.searchParams.get("baixar") || "").trim().toLowerCase();

  const { de, ate, rotulo } = janelaSemana();
  const logo = await loadLoneLogo().catch(() => "");
  const enviados: string[] = [];
  const erros: string[] = [];

  // ── TIME (padrão) ──
  if (quem === "time" || quem === "ambos") {
    const r = await relatorioTime(de, ate, rotulo);
    const pdf = await htmlToPdf(timePdfHtml(r, logo));
    if (!pdf.ok || !pdf.buffer) erros.push(`Time: ${pdf.error}`);
    else if (baixar === "time") {
      return new NextResponse(new Uint8Array(pdf.buffer), {
        headers: { "content-type": "application/pdf",
          "content-disposition": `inline; filename="time-${rotulo.replace(/[^0-9]/g, "")}.pdf"` },
      });
    } else if (!dry) {
      const jid = jidManual || process.env.CS_ADM_GROUP_JID || "";
      if (!jid) erros.push("Time: grupo administrativo não configurado (CS_ADM_GROUP_JID)");
      else {
        const r2 = await csSendGroupDocument(jid, pdf.buffer.toString("base64"),
          `Time - semana ${rotulo.replace(/\//g, "-")}.pdf`,
          `📋 *Relatório do time* — ${rotulo}\n${r.blocos.length} pessoa(s) · ${r.geral.artesEntregues} artes · ${r.geral.pecasCriadas} peças`);
        if (r2.ok) enviados.push("time"); else erros.push(`Time: ${r2.error}`);
      }
    } else enviados.push(`time (dry, ${pdf.buffer.length} bytes, ${r.blocos.length} pessoas)`);
  }

  // ── CEO ──
  if (quem === "ceo" || quem === "ambos") {
    const v = await visaoCeo(de, ate, rotulo);
    const pdf = await htmlToPdf(ceoPdfHtml(v, logo));
    if (!pdf.ok || !pdf.buffer) erros.push(`CEO: ${pdf.error}`);
    else if (baixar === "ceo") {
      return new NextResponse(new Uint8Array(pdf.buffer), {
        headers: { "content-type": "application/pdf",
          "content-disposition": `inline; filename="ceo-${rotulo.replace(/[^0-9]/g, "")}.pdf"` },
      });
    } else if (!dry) {
      // Grupo administrativo. Sem ele configurado, NÃO cai em outro grupo: o resumo tem número de
      // negócio e não pode vazar pro grupo errado por falta de config.
      const jid = jidManual || process.env.CS_ADM_GROUP_JID || "";
      if (!jid) erros.push("CEO: grupo administrativo não configurado (CS_ADM_GROUP_JID)");
      else {
        const r = await csSendGroupDocument(jid, pdf.buffer.toString("base64"),
          `Semana ${rotulo.replace(/\//g, "-")} - Lone Midia.pdf`,
          `📊 *Resumo da semana* — ${rotulo}\n${v.bom.length} ponto(s) positivo(s) · ${v.preocupa.length} ponto(s) de atenção`);
        if (r.ok) enviados.push("ceo"); else erros.push(`CEO: ${r.error}`);
      }
    } else enviados.push(`ceo (dry, ${pdf.buffer?.length ?? 0} bytes)`);
  }

  // ── POR FUNÇÃO ──
  const anterior = janelaAnterior(de);
  const blocos = quem === "time"
    ? []
    : [...await desempenhoDesigner(de, ate, anterior), ...await desempenhoSocial(de, ate, anterior)];
  if (quem === "funcao" || quem === "ambos") {
    const jid = jidManual || process.env.CS_TEAM_GROUP_JID || "";
    for (const b of blocos) {
      const pdf = await htmlToPdf(funcaoPdfHtml(b, rotulo, logo));
      if (!pdf.ok || !pdf.buffer) { erros.push(`${b.pessoa}: ${pdf.error}`); continue; }
      if (baixar && b.pessoa.toLowerCase().includes(baixar)) {
        return new NextResponse(new Uint8Array(pdf.buffer), {
          headers: { "content-type": "application/pdf",
            "content-disposition": `inline; filename="${b.pessoa.replace(/\s+/g, "-")}.pdf"` },
        });
      }
      if (dry || baixar) { enviados.push(`${b.pessoa} (dry)`); continue; }
      if (!jid) { erros.push(`${b.pessoa}: grupo da equipe não configurado`); continue; }
      const r = await csSendGroupDocument(jid, pdf.buffer.toString("base64"),
        `${b.pessoa} - semana ${rotulo.replace(/\//g, "-")}.pdf`,
        `📈 *${b.pessoa}* — desempenho da semana (${rotulo})`);
      if (r.ok) enviados.push(b.pessoa); else erros.push(`${b.pessoa}: ${r.error}`);
      await new Promise((r) => setTimeout(r, 1500)); // não estoura a fila da Evolution
    }
    // O tráfego não tem "produção por pessoa" no sistema: a Meta é editada fora daqui. Vai como
    // resumo curto, honesto sobre o que dá pra medir.
    if (!dry && jid) {
      const t = await desempenhoTrafego(de, ate);
      const seta = (n: number | null) => n === null ? "" : n > 0 ? ` (+${n}%)` : ` (${n}%)`;
      await csSendGroupText(jid, [
        `📊 *Tráfego — semana ${rotulo}*`, "",
        `• ${t.contasAtivas} contas com verba rodando`,
        `• ${t.conversas} conversas geradas${seta(t.variacaoConversas)}`,
        `• custo por conversa: R$ ${t.custoPorConversa.toFixed(2)}${seta(t.variacaoCusto)}`,
      ].join("\n"), undefined, { origem: "desempenho-trafego", destino: "interno" });
      enviados.push("trafego");
    }
  }

  return NextResponse.json({ ok: erros.length === 0, dry, periodo: rotulo, enviados, erros, pessoas: blocos.length });
}
