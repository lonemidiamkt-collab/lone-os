// lib/cs/taxonomy.ts — Taxonomia de demandas do Agente CS (A1).
// Tipo → é demanda? → área de roteamento → SLA-alvo. São PARÂMETROS do produto
// (ajustáveis conforme a Lone opera), não código fixo. Fonte: blueprint §11.1 / A1 §2.
// O roteamento (QUEM) é determinístico via clients.assigned_* — não é inferência da IA.

export const CS_DEMAND_TYPES = [
  "arte_nova",
  "ajuste_arte",
  "cobranca_prazo",
  "feedback_campanha",
  "duvida",
  "duvida_estrategia",
  "reclamacao",
  "info_operacional",
  "elogio",
  "agendamento",
  "retracao",
  "conversa",
] as const;

export type CsDemandType = (typeof CS_DEMAND_TYPES)[number];
export type CsUrgencia = "baixa" | "media" | "alta";
export type CsArea = "designer" | "social" | "trafego";

export interface CsTypeMeta {
  isDemanda: boolean;
  /** Área de roteamento. null = resolvida em runtime (ex.: cobranca herda a área da demanda cobrada). */
  area: CsArea | null;
  sla1aResposta: string;
  slaEntrega: string;
}

export const CS_TAXONOMY: Record<CsDemandType, CsTypeMeta> = {
  arte_nova:         { isDemanda: true,  area: "designer", sla1aResposta: "20 min",         slaEntrega: "2 dias úteis" },
  ajuste_arte:       { isDemanda: true,  area: "designer", sla1aResposta: "20 min",         slaEntrega: "1 dia útil" },
  cobranca_prazo:    { isDemanda: true,  area: null,       sla1aResposta: "10 min",         slaEntrega: "4h" },
  feedback_campanha: { isDemanda: true,  area: "trafego",  sla1aResposta: "20 min",         slaEntrega: "1 dia útil" },
  duvida:            { isDemanda: true,  area: "social",   sla1aResposta: "20 min",         slaEntrega: "4h" },
  duvida_estrategia: { isDemanda: true,  area: "trafego",  sla1aResposta: "20 min",         slaEntrega: "1 dia útil" },
  reclamacao:        { isDemanda: true,  area: "social",   sla1aResposta: "10 min",         slaEntrega: "2h" },
  info_operacional:  { isDemanda: false, area: null,       sla1aResposta: "—",              slaEntrega: "—" },
  elogio:            { isDemanda: false, area: "social",   sla1aResposta: "—",              slaEntrega: "—" },
  agendamento:       { isDemanda: true,  area: "social",   sla1aResposta: "próxima janela", slaEntrega: "conforme a data" },
  retracao:          { isDemanda: true,  area: null,       sla1aResposta: "—",              slaEntrega: "imediato" },
  conversa:          { isDemanda: false, area: null,       sla1aResposta: "—",              slaEntrega: "—" },
};
