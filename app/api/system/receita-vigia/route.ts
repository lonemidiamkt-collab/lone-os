export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// POST /api/system/receita-vigia — VIGIA MENSAL de CNPJ (25/10/2026). Cron dia 2 às 10h BRT (`0 13 2 * *`): reconsulta
// todos os clientes ativos na Receita, grava e avisa no sino do Roberto quem PASSOU a constar baixado/inapto
// (lib/empresa/receita-carteira.ts). ?dry=1 = ensaio (consulta e devolve, sem gravar nem avisar).

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import { rodarReceitaClientes } from "@/lib/empresa/receita-carteira";

export async function POST(req: NextRequest) {
  const negado = requireCron(req);
  if (negado) return negado;
  try {
    const r = await rodarReceitaClientes({ aplicar: req.nextUrl.searchParams.get("dry") === null, forcar: true });
    // A Central guarda só o começo da resposta: o resumo vem antes das linhas.
    const { linhas, ...resumo } = r;
    return NextResponse.json({ ...resumo, linhas });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
