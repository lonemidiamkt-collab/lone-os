export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import { conferirCadastros } from "@/lib/crm/ligar-cadastro";

// POST /api/system/crm-ligar-cadastros — CONFERÊNCIA cadastros do Lone OS × leads do Comercial (out/2026).
// Liga cliente sem lead ao lead de mesmo nome quando o par é único (lib/crm/ligar-cadastro.ts) e lista os rascunhos de
// cadastro que parecem duplicados. Não muda etapa de lead nem apaga nada. ?dry=1 só lista; sem dry, liga e avisa no sino.
// Cron: todo dia 9h BRT (`0 12 * * *`) — pega o lead criado DEPOIS do cadastro; o resto já liga na hora (rota de onboarding).
export async function POST(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;
  const aplicar = req.nextUrl.searchParams.get("dry") === null;
  try {
    const r = await conferirCadastros(aplicar);
    return NextResponse.json({ ok: true, aplicar, ...r });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
