export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import * as db from "@/lib/supabase/queries";

// Meta mensal do comercial. BFF: exige usuário logado.
//   GET ?mes=YYYY-MM              → { meta } (null se não definida)
//   PUT { mes, metaValor, metaLeads } → { meta } (upsert)
export async function GET(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const mes = req.nextUrl.searchParams.get("mes") ?? new Date().toISOString().slice(0, 7);
  const meta = await db.fetchCrmMeta(mes);
  return NextResponse.json({ meta });
}

export async function PUT(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body?.mes) return NextResponse.json({ error: "mes obrigatório" }, { status: 400 });
  try {
    const meta = await db.upsertCrmMeta(
      body.mes,
      body.metaValor === "" || body.metaValor == null ? null : Number(body.metaValor),
      body.metaLeads === "" || body.metaLeads == null ? null : Number(body.metaLeads),
    );
    return NextResponse.json({ meta });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "erro" }, { status: 500 });
  }
}
