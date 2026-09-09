export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { saudeDaCarteira } from "@/lib/meetings/consulta";
import { cobertura, porResponsavel } from "@/lib/meetings/status";
import { spNow } from "@/lib/cs/vigilancia";

// GET /api/reunioes/cobertura[?mes=2026-09]
//
// A resposta única para "quem teve reunião este mês". Alimenta a aba Clientes (coluna e filtro),
// o dashboard (cards de cobertura) e a métrica por responsável — os três lendo o MESMO cálculo,
// que é o que impede a mesma pergunta ter três respostas em três telas.

export async function GET(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const agora = spNow();
  const par = req.nextUrl.searchParams.get("mes");
  const mes = par && /^\d{4}-\d{2}$/.test(par)
    ? par
    : `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}`;

  const carteira = await saudeDaCarteira(mes, agora);

  return NextResponse.json({
    ok: true,
    mes,
    resumo: cobertura(carteira.map((c) => c.saude)),
    porResponsavel: porResponsavel(carteira.map((c) => ({ responsavel: c.responsavel, saude: c.saude }))),
    // Uma linha por cliente: é o que a aba Clientes usa para pintar o semáforo e filtrar.
    clientes: carteira.map((c) => ({
      clientId: c.clientId,
      nome: c.nome,
      responsavel: c.responsavel,
      status: c.saude.status,
      realizadas: c.saude.realizadas,
      agendadas: c.saude.agendadas,
      meta: c.saude.meta,
      metaAtingida: c.saude.metaAtingida,
      ultima: c.saude.ultima,
      proxima: c.saude.proxima,
      diasSemReuniao: c.saude.diasSemReuniao,
    })),
  }, { headers: { "cache-control": "no-store" } });
}
