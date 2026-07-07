// app/api/ficha/[token]/access/route.ts — portão do link do cliente. Recebe o PIN (1ª palavra
// do nome da loja), valida token + PIN no servidor e SÓ ENTÃO devolve os dados (crescimento +
// status do diagnóstico). Nada sensível é renderizado antes do PIN. Rate-limit por token.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { computeGrowth, type GrowthRow } from "@/lib/fichaViva/growth";
import { checkAccessCode } from "@/lib/fichaViva/pin";

const RATE = new Map<string, { count: number; reset: number }>();
function limited(token: string): boolean {
  const now = Date.now();
  const e = RATE.get(token);
  if (!e || e.reset < now) { RATE.set(token, { count: 1, reset: now + 60_000 }); return false; }
  if (e.count >= 10) return true; // até 10 tentativas/min por token
  e.count++; return false;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (limited(token)) return NextResponse.json({ error: "Muitas tentativas. Aguarde 1 minuto." }, { status: 429 });
  // Token é sempre UUID (crypto.randomUUID) — valida o formato antes do .or() (evita injeção de filtro)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
    return NextResponse.json({ error: "Link inválido" }, { status: 404 });
  }

  const { data: client } = await supabaseAdmin
    .from("clients")
    .select("id, name, nome_fantasia, whatsapp_team_phone, portal_welcome_message, ficha_viva_enabled, ficha_viva_token_revoked_at, ficha_viva_token, ficha_viva_raiox_token")
    .or(`ficha_viva_token.eq.${token},ficha_viva_raiox_token.eq.${token}`)
    .single();
  if (!client || !client.ficha_viva_enabled || client.ficha_viva_token_revoked_at) {
    return NextResponse.json({ error: "Link inválido ou expirado" }, { status: 404 });
  }

  // Escopo pelo token: link do vendedor (raiox) NÃO recebe financeiro E não exige PIN.
  const scope: "full" | "raiox" = client.ficha_viva_raiox_token === token ? "raiox" : "full";

  const body = await req.json().catch(() => ({}));
  const nome = (client.nome_fantasia as string) || (client.name as string);
  if (scope === "full" && !checkAccessCode(nome, String(body?.code ?? ""))) {
    return NextResponse.json({ error: "Código de acesso incorreto." }, { status: 401 });
  }

  const { count } = await supabaseAdmin
    .from("client_diagnostics")
    .select("id", { count: "exact", head: true })
    .eq("client_id", client.id as string);

  const base = {
    ok: true,
    scope,
    clientName: nome,
    whatsappPhone: (client.whatsapp_team_phone as string) || "5522981530700",
    welcomeMessage: (client.portal_welcome_message as string) || null,
    alreadyAnswered: (count ?? 0) > 0,
  };

  if (scope === "raiox") return NextResponse.json(base); // vendedor: sem crescimento/financeiro

  // Dono: crescimento (faturamento/vendas/ticket do negócio)
  const { data: fin } = await supabaseAdmin
    .from("client_financial_results")
    .select("month, revenue, vendas, ticket")
    .eq("client_id", client.id as string)
    .order("month");
  const rows: GrowthRow[] = (fin ?? []).map((r) => ({
    month: r.month as string,
    revenue: Number(r.revenue) || 0,
    vendas: r.vendas != null ? Number(r.vendas) : null,
    ticket: r.ticket != null ? Number(r.ticket) : null,
  }));

  return NextResponse.json({
    ...base,
    growth: computeGrowth(rows),
    series: rows.map((r) => ({ month: r.month, revenue: r.revenue, vendas: r.vendas, ticket: r.ticket })),
  });
}
