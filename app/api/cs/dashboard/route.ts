export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { isCronRequest } from "@/lib/api/cron-guard";
import { requireRole, GESTAO } from "@/lib/api/require-role";
import { isOpenAIConfigured } from "@/lib/ai/openai";
import { computeAutoavaliacao, type DemandaAval } from "@/lib/cs/autoavaliacao";
import { iaFora, type FalhaIa, type IaFora } from "@/lib/ia/saude-ia";
import { seloDaIa } from "@/lib/ia/selo-ia";

// GET /api/cs/dashboard — painel de controle do Agente Lone: acurácia, erros recorrentes,
// aprendizado (cs_client_rules), atividade recente e config.
// GESTÃO apenas (ou cron): devolve o RESUMO das demandas — inclusive reclamações nominais de
// clientes — e as regras aprendidas. Antes bastava estar logado: SDR e designer liam tudo.
//
// 25/10/2026 (auditoria de erro recuperável, 11.7): as cinco consultas ignoravam o erro e a rota
// respondia ok:true com "0 sugeridas" e "Nada aprendido ainda". Agora a seção que não leu vem null e o
// nome dela em `falhas` — a tela diz "não consegui ler". E o selo da IA olha as chamadas de verdade
// (llm_calls, o mesmo critério do vigia), não só se a chave existe.

type Resp<T> = { data: T[] | null; error: { message: string } | null };

/** Falhas de IA desde o último sucesso (7 dias). Mesma leitura do vigia (app/api/system/automacoes/vigia). */
async function saudeDaIa(agora: Date): Promise<{ ia: IaFora | null; lido: boolean }> {
  try {
    const semana = new Date(agora.getTime() - 7 * 86400_000).toISOString();
    const { data: ok, error: e1 } = await supabaseAdmin.from("llm_calls").select("created_at")
      .eq("ok", true).gte("created_at", semana).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (e1) return { ia: null, lido: false };
    const desde = (ok?.created_at as string | undefined) ?? semana;
    const { data: falhas, error } = await supabaseAdmin.from("llm_calls").select("origem, erro, created_at")
      .eq("ok", false).gt("created_at", desde).order("created_at", { ascending: true }).limit(5000);
    if (error) return { ia: null, lido: false };
    return { ia: iaFora((falhas ?? []) as FalhaIa[], agora), lido: true };
  } catch {
    return { ia: null, lido: false };
  }
}

export async function GET(req: NextRequest) {
  if (!isCronRequest(req)) {
    const gate = await requireRole(req, GESTAO);
    if (gate instanceof NextResponse) return gate;
  }

  const agora = new Date();
  const d30 = new Date(agora.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [demandasRes, pendentesRes, regrasRes, onbRes, rotRes, saudeIa] = await Promise.all([
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
    saudeDaIa(agora),
  ]);

  const falhas: string[] = [];
  const lido = <T,>(r: Resp<T>, rotulo: string): T[] | null => {
    if (r.error) { falhas.push(rotulo); console.error(`[cs/dashboard] ${rotulo}:`, r.error.message); return null; }
    return r.data ?? [];
  };

  const demandas = lido(demandasRes as unknown as Resp<DemandaAval & { resumo: string; created_at: string }>, "demandas dos últimos 30 dias");
  // Métricas excluem o cliente-teste pra refletir a realidade.
  const acuracia = demandas ? computeAutoavaliacao(demandas.filter((d) => !/\(teste\)/i.test(d.cliente_nome ?? ""))) : null;

  const regras = lido(regrasRes as unknown as Resp<Record<string, unknown>>, "o que o agente aprendeu");
  const aprendizado = regras?.map((r) => {
    const cli = r.clients as { name?: string; nome_fantasia?: string } | null;
    return {
      cliente: cli?.nome_fantasia || cli?.name || "—",
      texto: r.texto as string,
      escopo: r.escopo as string,
      origem: r.origem as string,
      created_at: r.created_at as string,
    };
  }) ?? null;

  const recentes = demandas?.slice(0, 15).map((d) => ({
    cliente: d.cliente_nome, tipo: d.tipo, status: d.status, resumo: d.resumo, created_at: d.created_at,
  })) ?? null;

  const pendentes = lido(pendentesRes as unknown as Resp<Record<string, unknown>>, "pedidos pendentes")?.map((p) => ({
    id: p.id as string,
    cliente: p.cliente_nome as string,
    tipo: p.tipo as string,
    urgencia: p.urgencia as string,
    resumo: p.resumo as string,
    responsavel: (p.responsavel as string) || null,
    created_at: p.created_at as string,
  })) ?? null;

  const pilot = (process.env.CS_PILOT_GROUP_JIDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const ia = seloDaIa({ chaveConfigurada: isOpenAIConfigured(), ia: saudeIa.ia, registroLido: saudeIa.lido });
  const config = {
    // Compatível com quem lia o boolean: "ok" só quando a IA está de fato respondendo.
    iaOk: ia.estado === "ok",
    ia,
    grupoInterno: !!process.env.CS_INTERNAL_GROUP_JID,
    gruposMonitorados: pilot.length,
    modoTeste: pilot.length > 0, // isPilot → cards marcados [TESTE]
  };

  return NextResponse.json({
    ok: true,
    falhas,
    config,
    acuracia,
    aprendizado,
    pendentes,
    recentes,
    onboardings: lido(onbRes as unknown as Resp<Record<string, unknown>>, "onboardings"),
    roteiros: lido(rotRes as unknown as Resp<Record<string, unknown>>, "roteiros"),
  });
}
