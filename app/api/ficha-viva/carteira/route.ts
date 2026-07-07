// app/api/ficha-viva/carteira/route.ts — Carteira / Radar de receita: a saúde de crescimento de
// TODOS os clientes ativos numa fila só (verde = upsell, vermelho = reter). Admin apenas.
// Cruza o histórico de faturamento (client_financial_results) por cliente via computeGrowth.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { computeGrowth, type GrowthRow } from "@/lib/fichaViva/growth";

interface CarteiraItem {
  clientId: string;
  nome: string;
  nicho: string | null;
  score: number;
  level: "up" | "ok" | "risk" | "unknown";
  situacao: string;
  acao: string;
  faturamentoMes: number | null;
  meses: number;
}

function scoreFromPct(pct: number | null): number {
  if (pct === null) return 50;
  return Math.round(Math.min(96, Math.max(28, 66 + (pct / 100) * 140)));
}

export async function GET(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "Acesso restrito" }, { status: 403 });

  // Clientes ativos (não ex-cliente, não em onboarding)
  const { data: clients, error } = await supabaseAdmin
    .from("clients")
    .select("id, name, nome_fantasia, industry")
    .neq("active", false)
    .neq("status", "onboarding")
    .order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ids = (clients ?? []).map((c) => c.id as string);
  const byClient = new Map<string, GrowthRow[]>();
  if (ids.length) {
    const { data: fin } = await supabaseAdmin
      .from("client_financial_results")
      .select("client_id, month, revenue, vendas, ticket")
      .in("client_id", ids)
      .order("month");
    (fin ?? []).forEach((r) => {
      const cid = r.client_id as string;
      const arr = byClient.get(cid) ?? [];
      arr.push({
        month: r.month as string,
        revenue: Number(r.revenue) || 0,
        vendas: r.vendas != null ? Number(r.vendas) : null,
        ticket: r.ticket != null ? Number(r.ticket) : null,
      });
      byClient.set(cid, arr);
    });
  }

  const items: CarteiraItem[] = (clients ?? []).map((c) => {
    const g = computeGrowth(byClient.get(c.id as string) ?? []);
    const level: CarteiraItem["level"] = g.level === "down" ? "risk" : g.level === "up" ? "up" : g.level === "flat" ? "ok" : "unknown";
    const score = scoreFromPct(g.pct);
    const situacao = level === "up" ? "Pronto p/ upsell" : level === "risk" ? "Em risco" : level === "ok" ? "Saudável" : "Sem dados";
    const acao =
      level === "up" ? "Faturamento acelerando — propor aumento de contrato/pacote." :
      level === "risk" ? "Queda recente — agendar reunião de retenção." :
      level === "ok" ? "Estável — manter cadência e buscar alavanca de ticket." :
      "Faltam dados de faturamento — lançar no Painel de Crescimento.";
    return {
      clientId: c.id as string,
      nome: (c.nome_fantasia as string) || (c.name as string),
      nicho: (c.industry as string) || null,
      score, level, situacao, acao,
      faturamentoMes: g.last ? g.last.faturamento : null,
      meses: g.mesesRegistrados,
    };
  });

  // Ordena: risco primeiro (menor score), depois upsell no topo? Regra: prioriza ação —
  // risco no topo (reter é urgente), depois upsell, depois estável, sem-dado por último.
  const rank = { risk: 0, up: 1, ok: 2, unknown: 3 };
  items.sort((a, b) => rank[a.level] - rank[b.level] || a.score - b.score);

  const resumo = {
    total: items.length,
    upsell: items.filter((i) => i.level === "up").length,
    risco: items.filter((i) => i.level === "risk").length,
    semDados: items.filter((i) => i.level === "unknown").length,
  };

  return NextResponse.json({ items, resumo });
}
