// lib/agentes/estado.ts — o agente está funcionando? Regra pura (sem banco), usada pela Central de Agentes.
//
// Junta três coisas que até 25/10/2026 não se encontravam: o catálogo (o que o agente é), o uso real
// (llm_calls e agent_runs: quando chamou a IA, se deu certo) e os interruptores (Central de Agentes,
// Central de Automações, variável do servidor, agency_settings). Custo em dinheiro não entra: é
// número da agência.

import type { Agente, Gatilho, Interruptor } from "./catalogo";
import { causaDoErro } from "@/lib/ia/causa-erro";

export type Estado = "funcionando" | "falhando" | "parado" | "desligado" | "sem-registro";

export const ESTADOS: readonly Estado[] = ["falhando", "parado", "funcionando", "desligado", "sem-registro"];

/** Uso real de um agente, já somado a partir de llm_calls e agent_runs. */
export interface UsoAgente {
  chamadas7d: number;
  falhasIa7d: number;
  /** A chamada de IA mais recente (em 7 dias, ou a última dos 90 dias quando a semana está vazia). */
  ultimaIa: { em: string; ok: boolean } | null;
  /** A falha de IA mais recente dos 7 dias. */
  ultimaFalhaIa: { em: string; erro: string | null } | null;
  /** A execução mais recente em agent_runs (rotinas e botões que abrem execução). */
  ultimaExecucao: { em: string; erro: string | null } | null;
  errosExecucao7d: number;
}

export const USO_VAZIO: UsoAgente = {
  chamadas7d: 0, falhasIa7d: 0, ultimaIa: null, ultimaFalhaIa: null, ultimaExecucao: null, errosExecucao7d: 0,
};

/** O pedaço da Central de Automações que interessa a um agente que roda por agenda. */
export interface RotinaDoAgente {
  id: string;
  nome: string;
  agendaBRT: string;
  saude: "ok" | "falhou" | "parado" | "desligado" | "sem-registro";
  ligada: boolean;
  pausadaAte: string | null;
  ultimaEm: string | null;
  ultimoSucessoEm: string | null;
  erros7d: number;
  maxSilencioHoras: number;
}

/** O que cada interruptor alcança. "webhook" = mensagem que chega; "cron:<job>" = só aquela rotina. */
export type Bloqueio = "tudo" | "webhook" | `cron:${string}` | "nada";

export interface EstadoInterruptor {
  tipo: Interruptor["tipo"];
  rotulo: string;
  /** null = não dá para saber daqui (constante no código, configuração que não carregou). */
  ligado: boolean | null;
  detalhe: string;
  bloqueia: Bloqueio;
}

/** Retrato de tudo que liga ou desliga agente, lido uma vez por carga da Central. */
export interface Ambiente {
  loninho: { ligado: boolean; pausadoAte: string | null; alteradoPor: string | null; alteradoEm: string | null } | null;
  rotinas: Record<string, RotinaDoAgente>;
  env: Record<string, string | undefined>;
  ajustes: Record<string, string | null>;
}

const contaLista = (v: string | undefined) => (v ?? "").split(",").map((s) => s.trim()).filter(Boolean).length;

function dataCurta(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/** Estado de um interruptor do catálogo, no ambiente de agora. Nunca mostra o VALOR de variável do servidor. */
export function estadoDoInterruptor(i: Interruptor, amb: Ambiente): EstadoInterruptor {
  switch (i.tipo) {
    case "loninho": {
      const l = amb.loninho;
      if (!l) return { tipo: i.tipo, rotulo: "Interruptor geral do Loninho", ligado: null, detalhe: "Não consegui ler o interruptor agora.", bloqueia: "webhook" };
      const quem = l.alteradoPor ? ` por ${l.alteradoPor}${l.alteradoEm ? ` em ${dataCurta(l.alteradoEm)}` : ""}` : "";
      const detalhe = l.ligado
        ? "Ligado: o Loninho lê os grupos."
        : l.pausadoAte ? `Pausado${quem} até ${dataCurta(l.pausadoAte)}.` : `Desligado${quem}.`;
      return { tipo: i.tipo, rotulo: "Interruptor geral do Loninho", ligado: l.ligado, detalhe, bloqueia: "webhook" };
    }
    case "automacao": {
      const r = amb.rotinas[i.job];
      const rotulo = `Central de Automações: ${r?.nome ?? i.job}`;
      if (!r) return { tipo: i.tipo, rotulo, ligado: null, detalhe: "Não consegui ler a Central de Automações agora.", bloqueia: `cron:${i.job}` };
      const ligado = r.ligada && !r.pausadaAte;
      const detalhe = ligado ? `Ligada · ${r.agendaBRT}` : r.pausadaAte ? `Pausada até ${dataCurta(r.pausadaAte)}` : "Desligada";
      return { tipo: i.tipo, rotulo, ligado, detalhe, bloqueia: `cron:${i.job}` };
    }
    case "env": {
      const v = amb.env[i.variavel];
      const rotulo = `Variável do servidor ${i.variavel}`;
      if (i.modo === "on") {
        const ligado = (v ?? "").trim().toLowerCase() === "on";
        return { tipo: i.tipo, rotulo, ligado, detalhe: `${ligado ? "Ligada" : "Desligada"}. ${i.significado}`, bloqueia: "tudo" };
      }
      if (i.modo === "existe") {
        const ligado = !!(v ?? "").trim();
        return { tipo: i.tipo, rotulo, ligado, detalhe: `${ligado ? "Configurada" : "Não configurada"}. ${i.significado}`, bloqueia: "tudo" };
      }
      const n = contaLista(v);
      return { tipo: i.tipo, rotulo, ligado: true, detalhe: `${n ? `${n} na lista` : "Lista vazia"}. ${i.significado}`, bloqueia: "nada" };
    }
    case "agency_settings": {
      const v = (amb.ajustes[i.chave] ?? "").trim().toLowerCase();
      const rotulo = `Configuração ${i.chave}`;
      if (i.modo === "modo-ia") {
        const modo = v === "true" || v === "on" ? "on" : v === "revisao" || v === "review" ? "revisao" : "off";
        const txt = modo === "on" ? "Ligada" : modo === "revisao" ? "Em revisão" : "Desligada";
        return { tipo: i.tipo, rotulo, ligado: modo !== "off", detalhe: `${txt}. ${i.significado}`, bloqueia: "tudo" };
      }
      const ligado = v === "on";
      return { tipo: i.tipo, rotulo, ligado, detalhe: `${ligado ? "Ligada" : "Desligada"}. ${i.significado}`, bloqueia: "tudo" };
    }
    case "constante":
      return { tipo: i.tipo, rotulo: "Constante no código", ligado: null, detalhe: `${i.significado} (${i.onde})`, bloqueia: "nada" };
  }
}

function bloqueado(g: Gatilho, ints: readonly EstadoInterruptor[]): EstadoInterruptor | null {
  for (const i of ints) {
    if (i.ligado !== false) continue;
    if (i.bloqueia === "tudo") return i;
    if (i.bloqueia === "webhook" && g.tipo === "webhook") return i;
    if (g.tipo === "cron" && i.bloqueia === `cron:${g.automacao}`) return i;
  }
  return null;
}

const ms = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : NaN);
const maisRecente = (...isos: (string | null | undefined)[]) =>
  isos.filter((x): x is string => !!x).sort((a, b) => ms(b) - ms(a))[0] ?? null;

/** O erro em uma linha que o time entende: a causa conhecida (OpenAI sem crédito…) ou o começo do texto. */
export function erroLegivel(erro: string | null | undefined): string {
  const c = causaDoErro(erro);
  if (c) return c.titulo;
  const t = (erro ?? "").replace(/\s+/g, " ").trim();
  return t ? (t.length > 140 ? `${t.slice(0, 137)}…` : t) : "erro sem mensagem";
}

export interface Avaliacao {
  estado: Estado;
  /** Uma frase: por que está assim. Vazia quando está tudo bem e não há nada a dizer. */
  motivo: string;
  ultimaEm: string | null;
  /** De onde veio a última execução. */
  ultimaFonte: "ia" | "execucao" | "rotina" | null;
  falhas7d: number;
}

/**
 * O estado de um agente:
 *  - desligado: de propósito (catálogo) ou porque TODO gatilho dele está desligado agora;
 *  - falhando: a última chamada de IA falhou e nada deu certo depois, ou a rotina dele falhou na última vez;
 *  - sem-registro: nenhuma execução registrada (em 90 dias);
 *  - parado: roda a cada mensagem ou por agenda e passou do prazo sem rodar;
 *  - funcionando: o resto. Falhas soltas da semana aparecem no motivo, não mudam o estado.
 */
export function avaliarAgente(
  a: Agente, uso: UsoAgente, ints: readonly EstadoInterruptor[], rotinas: readonly RotinaDoAgente[], agora: Date,
): Avaliacao {
  const ultimaRotina = maisRecente(...rotinas.map((r) => r.ultimaEm));
  const ultimaEm = maisRecente(uso.ultimaIa?.em, uso.ultimaExecucao?.em, ultimaRotina);
  const ultimaFonte: Avaliacao["ultimaFonte"] = !ultimaEm ? null
    : ultimaEm === uso.ultimaIa?.em ? "ia" : ultimaEm === uso.ultimaExecucao?.em ? "execucao" : "rotina";
  const errosRotina = rotinas.reduce((s, r) => s + r.erros7d, 0);
  const falhas7d = uso.falhasIa7d + uso.errosExecucao7d + errosRotina;
  const base = { ultimaEm, ultimaFonte, falhas7d };

  if (a.situacao === "desligado") {
    const off = ints.find((i) => i.ligado === false);
    return { ...base, estado: "desligado", motivo: off ? off.detalhe : "Desligado de propósito." };
  }
  const travas = a.gatilhos.map((g) => bloqueado(g, ints));
  if (travas.length && travas.every(Boolean)) {
    return { ...base, estado: "desligado", motivo: (travas[0] as EstadoInterruptor).detalhe };
  }

  if (uso.ultimaIa && !uso.ultimaIa.ok) {
    return { ...base, estado: "falhando", motivo: `A última chamada de IA falhou: ${erroLegivel(uso.ultimaFalhaIa?.erro)}.` };
  }
  const rotinaFalhou = rotinas.find((r) => r.saude === "falhou" && r.ligada && !r.pausadaAte);
  if (rotinaFalhou && ms(rotinaFalhou.ultimaEm) >= (ms(uso.ultimaIa?.em) || 0)) {
    return { ...base, estado: "falhando", motivo: `A rotina “${rotinaFalhou.nome}” falhou na última vez.` };
  }

  if (!ultimaEm) {
    return { ...base, estado: "sem-registro", motivo: "Nenhuma execução registrada nos últimos 90 dias." };
  }

  const soAgenda = a.gatilhos.length > 0 && a.gatilhos.every((g) => g.tipo === "cron");
  const ativas = rotinas.filter((r) => r.ligada && !r.pausadaAte);
  const limiteH = a.silencioMaxHoras ?? (soAgenda && ativas.length ? Math.max(...ativas.map((r) => r.maxSilencioHoras)) : null);
  if (limiteH && agora.getTime() - ms(ultimaEm) > limiteH * 3600_000) {
    const prazo = limiteH < 48 ? `${limiteH} h` : `${Math.round(limiteH / 24)} dias`;
    return { ...base, estado: "parado", motivo: `Nenhuma execução há mais de ${prazo}.` };
  }

  const partes: string[] = [];
  if (falhas7d) partes.push(`${falhas7d} falha${falhas7d > 1 ? "s" : ""} nos últimos 7 dias`);
  const meiaTrava = travas.find(Boolean);
  if (meiaTrava) partes.push(`parte dele está desligada (${meiaTrava.rotulo})`);
  return { ...base, estado: "funcionando", motivo: partes.length ? `${partes.join("; ")}.` : "" };
}
