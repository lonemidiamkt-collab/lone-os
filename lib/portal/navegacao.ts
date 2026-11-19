// lib/portal/navegacao.ts — as áreas do Painel de Resultados e o período, num lugar só (19/11/2026).
//
// Antes cada aba guardava o próprio período (anúncios, Instagram e Google, três estados) e nada ia para o
// endereço: o link do WhatsApp sempre abria em "Anúncios · 7 dias" e o cliente que trocava de aba perdia o
// período escolhido. Agora existe UM período, que acompanha o cliente entre as abas e vai na URL
// (`?aba=google&p=14d`) — o time manda o link já na área e no período certos.
//
// Cada fonte só sabe responder alguns períodos (o Google não tem "Hoje"; o Instagram guarda 7, 14 e 30 dias).
// A aba mostra só o que a fonte dela responde; ao trocar para uma aba que não tem o período atual, volta
// para 7 dias — nunca um número de outro recorte sob o rótulo errado.

import type { PeriodKind } from "./types";

export type AbaPortal = "resumo" | "ads" | "google" | "crm" | "social" | "conteudo";
export type PeriodoPortal = "hoje" | "7d" | "14d" | "30d" | "mes" | "mes-passado";
/** Os períodos que o Instagram guarda (mesmos valores de IG_PERIODOS em PortalInstagram). */
export type PeriodoIg = "7d" | "14d" | "30d";

export const ABAS_PORTAL: readonly AbaPortal[] = ["resumo", "ads", "google", "crm", "social", "conteudo"];
export const PERIODO_PADRAO: PeriodoPortal = "7d";

export const PERIODOS_PORTAL: readonly { valor: PeriodoPortal; rotulo: string }[] = [
  { valor: "hoje", rotulo: "Hoje" },
  { valor: "7d", rotulo: "7 dias" },
  { valor: "14d", rotulo: "14 dias" },
  { valor: "30d", rotulo: "30 dias" },
  { valor: "mes", rotulo: "Este mês" },
  { valor: "mes-passado", rotulo: "Mês passado" },
];

/** O que cada fonte responde. Aba sem período (atendimento, conteúdo) = lista vazia = sem filtro. */
export const PERIODOS_DA_ABA: Record<AbaPortal, readonly PeriodoPortal[]> = {
  // A Visão geral junta as três fontes: só oferece o que TODAS respondem.
  resumo: ["7d", "14d"],
  ads: ["hoje", "7d", "14d", "mes", "mes-passado"],
  google: ["7d", "14d", "mes", "mes-passado"],
  social: ["7d", "14d", "30d"],
  crm: [],
  conteudo: [],
};

const PARA_KIND: Partial<Record<PeriodoPortal, PeriodKind>> = {
  hoje: "today", "7d": "last_week", "14d": "last_2_weeks", mes: "this_month", "mes-passado": "last_month",
};

/**
 * Abas que este cliente tem, na ordem fixa do menu. A "Visão geral" só existe (e abre primeiro) para quem
 * tem dois ou mais canais com número — com um canal só ela repetiria a área dele.
 */
export function abasDisponiveis(tem: { hasAds?: boolean; hasGoogle?: boolean; hasCrm?: boolean; hasSocial?: boolean }): AbaPortal[] {
  const canais = [tem.hasAds, tem.hasGoogle, tem.hasSocial].filter(Boolean).length;
  return [
    ...(canais >= 2 ? ["resumo" as const] : []),
    ...(tem.hasAds ? ["ads" as const] : []),
    ...(tem.hasGoogle ? ["google" as const] : []),
    ...(tem.hasCrm ? ["crm" as const] : []),
    ...(tem.hasSocial ? ["social" as const, "conteudo" as const] : []),
  ];
}

/** A aba pedida (da URL) se o cliente tem; senão a primeira que ele tem. Sem nenhuma: "social" (a tela de "estamos começando"). */
export function abaValida(pedida: string | null | undefined, disponiveis: readonly AbaPortal[]): AbaPortal {
  const achada = disponiveis.find((a) => a === pedida);
  return achada ?? disponiveis[0] ?? "social";
}

/** O período pedido se a aba responde por ele; senão 7 dias. Em aba sem filtro o período só é carregado adiante. */
export function periodoValido(pedido: string | null | undefined, aba: AbaPortal): PeriodoPortal {
  const conhecido = PERIODOS_PORTAL.find((p) => p.valor === pedido)?.valor;
  if (!conhecido) return PERIODO_PADRAO;
  const daAba = PERIODOS_DA_ABA[aba];
  return daAba.length === 0 || daAba.includes(conhecido) ? conhecido : PERIODO_PADRAO;
}

/** Período no formato das rotas de anúncios e do Google. "30 dias" não existe lá: cai em 7 dias. */
export function paraPeriodKind(p: PeriodoPortal): PeriodKind {
  return PARA_KIND[p] ?? "last_week";
}

/** Período no formato do Instagram. O que ele não guarda cai em 7 dias. */
export function paraPeriodoIg(p: PeriodoPortal): PeriodoIg {
  return p === "14d" || p === "30d" ? p : "7d";
}

/** Janela em dias para as artes entregues (aba Conteúdo). */
export function diasDoPeriodo(p: PeriodoPortal): number {
  return p === "14d" ? 14 : p === "30d" || p === "mes" || p === "mes-passado" ? 30 : 7;
}

/**
 * A parte `?aba=…&p=…` do endereço. O padrão (primeira aba do cliente, 7 dias) fica de fora, para o link
 * comum continuar limpo. Mantém os outros parâmetros que já estavam no endereço.
 */
export function buscaDoPortal(atual: string, aba: AbaPortal, periodo: PeriodoPortal, abaPadrao: AbaPortal): string {
  const q = new URLSearchParams(atual);
  // Apaga e recoloca: a ordem fica sempre `aba` e depois `p`, qualquer que fosse o endereço anterior.
  q.delete("aba");
  q.delete("p");
  if (aba !== abaPadrao) q.set("aba", aba);
  if (periodo !== PERIODO_PADRAO && PERIODOS_DA_ABA[aba].length > 0) q.set("p", periodo);
  const s = q.toString();
  return s ? `?${s}` : "";
}
