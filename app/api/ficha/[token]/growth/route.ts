// app/api/ficha/[token]/growth/route.ts — o CLIENTE lança o faturamento/vendas do mês pelo link.
// Valida token + PIN (1ª palavra do nome) e grava em client_financial_results marcando a origem
// como "cliente (link)". Preserva investment/roi já existentes na linha (não sobrescreve dado do
// time). Ticket é coluna gerada no banco.
//
// Limites (auditoria 23/09): só o mês atual ou o anterior (em São Paulo), e nunca por cima de uma
// linha lançada pela equipe — antes o link reescrevia qualquer mês, inclusive o que o time conferiu.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { checkAccessCode, ipTravado, pinTravado, registrarTentativaPin, mensagemTrava } from "@/lib/fichaViva/pin";
import { criarLimite, ipDe } from "@/lib/portal/limite";
import { mesesPermitidosCliente } from "@/lib/portal/mesesCliente";

const LIMITE = criarLimite(20, 60_000);
const ORIGEM_CLIENTE = "cliente (link)";

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ip = ipDe(req.headers);
  const esperaIp = ipTravado(ip);
  if (esperaIp) return NextResponse.json({ error: mensagemTrava(esperaIp) }, { status: 429 });
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
    return NextResponse.json({ error: "Link inválido" }, { status: 404 });
  }

  const { data: client } = await supabaseAdmin
    .from("clients")
    .select("id, name, nome_fantasia, ficha_viva_enabled, ficha_viva_token_revoked_at")
    .eq("ficha_viva_token", token)
    .maybeSingle();
  if (!client || !client.ficha_viva_enabled || client.ficha_viva_token_revoked_at) {
    return NextResponse.json({ error: "Link inválido ou expirado" }, { status: 404 });
  }
  if (LIMITE.estourou(token)) return NextResponse.json({ error: "Muitas tentativas. Aguarde 1 minuto." }, { status: 429 });

  const body = await req.json().catch(() => ({}));
  const nome = (client.nome_fantasia as string) || (client.name as string);
  const espera = pinTravado(token, ip);
  if (espera) return NextResponse.json({ error: mensagemTrava(espera) }, { status: 429 });
  const certo = checkAccessCode(nome, String(body?.code ?? ""));
  registrarTentativaPin(token, ip, certo);
  if (!certo) return NextResponse.json({ error: "Código de acesso incorreto." }, { status: 401 });

  // Valida entrada
  const month = String(body?.month ?? "");
  if (!/^\d{4}-\d{2}$/.test(month)) return NextResponse.json({ error: "Mês inválido." }, { status: 422 });
  if (!mesesPermitidosCliente().includes(month)) {
    return NextResponse.json({ error: "Pelo link dá pra lançar só o mês atual ou o anterior. Para outro mês, fale com a Lone." }, { status: 422 });
  }
  const revenue = Number(body?.revenue);
  const vendasRaw = body?.vendas;
  const vendas = vendasRaw === "" || vendasRaw == null ? null : Number(vendasRaw);
  if (!Number.isFinite(revenue) || revenue < 0) return NextResponse.json({ error: "Faturamento inválido." }, { status: 422 });
  if (vendas != null && (!Number.isFinite(vendas) || vendas < 0 || !Number.isInteger(vendas))) return NextResponse.json({ error: "Vendas inválido." }, { status: 422 });

  // Preserva investment/roi/strategy_note já existentes na linha (dado do time)
  const { data: existing, error: errExisting } = await supabaseAdmin
    .from("client_financial_results")
    .select("investment, roi, strategy_note, recorded_by, revenue, vendas")
    .eq("client_id", client.id as string).eq("month", month).maybeSingle();
  if (errExisting) return NextResponse.json({ error: "Não foi possível salvar. Tente de novo." }, { status: 503 });
  // Linha zerada da equipe (sobra do bug do grid interno que gravava 0 ao sair do campo) não é lançamento.
  const lancadoPelaEquipe = !!existing && existing.recorded_by !== ORIGEM_CLIENTE
    && (Number(existing.revenue) > 0 || existing.vendas != null);
  if (lancadoPelaEquipe) {
    return NextResponse.json({ error: "Esse mês já foi lançado pela equipe da Lone. Se algo estiver diferente, fale com a gente." }, { status: 409 });
  }

  const { error } = await supabaseAdmin.from("client_financial_results").upsert({
    client_id: client.id, month,
    revenue, vendas,
    investment: existing?.investment ?? null,
    roi: existing?.roi ?? null,
    strategy_note: existing?.strategy_note ?? null,
    recorded_by: ORIGEM_CLIENTE,
  }, { onConflict: "client_id,month" });
  if (error) return NextResponse.json({ error: "Não foi possível salvar. Tente de novo." }, { status: 500 });

  return NextResponse.json({ success: true });
}
