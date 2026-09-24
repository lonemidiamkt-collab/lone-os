export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole, type Papel } from "@/lib/api/require-role";
import { hojeSP } from "@/lib/clients/pausa";
import { ROTULO_NICHO, type Nicho } from "@/lib/cs/nicho";
import { carregarReferencias } from "@/lib/traffic/referencia-nicho-server";
import type { RespostaReferencias } from "@/lib/traffic/referencia-nicho";

// GET /api/trafego/referencia-nicho — Leva 7A (N6). A mediana ANÔNIMA de cada nicho (custo por
// resultado, CTR, CPM; últimos 30 dias fechados). Só nichos com 3+ clientes. Nenhum nome, nenhum
// número individual de cliente sai daqui. Regras em lib/traffic/referencia-nicho.ts.

const TRAFEGO: Papel[] = ["admin", "manager", "traffic"];

export async function GET(req: NextRequest) {
  const gate = await requireRole(req, TRAFEGO);
  if (gate instanceof NextResponse) return gate;
  try {
    const ontem = (() => { const d = new Date(`${hojeSP()}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); })();
    const r = await carregarReferencias(ontem);
    const nichos = [...r.porNicho.values()]
      .map((n) => ({ chave: n.nicho, rotulo: ROTULO_NICHO[n.nicho as Nicho] ?? n.nicho, clientes: n.clientes, ctr: n.ctr, cpm: n.cpm, custo: n.custo }))
      .sort((a, b) => b.clientes - a.clientes || a.rotulo.localeCompare(b.rotulo));
    return NextResponse.json({ desde: r.desde, ate: r.ate, nichos } satisfies RespostaReferencias);
  } catch (e) {
    console.error("[trafego/referencia-nicho]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Não consegui calcular a referência por nicho agora." }, { status: 500 });
  }
}
