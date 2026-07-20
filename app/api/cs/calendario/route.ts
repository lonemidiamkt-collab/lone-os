// /api/cs/calendario — calendário estratégico (Fase 3). Geração é ASSÍNCRONA (job) porque roda
// vários passos de IA e estouraria o timeout do gateway numa request síncrona.
//   POST { clientId, modo?, contexto? }              → inicia a geração, retorna { jobId }.
//   GET  ?jobId=...                                  → status/resultado do job (polling).
//   POST { clientId, criar:true, ... }               → cria os cards no board (rápido, síncrono).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { planejarPeriodo, executarPlano, pecaParaTexto, datasDoPeriodo, type PecaFinal } from "@/lib/cs/motor";
import { criarCardDemanda } from "@/lib/cs/card";
import type { DecisaoDeConteudo, ObjetivoPeriodo, DiagnosticoEstrategico } from "@/lib/cs/pipeline";

// Roda a geração em background e grava o resultado no job (fire-and-forget num server Node vivo).
async function rodarGeracao(jobId: string, clientId: string, modo: "semana" | "mes", contexto?: string) {
  const finish = (patch: Record<string, unknown>) =>
    supabaseAdmin.from("content_calendar_jobs").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", jobId);
  try {
    const { periodo, datas } = datasDoPeriodo(modo);

    const r = await planejarPeriodo(clientId, periodo, datas, undefined, contexto);
    if (!r.ok || !r.plano || !r.nome) { await finish({ status: "error", error: r.error ?? "Falha ao planejar" }); return; }
    const pecas = await executarPlano(r.nome, r.plano.diagnostico, r.plano.decisoes);
    await finish({ status: "done", result: { cliente: r.nome, periodo, modo, plano: r.plano, pecas } });
  } catch (e) {
    await finish({ status: "error", error: e instanceof Error ? e.message : "erro inesperado" });
  }
}

export async function GET(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const jobId = req.nextUrl.searchParams.get("jobId");
  if (!jobId) return NextResponse.json({ error: "jobId obrigatório" }, { status: 400 });
  const { data: job } = await supabaseAdmin.from("content_calendar_jobs").select("status, result, error").eq("id", jobId).maybeSingle();
  if (!job) return NextResponse.json({ error: "job não encontrado" }, { status: 404 });
  return NextResponse.json({ status: job.status, result: job.result ?? null, error: job.error ?? null });
}

export async function POST(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const clientId = body?.clientId as string;
  if (!clientId) return NextResponse.json({ error: "clientId obrigatório" }, { status: 400 });

  // ── CRIAR no board (rápido, síncrono) ──
  if (body?.criar === true) {
    const periodo = body?.periodo as string;
    const objetivo = body?.objetivo as ObjetivoPeriodo | undefined;
    const decisoes = (body?.decisoes as DecisaoDeConteudo[]) || [];
    const pecas = (body?.pecas as PecaFinal[]) || [];
    if (!decisoes.length) return NextResponse.json({ error: "sem decisões pra criar" }, { status: 400 });

    const { data: c } = await supabaseAdmin.from("clients").select("name, nome_fantasia").eq("id", clientId).maybeSingle();
    const nome = (c?.nome_fantasia as string) || (c?.name as string) || "Cliente";
    const pecaDe = (data: string) => pecas.find((p) => p.data === data);

    const cardIds: string[] = [];
    for (const d of decisoes) {
      const p = pecaDe(d.data);
      const briefing = p
        ? `${pecaParaTexto(p)}\n\n_${d.formato} · pilar: ${d.pilar} · objetivo: ${d.objetivo} · por que agora: ${d.porQueAgora}_`
        : `${d.tema}\n\nÂngulo: ${d.angulo}\n\n_${d.formato} · pilar: ${d.pilar} · objetivo: ${d.objetivo}_`;
      const id = await criarCardDemanda({
        clientId, clienteNome: nome, titulo: p?.titulo || d.tema, urgencia: "media",
        briefing, tipo: "arte_nova", dueDate: d.data,
        decisao: { pilar: d.pilar, objetivo: d.objetivo, posicao_funil: d.posicaoFunil, angulo: d.angulo, dor_alvo: d.dorAlvo, por_que_agora: d.porQueAgora },
      });
      if (id) cardIds.push(id);
    }
    if (objetivo && periodo) {
      const diag = body?.diagnostico as DiagnosticoEstrategico | undefined;
      await supabaseAdmin.from("content_period_plans").upsert({
        client_id: clientId, periodo, objetivo_principal: objetivo.objetivoPrincipal, narrativa: objetivo.narrativa,
        mix_pilares: objetivo.mixPilares, diagnostico_snapshot: diag ?? null,
      }, { onConflict: "client_id,periodo" });
    }
    return NextResponse.json({ ok: true, cardIds, total: cardIds.length });
  }

  // ── GERAR (assíncrono): cria o job e dispara em background ──
  const modo = body?.modo === "mes" ? "mes" : "semana";
  const contexto = (body?.contexto as string) || undefined;
  const { data: job, error } = await supabaseAdmin.from("content_calendar_jobs")
    .insert({ client_id: clientId, modo, contexto: contexto ?? null, status: "running" }).select("id").maybeSingle();
  if (error || !job) return NextResponse.json({ error: "Não consegui iniciar a geração" }, { status: 500 });

  void rodarGeracao(job.id as string, clientId, modo, contexto);
  return NextResponse.json({ jobId: job.id });
}
