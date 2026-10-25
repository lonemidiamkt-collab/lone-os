// lib/integracoes/finance-porta.ts — a porta das leituras do sistema financeiro privado (clientes, vendas).
//
// Rotas públicas protegidas só pela ASSINATURA: HMAC-SHA256 de `${x-lone-timestamp}.GET ${caminho}` com o segredo
// LONEOS_FINANCE_READ_SECRET, carimbo de no máximo 5 min — o mesmo esquema do cadastro do site. Sem o segredo
// configurado a porta fica fechada (503). Devolve null quando pode seguir, ou a resposta de recusa.

import { NextRequest, NextResponse } from "next/server";
import { conferirAssinatura } from "@/lib/crm/site-lead";
import { mensagemAssinada } from "@/lib/integracoes/finance-clientes";

export function recusarLeituraFinance(req: NextRequest, caminho: string): NextResponse | null {
  const segredo = process.env.LONEOS_FINANCE_READ_SECRET ?? "";
  if (segredo.length < 32) return NextResponse.json({ error: "integração desligada" }, { status: 503 });
  const conf = conferirAssinatura({
    segredo,
    timestamp: req.headers.get("x-lone-timestamp"),
    assinatura: req.headers.get("x-lone-signature"),
    corpo: mensagemAssinada(caminho),
    agora: Date.now(),
  });
  if (conf.ok) return null;
  console.warn(`[integracoes/finance] leitura recusada (${caminho}): ${conf.motivo}`);
  return NextResponse.json({ error: "não autorizado" }, { status: 401 });
}
