export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import { requireRole, GESTAO } from "@/lib/api/require-role";
import { montarPainelMetas, salvarAlvo, voltarAlvoPadrao } from "@/lib/goals/metas-server";

// /api/goals — as metas do time ligadas a métricas reais (N33). Só a gestão.
//
// GET    → o painel: cada meta com o MÊS FECHADO (do histórico gravado, ou calculado agora), o parcial
//          do mês corrente e os últimos 6 meses fechados. Tudo calculado no servidor, da fonte.
// PUT    → { chave, alvo }: alvo do trimestre corrente (tabela okrs).
// DELETE → ?chave=: volta ao alvo padrão.
//
// Nenhuma meta de faturamento da agência (regra do CEO) — ver lib/goals/catalogo.ts.

export async function GET(req: NextRequest) {
  const gate = await requireRole(req, GESTAO);
  if (gate instanceof NextResponse) return gate;
  try {
    return NextResponse.json(await montarPainelMetas());
  } catch (e) {
    return NextResponse.json({ error: `Não consegui calcular as metas: ${e instanceof Error ? e.message : String(e)}` }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const gate = await requireRole(req, GESTAO);
  if (gate instanceof NextResponse) return gate;
  const body = (await req.json().catch(() => ({}))) as { chave?: string; alvo?: unknown };
  const r = await salvarAlvo(String(body.chave ?? ""), Number(body.alvo), gate.user.email || "gestão");
  if (!r.ok) return NextResponse.json({ error: r.erro }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const gate = await requireRole(req, GESTAO);
  if (gate instanceof NextResponse) return gate;
  const r = await voltarAlvoPadrao(req.nextUrl.searchParams.get("chave") ?? "");
  if (!r.ok) return NextResponse.json({ error: r.erro }, { status: 400 });
  return NextResponse.json({ ok: true });
}
