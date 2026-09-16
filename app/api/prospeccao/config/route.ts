export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole, GESTAO } from "@/lib/api/require-role";
import { carregarConfig, salvarConfig, CONFIG_PADRAO, type ProspectConfig } from "@/lib/prospeccao/config";

// GET/PUT /api/prospeccao/config — ICP, cidades, pesos, templates, presente, handoff, kill-switch.
export async function GET(req: NextRequest) {
  const gate = await requireRole(req, GESTAO);
  if (gate instanceof NextResponse) return gate;
  return NextResponse.json({ ok: true, config: await carregarConfig(), padrao: CONFIG_PADRAO });
}

export async function PUT(req: NextRequest) {
  const gate = await requireRole(req, GESTAO);
  if (gate instanceof NextResponse) return gate;
  const body = (await req.json().catch(() => null)) as Partial<ProspectConfig> | null;
  if (!body || typeof body !== "object") return NextResponse.json({ error: "corpo inválido" }, { status: 400 });
  try {
    const cfg = await salvarConfig(body);
    return NextResponse.json({ ok: true, config: cfg });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "erro" }, { status: 500 });
  }
}
