export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole, type Papel } from "@/lib/api/require-role";
import { carregarDados } from "@/lib/inicio/carregar";
import { montarInicio } from "@/lib/inicio/feed";
import { carregarVistos } from "@/lib/traffic/hoje/vistos";
import { ocultarVistosNoInicio } from "@/lib/traffic/hoje/visto";

// GET /api/inicio/atencao — o Início de quem está logado: o feed de atenção (um item por cliente e
// problema, já filtrado pelo papel e, para tráfego/social/designer/comercial, pelo que é DA pessoa)
// e o resumo do papel. Tudo calculado aqui, numa leitura só — a tela não junta store nenhum.
// Regras em lib/inicio/regras.ts; filtro e deduplicação em lib/inicio/feed.ts.
// Alerta de tráfego marcado como "visto" no Hoje/Defesa Ativa não aparece aqui enquanto o visto vale
// (24h, ou até piorar) — lib/traffic/hoje/visto.ts.

const TODOS: Papel[] = ["admin", "manager", "traffic", "social", "designer", "comercial"];

export async function GET(req: NextRequest) {
  const gate = await requireRole(req, TODOS);
  if (gate instanceof NextResponse) return gate;
  const papel = gate.papel as Papel; // requireRole só deixa passar com papel
  try {
    const agora = new Date();
    const veTrafego = papel === "admin" || papel === "manager" || papel === "traffic";
    const [{ dados, falhas, nome }, vistos] = await Promise.all([
      carregarDados(papel, gate.user.email, agora),
      veTrafego ? carregarVistos() : null,
    ]);
    const ocultar = vistos?.mapa.size ? ocultarVistosNoInicio(vistos.mapa, agora) : undefined;
    return NextResponse.json(montarInicio(dados, { nome, papel }, agora, falhas, ocultar));
  } catch (err) {
    console.error("[inicio/atencao]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Não consegui montar o Início agora. Recarregue em instantes." }, { status: 500 });
  }
}
