// lib/prospeccao/metricas.ts — o cockpit diário do SDR (Roberto, 16/09): funil por macroestágio
// com conversão sobre o anterior, conversas (quem deve a próxima mensagem), SLA de resposta com
// semáforo, tempo entre estágios, gargalos calculados, distribuição do pipeline, aging e a
// eficiência do agente (autonomia). Tudo puro: recebe linhas, devolve números — o teste cobre.
//
// "Alcançou" ≠ "está": o funil conta quem PASSOU por um estágio (eventos), a distribuição conta
// onde cada lead ESTÁ agora. Os dois respondem perguntas diferentes.

import type { Estagio, ProspectRow, CampanhaRow } from "./tipos";
import type { ProspectConfig } from "./config";
import { dentroDaJanela, proximaAberturaDaJanela, componentesSP, dataSP, isoSP, ymdSP, ehDiaUtil, somarDias, type Janela } from "./tempo";

export interface EventoMin { prospect_id: string; tipo: string; para: string | null; created_at: string }
export interface MensagemMin { prospect_id: string; direcao: "in" | "out"; autor: string; enviado: boolean; eh_primeira_abordagem: boolean; created_at: string }
export type ProspectMin = Pick<ProspectRow, "id" | "nome" | "estagio" | "owner" | "modo_agente" | "precisa_humano" | "primeira_abordagem_em" | "ultima_msg_de" | "ultima_interacao_em" | "next_action_at" | "next_action_type" | "score" | "classe" | "ranking_dia" | "ranking_pos" | "updated_at" | "reuniao_em">;

// ─── Macroestágios ────────────────────────────────────────────────────────────

export const MACRO: { chave: string; rotulo: string; estagios: Estagio[] }[] = [
  { chave: "descoberta", rotulo: "Descoberta", estagios: ["descoberto", "enriquecido", "icp_aprovado"] },
  { chave: "prospeccao", rotulo: "Prospecção", estagios: ["fila_prospeccao", "abordado", "aguardando_resposta", "followup"] },
  { chave: "contato", rotulo: "Contato", estagios: ["atendente", "decisor_identificado", "decisor_contatado"] },
  { chave: "oportunidade", rotulo: "Oportunidade", estagios: ["interesse", "horario_proposto", "aguardando_confirmacao"] },
  { chave: "reuniao", rotulo: "Reunião", estagios: ["reuniao_agendada", "handoff", "reuniao_realizada", "no_show"] },
  { chave: "comercial", rotulo: "Comercial", estagios: ["proposta", "cliente"] },
  { chave: "nutricao", rotulo: "Nutrição", estagios: ["momento_ruim", "nutricao_30d", "nutricao_90d"] },
  { chave: "encerrados", rotulo: "Encerrados", estagios: ["sem_interesse", "nao_perturbe", "perdido", "fora_icp"] },
];
export const macroDe = (e: Estagio) => MACRO.find((m) => m.estagios.includes(e))?.chave ?? "outro";

/** Estágios onde existe (ou existiu) uma conversa em andamento com o agente. */
const EM_CONVERSA: Estagio[] = ["abordado", "aguardando_resposta", "followup", "atendente", "decisor_identificado", "decisor_contatado", "interesse", "horario_proposto", "aguardando_confirmacao", "momento_ruim", "nutricao_30d", "nutricao_90d", "no_show"];
const ATIVOS_NO_PIPELINE: Estagio[] = [...EM_CONVERSA, "reuniao_agendada", "handoff", "reuniao_realizada", "proposta"];

// ─── Funil (alcançou) ─────────────────────────────────────────────────────────

/** Passos do funil, em ordem. `estagios` = quem passou por QUALQUER um deles conta. */
export const PASSOS_FUNIL: { chave: string; rotulo: string; estagios: Estagio[] }[] = [
  { chave: "encontrados", rotulo: "Encontrados", estagios: [] },
  { chave: "icp_aprovado", rotulo: "ICP aprovado", estagios: ["icp_aprovado", "fila_prospeccao"] },
  { chave: "abordados", rotulo: "Abordados", estagios: ["abordado"] },
  { chave: "responderam", rotulo: "Responderam", estagios: [] },
  { chave: "decisor_identificado", rotulo: "Decisor identificado", estagios: ["decisor_identificado"] },
  { chave: "decisor_contatado", rotulo: "Decisor contatado", estagios: ["decisor_contatado"] },
  { chave: "interessados", rotulo: "Interessados", estagios: ["interesse", "horario_proposto", "aguardando_confirmacao"] },
  { chave: "reuniao_marcada", rotulo: "Reunião marcada", estagios: ["reuniao_agendada", "handoff"] },
  { chave: "reuniao_realizada", rotulo: "Reunião realizada", estagios: ["reuniao_realizada"] },
  { chave: "proposta", rotulo: "Proposta", estagios: ["proposta"] },
  { chave: "cliente", rotulo: "Cliente", estagios: ["cliente"] },
];

export interface PassoFunil { chave: string; rotulo: string; n: number; pct_anterior: number | null; ids: string[] }

/** Conjunto de prospects que alcançaram cada passo (quem chegou num passo posterior também conta nos anteriores). */
export function alcancouPorPasso(ps: ProspectMin[], eventos: EventoMin[], msgs: MensagemMin[]): Map<string, Set<string>> {
  const porEstagio = new Map<string, Set<string>>();
  for (const e of eventos) {
    if (e.tipo !== "transicao" || !e.para) continue;
    if (!porEstagio.has(e.para)) porEstagio.set(e.para, new Set());
    porEstagio.get(e.para)!.add(e.prospect_id);
  }
  for (const p of ps) { // o estágio atual também conta (evento pode ter sido inserido à mão)
    if (!porEstagio.has(p.estagio)) porEstagio.set(p.estagio, new Set());
    porEstagio.get(p.estagio)!.add(p.id);
  }
  const responderam = new Set(msgs.filter((m) => m.direcao === "in").map((m) => m.prospect_id));
  const abordados = new Set(ps.filter((p) => p.primeira_abordagem_em).map((p) => p.id));
  const proprio = new Map<string, Set<string>>();
  for (const passo of PASSOS_FUNIL) {
    const s = new Set<string>();
    if (passo.chave === "encontrados") ps.forEach((p) => s.add(p.id));
    else if (passo.chave === "responderam") responderam.forEach((id) => s.add(id));
    else if (passo.chave === "abordados") abordados.forEach((id) => s.add(id));
    for (const e of passo.estagios) porEstagio.get(e)?.forEach((id) => s.add(id));
    proprio.set(passo.chave, s);
  }
  // Cumulativo de trás para frente: quem chegou em "cliente" alcançou tudo antes.
  const out = new Map<string, Set<string>>();
  let acumulado = new Set<string>();
  for (let i = PASSOS_FUNIL.length - 1; i >= 0; i--) {
    const chave = PASSOS_FUNIL[i].chave;
    acumulado = new Set([...acumulado, ...(proprio.get(chave) ?? [])]);
    out.set(chave, new Set(acumulado));
  }
  return out;
}

export function funil(ps: ProspectMin[], eventos: EventoMin[], msgs: MensagemMin[]): PassoFunil[] {
  const alc = alcancouPorPasso(ps, eventos, msgs);
  let anterior: number | null = null;
  return PASSOS_FUNIL.map((passo) => {
    const ids = Array.from(alc.get(passo.chave) ?? []);
    const n = ids.length;
    const pct = anterior === null ? null : anterior > 0 ? Math.round((n / anterior) * 1000) / 10 : null;
    anterior = n;
    return { chave: passo.chave, rotulo: passo.rotulo, n, pct_anterior: pct, ids };
  });
}

// ─── Conversas ────────────────────────────────────────────────────────────────

export interface Conversas {
  abordagens: number; responderam: number; nao_responderam: number; taxa_resposta: number | null;
  responderam_hoje: number; abertas: number; aguardando_lone: number; aguardando_prospect: number;
  ids_aguardando_lone: string[]; ids_aguardando_prospect: string[]; ids_sem_resposta: string[];
}

export function conversas(ps: ProspectMin[], msgs: MensagemMin[], agora = new Date()): Conversas {
  const hoje = ymdSP(agora);
  const responderam = new Set(msgs.filter((m) => m.direcao === "in").map((m) => m.prospect_id));
  const hojeIds = new Set(msgs.filter((m) => m.direcao === "in" && ymdSP(new Date(m.created_at)) === hoje).map((m) => m.prospect_id));
  const abordados = ps.filter((p) => p.primeira_abordagem_em);
  const abertas = ps.filter((p) => EM_CONVERSA.includes(p.estagio) && responderam.has(p.id));
  const aguardandoLone = abertas.filter((p) => p.ultima_msg_de === "prospect");
  const aguardandoProspect = abertas.filter((p) => p.ultima_msg_de !== "prospect");
  const semResposta = abordados.filter((p) => !responderam.has(p.id) && EM_CONVERSA.includes(p.estagio));
  return {
    abordagens: abordados.length, responderam: abordados.filter((p) => responderam.has(p.id)).length,
    nao_responderam: abordados.filter((p) => !responderam.has(p.id)).length,
    taxa_resposta: abordados.length ? Math.round((abordados.filter((p) => responderam.has(p.id)).length / abordados.length) * 1000) / 10 : null,
    responderam_hoje: hojeIds.size, abertas: abertas.length, aguardando_lone: aguardandoLone.length, aguardando_prospect: aguardandoProspect.length,
    ids_aguardando_lone: aguardandoLone.map((p) => p.id), ids_aguardando_prospect: aguardandoProspect.map((p) => p.id), ids_sem_resposta: semResposta.map((p) => p.id),
  };
}

// ─── SLA de resposta ──────────────────────────────────────────────────────────

export interface Sla {
  meta_min: number; media_s: number | null; mediana_s: number | null; pct_dentro: number | null; fora: number; maior_s: number | null;
  amostra: number; aguardando_agora: number; maior_espera_agora_s: number | null; ids_aguardando: string[]; ids_fora_agora: string[];
  semaforo: "verde" | "amarelo" | "vermelho" | "sem_dados";
}

/** Início da contagem: a mensagem chegou fora do horário → conta a partir da abertura da janela. */
export function inicioDaEspera(chegou: Date, janela: Janela): Date {
  return dentroDaJanela(janela, chegou) ? chegou : proximaAberturaDaJanela(janela, chegou);
}

/** Pares (recebida → próxima enviada do mesmo prospect). */
export function esperasDeResposta(msgs: MensagemMin[], janela: Janela): number[] {
  const porProspect = new Map<string, MensagemMin[]>();
  for (const m of msgs) { if (!porProspect.has(m.prospect_id)) porProspect.set(m.prospect_id, []); porProspect.get(m.prospect_id)!.push(m); }
  const esperas: number[] = [];
  for (const lista of porProspect.values()) {
    lista.sort((a, b) => a.created_at.localeCompare(b.created_at));
    let pendente: Date | null = null;
    for (const m of lista) {
      if (m.direcao === "in") { if (!pendente) pendente = inicioDaEspera(new Date(m.created_at), janela); }
      else if (pendente && m.enviado) { esperas.push(Math.max(0, (new Date(m.created_at).getTime() - pendente.getTime()) / 1000)); pendente = null; }
    }
  }
  return esperas;
}

export function sla(ps: ProspectMin[], msgs: MensagemMin[], cfg: ProspectConfig, campanha: CampanhaRow | null, agora = new Date()): Sla {
  const janela = campanha?.janela_resposta ?? { ini: "09:00", fim: "18:00" };
  const meta = cfg.sla_resposta_min * 60;
  const esperas = esperasDeResposta(msgs, janela);
  const ordenadas = [...esperas].sort((a, b) => a - b);
  const dentro = esperas.filter((e) => e <= meta).length;
  // Esperando resposta do agente AGORA: conversa aberta, última fala do prospect, agente ativo.
  const responderam = new Set(msgs.filter((m) => m.direcao === "in").map((m) => m.prospect_id));
  const aguardando = ps.filter((p) => EM_CONVERSA.includes(p.estagio) && responderam.has(p.id) && p.ultima_msg_de === "prospect" && p.modo_agente === "ativo" && p.owner === "SDR_AI");
  const esperasAgora = aguardando.map((p) => {
    const ultimaIn = msgs.filter((m) => m.prospect_id === p.id && m.direcao === "in").sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    const inicio = ultimaIn ? inicioDaEspera(new Date(ultimaIn.created_at), janela) : new Date(p.ultima_interacao_em ?? agora);
    return { id: p.id, s: Math.max(0, (agora.getTime() - inicio.getTime()) / 1000) };
  });
  const pct = esperas.length ? Math.round((dentro / esperas.length) * 1000) / 10 : null;
  return {
    meta_min: cfg.sla_resposta_min,
    media_s: esperas.length ? Math.round(esperas.reduce((a, b) => a + b, 0) / esperas.length) : null,
    mediana_s: ordenadas.length ? Math.round(ordenadas[Math.floor(ordenadas.length / 2)]) : null,
    pct_dentro: pct, fora: esperas.length - dentro, maior_s: ordenadas.length ? Math.round(ordenadas[ordenadas.length - 1]) : null,
    amostra: esperas.length, aguardando_agora: aguardando.length,
    maior_espera_agora_s: esperasAgora.length ? Math.round(Math.max(...esperasAgora.map((e) => e.s))) : null,
    ids_aguardando: aguardando.map((p) => p.id), ids_fora_agora: esperasAgora.filter((e) => e.s > meta).map((e) => e.id),
    semaforo: pct === null ? "sem_dados" : pct >= 95 ? "verde" : pct >= 85 ? "amarelo" : "vermelho",
  };
}

// ─── Tempo entre estágios (velocity) ──────────────────────────────────────────

export interface Transicao { chave: string; rotulo: string; media_s: number | null; n: number }

export function temposEntreEstagios(ps: ProspectMin[], eventos: EventoMin[], msgs: MensagemMin[]): Transicao[] {
  const primeira = (filtro: (e: EventoMin) => boolean) => {
    const m = new Map<string, number>();
    for (const e of eventos) if (filtro(e)) { const t = new Date(e.created_at).getTime(); const atual = m.get(e.prospect_id); if (atual === undefined || t < atual) m.set(e.prospect_id, t); }
    return m;
  };
  const abordado = new Map<string, number>();
  for (const p of ps) if (p.primeira_abordagem_em) abordado.set(p.id, new Date(p.primeira_abordagem_em).getTime());
  const resposta = new Map<string, number>();
  for (const m of msgs) if (m.direcao === "in") { const t = new Date(m.created_at).getTime(); const a = resposta.get(m.prospect_id); if (a === undefined || t < a) resposta.set(m.prospect_id, t); }
  const decisor = primeira((e) => e.tipo === "transicao" && e.para === "decisor_contatado");
  const interesse = primeira((e) => e.tipo === "transicao" && ["interesse", "horario_proposto", "aguardando_confirmacao"].includes(e.para ?? ""));
  const reuniao = primeira((e) => e.tipo === "transicao" && e.para === "reuniao_agendada");
  const media = (de: Map<string, number>, ate: Map<string, number>) => {
    const ds: number[] = [];
    for (const [id, t0] of de) { const t1 = ate.get(id); if (t1 !== undefined && t1 >= t0) ds.push((t1 - t0) / 1000); }
    return { media_s: ds.length ? Math.round(ds.reduce((a, b) => a + b, 0) / ds.length) : null, n: ds.length };
  };
  return [
    { chave: "abordagem_resposta", rotulo: "Abordagem → resposta", ...media(abordado, resposta) },
    { chave: "resposta_decisor", rotulo: "Resposta → decisor", ...media(resposta, decisor) },
    { chave: "decisor_interesse", rotulo: "Decisor → interesse", ...media(decisor, interesse) },
    { chave: "interesse_reuniao", rotulo: "Interesse → reunião", ...media(interesse, reuniao) },
    { chave: "abordagem_reuniao", rotulo: "Abordagem → reunião", ...media(abordado, reuniao) },
  ];
}

// ─── Distribuição e aging ─────────────────────────────────────────────────────

export function distribuicao(ps: ProspectMin[]): { estagio: Estagio; macro: string; n: number }[] {
  const contagem = new Map<Estagio, number>();
  for (const p of ps) if (ATIVOS_NO_PIPELINE.includes(p.estagio)) contagem.set(p.estagio, (contagem.get(p.estagio) ?? 0) + 1);
  return ATIVOS_NO_PIPELINE.filter((e) => contagem.get(e)).map((e) => ({ estagio: e, macro: macroDe(e), n: contagem.get(e)! }));
}

export const FAIXAS_AGING: { chave: string; rotulo: string; min: number; max: number | null }[] = [
  { chave: "ate_24h", rotulo: "< 24h", min: 0, max: 1 }, { chave: "1_3d", rotulo: "1–3 dias", min: 1, max: 3 }, { chave: "4_7d", rotulo: "4–7 dias", min: 3, max: 7 },
  { chave: "8_15d", rotulo: "8–15 dias", min: 7, max: 15 }, { chave: "15d_mais", rotulo: "+15 dias", min: 15, max: null },
];

/** Dias no estágio atual = agora − última transição (fallback updated_at). Só leads ativos no pipeline. */
export function diasNoEstagio(ps: ProspectMin[], eventos: EventoMin[], agora = new Date()): Map<string, number> {
  const ultimaTransicao = new Map<string, number>();
  for (const e of eventos) if (e.tipo === "transicao") { const t = new Date(e.created_at).getTime(); if ((ultimaTransicao.get(e.prospect_id) ?? 0) < t) ultimaTransicao.set(e.prospect_id, t); }
  const out = new Map<string, number>();
  for (const p of ps) {
    if (!ATIVOS_NO_PIPELINE.includes(p.estagio)) continue;
    const t = ultimaTransicao.get(p.id) ?? new Date(p.updated_at).getTime();
    out.set(p.id, (agora.getTime() - t) / 86_400_000);
  }
  return out;
}

export function aging(ps: ProspectMin[], eventos: EventoMin[], agora = new Date()): { chave: string; rotulo: string; n: number; ids: string[] }[] {
  const dias = diasNoEstagio(ps, eventos, agora);
  return FAIXAS_AGING.map((f) => {
    const ids = Array.from(dias.entries()).filter(([, d]) => d >= f.min && (f.max === null || d < f.max)).map(([id]) => id);
    return { chave: f.chave, rotulo: f.rotulo, n: ids.length, ids };
  });
}

// ─── Gargalos ─────────────────────────────────────────────────────────────────

export interface Gargalo { tipo: "perda" | "demora" | "atencao" | "positivo" | "info"; texto: string; ids?: string[] }

export function gargalos(f: PassoFunil[], tempos: Transicao[], s: Sla, ps: ProspectMin[], msgs: MensagemMin[], agora = new Date()): Gargalo[] {
  const out: Gargalo[] = [];
  const abordados = f.find((x) => x.chave === "abordados")?.n ?? 0;
  if (abordados < 5) {
    out.push({ tipo: "info", texto: `Ainda cedo: ${abordados} empresa${abordados === 1 ? "" : "s"} abordada${abordados === 1 ? "" : "s"}. Gargalos aparecem a partir de ~20.` });
  } else {
    const passos = f.slice(2, 8).filter((x, i, arr) => i > 0 && (arr[i - 1].n >= 5));
    const pior = [...passos].sort((a, b) => (a.pct_anterior ?? 100) - (b.pct_anterior ?? 100))[0];
    if (pior && pior.pct_anterior !== null) {
      const anterior = f[f.findIndex((x) => x.chave === pior.chave) - 1];
      out.push({ tipo: "perda", texto: `Maior perda: ${Math.round(100 - pior.pct_anterior)}% dos ${anterior.rotulo.toLowerCase()} não viraram ${pior.rotulo.toLowerCase()}.` });
    }
    const maisLenta = [...tempos].filter((t) => t.n >= 3 && t.media_s !== null && t.chave !== "abordagem_reuniao").sort((a, b) => (b.media_s ?? 0) - (a.media_s ?? 0))[0];
    if (maisLenta) out.push({ tipo: "demora", texto: `Maior demora: ${formatarDuracao(maisLenta.media_s!)} em ${maisLenta.rotulo.toLowerCase()}.` });
    const melhor = [...passos].sort((a, b) => (b.pct_anterior ?? 0) - (a.pct_anterior ?? 0))[0];
    if (melhor && melhor.pct_anterior !== null && melhor.pct_anterior >= 50 && melhor.chave !== pior?.chave) {
      const anterior = f[f.findIndex((x) => x.chave === melhor.chave) - 1];
      out.push({ tipo: "positivo", texto: `Positivo: ${melhor.pct_anterior}% dos ${anterior.rotulo.toLowerCase()} viram ${melhor.rotulo.toLowerCase()}.` });
    }
  }
  const responderam = new Set(msgs.filter((m) => m.direcao === "in").map((m) => m.prospect_id));
  const parados = ps.filter((p) => ["followup", "aguardando_resposta", "abordado"].includes(p.estagio) && !responderam.has(p.id) && p.primeira_abordagem_em && (agora.getTime() - new Date(p.primeira_abordagem_em).getTime()) > 5 * 86_400_000);
  if (parados.length) out.push({ tipo: "atencao", texto: `${parados.length} prospect${parados.length === 1 ? "" : "s"} em follow-up há mais de 5 dias sem resposta.`, ids: parados.map((p) => p.id) });
  if (s.ids_fora_agora.length) out.push({ tipo: "atencao", texto: `${s.ids_fora_agora.length} conversa${s.ids_fora_agora.length === 1 ? "" : "s"} esperando o agente há mais de ${s.meta_min} min.`, ids: s.ids_fora_agora });
  const atrasadas = ps.filter((p) => p.owner === "SDR_AI" && p.modo_agente === "ativo" && ATIVOS_NO_PIPELINE.includes(p.estagio) && p.next_action_at && new Date(p.next_action_at).getTime() < agora.getTime() - 86_400_000);
  if (atrasadas.length) out.push({ tipo: "atencao", texto: `${atrasadas.length} ação${atrasadas.length === 1 ? "" : "ões"} do agente atrasada${atrasadas.length === 1 ? "" : "s"} há mais de 1 dia — cron parado?`, ids: atrasadas.map((p) => p.id) });
  return out.slice(0, 5);
}

// ─── Fila do dia ──────────────────────────────────────────────────────────────

export interface FilaKpi {
  selecionados: number; abordados: number; aguardando: number; score_medio: number | null; classe_a: number; classe_b: number;
  melhor: { id: string; nome: string; score: number | null } | null; proximo_envio: string | null; proximo_envio_texto: string;
}

export function filaDoDia(ps: ProspectMin[], campanha: CampanhaRow | null, teto: { usado: number; limite: number }, ligado: boolean, agora = new Date()): FilaKpi {
  const hoje = ymdSP(agora);
  const fila = ps.filter((p) => p.ranking_dia === hoje);
  const aguardando = fila.filter((p) => p.estagio === "fila_prospeccao");
  const abordados = fila.filter((p) => p.primeira_abordagem_em && ymdSP(new Date(p.primeira_abordagem_em)) === hoje);
  const scores = fila.map((p) => p.score).filter((s): s is number => typeof s === "number");
  const melhor = [...fila].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
  const janela = campanha?.janela_abordagem ?? { ini: "09:00", fim: "11:00" };
  let proximo: Date | null = null, texto = "—";
  if (!ligado || !campanha || campanha.status !== "running") texto = "agente parado";
  else if (teto.usado >= teto.limite) texto = "teto do dia atingido";
  else if (!aguardando.length) texto = ehDiaUtil(agora) && componentesSP(agora).hora < 8 ? "fila é montada às 08:35" : "fila vazia";
  else if (dentroDaJanela(janela, agora)) {
    const c = componentesSP(agora);
    const min = Math.ceil((c.minuto + 1) / 5) * 5;
    proximo = dataSP(c.ano, c.mes, c.dia, c.hora + Math.floor(min / 60), min % 60);
    texto = `hoje às ${componentesSP(proximo).hora.toString().padStart(2, "0")}:${componentesSP(proximo).minuto.toString().padStart(2, "0")}`;
  } else {
    proximo = proximaAberturaDaJanela(janela, agora);
    const c = componentesSP(proximo);
    texto = `${c.ymd === hoje ? "hoje" : c.ymd === ymdSP(somarDias(agora, 1)) ? "amanhã" : `${String(c.dia).padStart(2, "0")}/${String(c.mes).padStart(2, "0")}`} às ${janela.ini}`;
  }
  return {
    selecionados: fila.length, abordados: abordados.length, aguardando: aguardando.length,
    score_medio: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
    classe_a: fila.filter((p) => p.classe === "A").length, classe_b: fila.filter((p) => p.classe === "B").length,
    melhor: melhor ? { id: melhor.id, nome: melhor.nome, score: melhor.score } : null,
    proximo_envio: proximo ? isoSP(proximo) : null, proximo_envio_texto: texto,
  };
}

// ─── Eficiência do agente ─────────────────────────────────────────────────────

export interface Eficiencia {
  abordagens_por_dia: number | null; taxa_resposta: number | null; taxa_decisor: number | null; taxa_interesse: number | null; taxa_reuniao: number | null;
  sla_pct: number | null; acoes_no_prazo: number | null; erros_operacionais: number; handoffs_humanos: number; autonomia: number | null; conversas: number;
}

export function eficiencia(f: PassoFunil[], s: Sla, ps: ProspectMin[], eventos: EventoMin[], campanha: CampanhaRow | null, agora = new Date()): Eficiencia {
  const n = (k: string) => f.find((x) => x.chave === k)?.n ?? 0;
  const abordados = n("abordados");
  const pct = (a: number) => (abordados ? Math.round((a / abordados) * 1000) / 10 : null);
  let diasUteis = 0;
  if (campanha?.iniciado_em) {
    let d = new Date(campanha.iniciado_em);
    while (d.getTime() <= agora.getTime()) { if (ehDiaUtil(d)) diasUteis++; d = somarDias(d, 1); }
  }
  const ativosComAcao = ps.filter((p) => p.owner === "SDR_AI" && p.modo_agente === "ativo" && ATIVOS_NO_PIPELINE.includes(p.estagio) && p.next_action_at);
  const atrasadas = ativosComAcao.filter((p) => new Date(p.next_action_at!).getTime() < agora.getTime() - 86_400_000).length;
  const comResposta = n("responderam");
  const humanos = new Set(eventos.filter((e) => e.tipo === "precisa_humano" || e.tipo === "humano_assumiu" || e.tipo === "humano_enviou").map((e) => e.prospect_id));
  const humanosEmConversa = ps.filter((p) => humanos.has(p.id) && (p.primeira_abordagem_em)).length;
  return {
    abordagens_por_dia: diasUteis ? Math.round((abordados / diasUteis) * 10) / 10 : null,
    taxa_resposta: pct(comResposta), taxa_decisor: pct(n("decisor_contatado")), taxa_interesse: pct(n("interessados")), taxa_reuniao: pct(n("reuniao_marcada")),
    sla_pct: s.pct_dentro,
    acoes_no_prazo: ativosComAcao.length ? Math.round(((ativosComAcao.length - atrasadas) / ativosComAcao.length) * 1000) / 10 : null,
    erros_operacionais: eventos.filter((e) => e.tipo === "envio_falhou").length,
    handoffs_humanos: humanosEmConversa,
    autonomia: comResposta ? Math.round(((comResposta - Math.min(comResposta, humanosEmConversa)) / comResposta) * 1000) / 10 : null,
    conversas: comResposta,
  };
}

// ─── Utilidades ───────────────────────────────────────────────────────────────

export function formatarDuracao(s: number | null | undefined): string {
  if (s === null || s === undefined) return "—";
  if (s < 60) return `${Math.round(s)}s`;
  if (s < 3600) { const m = Math.floor(s / 60); const r = Math.round(s % 60); return r ? `${m}m ${r}s` : `${m} min`; }
  if (s < 86_400) { const h = Math.floor(s / 3600); const m = Math.round((s % 3600) / 60); return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`; }
  const d = s / 86_400;
  return d < 10 ? `${(Math.round(d * 10) / 10).toString().replace(".", ",")} dias` : `${Math.round(d)} dias`;
}
