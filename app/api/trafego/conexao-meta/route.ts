export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole, type Papel } from "@/lib/api/require-role";
import { lerConexao } from "@/lib/trafego/anuncios-server";

// GET /api/trafego/conexao-meta — estado do token da agência para a tela Sistema › Conexão Meta.
// Nunca devolve o token (quem precisa dele é só o admin, via /api/meta/token). Sem isto, gestor e
// tráfego abriam a tela e viam "Desconectado" com a Meta funcionando: a rota do token só responde
// ao admin e o hook entendia o 401 como "sem conexão".

const TRAFEGO: Papel[] = ["admin", "manager", "traffic"];

export async function GET(req: NextRequest) {
  const gate = await requireRole(req, TRAFEGO);
  if (gate instanceof NextResponse) return gate;
  try {
    const c = await lerConexao();
    return NextResponse.json({ estado: c.estado, expiraEm: c.expiraEm, tipo: c.tipo });
  } catch (err) {
    console.error("[trafego/conexao-meta]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Não consegui ler o estado da conexão." }, { status: 500 });
  }
}
