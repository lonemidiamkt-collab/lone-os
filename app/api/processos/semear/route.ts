// app/api/processos/semear/route.ts — põe os processos escritos no banco.
//
// Ação de gestão, e idempotente: rodar de novo não sobrescreve o que alguém já corrigiu na tela.
// Existe como rota (e não como migration) porque o conteúdo é texto de operação, não estrutura —
// e porque `deploy.sh` não roda migrations, então seed em migration nunca chegaria em produção.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import { requireRole, type Papel } from "@/lib/api/require-role";
import { semear } from "@/lib/processos/semear";

const GESTAO: Papel[] = ["admin", "manager"];

export async function POST(req: NextRequest) {
  const gate = await requireRole(req, GESTAO);
  if (gate instanceof NextResponse) return gate;

  const r = await semear(gate.user.email || "gestão");
  return NextResponse.json({ ok: r.falhas.length === 0, ...r });
}
