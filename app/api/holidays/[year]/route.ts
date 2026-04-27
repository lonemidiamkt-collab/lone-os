export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getHolidays } from "@/lib/holidays/brasil-api";

/**
 * GET /api/holidays/[year]
 *   Retorna feriados nacionais do ano (cache 30d, fallback estático).
 *   Endpoint PÚBLICO — feriados são informação pública (Brasil API também é).
 *   Sem auth pra simplificar consumo do calendário (evita race com hidratação de sessão).
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ year: string }> }) {
  const { year: yearStr } = await params;
  const year = parseInt(yearStr, 10);
  if (!Number.isFinite(year) || year < 2020 || year > 2050) {
    return NextResponse.json({ error: "Ano inválido" }, { status: 400 });
  }

  const holidays = await getHolidays(year);
  return NextResponse.json({
    year,
    count: holidays.length,
    source: holidays[0]?.source ?? "fallback",
    holidays,
  });
}
