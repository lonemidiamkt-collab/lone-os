export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { pulsoDeTodos } from "@/lib/pulse/fetch";

// GET /api/dashboard/pulse — atividade BIDIRECIONAL por cliente, com o motivo dominante.
// Substitui o `inactiveSevenDays` do dashboard, que lia dois campos mortos e listava a carteira
// inteira como "inativo" (33 de 33). Aqui, quem não tem sinal fica de fora do alerta (`semSinal`).
export async function GET(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const todos = await pulsoDeTodos();
  const atencao = todos
    .filter((p) => !p.semSinal && p.motivoDominante)
    .sort((a, b) => a.score - b.score);

  return NextResponse.json({
    atencao,
    semSinal: todos.filter((p) => p.semSinal).map((p) => ({ clientId: p.clientId, nome: p.nome })),
    resumo: {
      total: todos.length,
      saudaveis: todos.filter((p) => p.nivel === "saudavel").length,
      atencao: todos.filter((p) => p.nivel === "atencao").length,
      risco: todos.filter((p) => p.nivel === "risco").length,
      critico: todos.filter((p) => p.nivel === "critico").length,
    },
  });
}
