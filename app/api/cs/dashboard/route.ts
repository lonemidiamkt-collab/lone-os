export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireCronOrUser } from "@/lib/api/cron-guard";
import { isOpenAIConfigured } from "@/lib/ai/openai";
import { computeAutoavaliacao, type DemandaAval } from "@/lib/cs/autoavaliacao";

// GET /api/cs/dashboard — painel de controle do Agente Lone: acurácia, erros recorrentes,
// aprendizado (cs_client_rules), atividade recente e config. Auth: usuário logado (ou cron).
export async function GET(req: NextRequest) {
  const denied = await requireCronOrUser(req);
  if (denied) return denied;

  const d30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [demandasRes, pendentesRes, regrasRes, onbRes, rotRes] = await Promise.all([
    supabaseAdmin.from("cs_demandas")
      .select("tipo, status, cliente_nome, resumo, created_at")
      .gte("created_at", d30).order("created_at", { ascending: false }),
    // Pendentes acionáveis (precisam do ok/não da equipe) — cabeça do painel, dá pra decidir na tela.
    supabaseAdmin.from("cs_demandas")
      .select("id, cliente_nome, tipo, urgencia, resumo, responsavel, created_at")
      .eq("status", "pendente").order("created_at", { ascending: false }).limit(50),
    supabaseAdmin.from("cs_client_rules")
      .select("texto, escopo, origem, created_at, clients(name, nome_fantasia)")
      .eq("ativo", true).order("created_at", { ascending: false }).limit(120),
    supabaseAdmin.from("cs_onboarding_sessions")
      .select("cliente_nome, status, created_at").order("created_at", { ascending: false }).limit(8),
    supabaseAdmin.from("cs_roteiro_pedidos")
      .select("cliente_nome, scorecard, created_at").order("created_at", { ascending: false }).limit(8),
  ]);

  const demandas = (demandasRes.data ?? []) as Array<DemandaAval & { resumo: string; created_at: string }>;
  // Métricas excluem o cliente-teste pra refletir a realidade.
  const reais = demandas.filter((d) => !/\(teste\)/i.test(d.cliente_nome ?? ""));
  const acuracia = computeAutoavaliacao(reais);

  const aprendizado = (regrasRes.data ?? []).map((r) => {
    const cli = r.clients as { name?: string; nome_fantasia?: string } | null;
    return {
      cliente: cli?.nome_fantasia || cli?.name || "—",
      texto: r.texto as string,
      escopo: r.escopo as string,
      origem: r.origem as string,
      created_at: r.created_at as string,
    };
  });

  const recentes = demandas.slice(0, 15).map((d) => ({
    cliente: d.cliente_nome, tipo: d.tipo, status: d.status, resumo: d.resumo, created_at: d.created_at,
  }));

  const pendentes = (pendentesRes.data ?? []).map((p) => ({
    id: p.id as string,
    cliente: p.cliente_nome as string,
    tipo: p.tipo as string,
    urgencia: p.urgencia as string,
    resumo: p.resumo as string,
    responsavel: (p.responsavel as string) || null,
    created_at: p.created_at as string,
  }));

  const pilot = (process.env.CS_PILOT_GROUP_JIDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const config = {
    iaOk: isOpenAIConfigured(),
    grupoInterno: !!process.env.CS_INTERNAL_GROUP_JID,
    gruposMonitorados: pilot.length,
    modoTeste: pilot.length > 0, // isPilot → cards marcados [TESTE]
  };

  return NextResponse.json({
    ok: true,
    config,
    acuracia,
    aprendizado,
    pendentes,
    recentes,
    onboardings: (onbRes.data ?? []),
    roteiros: (rotRes.data ?? []),
  });
}
