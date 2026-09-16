export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole, GESTAO } from "@/lib/api/require-role";
import { supabaseAdmin } from "@/lib/supabase/server";
import { carregarConfig } from "@/lib/prospeccao/config";
import { campanhaAtual, pilotoRodando, diaDoPiloto } from "@/lib/prospeccao/piloto";
import { abordagensHoje, podeAbordarAgora, podeResponderAgora } from "@/lib/prospeccao/limites";
import { checarInstanciaOutbound } from "@/lib/prospeccao/envio";
import { estadoGoogle, planilhaId, urlDaPlanilha } from "@/lib/prospeccao/google";
import { contarPorEstagio } from "@/lib/prospeccao/db";
import { calcularMetricas, janelaDoDia, hojeYmd } from "@/lib/prospeccao/relatorios";
import { etapaPipeline, ROTULO_ESTAGIO } from "@/lib/prospeccao/maquina";
import type { Estagio } from "@/lib/prospeccao/tipos";
import { ymdSP, somarDias } from "@/lib/prospeccao/tempo";

// GET /api/prospeccao/dashboard — a Visão geral: estado do agente, teto do dia, KPIs, funil, quem precisa de você.
export async function GET(req: NextRequest) {
  const gate = await requireRole(req, GESTAO);
  if (gate instanceof NextResponse) return gate;
  const agora = new Date();
  const [cfg, campanha, hoje, inst, google, sheet, porEstagio] = await Promise.all([
    carregarConfig(), campanhaAtual(), abordagensHoje(), checarInstanciaOutbound(), estadoGoogle(), planilhaId(), contarPorEstagio(),
  ]);
  const dia = hojeYmd();
  const { de, ate } = janelaDoDia(dia);
  const de7 = somarDias(new Date(de), -6).toISOString();
  const [mHoje, m7, mTotal] = await Promise.all([
    calcularMetricas(de, ate),
    calcularMetricas(de7, ate),
    campanha?.iniciado_em ? calcularMetricas(campanha.iniciado_em, ate) : Promise.resolve(null),
  ]);
  const { data: precisa } = await supabaseAdmin.from("prospects").select("id, nome, cidade, estagio, motivo_humano, updated_at, score, classe, reuniao_em, reuniao_tipo")
    .eq("precisa_humano", true).order("updated_at", { ascending: false }).limit(20);
  const { data: fila } = await supabaseAdmin.from("prospects").select("id, nome, cidade, segmento, score, classe, ranking_pos, decisor_nome, estagio, quality_gate, primeira_abordagem_em")
    .in("estagio", ["fila_prospeccao", "abordado"]).eq("ranking_dia", ymdSP(agora)).order("ranking_pos", { ascending: true }).limit(20);
  const { data: recentes } = await supabaseAdmin.from("prospect_messages").select("id, prospect_id, direcao, autor, texto, created_at, intent")
    .order("created_at", { ascending: false }).limit(12);
  const ids = Array.from(new Set((recentes ?? []).map((m) => m.prospect_id as string)));
  const { data: nomes } = ids.length ? await supabaseAdmin.from("prospects").select("id, nome, estagio").in("id", ids) : { data: [] };
  const nomeDe = new Map((nomes ?? []).map((n) => [n.id as string, n]));
  const { data: reunioes } = await supabaseAdmin.from("prospects").select("id, nome, cidade, reuniao_em, reuniao_tipo, meet_url, decisor_nome, estagio")
    .not("reuniao_em", "is", null).gte("reuniao_em", somarDias(agora, -1).toISOString()).order("reuniao_em", { ascending: true }).limit(10);
  const { data: custo } = await supabaseAdmin.from("llm_calls").select("custo_usd").like("origem", "prospeccao%").gte("created_at", campanha?.iniciado_em ?? de7);
  const custoTotal = (custo ?? []).reduce((s, r) => s + Number((r as { custo_usd: number | null }).custo_usd ?? 0), 0);

  const funil = (Object.keys(ROTULO_ESTAGIO) as Estagio[]).map((e) => ({ estagio: e, rotulo: ROTULO_ESTAGIO[e], etapa: etapaPipeline(e), n: porEstagio[e] ?? 0 })).filter((f) => f.n > 0);
  return NextResponse.json({
    ok: true,
    agente: {
      ligado: cfg.ligado, rodando: pilotoRodando(campanha, agora), campanha, dia_piloto: diaDoPiloto(campanha, agora),
      teto: { usado: hoje, limite: campanha?.limite_dia ?? 10 },
      pode_abordar: podeAbordarAgora({ cfg, campanha, abordagensHoje: hoje, agora }),
      pode_responder: podeResponderAgora({ cfg, campanha, agora }),
      whatsapp: inst, google: { ...google, planilha: sheet ? urlDaPlanilha(sheet) : null }, handoff_numero: cfg.handoff_numero,
      custo_usd: Math.round(custoTotal * 10000) / 10000,
    },
    metricas: { hoje: mHoje, semana: m7, piloto: mTotal },
    funil, por_estagio: porEstagio,
    precisa_humano: precisa ?? [],
    fila_do_dia: fila ?? [],
    recentes: (recentes ?? []).map((m) => ({ ...m, prospect: nomeDe.get(m.prospect_id as string) ?? null })),
    reunioes: reunioes ?? [],
  });
}
