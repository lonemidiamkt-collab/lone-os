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
import { calcularMetricas, janelaDoDia, hojeYmd } from "@/lib/prospeccao/relatorios";
import { funil, conversas, sla, temposEntreEstagios, distribuicao, aging, gargalos, filaDoDia, eficiencia, MACRO, type ProspectMin, type EventoMin, type MensagemMin } from "@/lib/prospeccao/metricas";
import { ROTULO_ESTAGIO } from "@/lib/prospeccao/maquina";
import { somarDias } from "@/lib/prospeccao/tempo";

// GET /api/prospeccao/dashboard — o cockpit diário do SDR: estado do agente, funil por macroestágio,
// conversas, SLA, velocity, gargalos, distribuição, aging, fila do dia, eficiência, quem precisa de você.
const COLS_MIN = "id, nome, estagio, owner, modo_agente, precisa_humano, primeira_abordagem_em, ultima_msg_de, ultima_interacao_em, next_action_at, next_action_type, score, classe, ranking_dia, ranking_pos, updated_at, reuniao_em";

export async function GET(req: NextRequest) {
  const gate = await requireRole(req, GESTAO);
  if (gate instanceof NextResponse) return gate;
  const agora = new Date();
  const [cfg, campanha, hoje, inst, google, sheet] = await Promise.all([
    carregarConfig(), campanhaAtual(), abordagensHoje(), checarInstanciaOutbound(), estadoGoogle(), planilhaId(),
  ]);
  const inicio = campanha?.iniciado_em ?? somarDias(agora, -30).toISOString();
  const [{ data: psRaw }, { data: evRaw }, { data: msRaw }] = await Promise.all([
    supabaseAdmin.from("prospects").select(COLS_MIN).limit(10000),
    supabaseAdmin.from("prospect_events").select("prospect_id, tipo, para, created_at").gte("created_at", inicio).limit(50000),
    supabaseAdmin.from("prospect_messages").select("prospect_id, direcao, autor, enviado, eh_primeira_abordagem, created_at").gte("created_at", inicio).limit(50000),
  ]);
  const ps = (psRaw ?? []) as ProspectMin[];
  const ev = (evRaw ?? []) as EventoMin[];
  const ms = (msRaw ?? []) as MensagemMin[];

  const f = funil(ps, ev, ms);
  const s = sla(ps, ms, cfg, campanha, agora);
  const tempos = temposEntreEstagios(ps, ev, ms);
  const dia = hojeYmd();
  const { de, ate } = janelaDoDia(dia);
  const mHoje = await calcularMetricas(de, ate);
  const { data: custo } = await supabaseAdmin.from("llm_calls").select("custo_usd").like("origem", "prospeccao%").gte("created_at", inicio);
  const custoTotal = (custo ?? []).reduce((acc, r) => acc + Number((r as { custo_usd: number | null }).custo_usd ?? 0), 0);

  const { data: precisa } = await supabaseAdmin.from("prospects").select("id, nome, cidade, estagio, motivo_humano, updated_at, score, classe, reuniao_em, reuniao_tipo")
    .eq("precisa_humano", true).order("updated_at", { ascending: false }).limit(30);
  const { data: recentes } = await supabaseAdmin.from("prospect_messages").select("id, prospect_id, direcao, autor, texto, created_at, intent")
    .order("created_at", { ascending: false }).limit(12);
  const nomeDe = new Map(ps.map((p) => [p.id, { nome: p.nome, estagio: p.estagio }]));
  const { data: reunioes } = await supabaseAdmin.from("prospects").select("id, nome, cidade, reuniao_em, reuniao_tipo, meet_url, decisor_nome, estagio")
    .not("reuniao_em", "is", null).gte("reuniao_em", somarDias(agora, -1).toISOString()).order("reuniao_em", { ascending: true }).limit(10);
  const { data: filaLista } = await supabaseAdmin.from("prospects").select("id, nome, cidade, segmento, score, classe, ranking_pos, decisor_nome, estagio")
    .eq("ranking_dia", dia).order("ranking_pos", { ascending: true }).limit(20);

  const teto = { usado: hoje, limite: campanha?.limite_dia ?? 10 };
  const fila = filaDoDia(ps, campanha, teto, cfg.ligado, agora);
  // Sem `ids` no payload do funil/aging (podem ser milhares): a lista é buscada por filtro na aba Prospects.
  const funilSemIds = f.map(({ ids, ...x }) => ({ ...x, tem: ids.length > 0 }));
  const agingSemIds = aging(ps, ev, agora).map(({ ids, ...x }) => ({ ...x, tem: ids.length > 0 }));

  return NextResponse.json({
    ok: true,
    agente: {
      ligado: cfg.ligado, rodando: pilotoRodando(campanha, agora), campanha, dia_piloto: diaDoPiloto(campanha, agora), teto,
      pode_abordar: podeAbordarAgora({ cfg, campanha, abordagensHoje: hoje, agora }), pode_responder: podeResponderAgora({ cfg, campanha, agora }),
      whatsapp: inst, google: { ...google, planilha: sheet ? urlDaPlanilha(sheet) : null }, handoff_numero: cfg.handoff_numero,
      custo_usd: Math.round(custoTotal * 10000) / 10000, custo_hoje_usd: mHoje.custo_usd, proximo_envio: fila.proximo_envio_texto,
    },
    hoje: { abordagens: hoje, respostas: mHoje.respostas, reunioes: mHoje.reunioes_online + mHoje.visitas, reunioes_online: mHoje.reunioes_online, visitas: mHoje.visitas, followups: mHoje.followups },
    funil: funilSemIds,
    conversas: conversas(ps, ms, agora),
    sla: s,
    tempos,
    gargalos: gargalos(f, tempos, s, ps, ms, agora),
    distribuicao: distribuicao(ps).map((d) => ({ ...d, rotulo: ROTULO_ESTAGIO[d.estagio], macro_rotulo: MACRO.find((m) => m.chave === d.macro)?.rotulo ?? d.macro })),
    aging: agingSemIds,
    fila, fila_lista: filaLista ?? [],
    eficiencia: eficiencia(f, s, ps, ev, campanha, agora),
    precisa_humano: precisa ?? [],
    recentes: (recentes ?? []).map((m) => ({ ...m, prospect: nomeDe.get(m.prospect_id as string) ?? null })),
    reunioes: reunioes ?? [],
  });
}
