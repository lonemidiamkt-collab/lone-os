// lib/goals/metas-server.ts — alvos (okrs), histórico (goal_results) e o painel da tela Metas & OKRs
// (N33). Só servidor. O cálculo de cada mês mora em lib/goals/calcular-server.ts.
//
// HISTÓRICO DE VERDADE: o fechamento de cada mês (job metas-fechamento, dia 1º) grava em
// goal_results o valor, o alvo daquele trimestre e o status. A tela lê de lá; o mês fechado que
// ainda não foi gravado é calculado na hora (e diz isso). Antes da migration 20260926120000 não há
// tabela: a tela mostra só o mês fechado calculado na hora e o parcial do mês corrente.

import { supabaseAdmin } from "@/lib/supabase/server";
import { hojeSP } from "@/lib/clients/pausa";
import {
  EQUIPES, METAS, alvosDoTrimestre, avaliarMeta, mesFechado, mesesAte, trimestreDo,
  type Equipe, type LinhaOkr, type MetaCatalogo, type Sentido, type StatusMeta,
} from "./catalogo";
import { calcularMetasDoMes } from "./calcular-server";
import type { ValorMeta } from "./calculos";

export const TABELA_HISTORICO = "goal_results";
export const MIGRACAO_METAS = "supabase/migrations/20260926120000_gestao_portal.sql";
export const MESES_DE_HISTORICO = 6;

// ─── Alvos ─────────────────────────────────────────────────────────────────

export async function lerAlvos(trimestre: string): Promise<{ alvos: Map<string, { alvo: number; okrId: string }>; erro: string | null }> {
  const { data, error } = await supabaseAdmin.from("okrs").select("id, metric_key, target, quarter").eq("quarter", trimestre);
  if (error) return { alvos: new Map(), erro: error.message };
  return { alvos: alvosDoTrimestre((data ?? []) as LinhaOkr[]), erro: null };
}

// ─── Histórico ─────────────────────────────────────────────────────────────

export interface LinhaHistorico {
  periodo: string;
  chave: string;
  valor: number | null;
  alvo: number | null;
  status: StatusMeta;
  sem_fonte: string | null;
  detalhe: string | null;
  calculado_em: string;
}

export async function lerHistorico(meses: readonly string[]): Promise<{ linhas: LinhaHistorico[]; existe: boolean }> {
  const { data, error } = await supabaseAdmin.from(TABELA_HISTORICO)
    .select("periodo, chave, valor, alvo, status, sem_fonte, detalhe, calculado_em").in("periodo", [...meses]);
  if (error) return { linhas: [], existe: false };
  return {
    linhas: ((data ?? []) as Record<string, unknown>[]).map((r) => ({
      periodo: r.periodo as string,
      chave: r.chave as string,
      valor: r.valor == null ? null : Number(r.valor),
      alvo: r.alvo == null ? null : Number(r.alvo),
      status: (r.status as StatusMeta) ?? "sem_dado",
      sem_fonte: (r.sem_fonte as string) ?? null,
      detalhe: (r.detalhe as string) ?? null,
      calculado_em: r.calculado_em as string,
    })),
    existe: true,
  };
}

// ─── Fechamento (o job do dia 1º) ──────────────────────────────────────────

export interface Fechamento {
  mes: string;
  trimestre: string;
  linhas: Omit<LinhaHistorico, "calculado_em">[];
  falhas: string[];
}

/** Calcula o mês e aplica o alvo do trimestre dele. Não grava. */
export async function calcularFechamento(mes: string, agora = new Date()): Promise<Fechamento> {
  const trimestre = trimestreDo(mes);
  const [calc, alvos] = await Promise.all([calcularMetasDoMes(mes, agora), lerAlvos(trimestre)]);
  const falhas = [...calc.falhas, ...(alvos.erro ? [`alvos (okrs): ${alvos.erro}`] : [])];
  const linhas = METAS.map((m) => {
    const v: ValorMeta = calc.valores[m.chave] ?? { valor: null, semFonte: "não calculado" };
    const alvo = alvos.alvos.get(m.chave)?.alvo ?? m.alvoPadrao;
    return {
      periodo: mes, chave: m.chave, valor: v.valor, alvo,
      status: avaliarMeta(v.valor, alvo, m.sentido).status,
      sem_fonte: v.semFonte ?? null, detalhe: v.detalhe ?? null,
    };
  });
  return { mes, trimestre, linhas, falhas };
}

export async function gravarFechamento(f: Fechamento): Promise<{ ok: boolean; erro?: string }> {
  const agora = new Date().toISOString();
  const { error } = await supabaseAdmin.from(TABELA_HISTORICO)
    .upsert(f.linhas.map((l) => ({ ...l, calculado_em: agora })), { onConflict: "periodo,chave" });
  if (error) {
    const falta = /does not exist|schema cache|Could not find/i.test(error.message);
    return { ok: false, erro: falta ? `tabela ${TABELA_HISTORICO} não existe — aplique ${MIGRACAO_METAS}` : error.message };
  }
  return { ok: true };
}

// ─── O painel da tela ──────────────────────────────────────────────────────

export interface PontoHistorico { periodo: string; valor: number | null; alvo: number | null; status: StatusMeta }

export interface Leitura {
  valor: number | null;
  semFonte: string | null;
  detalhe: string | null;
  alvo: number;
  progresso: number | null;
  status: StatusMeta;
}

export interface MetaPainel {
  chave: string;
  titulo: string;
  equipe: Equipe;
  unidade: MetaCatalogo["unidade"];
  casas: number;
  sentido: Sentido;
  fonte: string;
  /** Alvo do trimestre CORRENTE (o que se edita). */
  alvo: number;
  alvoPersonalizado: boolean;
  fechado: Leitura;
  parcial: Leitura;
  historico: PontoHistorico[];
}

export interface PainelMetas {
  hoje: string;
  mesFechado: string;
  mesAtual: string;
  trimestreAtual: string;
  /** O mês fechado veio do histórico gravado (true) ou foi calculado agora (false). */
  fechadoGravado: boolean;
  historicoExiste: boolean;
  equipes: typeof EQUIPES;
  metas: MetaPainel[];
  falhas: string[];
}

function leitura(v: ValorMeta | undefined, alvo: number, sentido: Sentido): Leitura {
  const valor = v?.valor ?? null;
  const { progresso, status } = avaliarMeta(valor, alvo, sentido);
  return { valor, semFonte: v?.semFonte ?? (v ? null : "não calculado"), detalhe: v?.detalhe ?? null, alvo, progresso, status };
}

export async function montarPainelMetas(agora = new Date()): Promise<PainelMetas> {
  const hoje = hojeSP(agora);
  const fechado = mesFechado(hoje);
  const atual = hoje.slice(0, 7);
  const meses = mesesAte(fechado, MESES_DE_HISTORICO);
  const trimestreAtual = trimestreDo(atual);
  const trimestreFechado = trimestreDo(fechado);

  const [hist, alvosAtuais, alvosFechado, parcial] = await Promise.all([
    lerHistorico(meses),
    lerAlvos(trimestreAtual),
    trimestreFechado === trimestreAtual ? Promise.resolve(null) : lerAlvos(trimestreFechado),
    calcularMetasDoMes(atual, agora),
  ]);
  const alvosDoFechado = alvosFechado ?? alvosAtuais;
  const gravadasDoFechado = hist.linhas.filter((l) => l.periodo === fechado);
  const fechadoGravado = gravadasDoFechado.length > 0;
  // Mês fechado sem fechamento gravado: calcula agora (a tela avisa que é cálculo do momento).
  const calcFechado = fechadoGravado ? null : await calcularMetasDoMes(fechado, agora);

  const falhas = [...parcial.falhas.map((f) => `mês corrente — ${f}`), ...(calcFechado?.falhas ?? []).map((f) => `mês fechado — ${f}`)];
  if (alvosAtuais.erro) falhas.push(`alvos: ${alvosAtuais.erro}`);

  const metas: MetaPainel[] = METAS.map((m) => {
    const alvoAtual = alvosAtuais.alvos.get(m.chave)?.alvo ?? m.alvoPadrao;
    const alvoFech = alvosDoFechado.alvos.get(m.chave)?.alvo ?? m.alvoPadrao;
    const gravada = gravadasDoFechado.find((l) => l.chave === m.chave);
    const lFechado: Leitura = gravada
      ? {
          valor: gravada.valor, semFonte: gravada.sem_fonte, detalhe: gravada.detalhe,
          alvo: gravada.alvo ?? alvoFech,
          ...avaliarMeta(gravada.valor, gravada.alvo ?? alvoFech, m.sentido),
        }
      : leitura(calcFechado?.valores[m.chave], alvoFech, m.sentido);
    const historico: PontoHistorico[] = meses.map((periodo) => {
      if (periodo === fechado) return { periodo, valor: lFechado.valor, alvo: lFechado.alvo, status: lFechado.status };
      const l = hist.linhas.find((x) => x.periodo === periodo && x.chave === m.chave);
      return l ? { periodo, valor: l.valor, alvo: l.alvo, status: l.status } : { periodo, valor: null, alvo: null, status: "sem_dado" as const };
    });
    return {
      chave: m.chave, titulo: m.titulo, equipe: m.equipe, unidade: m.unidade, casas: m.casas, sentido: m.sentido, fonte: m.fonte,
      alvo: alvoAtual, alvoPersonalizado: alvosAtuais.alvos.has(m.chave),
      fechado: lFechado,
      parcial: leitura(parcial.valores[m.chave], alvoAtual, m.sentido),
      historico,
    };
  });

  return {
    hoje, mesFechado: fechado, mesAtual: atual, trimestreAtual,
    fechadoGravado, historicoExiste: hist.existe, equipes: EQUIPES, metas, falhas,
  };
}

// ─── Editar o alvo ─────────────────────────────────────────────────────────

/** Grava o alvo do trimestre corrente (atualiza a linha da okrs, ou cria). */
export async function salvarAlvo(chave: string, alvo: number, quem: string, agora = new Date()): Promise<{ ok: boolean; erro?: string }> {
  const meta = METAS.find((m) => m.chave === chave);
  if (!meta) return { ok: false, erro: "Meta desconhecida." };
  if (!Number.isFinite(alvo) || alvo < 0) return { ok: false, erro: "Informe um número válido." };
  const trimestre = trimestreDo(hojeSP(agora).slice(0, 7));
  const { alvos, erro } = await lerAlvos(trimestre);
  if (erro) return { ok: false, erro };
  const existente = alvos.get(chave);
  const agoraIso = agora.toISOString();
  if (existente) {
    const { error } = await supabaseAdmin.from("okrs").update({ target: alvo, updated_at: agoraIso }).eq("id", existente.okrId);
    return error ? { ok: false, erro: error.message } : { ok: true };
  }
  const team = EQUIPES.find((e) => e.id === meta.equipe)?.team ?? "company";
  const { error } = await supabaseAdmin.from("okrs").insert({
    title: meta.titulo, description: meta.fonte, team, metric_key: chave, target: alvo,
    unit: meta.unidade === "R$" ? "R$" : meta.unidade, quarter: trimestre, owner: "", auto_calculated: true,
    created_by: quem, current_value: 0, status: "off_track",
  });
  return error ? { ok: false, erro: error.message } : { ok: true };
}

/** Volta ao alvo padrão: apaga as linhas do trimestre corrente ligadas à meta. */
export async function voltarAlvoPadrao(chave: string, agora = new Date()): Promise<{ ok: boolean; erro?: string }> {
  const meta = METAS.find((m) => m.chave === chave);
  if (!meta) return { ok: false, erro: "Meta desconhecida." };
  const trimestre = trimestreDo(hojeSP(agora).slice(0, 7));
  const chaves = [meta.chave, ...(meta.chavesAntigas ?? [])];
  const { error } = await supabaseAdmin.from("okrs").delete().eq("quarter", trimestre).in("metric_key", chaves);
  return error ? { ok: false, erro: error.message } : { ok: true };
}
