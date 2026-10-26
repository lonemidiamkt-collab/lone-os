// app/api/system/contratos-d4sign-arquivo/route.ts — a rotina do arquivo de contratos por mês.
//
// Baixa da D4Sign o PDF assinado de cada documento finalizado nos cofres de contrato e guarda no Lone OS
// (lib/contracts/arquivo-d4sign.ts). A conta responde a 10 chamadas por hora, então roda de madrugada —
// quando a consulta de 3 em 3 horas não roda — e cada rodada para na reserva do webhook. Documento antigo
// entra em silêncio: nada vai para o grupo.
//
//   ?dry=1 ... o que faria: quantos faltam, sem listar nem baixar
//
// Cron: `45 3-9 * * *` (0h45 a 6h45 BRT).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import { rodarArquivo } from "@/lib/contracts/arquivo-d4sign";

export async function POST(req: NextRequest) {
  const denied = requireCron(req); if (denied) return denied;
  const dry = req.nextUrl.searchParams.get("dry") !== null;
  const r = await rodarArquivo({ dry });
  console.log(`[contratos-d4sign-arquivo] listou=${r.listou} novos=${r.novos} guardados=${r.guardados} faltam=${r.faltam} cota=${r.parouNaCota} dry=${dry} erros=${r.erros.length}${r.desligado ? ` desligado=${r.desligado}` : ""}`);
  return NextResponse.json(r, { status: r.ok ? 200 : 502 });
}
