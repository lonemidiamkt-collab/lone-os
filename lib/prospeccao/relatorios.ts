// lib/prospeccao/relatorios.ts — os números do piloto (§34), o relatório diário (V2 §24) e o
// relatório final dos 30 dias (V2 §25). Tudo contado a partir de prospect_events /
// prospect_messages / llm_calls — nada é "lembrado", é recontado.

import { supabaseAdmin } from "@/lib/supabase/server";
import type { CampanhaRow, ProspectRow } from "./tipos";
import { componentesSP, dataSP, dataCurtaSP, ymdSP } from "./tempo";
import { cruzamentos, type Cruzamentos } from "./aprendizado";
import { rotuloClasse } from "./score";
import { nomeProprio } from "./normalizar";

export interface Metricas {
  encontrados: number; icp_aprovados: number; abordados: number; respostas: number; decisores: number; interessados: number;
  reunioes_online: number; visitas: number; realizadas: number; no_shows: number; propostas: number; vendas: number;
  followups: number; opt_outs: number; sem_interesse: number; custo_usd: number; tempo_medio_resposta_min: number | null;
  melhor_lead: { id: string; nome: string; score: number | null } | null;
  conversao: { prospect_resposta: string; resposta_decisor: string; decisor_interesse: string; interesse_reuniao: string; prospect_reuniao: string; reuniao_proposta: string; proposta_venda: string };
}

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");

export async function calcularMetricas(deIso: string, ateIso: string): Promise<Metricas> {
  const [{ data: ev }, { data: ms }, { data: ps }, { data: llm }] = await Promise.all([
    supabaseAdmin.from("prospect_events").select("prospect_id, tipo, para, motivo, created_at").gte("created_at", deIso).lt("created_at", ateIso).limit(50000),
    supabaseAdmin.from("prospect_messages").select("prospect_id, direcao, autor, enviado, eh_primeira_abordagem, created_at").gte("created_at", deIso).lt("created_at", ateIso).limit(50000),
    supabaseAdmin.from("prospects").select("id, nome, score, reuniao_tipo, created_at, primeira_abordagem_em").limit(10000),
    supabaseAdmin.from("llm_calls").select("custo_usd").like("origem", "prospeccao%").gte("created_at", deIso).lt("created_at", ateIso).limit(50000),
  ]);
  const eventos = (ev ?? []) as { prospect_id: string; tipo: string; para: string | null; motivo: string | null; created_at: string }[];
  const msgs = (ms ?? []) as { prospect_id: string; direcao: string; autor: string; enviado: boolean; eh_primeira_abordagem: boolean; created_at: string }[];
  const prospects = (ps ?? []) as Pick<ProspectRow, "id" | "nome" | "score" | "reuniao_tipo" | "created_at" | "primeira_abordagem_em">[];
  const porId = new Map(prospects.map((p) => [p.id, p]));

  const para = (e: string) => new Set(eventos.filter((x) => x.tipo === "transicao" && x.para === e).map((x) => x.prospect_id));
  const abordadosIds = new Set(msgs.filter((m) => m.eh_primeira_abordagem && m.enviado).map((m) => m.prospect_id));
  const respostasIds = new Set(msgs.filter((m) => m.direcao === "in").map((m) => m.prospect_id));
  const decisoresIds = para("decisor_contatado");
  const interesseIds = para("interesse");
  const reuniaoIds = para("reuniao_agendada");
  const reunioes_online = Array.from(reuniaoIds).filter((id) => porId.get(id)?.reuniao_tipo === "online").length;
  const visitas = Array.from(reuniaoIds).filter((id) => porId.get(id)?.reuniao_tipo === "visita").length;
  const realizadas = para("reuniao_realizada").size, no_shows = para("no_show").size, propostas = para("proposta").size, vendas = para("cliente").size;
  const perdidos = eventos.filter((x) => x.tipo === "transicao" && x.para === "perdido");
  const custo = (llm ?? []).reduce((s, r) => s + Number((r as { custo_usd: number | null }).custo_usd ?? 0), 0);

  // Tempo até a resposta: cada mensagem recebida vs a última enviada antes dela, por prospect.
  const tempos: number[] = [];
  const ordenadas = [...msgs].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const ultimaSaida = new Map<string, number>();
  for (const m of ordenadas) {
    if (m.direcao === "out") ultimaSaida.set(m.prospect_id, new Date(m.created_at).getTime());
    else { const t = ultimaSaida.get(m.prospect_id); if (t) { tempos.push((new Date(m.created_at).getTime() - t) / 60_000); ultimaSaida.delete(m.prospect_id); } }
  }
  const melhor = Array.from(abordadosIds).map((id) => porId.get(id)).filter(Boolean).sort((a, b) => (b!.score ?? 0) - (a!.score ?? 0))[0];

  const abordados = abordadosIds.size, respostas = respostasIds.size, decisores = decisoresIds.size, interessados = interesseIds.size, reunioes = reunioes_online + visitas;
  return {
    encontrados: prospects.filter((p) => p.created_at >= deIso && p.created_at < ateIso).length,
    icp_aprovados: para("icp_aprovado").size, abordados, respostas, decisores, interessados, reunioes_online, visitas, realizadas, no_shows, propostas, vendas,
    followups: para("followup").size, opt_outs: para("nao_perturbe").size, sem_interesse: perdidos.filter((x) => /interess/i.test(x.motivo ?? "")).length,
    custo_usd: Math.round(custo * 10000) / 10000,
    tempo_medio_resposta_min: tempos.length ? Math.round(tempos.reduce((a, b) => a + b, 0) / tempos.length) : null,
    melhor_lead: melhor ? { id: melhor.id, nome: melhor.nome, score: melhor.score } : null,
    conversao: {
      prospect_resposta: pct(respostas, abordados), resposta_decisor: pct(decisores, respostas), decisor_interesse: pct(interessados, decisores),
      interesse_reuniao: pct(reunioes, interessados), prospect_reuniao: pct(reunioes, abordados), reuniao_proposta: pct(propostas, realizadas), proposta_venda: pct(vendas, propostas),
    },
  };
}

/** Janela [00:00, 24:00) de um dia SP. */
export function janelaDoDia(ymd: string): { de: string; ate: string } {
  const [a, m, d] = ymd.split("-").map(Number);
  return { de: dataSP(a, m, d, 0, 0).toISOString(), ate: dataSP(a, m, d + 1, 0, 0).toISOString() };
}

export async function gravarMetricasDoDia(ymd: string, campanha: CampanhaRow | null): Promise<Metricas> {
  const { de, ate } = janelaDoDia(ymd);
  const m = await calcularMetricas(de, ate);
  const { error } = await supabaseAdmin.from("prospect_daily_metrics").upsert({
    dia: ymd, campanha_id: campanha?.id ?? null,
    encontrados: m.encontrados, icp_aprovados: m.icp_aprovados, abordados: m.abordados, respostas: m.respostas, decisores: m.decisores,
    interessados: m.interessados, reunioes_online: m.reunioes_online, visitas: m.visitas, realizadas: m.realizadas, no_shows: m.no_shows,
    propostas: m.propostas, vendas: m.vendas, followups: m.followups, opt_outs: m.opt_outs, sem_interesse: m.sem_interesse,
    custo_usd: m.custo_usd, tempo_medio_resposta_min: m.tempo_medio_resposta_min, melhor_lead: m.melhor_lead, detalhe: { conversao: m.conversao },
  }, { onConflict: "dia,campanha_id" });
  if (error) console.error("[prospeccao/relatorios] não gravei métricas:", error.message);
  return m;
}

const brl = (usd: number, cambio = 5.6) => `R$ ${(usd * cambio).toFixed(2).replace(".", ",")}`;

export async function textoRelatorioDiario(ymd: string, m: Metricas): Promise<string> {
  const { de, ate } = janelaDoDia(ymd);
  const { data } = await supabaseAdmin.from("prospect_events").select("prospect_id").eq("tipo", "transicao").eq("para", "reuniao_agendada").gte("created_at", de).lt("created_at", ate);
  const ids = Array.from(new Set((data ?? []).map((r) => (r as { prospect_id: string }).prospect_id)));
  const { data: ps } = ids.length ? await supabaseAdmin.from("prospects").select("nome").in("id", ids) : { data: [] };
  const reunioesNomes = ((ps ?? []) as { nome: string }[]).map((p) => p.nome);
  const reunioes = m.reunioes_online + m.visitas;
  const [a, mm, d] = ymd.split("-");
  return [
    `RELATÓRIO SDR — ${d}/${mm}/${a}`,
    "",
    `Novos prospects: ${m.abordados}`,
    `Respostas: ${m.respostas}`,
    `Contato com decisor: ${m.decisores}`,
    `Interessados: ${m.interessados}`,
    `Reuniões: ${m.reunioes_online}`,
    `Visitas: ${m.visitas}`,
    `Follow-ups: ${m.followups}`,
    `Sem interesse: ${m.sem_interesse}`,
    `Opt-out: ${m.opt_outs}`,
    `Empresas encontradas hoje: ${m.encontrados} · ICP aprovados: ${m.icp_aprovados}`,
    m.tempo_medio_resposta_min !== null ? `Tempo médio até a resposta: ${m.tempo_medio_resposta_min} min` : null,
    "",
    `Melhor lead: ${m.melhor_lead ? `${m.melhor_lead.nome} — ${m.melhor_lead.score ?? "?"}/100` : "—"}`,
    `Reuniões geradas: ${reunioesNomes.length ? reunioesNomes.join(", ") : "nenhuma"}`,
    "",
    `Custo IA hoje: ${brl(m.custo_usd)} (US$ ${m.custo_usd.toFixed(3)})`,
    `Custo por reunião: ${reunioes ? brl(m.custo_usd / reunioes) : "—"}`,
  ].filter((l) => l !== null).join("\n");
}

export interface RelatorioFinal {
  campanha: { nome: string; inicio: string | null; fim: string | null; dias_executados: number };
  totais: Metricas;
  pesquisados: number; qualificados: number; abordados: number;
  custo_total_usd: number; custo_por_reuniao_usd: number | null; custo_por_cliente_usd: number | null;
  receita_brl: number | null;
  cruzamentos: Cruzamentos;
  gerado_em: string;
}

export async function gerarRelatorioFinal(c: CampanhaRow, agora = new Date()): Promise<RelatorioFinal> {
  const de = c.iniciado_em ?? c.created_at;
  const ate = agora.toISOString();
  const totais = await calcularMetricas(de, ate);
  const { count: pesquisados } = await supabaseAdmin.from("prospects").select("id", { count: "exact", head: true }).gte("created_at", de);
  const { count: qualificados } = await supabaseAdmin.from("prospects").select("id", { count: "exact", head: true }).gte("created_at", de).in("classe", ["A", "B"]);
  const reunioes = totais.reunioes_online + totais.visitas;
  const dias = Math.max(1, Math.round((agora.getTime() - new Date(de).getTime()) / 86_400_000));
  // Receita: valor dos leads do CRM ganhos que vieram da prospecção (se o Roberto preencheu).
  const { data: ganhos } = await supabaseAdmin.from("crm_leads").select("valor_orcamento").eq("estagio", "ganho").not("prospect_id", "is", null);
  const receita = (ganhos ?? []).reduce((s, r) => s + Number((r as { valor_orcamento: number | null }).valor_orcamento ?? 0), 0);
  return {
    campanha: { nome: c.nome, inicio: c.iniciado_em, fim: c.termina_em, dias_executados: dias },
    totais, pesquisados: pesquisados ?? 0, qualificados: qualificados ?? 0, abordados: totais.abordados,
    custo_total_usd: totais.custo_usd,
    custo_por_reuniao_usd: reunioes ? Math.round((totais.custo_usd / reunioes) * 100) / 100 : null,
    custo_por_cliente_usd: totais.vendas ? Math.round((totais.custo_usd / totais.vendas) * 100) / 100 : null,
    receita_brl: receita || null,
    cruzamentos: await cruzamentos(de, ate),
    gerado_em: agora.toISOString(),
  };
}

export function textoRelatorioFinal(r: RelatorioFinal): string {
  const t = r.totais;
  const linha = (rot: string, v: string | number | null) => `${rot}: ${v ?? "—"}`;
  const topo = (lista: { chave: string; abordados: number; reunioes: number; taxa: string }[]) => lista.slice(0, 3).map((x) => `${x.chave} (${x.reunioes}/${x.abordados} → ${x.taxa})`).join(" · ") || "—";
  return [
    `RELATÓRIO DO PILOTO SDR LONE — ${r.campanha.nome}`,
    `${r.campanha.inicio ? dataCurtaSP(r.campanha.inicio) : "?"} → ${r.campanha.fim ? dataCurtaSP(r.campanha.fim) : "?"} (${r.campanha.dias_executados} dias)`,
    "",
    linha("Prospects pesquisados", r.pesquisados), linha("Qualificados (A/B)", r.qualificados), linha("Empresas abordadas", r.abordados),
    linha("Respostas", t.respostas), linha("Taxa de resposta", t.conversao.prospect_resposta), linha("Decisores alcançados", t.decisores),
    linha("Interessados", t.interessados), linha("Reuniões online", t.reunioes_online), linha("Visitas", t.visitas), linha("Realizadas", t.realizadas),
    linha("No-show", t.no_shows), linha("Propostas", t.propostas), linha("Clientes", t.vendas), linha("Receita (CRM)", r.receita_brl !== null ? `R$ ${r.receita_brl.toLocaleString("pt-BR")}` : "—"),
    linha("Custo do agente", `${brl(r.custo_total_usd)} (US$ ${r.custo_total_usd.toFixed(2)})`),
    linha("Custo por reunião", r.custo_por_reuniao_usd !== null ? brl(r.custo_por_reuniao_usd) : "—"),
    linha("Custo por cliente", r.custo_por_cliente_usd !== null ? brl(r.custo_por_cliente_usd) : "—"),
    "",
    "Conversão: " + Object.entries(t.conversao).map(([k, v]) => `${k.replace(/_/g, "→")} ${v}`).join(" · "),
    "",
    `Melhor segmento: ${topo(r.cruzamentos.segmento)}`,
    `Melhor cidade: ${topo(r.cruzamentos.cidade)}`,
    `Melhor faixa de score: ${topo(r.cruzamentos.faixa_score)}`,
    `Melhor CNAE: ${topo(r.cruzamentos.cnae)}`,
    `Melhor abordagem: ${topo(r.cruzamentos.abordagem)}`,
    `Melhor dia: ${topo(r.cruzamentos.dia_semana)} · Melhor horário: ${topo(r.cruzamentos.hora)}`,
    `Distância × conversão: ${topo(r.cruzamentos.distancia)}`,
    `Presencial × online: ${r.cruzamentos.modalidade.map((x) => `${x.chave} ${x.reunioes} marcadas, ${x.realizadas} realizadas`).join(" · ") || "—"}`,
    `Score × venda: ${r.cruzamentos.faixa_score.map((x) => `${x.chave}: ${x.vendas} venda${x.vendas === 1 ? "" : "s"}`).join(" · ") || "—"}`,
    `Objeções mais comuns: ${r.cruzamentos.objecoes.map((o) => `${o.chave} (${o.n})`).join(", ") || "—"}`,
  ].join("\n");
}

export const hojeYmd = () => ymdSP();
export const ontemYmd = () => { const c = componentesSP(new Date()); return ymdSP(dataSP(c.ano, c.mes, c.dia - 1, 12)); };
export { rotuloClasse, nomeProprio };
