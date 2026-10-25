export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/api/require-role";
import { PAPEIS_COMERCIAL } from "@/lib/crm/acesso";
import { supabaseAdmin } from "@/lib/supabase/server";
import { estadoGoogle, ocupadosNoCalendario } from "@/lib/prospeccao/google";
import { inicioDe, respostaHorarios } from "@/lib/crm/reunioes";

// GET /api/crm/reunioes/horarios?dia=YYYY-MM-DD&duracao=45 → { livres: ["10:00", …], google, erro }
// Ocupado = o Google Agenda da Lone (freebusy) + as reuniões do Comercial já marcadas nesse dia.
// 24/10/2026 (auditoria 4.9): leitura que falha volta com `erro` e SEM horários — nunca agenda "livre" sem conferir.

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
  let google: Parameters<typeof respostaHorarios>[0]["google"] = "desconectado";
  if (g.conectado) {
    const fb = await ocupadosNoCalendario(new Date(de).toISOString(), new Date(ate).toISOString())
      .catch((e: unknown) => ({ ok: false, faixas: [], error: e instanceof Error ? e.message : "sem resposta" }));
    google = fb.ok ? { ok: true, faixas: fb.faixas } : { ok: false, erro: fb.error ?? "sem resposta" };
  }
  const r = respostaHorarios({
    dia, duracao, agora: new Date(), google,
    nossas: nossas.error ? { ok: false, erro: nossas.error.message } : { ok: true, faixas: (nossas.data ?? []).map((x) => ({ inicio: x.inicio as string, fim: x.fim as string })) },
  });
  return NextResponse.json(r);
}
