// lib/crm/pipeline.ts — os números do DASHBOARD do comercial, no formato que o Roberto usa para olhar
// o pipeline (out/2026): MRR potencial, receita anualizada, ponderado pela chance, ticket médio,
// a tabela de oportunidades com valor e a simulação de conversão. Módulo PURO, testado.
//
// "Oportunidade" = lead em etapa aberta COM mensalidade estimada. Lead aberto sem valor (loja da rota
// que ainda não passou do primeiro contato) conta no funil por etapa, mas não entra nas somas: um
// zero ali puxaria o ticket médio para baixo sem querer dizer nada.

import { ETAPAS_ABERTAS, chanceDe, ehAberta, normalizarEtapa } from "@/lib/crm/etapas";
import type { CrmEstagio } from "@/lib/types";

export interface LeadPipeline {
  id: string;
  empresa: string | null;
  contatoNome: string;
  estagio: string;
  valorOrcamento: number | null;
  probabilidade?: number | null;
  fechadoEm?: string | null;
}

export interface LinhaOportunidade<L> {
  lead: L;
  etapa: CrmEstagio;
  mensalidade: number;
  chance: number;    // 0..1
  ponderado: number; // mensalidade × chance
}

export interface ResumoPipeline<L> {
  oportunidades: LinhaOportunidade<L>[];
  mrrPotencial: number;
  anualizado: number;
  ponderado: number;
  ticketMedio: number | null;
  semValor: number;
  simulacao: { taxa: number; mrr: number; anual: number }[];
  porEtapa: { etapa: CrmEstagio; n: number; valor: number; ponderado: number }[];
  ganhosNoMes: { n: number; valor: number };
}

export const TAXAS_SIMULACAO = [0.25, 0.5, 0.75, 1] as const;

const valorDe = (l: LeadPipeline) => (typeof l.valorOrcamento === "number" && l.valorOrcamento > 0 ? l.valorOrcamento : 0);

export function resumirPipeline<L extends LeadPipeline>(leads: L[], mes: string): ResumoPipeline<L> {
  const ordem = new Map(ETAPAS_ABERTAS.map((e, i) => [e, i]));
  const oportunidades = leads
    .filter((l) => ehAberta(l.estagio) && valorDe(l) > 0)
    .map((l) => {
      const chance = chanceDe(l);
      return { lead: l, etapa: normalizarEtapa(l.estagio), mensalidade: valorDe(l), chance, ponderado: valorDe(l) * chance };
    })
    // Mais perto de fechar primeiro (negociação → novo); dentro da etapa, o maior valor.
    .sort((a, b) => (ordem.get(b.etapa) ?? 0) - (ordem.get(a.etapa) ?? 0) || b.mensalidade - a.mensalidade);

  const mrrPotencial = oportunidades.reduce((s, o) => s + o.mensalidade, 0);
  const ponderado = oportunidades.reduce((s, o) => s + o.ponderado, 0);
  const abertos = leads.filter((l) => ehAberta(l.estagio));
  const porEtapa = ETAPAS_ABERTAS.map((etapa) => {
    const daEtapa = abertos.filter((l) => normalizarEtapa(l.estagio) === etapa);
    return {
      etapa, n: daEtapa.length,
      valor: daEtapa.reduce((s, l) => s + valorDe(l), 0),
      ponderado: daEtapa.reduce((s, l) => s + valorDe(l) * chanceDe(l), 0),
    };
  });
  const ganhos = leads.filter((l) => normalizarEtapa(l.estagio) === "ganho" && (l.fechadoEm ?? "").slice(0, 7) === mes);

  return {
    oportunidades, mrrPotencial, anualizado: mrrPotencial * 12, ponderado,
    ticketMedio: oportunidades.length ? mrrPotencial / oportunidades.length : null,
    semValor: abertos.length - oportunidades.length,
    simulacao: TAXAS_SIMULACAO.map((taxa) => ({ taxa, mrr: mrrPotencial * taxa, anual: mrrPotencial * taxa * 12 })),
    porEtapa,
    ganhosNoMes: { n: ganhos.length, valor: ganhos.reduce((s, l) => s + valorDe(l), 0) },
  };
}
