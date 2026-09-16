// lib/prospeccao/maquina.ts — a máquina de estados do prospect. ÚNICO lugar que muda `estagio`.
//
// Regras determinísticas antes da IA: o modelo lê a resposta e diz a intenção; quem decide para
// onde o prospect vai é esta tabela. Toda transição grava um evento (§27: data, evento, etapa
// anterior, etapa nova, mensagem, responsável, próxima ação) e deixa o prospect com uma próxima
// ação (§33: lead ativo sem próxima ação é erro — o teste cobre).

import type { Estagio, NextAction, Owner, ProspectRow } from "./tipos";
import { diaUtilAs, somarDias, proximaAberturaDaJanela, isoSP, componentesSP, dataSP } from "./tempo";

export const ESTAGIOS: Estagio[] = [
  "descoberto", "enriquecido", "icp_aprovado", "fila_prospeccao",
  "abordado", "aguardando_resposta", "followup",
  "atendente", "decisor_identificado", "decisor_contatado",
  "interesse", "horario_proposto", "aguardando_confirmacao",
  "reuniao_agendada", "handoff", "reuniao_realizada", "no_show", "proposta", "cliente",
  "momento_ruim", "nutricao_30d", "nutricao_90d",
  "sem_interesse", "nao_perturbe", "fora_icp", "perdido",
];

export const TERMINAIS = new Set<Estagio>(["cliente", "nao_perturbe", "fora_icp", "perdido"]);

/** Estágios em que a conversa já começou (uma resposta do prospect faz sentido). */
export const EM_CONVERSA = new Set<Estagio>([
  "abordado", "aguardando_resposta", "followup", "atendente", "decisor_identificado", "decisor_contatado",
  "interesse", "horario_proposto", "aguardando_confirmacao", "reuniao_agendada", "handoff",
  "reuniao_realizada", "no_show", "proposta", "momento_ruim", "nutricao_30d", "nutricao_90d", "sem_interesse",
]);

/** A partir daqui o dono é o Roberto e o agente só observa (§14 da V2). */
export const POS_REUNIAO = new Set<Estagio>(["reuniao_agendada", "handoff", "reuniao_realizada", "no_show", "proposta", "cliente"]);

// Para onde cada estágio pode ir. Os "saltos de governança" (nao_perturbe, perdido, fora_icp,
// sem_interesse, momento_ruim, atendimento humano) valem de qualquer estágio ativo — ver `podeIr`.
const TRANSICOES: Record<Estagio, Estagio[]> = {
  descoberto: ["enriquecido", "fora_icp"],
  enriquecido: ["icp_aprovado", "fora_icp", "enriquecido"],
  icp_aprovado: ["fila_prospeccao", "fora_icp", "enriquecido"],
  fila_prospeccao: ["abordado", "icp_aprovado"],
  abordado: ["aguardando_resposta", "atendente", "decisor_contatado", "decisor_identificado"],
  aguardando_resposta: ["followup", "atendente", "decisor_contatado", "decisor_identificado", "interesse"],
  followup: ["followup", "atendente", "decisor_contatado", "decisor_identificado", "interesse", "nutricao_30d"],
  atendente: ["decisor_identificado", "decisor_contatado", "followup", "nutricao_30d", "interesse"],
  decisor_identificado: ["decisor_contatado", "followup", "abordado"],
  decisor_contatado: ["interesse", "followup", "horario_proposto"],
  interesse: ["horario_proposto", "followup", "reuniao_agendada"],
  horario_proposto: ["aguardando_confirmacao", "reuniao_agendada", "interesse", "followup"],
  aguardando_confirmacao: ["reuniao_agendada", "horario_proposto", "interesse", "followup"],
  reuniao_agendada: ["handoff", "reuniao_realizada", "no_show", "horario_proposto"],
  handoff: ["reuniao_realizada", "no_show", "horario_proposto"],
  reuniao_realizada: ["proposta", "cliente", "nutricao_30d"],
  no_show: ["horario_proposto", "followup", "reuniao_agendada"],
  proposta: ["cliente", "nutricao_30d", "nutricao_90d"],
  cliente: [],
  momento_ruim: ["nutricao_30d", "nutricao_90d", "decisor_contatado", "interesse"],
  nutricao_30d: ["decisor_contatado", "interesse", "nutricao_90d", "abordado"],
  nutricao_90d: ["decisor_contatado", "interesse", "abordado"],
  sem_interesse: ["perdido", "nutricao_90d", "interesse"],
  nao_perturbe: [],
  fora_icp: ["enriquecido"],
  perdido: ["nutricao_90d"],
};

const SALTOS_DE_QUALQUER_ATIVO = new Set<Estagio>(["nao_perturbe", "perdido", "fora_icp", "sem_interesse", "momento_ruim"]);

// Dentro da conversa o prospect não segue a ordem: o primeiro "oi" pode ser "tenho interesse, pode
// ser quarta às 15h". Entre estes estágios o agente anda em qualquer direção; as portas que NÃO se
// pulam ficam antes (descoberto → … → fila → abordado) e depois (reunião → handoff → …).
const EM_CONVERSA_LIVRE = new Set<Estagio>([
  "abordado", "aguardando_resposta", "followup", "atendente", "decisor_identificado", "decisor_contatado",
  "interesse", "horario_proposto", "aguardando_confirmacao", "momento_ruim", "nutricao_30d", "nutricao_90d", "no_show",
]);
const DESTINOS_DA_CONVERSA = new Set<Estagio>([
  "atendente", "decisor_identificado", "decisor_contatado", "interesse", "horario_proposto", "aguardando_confirmacao", "reuniao_agendada", "followup",
]);

export function podeIr(de: Estagio, para: Estagio): boolean {
  if (de === para) return TRANSICOES[de]?.includes(para) ?? false;
  if (TERMINAIS.has(de)) return TRANSICOES[de]?.includes(para) ?? false;
  if (SALTOS_DE_QUALQUER_ATIVO.has(para)) return true;
  if (EM_CONVERSA_LIVRE.has(de) && DESTINOS_DA_CONVERSA.has(para)) return true;
  return TRANSICOES[de]?.includes(para) ?? false;
}

export const ehAtivo = (e: Estagio) => !TERMINAIS.has(e);

/** Etapa 01–17 do pipeline (§26) — a visão do CRM/planilha. */
export function etapaPipeline(e: Estagio): string {
  switch (e) {
    case "descoberto": return "01 — Mapeado";
    case "enriquecido": return "02 — Enriquecido";
    case "icp_aprovado": case "fila_prospeccao": return "03 — ICP aprovado";
    case "abordado": case "aguardando_resposta": return "04 — Primeira abordagem";
    case "atendente": return "05 — Contato com recepção";
    case "decisor_identificado": return "06 — Decisor identificado";
    case "decisor_contatado": return "07 — Conversando com decisor";
    case "followup": return "08 — Em follow-up";
    case "interesse": case "horario_proposto": case "aguardando_confirmacao": return "09 — Interesse identificado";
    case "reuniao_agendada": case "no_show": return "10 — Reunião/visita agendada";
    case "handoff": return "11 — Handoff Lone";
    case "reuniao_realizada": return "12 — Reunião realizada";
    case "proposta": return "13 — Proposta";
    case "cliente": return "14 — Cliente";
    case "momento_ruim": case "nutricao_30d": case "nutricao_90d": return "15 — Nutrição";
    case "sem_interesse": case "nao_perturbe": case "perdido": return "16 — Perdido";
    case "fora_icp": return "17 — Fora do ICP";
  }
}

export const ROTULO_ESTAGIO: Record<Estagio, string> = {
  descoberto: "Descoberto", enriquecido: "Enriquecido", icp_aprovado: "ICP aprovado", fila_prospeccao: "Fila do dia",
  abordado: "Abordado", aguardando_resposta: "Aguardando resposta", followup: "Em follow-up",
  atendente: "Falou com recepção", decisor_identificado: "Decisor identificado", decisor_contatado: "Conversando com decisor",
  interesse: "Interesse", horario_proposto: "Horário proposto", aguardando_confirmacao: "Aguardando confirmação",
  reuniao_agendada: "Reunião agendada", handoff: "Handoff Lone", reuniao_realizada: "Reunião realizada",
  no_show: "No-show", proposta: "Proposta", cliente: "Cliente",
  momento_ruim: "Momento ruim", nutricao_30d: "Nutrição 30d", nutricao_90d: "Nutrição 90d",
  sem_interesse: "Sem interesse", nao_perturbe: "Não perturbe", fora_icp: "Fora do ICP", perdido: "Perdido",
};

// Cadência §28: dia 0 abordagem, dia 2 follow-up 1, dia 5 follow-up 2, dia 12 último; depois nutrição.
export const CADENCIA_DIAS = [2, 3, 7];
export const HORA_FOLLOWUP = 9, MINUTO_FOLLOWUP = 30;

export interface ContextoAcao {
  agora?: Date;
  followups?: number;
  /** Data pedida pelo prospect ("me chama mês que vem") já resolvida — vence a cadência. */
  retornarEm?: Date | null;
  reuniaoEm?: Date | null;
  janelaAbordagem?: { ini: string; fim: string };
}

/** Próxima ação padrão de cada estágio. A regra de ouro (§33) é garantida aqui. */
export function proximaAcaoPadrao(estagio: Estagio, ctx: ContextoAcao = {}): NextAction | null {
  const agora = ctx.agora ?? new Date();
  const roberto: Owner = "ROBERTO", ia: Owner = "SDR_AI";
  const em = (d: Date) => isoSP(d);
  switch (estagio) {
    case "descoberto": return { type: "ENRIQUECER", at: em(agora), owner: ia, reason: "Empresa mapeada, falta pesquisar" };
    case "enriquecido": return { type: "PONTUAR", at: em(agora), owner: ia, reason: "Pesquisa concluída, calcular ICP" };
    case "icp_aprovado": return { type: "ENTRAR_NA_FILA", at: em(diaUtilAs(agora, componentesSP(agora).hora < 8 ? 0 : 1, 8, 35)), owner: ia, reason: "Aguarda o ranking diário" };
    case "fila_prospeccao": {
      const j = ctx.janelaAbordagem ?? { ini: "09:00", fim: "11:00" };
      return { type: "ABORDAR", at: em(proximaAberturaDaJanela(j, somarDias(agora, -1)) <= agora ? agora : proximaAberturaDaJanela(j, agora)), owner: ia, reason: "Na fila do dia" };
    }
    case "abordado":
    case "aguardando_resposta":
    case "decisor_contatado":
    case "atendente": {
      const n = ctx.followups ?? 0;
      const dias = CADENCIA_DIAS[Math.min(n, CADENCIA_DIAS.length - 1)];
      return { type: `FOLLOWUP_${n + 1}`, at: em(diaUtilAs(agora, dias, HORA_FOLLOWUP, MINUTO_FOLLOWUP)), owner: ia, reason: "Sem resposta: cadência 2/5/12 dias" };
    }
    case "followup": {
      const n = ctx.followups ?? 1;
      if (n >= CADENCIA_DIAS.length) return { type: "NUTRIR", at: em(agora), owner: ia, reason: "Cadência esgotada, mover para nutrição" };
      const dias = CADENCIA_DIAS[Math.min(n, CADENCIA_DIAS.length - 1)];
      return { type: `FOLLOWUP_${n + 1}`, at: em(diaUtilAs(agora, dias, HORA_FOLLOWUP, MINUTO_FOLLOWUP)), owner: ia, reason: "Sem resposta: cadência 2/5/12 dias" };
    }
    case "decisor_identificado": return { type: "CONTATAR_DECISOR", at: em(agora), owner: ia, reason: "Falar direto com o decisor" };
    case "interesse": return { type: "OFERECER_HORARIOS", at: em(agora), owner: ia, reason: "Interesse identificado" };
    case "horario_proposto":
    case "aguardando_confirmacao": return { type: "COBRAR_CONFIRMACAO", at: em(diaUtilAs(agora, 1, 10)), owner: ia, reason: "Horário oferecido sem resposta" };
    case "reuniao_agendada": return { type: "HANDOFF", at: em(agora), owner: ia, reason: "Reunião confirmada: avisar a Lone" };
    case "handoff": {
      const r = ctx.reuniaoEm ?? somarDias(agora, 1);
      return { type: "LEMBRETE_24H", at: em(somarDias(r, -1)), owner: ia, reason: "Lembrar prospect e Lone na véspera" };
    }
    case "reuniao_realizada": return { type: "REGISTRAR_RESULTADO", at: em(diaUtilAs(agora, 1, 10)), owner: roberto, reason: "Roberto registra o resultado da reunião" };
    case "no_show": return { type: "REAGENDAR", at: em(diaUtilAs(agora, 1, 10)), owner: ia, reason: "Prospect não apareceu" };
    case "proposta": return { type: "FOLLOWUP_PROPOSTA", at: em(diaUtilAs(agora, 3, 10)), owner: roberto, reason: "Acompanhar proposta" };
    case "momento_ruim": {
      const r = ctx.retornarEm ?? somarDias(agora, 30);
      return { type: "RETOMAR", at: em(r), owner: ia, reason: "Prospect pediu contato depois" };
    }
    case "nutricao_30d": return { type: "RETOMAR", at: em(ctx.retornarEm ?? somarDias(agora, 30)), owner: ia, reason: "Nutrição: retomar com o contexto da última conversa" };
    case "nutricao_90d": return { type: "RETOMAR", at: em(ctx.retornarEm ?? somarDias(agora, 90)), owner: ia, reason: "Nutrição longa" };
    case "sem_interesse": return { type: "ENCERRAR", at: em(agora), owner: ia, reason: "Sem interesse declarado" };
    case "cliente": case "nao_perturbe": case "fora_icp": case "perdido": return null;
  }
}

/** Erro claro quando um lead ativo ficaria sem próxima ação. */
export function exigirProximaAcao(estagio: Estagio, acao: NextAction | null): asserts acao is NextAction {
  if (ehAtivo(estagio) && !acao) throw new Error(`regra de ouro: estágio ativo "${estagio}" sem próxima ação`);
}

/** Resolve "mês que vem", "em 45 dias", "depois da reforma", "semana que vem" em uma data (ou null). */
export function resolverQuando(texto: string | null | undefined, agora = new Date()): Date | null {
  if (!texto) return null;
  const t = texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const dias = /(\d{1,3})\s*dias?/.exec(t);
  if (dias) return somarDias(agora, Number(dias[1]));
  const semanas = /(\d{1,2})\s*semanas?/.exec(t);
  if (semanas) return somarDias(agora, Number(semanas[1]) * 7);
  const meses = /(\d{1,2})\s*mes(es)?/.exec(t);
  if (meses) return somarDias(agora, Number(meses[1]) * 30);
  if (/semana que vem|proxima semana/.test(t)) return somarDias(agora, 7);
  if (/mes que vem|proximo mes/.test(t)) return somarDias(agora, 30);
  if (/(depois|apos) (do|da|de) (reforma|inauguracao|mudanca|obra)/.test(t)) return somarDias(agora, 45);
  if (/fim do ano|final do ano|ano que vem|proximo ano/.test(t)) {
    const c = componentesSP(agora);
    return dataSP(c.mes >= 11 ? c.ano + 1 : c.ano, c.mes >= 11 ? 1 : 12, 5, 10);
  }
  if (/mais tarde|mais pra frente|depois/.test(t)) return somarDias(agora, 30);
  return null;
}

// ─── Persistência ────────────────────────────────────────────────────────────

export interface Transicao {
  para: Estagio;
  motivo: string;
  /** Texto da mensagem que causou a transição (para o log da §27). */
  mensagem?: string | null;
  responsavel?: string;
  /** Sobrescreve a próxima ação padrão (ex.: "retornar em 45 dias"). */
  proximaAcao?: NextAction | null;
  /** Campos extras do prospect a atualizar na mesma escrita. */
  patch?: Partial<ProspectRow> & Record<string, unknown>;
  detalhe?: Record<string, unknown>;
  ctx?: ContextoAcao;
}

/**
 * Aplica a transição, grava o evento e garante a próxima ação. Devolve a linha atualizada.
 * Lança quando a transição não existe na tabela — quem chama decide o que fazer (o inbound
 * marca `precisa_humano`; o cron registra e segue).
 */
export async function transicionar(p: ProspectRow, t: Transicao): Promise<ProspectRow> {
  const { supabaseAdmin } = await import("@/lib/supabase/server");
  if (!podeIr(p.estagio, t.para)) throw new Error(`transição inválida: ${p.estagio} → ${t.para}`);

  const ctx: ContextoAcao = { followups: p.followups, ...t.ctx };
  if (!ctx.reuniaoEm && p.reuniao_em) ctx.reuniaoEm = new Date(p.reuniao_em);
  const acao = t.proximaAcao !== undefined ? t.proximaAcao : proximaAcaoPadrao(t.para, ctx);
  exigirProximaAcao(t.para, acao);

  const agora = new Date().toISOString();
  const patch: Record<string, unknown> = {
    ...(t.patch ?? {}),
    estagio: t.para,
    etapa_pipeline: etapaPipeline(t.para),
    next_action_type: acao?.type ?? null,
    next_action_at: acao?.at ?? null,
    next_action_owner: acao?.owner ?? null,
    next_action_reason: acao?.reason ?? null,
    updated_at: agora,
  };
  if (POS_REUNIAO.has(t.para) && p.owner !== "ROBERTO") { patch.owner = "ROBERTO"; patch.modo_agente = "observacao"; }
  if (t.para === "nao_perturbe" || t.para === "perdido" || t.para === "fora_icp") patch.modo_agente = "observacao";

  const { data, error } = await supabaseAdmin.from("prospects").update(patch).eq("id", p.id).select("*").single();
  if (error) throw new Error(`prospects.update: ${error.message}`);

  await registrarEvento(p.id, {
    tipo: "transicao", de: p.estagio, para: t.para, motivo: t.motivo, mensagem: t.mensagem ?? null,
    responsavel: t.responsavel ?? "SDR_AI",
    proxima_acao: acao ? `${acao.type} em ${acao.at ?? "—"} (${acao.owner})` : null,
    detalhe: t.detalhe ?? null,
  });
  return data as ProspectRow;
}

export async function registrarEvento(prospectId: string, e: {
  tipo: string; de?: string | null; para?: string | null; motivo?: string | null; mensagem?: string | null;
  responsavel?: string | null; proxima_acao?: string | null; detalhe?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/lib/supabase/server");
    const { error } = await supabaseAdmin.from("prospect_events").insert({
      prospect_id: prospectId, tipo: e.tipo, de: e.de ?? null, para: e.para ?? null, motivo: e.motivo ?? null,
      mensagem: e.mensagem ? e.mensagem.slice(0, 2000) : null, responsavel: e.responsavel ?? null,
      proxima_acao: e.proxima_acao ?? null, detalhe: e.detalhe ?? null,
    });
    if (error) console.error("[prospeccao/eventos] não gravei:", error.message);
  } catch (err) {
    console.error("[prospeccao/eventos] não gravei:", err instanceof Error ? err.message : err);
  }
}

/** Atualiza só a próxima ação (sem mudar de estágio) — ex.: reagendar um follow-up. */
export async function definirProximaAcao(prospectId: string, acao: NextAction | null, motivo?: string): Promise<void> {
  const { supabaseAdmin } = await import("@/lib/supabase/server");
  await supabaseAdmin.from("prospects").update({
    next_action_type: acao?.type ?? null, next_action_at: acao?.at ?? null,
    next_action_owner: acao?.owner ?? null, next_action_reason: acao?.reason ?? null,
    updated_at: new Date().toISOString(),
  }).eq("id", prospectId);
  if (motivo) await registrarEvento(prospectId, { tipo: "proxima_acao", motivo, proxima_acao: acao ? `${acao.type} em ${acao.at ?? "—"}` : "nenhuma" });
}
