// /api/cs/calendario — calendário estratégico da próxima semana (Fase 3).
//   GET  ?clientId  → roda o motor (diagnosticar → objetivo → decidir → EXECUTAR): devolve o
//                     plano + as peças prontas (gancho/apoio/CTA/legenda/design), com justificativa.
//   POST { clientId, periodo, objetivo, decisoes, pecas } → cria os cards no board (com a DECISÃO
//                     gravada: pilar/objetivo/ângulo/por que agora) + salva o plano do período.
// Human-gated: o time revisa o preview (GET) e só then cria (POST).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { planejarPeriodo, executarPlano, type PecaFinal } from "@/lib/cs/motor";
import { criarCardDemanda } from "@/lib/cs/card";
import { datasProximaSemana } from "@/lib/cs/pauta";
import { spNow, ymd } from "@/lib/cs/vigilancia";
import type { DecisaoDeConteudo, ObjetivoPeriodo, DiagnosticoEstrategico } from "@/lib/cs/pipeline";

export async function GET(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const clientId = req.nextUrl.searchParams.get("clientId");
  if (!clientId) return NextResponse.json({ error: "clientId obrigatório" }, { status: 400 });

  const { segunda, datas } = datasProximaSemana(spNow());
  const periodo = `semana de ${ymd(segunda)}`;

  const r = await planejarPeriodo(clientId, periodo, datas);
  if (!r.ok || !r.plano || !r.nome) return NextResponse.json({ error: r.error ?? "Falha ao planejar" }, { status: 502 });

  const pecas = await executarPlano(r.nome, r.plano.diagnostico, r.plano.decisoes);
  return NextResponse.json({ cliente: r.nome, periodo, plano: r.plano, pecas });
}

export async function POST(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const clientId = body?.clientId as string;
  const periodo = body?.periodo as string;
  const objetivo = body?.objetivo as ObjetivoPeriodo | undefined;
  const decisoes = (body?.decisoes as DecisaoDeConteudo[]) || [];
  const pecas = (body?.pecas as PecaFinal[]) || [];
  if (!clientId || !decisoes.length) return NextResponse.json({ error: "clientId e decisoes obrigatórios" }, { status: 400 });

  const { data: c } = await supabaseAdmin.from("clients").select("name, nome_fantasia").eq("id", clientId).maybeSingle();
  const nome = (c?.nome_fantasia as string) || (c?.name as string) || "Cliente";
  const pecaDe = (data: string) => pecas.find((p) => p.data === data);

  const cardIds: string[] = [];
  for (const d of decisoes) {
    const p = pecaDe(d.data);
    const briefing = p
      ? `${p.gancho}\n\n${p.apoio}\n\nCTA: ${p.cta}\n\n— Legenda sugerida —\n${p.legenda}\n\n— Design —\n${p.sugestao_design}\n\n_${d.formato} · pilar: ${d.pilar} · objetivo: ${d.objetivo} · por que agora: ${d.porQueAgora}_`
      : `${d.tema}\n\nÂngulo: ${d.angulo}\n\n_${d.formato} · pilar: ${d.pilar} · objetivo: ${d.objetivo}_`;
    const id = await criarCardDemanda({
      clientId, clienteNome: nome, titulo: p?.titulo || d.tema, urgencia: "media",
      briefing, tipo: "arte_nova", dueDate: d.data,
      decisao: { pilar: d.pilar, objetivo: d.objetivo, posicao_funil: d.posicaoFunil, angulo: d.angulo, dor_alvo: d.dorAlvo, por_que_agora: d.porQueAgora },
    });
    if (id) cardIds.push(id);
  }

  // salva o plano do período (objetivo/narrativa/mix + snapshot do diagnóstico)
  if (objetivo && periodo) {
    const diag = body?.diagnostico as DiagnosticoEstrategico | undefined;
    await supabaseAdmin.from("content_period_plans").upsert({
      client_id: clientId, periodo,
      objetivo_principal: objetivo.objetivoPrincipal, narrativa: objetivo.narrativa,
      mix_pilares: objetivo.mixPilares, diagnostico_snapshot: diag ?? null,
    }, { onConflict: "client_id,periodo" });
  }

  return NextResponse.json({ ok: true, cardIds, total: cardIds.length });
}
