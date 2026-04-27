export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getAllObservances } from "@/lib/holidays/brasil-api";

/**
 * GET /api/holidays/[year]
 *   Retorna feriados oficiais + datas comemorativas (comerciais, awareness months,
 *   profissões). Cache 30d server-side pros feriados oficiais; comemorativas são
 *   estáticas no código.
 *
 *   Endpoint PÚBLICO — feriados/datas comemorativas são informação pública.
 *   Sem auth pra simplificar consumo do calendário (evita race com hidratação de sessão).
 *
 *   Query params:
 *     - sem nada: retorna tudo
 *     - ?only=feriado:    retorna só feriados oficiais (category=national)
 *     - ?only=comemorativa: retorna só comemorativas (todas as outras categorias)
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ year: string }> }) {
  const { year: yearStr } = await params;
  const year = parseInt(yearStr, 10);
  if (!Number.isFinite(year) || year < 2020 || year > 2050) {
    return NextResponse.json({ error: "Ano inválido" }, { status: 400 });
  }

  const only = req.nextUrl.searchParams.get("only");
  const all = await getAllObservances(year);

  let holidays = all;
  if (only === "feriado") {
    holidays = all.filter((h) => h.category === "national");
  } else if (only === "comemorativa") {
    holidays = all.filter((h) => h.category !== "national");
  }

  return NextResponse.json({
    year,
    count: holidays.length,
    holidays,
  });
}
