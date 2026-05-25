export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getAllObservances, observancesForLocation } from "@/lib/holidays/brasil-api";

/**
 * GET /api/holidays/[year]
 *   Retorna feriados (nacionais, estaduais, municipais) + datas comemorativas.
 *   Cache 30d server-side pros feriados oficiais; resto é estático no código.
 *
 *   Endpoint PÚBLICO — feriados/datas comemorativas são informação pública.
 *
 *   Query params:
 *     - sem nada: retorna tudo, incluindo TODOS os feriados estaduais e
 *       municipais cadastrados (visão completa do calendário interno)
 *     - ?uf=RJ:           filtra estaduais pra RJ apenas (descarta outros UF)
 *     - ?city=Saquarema:  filtra municipais pra Saquarema (descarta outros)
 *       Quando uf+city forem passados, retorna o calendário pessoal daquele
 *       cliente (nacionais + estaduais do estado dele + municipais da cidade
 *       dele + comemorativas).
 *     - ?only=feriado:    retorna só feriados oficiais (national/estadual/municipal)
 *     - ?only=comemorativa: retorna só comemorativas
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ year: string }> }) {
  const { year: yearStr } = await params;
  const year = parseInt(yearStr, 10);
  if (!Number.isFinite(year) || year < 2020 || year > 2050) {
    return NextResponse.json({ error: "Ano inválido" }, { status: 400 });
  }

  const sp = req.nextUrl.searchParams;
  const only = sp.get("only");
  const uf = sp.get("uf") || undefined;
  const city = sp.get("city") || undefined;

  let holidays = await getAllObservances(year);

  // Filtra por localização se uf ou city foi passada
  if (uf || city) {
    holidays = observancesForLocation(holidays, { uf, city });
  }

  if (only === "feriado") {
    holidays = holidays.filter((h) => h.category === "national" || h.category === "estadual" || h.category === "municipal");
  } else if (only === "comemorativa") {
    holidays = holidays.filter((h) => h.category !== "national" && h.category !== "estadual" && h.category !== "municipal");
  }

  return NextResponse.json({
    year,
    count: holidays.length,
    filter: uf || city ? { uf, city } : null,
    holidays,
  });
}
