export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import { hojeSP } from "@/lib/clients/pausa";
import { mesFechado, mesValido, mesesAte } from "@/lib/goals/catalogo";
import { calcularFechamento, gravarFechamento } from "@/lib/goals/metas-server";

// POST /api/system/metas-fechamento — FECHA O MÊS DAS METAS (N33, Leva 7D). Dia 1º, 7h.
//
// Calcula cada meta sobre o mês que acabou, da fonte (lib/goals/calcular-server.ts), aplica o alvo do
// trimestre daquele mês e grava em goal_results: é o histórico que a tela Metas & OKRs mostra.
// Só grava — não manda mensagem para ninguém.
//
//   ?dry=1          calcula e devolve, sem gravar.
//   ?periodo=AAAA-MM fecha um mês específico (refazer um fechamento).
//   ?meses=N        fecha os N últimos meses (até 12) — para montar o histórico da primeira vez.
//
// Precisa da migration 20260926120000_gestao_portal.sql (tabela goal_results). Sem ela, o dry roda
// e a gravação devolve o erro dizendo isso.
//
// Cron: `0 10 1 * *` (dia 1º, 7h BRT — depois do sync-posts das 6h30).

export async function POST(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;
  const dry = req.nextUrl.searchParams.get("dry") !== null;
  const pedido = req.nextUrl.searchParams.get("periodo");
  const quantos = Math.min(Math.max(Number(req.nextUrl.searchParams.get("meses")) || 1, 1), 12);
  const ultimo = mesFechado(hojeSP());
  if (pedido && (!mesValido(pedido) || pedido > ultimo)) {
    return NextResponse.json({ ok: false, error: `periodo inválido — só mês que já acabou (até ${ultimo})` }, { status: 400 });
  }
  const meses = pedido ? [pedido] : mesesAte(ultimo, quantos);

  const resultados: { mes: string; gravado: boolean; erro?: string; falhas: string[]; metas: { chave: string; valor: number | null; alvo: number | null; status: string; semFonte: string | null }[] }[] = [];
  for (const mes of meses) {
    const f = await calcularFechamento(mes);
    let gravado = false, erro: string | undefined;
    if (!dry) {
      const g = await gravarFechamento(f);
      gravado = g.ok;
      erro = g.erro;
    }
    resultados.push({
      mes, gravado, erro, falhas: f.falhas,
      metas: f.linhas.map((l) => ({ chave: l.chave, valor: l.valor, alvo: l.alvo, status: l.status, semFonte: l.sem_fonte })),
    });
  }

  const erros = resultados.filter((r) => r.erro);
  return NextResponse.json({
    ok: erros.length === 0,
    job: "metas-fechamento",
    dry,
    meses: resultados,
    ...(erros.length ? { error: erros.map((r) => `${r.mes}: ${r.erro}`).join("; ") } : {}),
  }, { status: erros.length && erros.length === resultados.length ? 500 : 200 });
}
