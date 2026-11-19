export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/portal/[token]/google  { period_kind } — o bloco GOOGLE do painel de resultados do cliente:
// Google Ads (com contrato de tráfego), Perfil da Empresa (Google Meu Negócio) e o site (Google Analytics).
//
// Público via token, como o resto do portal. Lê do BANCO (a rotina google-sync grava todo dia às 7h), pela mesma
// conta do relatório semanal e mensal (lib/google/relatorio-dados.ts) — o cliente vê no painel o mesmo número do PDF.
// Período: o mesmo seletor dos anúncios, sem "Hoje" (o Google não fecha o dia; o Perfil chega com dias de atraso).
//
// Bloco que não pôde ser lido volta como `indisponivel: true` SEM o motivo técnico (é a tela do cliente; o motivo
// fica no log e na ficha do cliente para o time) — e nunca como zero.

import { NextRequest, NextResponse } from "next/server";
import { lerLinkDoPortal, FRASE_INDISPONIVEL, type LinhaDeAcesso } from "@/lib/portal/token";
import { calcPeriod } from "@/lib/portal/buildSnapshot";
import { criarLimite } from "@/lib/portal/limite";
import type { PeriodKind } from "@/lib/portal/types";
import { janelaDoRelatorio } from "@/lib/reports/relatorioCliente";
import { lerRelatorioGoogle } from "@/lib/google/relatorio-dados";
import { temColunasGoogle, temColunasAnalytics } from "@/lib/google/colunas";
import { hojeSP } from "@/lib/clients/pausa";

const PERIODOS: PeriodKind[] = ["last_week", "last_2_weeks", "this_month", "last_month"];
const LIMITE = criarLimite(30, 60_000);

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!(await temColunasGoogle())) return NextResponse.json({ ads: null, perfil: null, adsIndisponivel: false, perfilIndisponivel: false });
  // Site (Google Analytics): só depois da migração 20261119100000 — antes dela a coluna nem é pedida.
  const ga = await temColunasAnalytics();
  const lido = await lerLinkDoPortal<LinhaDeAcesso & { id: string; service_type: string | null; google_ads_customer_id: string | null; google_perfil_local: string | null; google_analytics_propriedade?: string | null }>(
    token, `id, service_type, google_ads_customer_id, google_perfil_local${ga ? ", google_analytics_propriedade" : ""}`);
  if (lido.estado === "indisponivel") return NextResponse.json({ error: FRASE_INDISPONIVEL }, { status: 503 });
  if (lido.estado === "invalido") return NextResponse.json({ error: "Link inválido ou expirado" }, { status: 404 });
  const c = lido.linha;
  if (LIMITE.estourou(c.id)) return NextResponse.json({ error: "Muitas buscas seguidas. Tente em 1 minuto." }, { status: 429 });

  const body = await req.json().catch(() => ({}));
  const kind: PeriodKind = PERIODOS.includes(body?.period_kind) ? body.period_kind : "last_week";
  const p = calcPeriod(kind, new Date());
  // Dia 1º, "este mês" é só hoje — que o Google ainda não fechou.
  if (kind === "this_month" && p.end >= hojeSP()) {
    return NextResponse.json({ periodo: { kind, inicio: p.start, fim: p.end }, aviso: "O mês começou hoje — os números do Google aparecem a partir de amanhã." });
  }
  const janela = janelaDoRelatorio(p.start, p.end);
  const anterior = janelaDoRelatorio(p.previous_start, p.previous_end);

  try {
    const g = await lerRelatorioGoogle(c, janela, { anterior });
    if (g?.adsIndisponivel) console.error("[portal/google] Ads indisponível:", c.id, g.adsIndisponivel.motivo);
    if (g?.perfilIndisponivel) console.error("[portal/google] Perfil indisponível:", c.id, g.perfilIndisponivel.motivo);
    if (g?.siteIndisponivel) console.error("[portal/google] Site indisponível:", c.id, g.siteIndisponivel.motivo);
    return NextResponse.json({
      periodo: { kind, inicio: janela.inicio, fim: janela.fim, anteriorInicio: anterior.inicio, anteriorFim: anterior.fim },
      ads: g?.ads ?? null,
      perfil: g?.perfil ?? null,
      adsIndisponivel: !!g?.adsIndisponivel,
      perfilIndisponivel: !!g?.perfilIndisponivel,
      site: g?.site ?? null,
      siteIndisponivel: !!g?.siteIndisponivel,
    });
  } catch (e) {
    console.error("[portal/google] falhou:", c.id, e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: "Não consegui carregar os números do Google agora." }, { status: 503 });
  }
}
