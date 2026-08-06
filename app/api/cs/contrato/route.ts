// app/api/cs/contrato/route.ts — gera o contrato em PDF e devolve/manda no grupo.
//
// Fluxo (Roberto, 05/08): cliente termina o cadastro → o agente avisa no grupo CADASTRO e oferece
// o contrato → o Roberto responde "gera: 2500, 12 meses, dia 10" → o arquivo chega ali, pronto
// pra encaminhar pra assinatura.
//
// POST { clientId, valorMensal, duracaoMeses, diaPagamento, groupJid? }
//   sem groupJid → devolve o PDF na resposta (usado pra testar sem mandar pra ninguém)
//   com groupJid → manda o arquivo no grupo
//
// NÃO GERA COM LACUNA. Se falta CNPJ, endereço ou representante, devolve a lista do que preencher
// em vez do documento. Contrato com "CNPJ: ___" chegando no cliente é pior que contrato atrasado.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import { requireRole, GESTAO } from "@/lib/api/require-role";
import { montarContratoHtml } from "@/lib/contracts/contratoPdf";
import { htmlToPdf } from "@/lib/traffic/renderPdf";
import { csSendGroupDocument } from "@/lib/cs/notify";

export async function POST(req: NextRequest) {
  const gate = await requireRole(req, GESTAO);
  if (gate instanceof NextResponse) return gate;

  const body = await req.json().catch(() => ({}));
  const clientId = body?.clientId as string;
  const valorMensal = Number(body?.valorMensal);
  const duracaoMeses = Number(body?.duracaoMeses);
  const diaPagamento = Number(body?.diaPagamento);
  const groupJid = (body?.groupJid as string) || "";

  if (!clientId) return NextResponse.json({ error: "clientId obrigatório" }, { status: 400 });
  if (!(valorMensal > 0) || !(duracaoMeses > 0) || !(diaPagamento >= 1 && diaPagamento <= 28)) {
    return NextResponse.json({ error: "Informe valor mensal, duração em meses e dia de pagamento (1 a 28)." }, { status: 400 });
  }

  const montado = await montarContratoHtml(clientId, { valorMensal, duracaoMeses, diaPagamento });
  if (!montado.ok || !montado.html) {
    return NextResponse.json({
      ok: false,
      cliente: montado.cliente,
      faltando: montado.faltando,
      error: montado.erro ?? (montado.faltando?.length
        ? `Falta no cadastro: ${montado.faltando.join(", ")}.`
        : "Não consegui montar o contrato."),
    }, { status: 422 });
  }

  const pdf = await htmlToPdf(montado.html);
  if (!pdf.ok || !pdf.buffer) {
    return NextResponse.json({ ok: false, error: pdf.error ?? "Falha ao renderizar o PDF." }, { status: 502 });
  }

  if (!groupJid) {
    return new NextResponse(new Uint8Array(pdf.buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${montado.nomeArquivo}"`,
      },
    });
  }

  const legenda =
    `📄 *Contrato — ${montado.cliente}*\n` +
    `${valorMensal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}/mês · ` +
    `${duracaoMeses} meses · vencimento dia ${diaPagamento}\n\n` +
    `_Confira antes de mandar pro cliente. O .docx oficial pro D4Sign continua saindo em Contratos._`;

  const env = await csSendGroupDocument(groupJid, pdf.buffer.toString("base64"), montado.nomeArquivo!, legenda);
  return NextResponse.json({
    ok: env.ok, cliente: montado.cliente, arquivo: montado.nomeArquivo,
    ...(env.ok ? {} : { error: env.error }),
  });
}
