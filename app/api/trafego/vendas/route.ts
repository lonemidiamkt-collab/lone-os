export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole, type Papel } from "@/lib/api/require-role";
import { hojeSP } from "@/lib/clients/pausa";
import { periodoDoMes, validarVenda } from "@/lib/trafego/vendas";
import { apagarVenda, registrarVenda, vendasDaCarteira, vendasDoCliente } from "@/lib/trafego/vendas-server";

// /api/trafego/vendas — Leva 7A (N9). Vendas que o cliente fechou vindas dos anúncios × investimento.
//   GET  ?mes=AAAA-MM            → a carteira: vendas, custo por venda e retorno de cada cliente no mês
//   GET  ?clientId=&mes=AAAA-MM  → um cliente: as vendas lançadas e o resumo
//   POST { clientId, soldOn, quantity?, amount?, channel?, note? } → lança uma venda (time)
//   DELETE ?id=&clientId=        → apaga (fica registrado quando, não some do banco)
// Dinheiro do CLIENTE (investimento dele e o que ele vendeu) — nada da agência.

const LER: Papel[] = ["admin", "manager", "traffic", "social"];
const LANCAR: Papel[] = ["admin", "manager", "traffic", "social"];
const UUID = /^[0-9a-f-]{36}$/i;

export async function GET(req: NextRequest) {
  const gate = await requireRole(req, LER);
  if (gate instanceof NextResponse) return gate;
  const hoje = hojeSP();
  const mes = req.nextUrl.searchParams.get("mes") || hoje.slice(0, 7);
  const periodo = periodoDoMes(mes, hoje);
  if (!periodo) return NextResponse.json({ error: "Mês inválido." }, { status: 400 });
  const clientId = req.nextUrl.searchParams.get("clientId");
  try {
    if (clientId) {
      if (!UUID.test(clientId)) return NextResponse.json({ error: "Cliente inválido." }, { status: 400 });
      return NextResponse.json(await vendasDoCliente(clientId, periodo.desde, periodo.ate, hoje));
    }
    return NextResponse.json(await vendasDaCarteira(periodo.desde, periodo.ate, hoje));
  } catch (e) {
    console.error("[trafego/vendas]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Não consegui carregar as vendas agora." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireRole(req, LANCAR);
  if (gate instanceof NextResponse) return gate;
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const clientId = typeof body?.clientId === "string" ? body.clientId : "";
  if (!UUID.test(clientId)) return NextResponse.json({ error: "Escolha o cliente." }, { status: 400 });
  const v = validarVenda(body, hojeSP());
  if (!v.ok) return NextResponse.json({ error: v.erro }, { status: 400 });
  const r = await registrarVenda(clientId, v.venda, "interno", gate.user.email || null);
  if (!r.ok) return NextResponse.json({ error: r.erro }, { status: r.indisponivel ? 503 : 500 });
  return NextResponse.json({ ok: true, id: r.id });
}

export async function DELETE(req: NextRequest) {
  const gate = await requireRole(req, LANCAR);
  if (gate instanceof NextResponse) return gate;
  const id = req.nextUrl.searchParams.get("id") || "";
  const clientId = req.nextUrl.searchParams.get("clientId");
  if (!UUID.test(id)) return NextResponse.json({ error: "Venda inválida." }, { status: 400 });
  const ok = await apagarVenda(id, clientId && UUID.test(clientId) ? clientId : null, false);
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Não encontrei essa venda." }, { status: 404 });
}
