// app/api/ficha/[token]/growth/route.ts — o CLIENTE lança o faturamento/vendas do mês pelo link.
// Valida token + PIN (1ª palavra do nome) e grava em client_financial_results marcando a origem
// como "cliente (link)". Preserva investment/roi já existentes na linha (não sobrescreve dado do
// time). Ticket é coluna gerada no banco.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { checkAccessCode } from "@/lib/fichaViva/pin";

const RATE = new Map<string, { count: number; reset: number }>();
function limited(token: string): boolean {
  const now = Date.now();
  const e = RATE.get(token);
  if (!e || e.reset < now) { RATE.set(token, { count: 1, reset: now + 60_000 }); return false; }
  if (e.count >= 20) return true;
  e.count++; return false;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (limited(token)) return NextResponse.json({ error: "Muitas tentativas. Aguarde 1 minuto." }, { status: 429 });

  const { data: client } = await supabaseAdmin
    .from("clients")
    .select("id, name, nome_fantasia, ficha_viva_enabled, ficha_viva_token_revoked_at")
    .eq("ficha_viva_token", token)
    .single();
  if (!client || !client.ficha_viva_enabled || client.ficha_viva_token_revoked_at) {
    return NextResponse.json({ error: "Link inválido ou expirado" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const nome = (client.nome_fantasia as string) || (client.name as string);
  if (!checkAccessCode(nome, String(body?.code ?? ""))) {
    return NextResponse.json({ error: "Código de acesso incorreto." }, { status: 401 });
  }

  // Valida entrada
  const month = String(body?.month ?? "");
  if (!/^\d{4}-\d{2}$/.test(month)) return NextResponse.json({ error: "Mês inválido." }, { status: 422 });
  const revenue = Number(body?.revenue);
  const vendasRaw = body?.vendas;
  const vendas = vendasRaw === "" || vendasRaw == null ? null : Number(vendasRaw);
  if (!Number.isFinite(revenue) || revenue < 0) return NextResponse.json({ error: "Faturamento inválido." }, { status: 422 });
  if (vendas != null && (!Number.isFinite(vendas) || vendas < 0)) return NextResponse.json({ error: "Vendas inválido." }, { status: 422 });

  // Preserva investment/roi/strategy_note já existentes na linha (dado do time)
  const { data: existing } = await supabaseAdmin
    .from("client_financial_results")
    .select("investment, roi, strategy_note")
    .eq("client_id", client.id as string).eq("month", month).maybeSingle();

  const { error } = await supabaseAdmin.from("client_financial_results").upsert({
    client_id: client.id, month,
    revenue, vendas,
    investment: existing?.investment ?? null,
    roi: existing?.roi ?? null,
    strategy_note: existing?.strategy_note ?? null,
    recorded_by: "cliente (link)",
  }, { onConflict: "client_id,month" });
  if (error) return NextResponse.json({ error: "Não foi possível salvar. Tente de novo." }, { status: 500 });

  return NextResponse.json({ success: true });
}
