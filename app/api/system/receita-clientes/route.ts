export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// POST /api/system/receita-clientes — consulta na Receita o CNPJ dos clientes ativos (lib/empresa/receita-carteira.ts
// explica o que grava e o que avisa). Uso manual; o cron mensal é /api/system/receita-vigia.
// Roberto (18/10/2026) autorizou rodar para os clientes atuais ("sim").
//
//   sem parâmetro → ensaio: consulta e devolve o que gravaria, sem gravar
//   ?aplicar=1    → grava (e avisa CNPJ que passou a não ativo); ?dry=1 junto = ensaio
//   ?forcar=1     → reconsulta também quem foi consultado nos últimos 30 dias

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import { rodarReceitaClientes } from "@/lib/empresa/receita-carteira";

export async function POST(req: NextRequest) {
  const negado = requireCron(req);
  if (negado) return negado;
  const q = req.nextUrl.searchParams;
  try {
    return NextResponse.json(await rodarReceitaClientes({ aplicar: q.get("aplicar") === "1" && q.get("dry") === null, forcar: q.get("forcar") === "1" }));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
