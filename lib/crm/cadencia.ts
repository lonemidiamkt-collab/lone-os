// lib/crm/cadencia.ts — CADÊNCIA DE FOLLOW-UP POR ETAPA (Leva 2 do comercial, out/2026). Módulo PURO.
//
// Antes era uma régua só (dia 2/5/12) para qualquer etapa. Agora cada etapa tem a sua, com o CANAL
// de cada toque, montada a partir da pesquisa de 17/10 (IDEIA-COMERCIAL-LONE, seção 7.2): responder
// em até 1 h, WhatsApp é o canal nº 1 no Brasil, no máximo 3 WhatsApps seguidos sem resposta, e uma
// mensagem de encerramento que deixa a porta aberta.
//
// Dia zero = entrada na etapa (`etapa_desde`; sem ela, `cadencia_inicio` ou a criação). Um passo conta
// como feito quando há um TOQUE (ligação, WhatsApp, e-mail, reunião, visita) ou um "pulado" num dia
// a partir do dia zero — um por dia. Regra em código: a IA nunca decide data nem quem aparece no Hoje.

import { ehAberta, normalizarEtapa } from "@/lib/crm/etapas";
import type { CrmEstagio } from "@/lib/types";

export type Canal = "whatsapp" | "ligacao" | "visita";

export interface Passo {
  chave: string;
  dia: number;
  canal: Canal;
  objetivo: string;
}

export const CADENCIAS: Partial<Record<CrmEstagio, Passo[]>> = {
  novo: [
    { chave: "novo_primeiro", dia: 0, canal: "whatsapp", objetivo: "Primeiro contato em até 1 h: apresentar-se e propor o raio-x de 15 minutos." },
  ],
  contato: [
    { chave: "contato_d0", dia: 0, canal: "whatsapp", objetivo: "Resumo da conversa e pedir para seguir pelo WhatsApp." },
    { chave: "contato_d2", dia: 2, canal: "whatsapp", objetivo: "Algo útil sobre o Instagram da loja e o convite para o raio-x." },
    { chave: "contato_d5", dia: 5, canal: "ligacao", objetivo: "Ligar: retomar a conversa e marcar o raio-x de 15 minutos." },
    { chave: "contato_d9", dia: 9, canal: "whatsapp", objetivo: "Caso de uma loja parecida e o que faria nesta." },
    { chave: "contato_d14", dia: 14, canal: "visita", objetivo: "Passar na loja e mostrar o raio-x no celular." },
    { chave: "contato_d21", dia: 21, canal: "whatsapp", objetivo: "Encerrar sem pressão, deixando a porta aberta." },
  ],
  diagnostico: [
    { chave: "diagnostico_d1", dia: 1, canal: "whatsapp", objetivo: "Agradecer, resumir o que viram e dizer quando chega a proposta." },
    { chave: "diagnostico_d3", dia: 3, canal: "ligacao", objetivo: "Tirar dúvidas e combinar a proposta." },
  ],
  proposta: [
    { chave: "proposta_d1", dia: 1, canal: "whatsapp", objetivo: "Confirmar que a proposta chegou." },
    { chave: "proposta_d3", dia: 3, canal: "ligacao", objetivo: "Conversar 10 minutos sobre a proposta." },
    { chave: "proposta_d7", dia: 7, canal: "whatsapp", objetivo: "Pedir retorno, com a porta aberta se o momento não for agora." },
  ],
};

/** Negociação não tem fim previsto: um toque a cada 3 dias até decidir. */
export const INTERVALO_NEGOCIACAO = 3;
export const PASSO_NEGOCIACAO: Passo = { chave: "negociacao", dia: 0, canal: "whatsapp", objetivo: "Destravar a decisão: combinar o próximo passo com data." };
/** Passou isto do último passo previsto sem terminar a régua: a cadência acabou → sugerir fechar. */
export const FOLGA_FIM = 7;

export const TIPOS_TOQUE = new Set(["ligacao", "whatsapp", "email", "reuniao", "visita"]);
/** O que faz a régua andar: um toque de verdade ou um "pulado" (o comercial decidiu não fazer aquele). */
export const TIPOS_AVANCO = new Set([...TIPOS_TOQUE, "pulado"]);

export const ROTULO_CANAL: Record<Canal, string> = { whatsapp: "WhatsApp", ligacao: "Ligação", visita: "Visita" };

export interface ProximoToque {
  etapa: CrmEstagio;
  passo: Passo;
  /** Posição do passo na régua (0 = primeiro). */
  indice: number;
  /** Total de passos da etapa; null na negociação (contínua). */
  total: number | null;
  /** Dia do passo contado do dia zero. */
  dia: number;
  /** YYYY-MM-DD. */
  data: string;
  /** Quantos passos já foram feitos. */
  feitos: number;
  situacao: "futuro" | "hoje" | "atrasado";
  diasAtraso: number;
}

const diaSP = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const paraDia = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : diaSP(v));
const somaDias = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const diff = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);

interface Entrada {
  estagio: string;
  /** Dia zero: etapa_desde ?? cadencia_inicio ?? created_at (ISO ou YYYY-MM-DD). */
  inicio: string;
  /** Datas (ISO) das atividades que fazem a régua andar (toques + "pulado"). */
  toques: string[];
  hoje: string;
  retomarEm?: string | null;
}

function diasFeitos(p: Entrada, dia0: string): string[] {
  return [...new Set(p.toques.filter((t) => Number.isFinite(new Date(t).getTime())).map(paraDia).filter((d) => d >= dia0))].sort();
}

/** O próximo toque do lead, ou null (fechado, estacionado em "retomar em", ou régua encerrada). */
export function proximoToque(p: Entrada): ProximoToque | null {
  const etapa = normalizarEtapa(p.estagio);
  if (!ehAberta(etapa)) return null;
  // "Retomar em" no futuro: o lead está estacionado de propósito — nada de toque atrasado até lá.
  if (p.retomarEm && p.retomarEm > p.hoje) return null;
  const dia0 = paraDia(p.inicio);
  const feitos = diasFeitos(p, dia0);

  const montar = (passo: Passo, indice: number, total: number | null, data: string): ProximoToque => {
    const atraso = diff(data, p.hoje);
    return {
      etapa, passo, indice, total, dia: diff(dia0, data), data, feitos: Math.min(feitos.length, total ?? feitos.length),
      situacao: atraso > 0 ? "atrasado" : atraso === 0 ? "hoje" : "futuro", diasAtraso: Math.max(0, atraso),
    };
  };

  if (etapa === "negociacao") {
    const base = feitos.length ? feitos[feitos.length - 1] : dia0;
    return montar(PASSO_NEGOCIACAO, feitos.length, null, somaDias(base, INTERVALO_NEGOCIACAO));
  }
  const passos = CADENCIAS[etapa];
  if (!passos?.length) return null;
  const ultimo = passos[passos.length - 1];
  if (diff(dia0, p.hoje) > ultimo.dia + FOLGA_FIM) return null; // régua vencida: vira "fim da cadência"
  if (feitos.length >= passos.length) return null;
  const passo = passos[feitos.length];
  return montar(passo, feitos.length, passos.length, somaDias(dia0, passo.dia));
}

/**
 * A régua acabou sem o lead andar (todos os passos feitos, ou o prazo passou) e ele continua na mesma
 * etapa: hora de decidir — Perdido (sem resposta) ou Retomar em 30 dias. Null quando não é o caso.
 */
export function fimDaCadencia(p: Entrada): { desde: string } | null {
  const etapa = normalizarEtapa(p.estagio);
  if (!ehAberta(etapa) || etapa === "negociacao" || etapa === "novo") return null;
  if (p.retomarEm && p.retomarEm > p.hoje) return null;
  const passos = CADENCIAS[etapa];
  if (!passos?.length) return null;
  const dia0 = paraDia(p.inicio);
  const ultimo = passos[passos.length - 1];
  const fimPrevisto = somaDias(dia0, ultimo.dia);
  const feitos = diasFeitos(p, dia0);
  if (feitos.length >= passos.length) return { desde: feitos[feitos.length - 1] };
  if (diff(dia0, p.hoje) > ultimo.dia + FOLGA_FIM) return { desde: fimPrevisto };
  return null;
}

/** Rótulo curto para o card: "Ligação do dia 5 · hoje", "WhatsApp do dia 2 · atrasado 3d", "Primeiro contato". */
export function rotuloToque(t: ProximoToque): string {
  const ddmm = `${t.data.slice(8, 10)}/${t.data.slice(5, 7)}`;
  const nome = t.passo.chave === "novo_primeiro" ? "Primeiro contato"
    : t.total == null ? `${ROTULO_CANAL[t.passo.canal]} da negociação`
    : `${ROTULO_CANAL[t.passo.canal]} do dia ${t.passo.dia}`;
  if (t.situacao === "hoje") return `${nome} · hoje`;
  if (t.situacao === "atrasado") return `${nome} · atrasado ${t.diasAtraso}d`;
  return `${nome} · ${ddmm}`;
}
