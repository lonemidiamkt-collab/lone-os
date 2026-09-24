export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole, GESTAO } from "@/lib/api/require-role";
import { supabaseAdmin } from "@/lib/supabase/server";
import { montarPainel, MIGRACAO_PENDENTE } from "@/lib/automacoes/painel";
import { automacaoPorId } from "@/lib/automacoes/registro";

// GET /api/system/automacoes — a Central inteira: registro + última execução, último sucesso,
// 7 dias, configuração, próxima execução e saúde de cada job.
// GET ?job=<id> — as 10 últimas execuções daquele job (com o resumo), para a linha aberta.
export async function GET(req: NextRequest) {
  const gate = await requireRole(req, GESTAO);
  if (gate instanceof NextResponse) return gate;

  const job = req.nextUrl.searchParams.get("job");
  if (job) {
    if (!automacaoPorId(job)) return NextResponse.json({ error: "Job desconhecido." }, { status: 404 });
    const { data, error } = await supabaseAdmin
      .from("automation_runs")
      .select("id, started_at, finished_at, duration_ms, http_status, ok, skipped, ensaio, resumo")
      .eq("job", job).order("finished_at", { ascending: false }).limit(10);
    if (error) return NextResponse.json({ error: MIGRACAO_PENDENTE, detalhe: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, job, execucoes: data ?? [] });
  }

  try {
    const agora = new Date();
    const { linhas, inicioMonitoramento } = await montarPainel(agora);
    return NextResponse.json({ ok: true, agora: agora.toISOString(), inicioMonitoramento, automacoes: linhas });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: MIGRACAO_PENDENTE, detalhe: msg }, { status: 500 });
  }
}
