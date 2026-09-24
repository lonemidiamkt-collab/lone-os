export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { GESTAO, requireRole, type Papel } from "@/lib/api/require-role";
import { carregarDados } from "@/lib/inicio/carregar";
import { montarInicio } from "@/lib/inicio/feed";
import type { Severidade } from "@/lib/inicio/tipos";

// GET /api/dashboard/insights — LEGADO. O dashboard antigo lia daqui; o Início (Leva 3, 24/09/2026)
// passou a ler /api/inicio/atencao, e as duas fontes discordavam sobre os mesmos cards. Esta rota
// agora é só um adaptador do feed novo no formato antigo, para quem ainda chamar não quebrar e não
// voltar a haver dois cálculos do mesmo alerta.

const TODOS: Papel[] = ["admin", "manager", "traffic", "social", "designer", "comercial"];
const TOM: Record<Severidade, "alerta" | "atencao" | "info"> = { critical: "alerta", warning: "atencao", info: "info" };

export async function GET(req: NextRequest) {
  const gate = await requireRole(req, TODOS);
  if (gate instanceof NextResponse) return gate;
  const papel = gate.papel as Papel;
  try {
    const agora = new Date();
    const { dados, falhas, nome } = await carregarDados(papel, gate.user.email, agora);
    const { itens } = montarInicio(dados, { nome, papel }, agora, falhas);
    const insights = itens.map((i) => ({
      id: i.id,
      tone: TOM[i.severidade],
      icon: "",
      titulo: `${i.cliente?.nome ?? i.sujeito}: ${i.titulo}`,
      detalhe: i.motivo,
      href: i.acao.href,
    }));
    return NextResponse.json({ insights, gestao: GESTAO.includes(papel) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
