// /api/cs/calendario — calendário estratégico (Fase 3). Semana ou MÊS, com contexto/campanha
// abastecido pelo time (ex.: "agosto: promoção na loja toda").
//   POST { clientId, modo?("semana"|"mes"), contexto? }        → GERA (plano + peças).
//   POST { clientId, criar:true, periodo, objetivo, decisoes, pecas, diagnostico } → cria no board.
// Human-gated: gera → time revisa → cria.

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

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

// Seg/qua/sex do PRÓXIMO mês (planejar agosto estando em julho).
function datasProximoMes(): { periodo: string; datas: string[] } {
  const now = spNow();
  const nm = now.getMonth() === 11 ? 0 : now.getMonth() + 1;
  const ny = now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear();
  const dias = new Date(ny, nm + 1, 0).getDate();
  const datas: string[] = [];
  for (let d = 1; d <= dias; d++) {
    const dt = new Date(ny, nm, d);
    if ([1, 3, 5].includes(dt.getDay())) datas.push(ymd(dt));
  }
  return { periodo: `${MESES[nm]}/${ny}`, datas };
}

export async function POST(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const clientId = body?.clientId as string;
  if (!clientId) return NextResponse.json({ error: "clientId obrigatório" }, { status: 400 });

  // ── CRIAR no board (a partir do plano aprovado) ──
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
        ? `${p.gancho}\n\n${p.apoio}\n\nCTA: ${p.cta}\n\n— Legenda sugerida —\n${p.legenda}\n\n— Design —\n${p.sugestao_design}\n\n_${d.formato} · pilar: ${d.pilar} · objetivo: ${d.objetivo} · por que agora: ${d.porQueAgora}_`
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

  // ── GERAR (preview) ──
  const modo = body?.modo === "mes" ? "mes" : "semana";
  const contexto = (body?.contexto as string) || undefined;
  const { periodo, datas } = modo === "mes"
    ? datasProximoMes()
    : (() => { const { segunda, datas } = datasProximaSemana(spNow()); return { periodo: `semana de ${ymd(segunda)}`, datas }; })();

  const r = await planejarPeriodo(clientId, periodo, datas, undefined, contexto);
  if (!r.ok || !r.plano || !r.nome) return NextResponse.json({ error: r.error ?? "Falha ao planejar" }, { status: 502 });

  const pecas = await executarPlano(r.nome, r.plano.diagnostico, r.plano.decisoes);
  return NextResponse.json({ cliente: r.nome, periodo, modo, plano: r.plano, pecas });
}
