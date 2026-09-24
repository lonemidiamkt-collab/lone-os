// GET /api/saude/carteira — a Saúde da carteira: cada cliente com o nível (modelo único), o porquê, o
// dono e a próxima ação (sugerida pelo feed de prioridades ou confirmada por alguém).
//
// Quem vê: a gestão e o social (os mesmos papéis que viam Termômetro, Jornada e Carteira no menu). A
// ficha de relacionamento (notas com o handoff do comercial) só vai para a gestão. Sem dinheiro.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole, type Papel } from "@/lib/api/require-role";
import { carregarCarteira, nomeDoUsuario } from "@/lib/saude/carregar";
import { PAPEIS_SAUDE } from "@/lib/saude/carteira";

export async function GET(req: NextRequest) {
  const gate = await requireRole(req, [...PAPEIS_SAUDE]);
  if (gate instanceof NextResponse) return gate;
  try {
    const nome = await nomeDoUsuario(gate.user.email);
    const r = await carregarCarteira({ nome, papel: gate.papel as Papel });
    return NextResponse.json(r);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
