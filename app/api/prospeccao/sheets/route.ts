export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import { requireRole, GESTAO } from "@/lib/api/require-role";
import { criarPlanilha, planilhaId, urlDaPlanilha } from "@/lib/prospeccao/google";
import { sincronizarPlanilha } from "@/lib/prospeccao/sheets-sync";

// POST /api/prospeccao/sheets { acao: "criar" | "sincronizar" }
export async function POST(req: NextRequest) {
  const gate = await requireRole(req, GESTAO);
  if (gate instanceof NextResponse) return gate;
  const body = (await req.json().catch(() => null)) as { acao?: string } | null;
  if (body?.acao === "criar") {
    const existente = await planilhaId();
    if (existente) return NextResponse.json({ ok: true, id: existente, url: urlDaPlanilha(existente), aviso: "planilha já existia" });
    const r = await criarPlanilha();
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 502 });
    const s = await sincronizarPlanilha();
    return NextResponse.json({ ok: true, id: r.id, url: r.url, sincronizada: s.ok, erro_sync: s.error ?? null });
  }
  const s = await sincronizarPlanilha();
  if (!s.ok) return NextResponse.json({ error: s.error }, { status: 502 });
  return NextResponse.json({ ...s, ok: true });
}
