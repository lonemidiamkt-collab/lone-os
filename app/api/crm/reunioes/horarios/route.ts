export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/api/require-role";
import { PAPEIS_COMERCIAL } from "@/lib/crm/acesso";
import { supabaseAdmin } from "@/lib/supabase/server";
import { estadoGoogle, ocupadosNoCalendario } from "@/lib/prospeccao/google";
import { horariosLivres, inicioDe } from "@/lib/crm/reunioes";

// GET /api/crm/reunioes/horarios?dia=YYYY-MM-DD&duracao=45 → { livres: ["10:00", …], ocupados: [{inicio, fim}], google }
// Ocupado = o Google Agenda da Lone (freebusy) + as reuniões do Comercial já marcadas nesse dia.

export async function GET(req: NextRequest) {
  const gate = await requireRole(req, PAPEIS_COMERCIAL);
  if (gate instanceof NextResponse) return gate;
  const dia = req.nextUrl.searchParams.get("dia") ?? "";
  const duracao = Number(req.nextUrl.searchParams.get("duracao") ?? 45);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return NextResponse.json({ error: "dia inválido" }, { status: 400 });
  const de = inicioDe(dia, "00:00"), ate = inicioDe(dia, "23:59");
  const [g, nossas] = await Promise.all([
    estadoGoogle(),
    supabaseAdmin.from("crm_reunioes").select("inicio, fim").eq("estado", "agendada").gte("inicio", de).lte("inicio", ate),
  ]);
  const ocupados = (nossas.data ?? []).map((r) => ({ inicio: r.inicio as string, fim: r.fim as string }));
  let google: "conectado" | "desconectado" | "erro" = "desconectado";
  if (g.conectado) {
    const fb = await ocupadosNoCalendario(new Date(de).toISOString(), new Date(ate).toISOString());
    if (fb.ok) { ocupados.push(...fb.faixas); google = "conectado"; } else google = "erro";
  }
  return NextResponse.json({ livres: horariosLivres({ dia, duracao, ocupados, agora: new Date(), max: 6 }), ocupados, google });
}
