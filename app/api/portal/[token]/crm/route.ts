export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/portal/[token]/crm  { period_kind } — a aba "Atendimento e vendas" do painel de resultados do cliente:
// os números do CRM dele (Âncora, Kommo ou API aberta), pela MESMA conta do relatório semanal e mensal
// (lib/crm-externo/relatorio.ts) — o cliente vê no painel o mesmo número do PDF.
//
// Público via token, como o resto do portal. Lê com cache de 30 min (lib/crm-externo/servidor.ts): visita no portal
// não bate no CRM do cliente toda vez. Período que não pôde ser lido volta como `indisponivel: true` SEM o motivo
// técnico (o motivo fica no log e na ficha para o time) — nunca como zero.

import { NextRequest, NextResponse } from "next/server";
import { lerLinkDoPortal, FRASE_INDISPONIVEL, type LinhaDeAcesso } from "@/lib/portal/token";
import { calcPeriod } from "@/lib/portal/buildSnapshot";
import { criarLimite } from "@/lib/portal/limite";
import type { PeriodKind } from "@/lib/portal/types";
import { janelaDoRelatorio } from "@/lib/reports/relatorioCliente";
import { lerRelatorioCrm } from "@/lib/crm-externo/servidor";

const PERIODOS: PeriodKind[] = ["last_week", "last_2_weeks", "this_month", "last_month"];
const LIMITE = criarLimite(20, 60_000);

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const lido = await lerLinkDoPortal<LinhaDeAcesso & { id: string }>(token, "id");
  if (lido.estado === "indisponivel") return NextResponse.json({ error: FRASE_INDISPONIVEL }, { status: 503 });
  if (lido.estado === "invalido") return NextResponse.json({ error: "Link inválido ou expirado" }, { status: 404 });
  const c = lido.linha;
  if (LIMITE.estourou(c.id)) return NextResponse.json({ error: "Muitas buscas seguidas. Tente em 1 minuto." }, { status: 429 });

  const body = await req.json().catch(() => ({}));
  const kind: PeriodKind = PERIODOS.includes(body?.period_kind) ? body.period_kind : "last_week";
  const p = calcPeriod(kind, new Date());
  const janela = janelaDoRelatorio(p.start, p.end);
  const anterior = janelaDoRelatorio(p.previous_start, p.previous_end);

  try {
    const r = await lerRelatorioCrm(c.id, janela, { anterior });
    if (!r) return NextResponse.json({ relatorio: null, conectado: false });
    if (r.avisos.length) console.error("[portal/crm]", c.id, r.avisos.join(" · ").slice(0, 400));
    return NextResponse.json({
      periodo: { kind, inicio: janela.inicio, fim: janela.fim, anteriorInicio: anterior.inicio, anteriorFim: anterior.fim },
      conectado: true,
      relatorio: r.relatorio,
      indisponivel: r.indisponivel,
    });
  } catch (e) {
    console.error("[portal/crm] falhou:", c.id, e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: "Não consegui carregar os números de atendimento agora." }, { status: 503 });
  }
}
