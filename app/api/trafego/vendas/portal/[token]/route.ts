export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { estaPausado, hojeSP } from "@/lib/clients/pausa";
import { periodoDoMes, validarVenda } from "@/lib/trafego/vendas";
import { apagarVenda, lancamentosDoPortalHoje, registrarVenda, vendasDoCliente } from "@/lib/trafego/vendas-server";

// /api/trafego/vendas/portal/[token] — Leva 7A (N9). O MESMO registro de vendas, pelo portal do
// cliente (link público, sem login). Mesma regra de acesso das rotas do portal: link revogado, portal
// desligado, ex-cliente e cliente pausado não entram. O cliente só vê as vendas dele e só apaga o que
// ele mesmo lançou. Componente pronto para o portal montar: components/trafego/vendas/VendasDoCliente.tsx.
//   GET ?mes=AAAA-MM · POST { soldOn, quantity?, amount?, channel?, note? } · DELETE ?id=

const MAX_LANCAMENTOS_DIA = 60;

async function clienteDoLink(token: string): Promise<string | null> {
  if (!token || token.length > 200) return null;
  const { data: c } = await supabaseAdmin.from("clients")
    .select("id, public_report_enabled, public_report_token_revoked_at, active, churned_at, paused_at, paused_until")
    .eq("public_report_token", token).maybeSingle();
  if (!c || !c.public_report_enabled || c.public_report_token_revoked_at || c.active === false || c.churned_at || estaPausado(c)) return null;
  return c.id as string;
}

type Ctx = { params: Promise<{ token: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  const clientId = await clienteDoLink((await params).token);
  if (!clientId) return NextResponse.json({ error: "Link inválido ou revogado" }, { status: 404 });
  const hoje = hojeSP();
  const periodo = periodoDoMes(req.nextUrl.searchParams.get("mes") || hoje.slice(0, 7), hoje);
  if (!periodo) return NextResponse.json({ error: "Mês inválido." }, { status: 400 });
  try {
    const r = await vendasDoCliente(clientId, periodo.desde, periodo.ate, hoje);
    // Para o cliente: sem quem lançou (e-mail do time) — só se foi ele ou a agência.
    return NextResponse.json({ ...r, vendas: r.vendas.map((v) => ({ ...v, created_by: null })) });
  } catch (e) {
    console.error("[trafego/vendas/portal]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Não consegui carregar as vendas agora." }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const clientId = await clienteDoLink((await params).token);
  if (!clientId) return NextResponse.json({ error: "Link inválido ou revogado" }, { status: 404 });
  const hoje = hojeSP();
  if ((await lancamentosDoPortalHoje(clientId, hoje)) >= MAX_LANCAMENTOS_DIA) {
    return NextResponse.json({ error: "Muitos lançamentos hoje. Fale com a gente pelo grupo." }, { status: 429 });
  }
  const v = validarVenda(await req.json().catch(() => null), hoje);
  if (!v.ok) return NextResponse.json({ error: v.erro }, { status: 400 });
  const r = await registrarVenda(clientId, v.venda, "portal", "portal");
  if (!r.ok) return NextResponse.json({ error: r.indisponivel ? "Registro de vendas ainda não disponível." : "Não consegui salvar agora." }, { status: r.indisponivel ? 503 : 500 });
  return NextResponse.json({ ok: true, id: r.id });
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const clientId = await clienteDoLink((await params).token);
  if (!clientId) return NextResponse.json({ error: "Link inválido ou revogado" }, { status: 404 });
  const id = req.nextUrl.searchParams.get("id") || "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Venda inválida." }, { status: 400 });
  const ok = await apagarVenda(id, clientId, true);
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Só dá para apagar a venda que você lançou." }, { status: 404 });
}
