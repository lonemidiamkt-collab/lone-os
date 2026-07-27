// app/api/ceo/cockpit/route.ts — os números do cockpit, do servidor e da fonte.
//
// GET  → mês corrente calculado ao vivo + comparação com o mês anterior GRAVADO (tabela snapshots).
//        Sem mês anterior gravado, a comparação vem null e a tela não desenha seta nenhuma.
// POST → fecha o mês: grava o snapshot na tabela. Cron no dia 1º.
//
// Substitui o cálculo que rodava no navegador com baseline inventado e histórico em localStorage.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole, GESTAO } from "@/lib/api/require-role";
import { requireCron } from "@/lib/api/cron-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import { calcularCockpit, compararComAnterior, periodoAtualBRT, type Cockpit } from "@/lib/metrics/cockpit";

/** Mês anterior no formato "YYYY-MM". */
function periodoAnterior(p: string): string {
  const [a, m] = p.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Linha da tabela `snapshots` → o formato do cockpit. Só pra comparação. */
function daLinha(r: Record<string, unknown>): Cockpit {
  const n = (v: unknown) => (v == null ? null : Number(v));
  return {
    periodo: r.period as string,
    clientes: Number(r.total_clients) || 0,
    ativos: Number(r.active_clients) || 0,
    emRisco: Number(r.at_risk_clients) || 0,
    churnPct: { valor: n(r.churn_rate) },
    healthMedio: { valor: n(r.avg_health_score) },
    postsPublicados: { valor: n(r.posts_published) },
    postsMeta: n(r.posts_target),
    slaEntregaHoras: { valor: n(r.avg_delivery_sla_hours) },
    slaCumprimentoPct: { valor: n(r.sla_compliance_pct) },
    designEntregues: { valor: n(r.design_completed) },
    designNoPrazoPct: { valor: n(r.design_on_time_pct) },
    designDiasMedio: { valor: n(r.design_avg_days) },
    tarefasConcluidas: { valor: n(r.tasks_completed) },
    tarefasVencidas: { valor: n(r.tasks_overdue) },
    diasSemFalarMedio: { valor: n(r.avg_days_since_last_interaction) },
    cobertura: { health: 0, interacao: 0 },
  };
}

export async function GET(req: NextRequest) {
  // Cockpit é do CEO: número de churn e saúde da carteira não é pra todo mundo.
  const gate = await requireRole(req, GESTAO);
  if (gate instanceof NextResponse) return gate;

  const periodo = req.nextUrl.searchParams.get("periodo") || periodoAtualBRT();
  const atual = await calcularCockpit(periodo);

  const { data: anteriorRow } = await supabaseAdmin
    .from("snapshots").select("*").eq("period", periodoAnterior(periodo)).maybeSingle();
  const anterior = anteriorRow ? daLinha(anteriorRow) : null;

  return NextResponse.json({
    atual,
    anterior: anterior ? { periodo: anterior.periodo } : null,
    deltas: compararComAnterior(atual, anterior),
    // A tela precisa saber a diferença entre "não mudou" e "não temos com o que comparar".
    temComparacao: !!anterior,
    motivoSemComparacao: anterior ? null
      : `Nenhum fechamento gravado para ${periodoAnterior(periodo)}. A comparação aparece a partir do primeiro fechamento de mês.`,
  });
}

/** Fecha o mês. Cron dia 1º; `?periodo=YYYY-MM` fecha um específico. */
export async function POST(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) {
    const gate = await requireRole(req, GESTAO);
    if (gate instanceof NextResponse) return gate;
  }

  // Sem parâmetro, fecha o mês que ACABOU (o cron roda no dia 1º do mês seguinte).
  const pedido = req.nextUrl.searchParams.get("periodo");
  const periodo = pedido || periodoAnterior(periodoAtualBRT());
  const c = await calcularCockpit(periodo);

  const { error } = await supabaseAdmin.from("snapshots").upsert({
    period: periodo, period_type: "monthly",
    total_clients: c.clientes, active_clients: c.ativos, at_risk_clients: c.emRisco,
    churn_rate: c.churnPct.valor, avg_health_score: c.healthMedio.valor,
    posts_published: c.postsPublicados.valor, posts_target: c.postsMeta,
    avg_delivery_sla_hours: c.slaEntregaHoras.valor, sla_compliance_pct: c.slaCumprimentoPct.valor,
    design_completed: c.designEntregues.valor, design_avg_days: c.designDiasMedio.valor,
    design_on_time_pct: c.designNoPrazoPct.valor,
    tasks_completed: c.tarefasConcluidas.valor, tasks_overdue: c.tarefasVencidas.valor,
    avg_days_since_last_interaction: c.diasSemFalarMedio.valor,
    raw_data: c as unknown as Record<string, unknown>,
  }, { onConflict: "period" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, periodo, gravado: c });
}
