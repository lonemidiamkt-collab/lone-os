// lib/ceo/fontes.ts — número da Área CEO só quando a fonte carregou. Módulo PURO (25/10/2026, auditoria 6.5).
//
// Os KPIs saíam do store sem olhar se ele tinha carregado: "Total de Clientes 0", "Risco de Churn 0", "Taxa Geral 0%"
// e "Publicações atrasadas 0 — nenhuma" em verde apareciam enquanto carregava e quando a leitura falhava. Fonte que
// não está pronta mostra "—" e diz por quê; a tela oferece "Tentar de novo".

export type SituacaoFonte = "pronta" | "carregando" | "erro";

export function situacaoDaFonte(o: { carregada: boolean; erro?: string | boolean | null }): SituacaoFonte {
  if (o.erro) return "erro";
  return o.carregada ? "pronta" : "carregando";
}

/** O número, ou "—" quando a fonte não está pronta. */
export function valorDaFonte<T extends number | string>(valor: T, s: SituacaoFonte): T | "—" {
  return s === "pronta" ? valor : "—";
}

/** A legenda embaixo do número: a de sempre, ou o porquê do "—". */
export function legendaDaFonte(normal: string, s: SituacaoFonte): string {
  return s === "pronta" ? normal : s === "erro" ? "não carregou" : "carregando…";
}
