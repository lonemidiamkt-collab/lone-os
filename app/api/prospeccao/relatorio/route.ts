export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import { requireRole, GESTAO } from "@/lib/api/require-role";
import { supabaseAdmin } from "@/lib/supabase/server";
import { campanhaAtual } from "@/lib/prospeccao/piloto";
import { gerarRelatorioFinal, textoRelatorioFinal } from "@/lib/prospeccao/relatorios";
import { cruzamentos } from "@/lib/prospeccao/aprendizado";

// GET /api/prospeccao/relatorio — diários gravados + prévia do relatório final + aprendizado (cruzamentos).
export async function GET(req: NextRequest) {
  const gate = await requireRole(req, GESTAO);
  if (gate instanceof NextResponse) return gate;
  const campanha = await campanhaAtual();
  const { data: diarios } = await supabaseAdmin.from("prospect_daily_metrics").select("*").order("dia", { ascending: false }).limit(60);
  if (!campanha) return NextResponse.json({ ok: true, campanha: null, diarios: diarios ?? [], final: null, texto: null, cruzamentos: null });
  const final = campanha.relatorio_final ?? await gerarRelatorioFinal(campanha);
  const de = campanha.iniciado_em ?? campanha.created_at;
  const cz = (final as { cruzamentos?: unknown }).cruzamentos ?? await cruzamentos(de, new Date().toISOString());
  return NextResponse.json({ ok: true, campanha, diarios: diarios ?? [], final, texto: textoRelatorioFinal(final as Awaited<ReturnType<typeof gerarRelatorioFinal>>), cruzamentos: cz, salvo: !!campanha.relatorio_final });
}
