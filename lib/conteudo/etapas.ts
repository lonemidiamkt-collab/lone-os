// lib/conteudo/etapas.ts — AS SEIS ETAPAS DA PRODUÇÃO. Um lugar só para o nome, a ordem e a cor.
//
// POR QUE EXISTE (Leva 5b, set/2026). A mesma arte aparecia com três nomes de etapa conforme a
// tela: "Em Produção" no Social, "Fila / Pra Fazer" no Designer, "Produção" no Meu Trabalho,
// "Aprovação Social Media" aqui e "Aprovação" ali. Cada tela tinha a sua tabela de rótulos e a sua
// lista de status. Agora toda tela, PDF, texto de WhatsApp, aviso e filtro que fala de etapa
// passa por este módulo.
//
// O banco NÃO muda: o enum content_status continua com os oito valores de sempre (ideas, script,
// in_production, blocked, approval, client_approval, scheduled, published). A etapa é uma LEITURA
// do status — `script` cai em Pauta junto com `ideas`, e `blocked` é uma marca dentro de "Com o
// designer" (o designer devolveu o card), não uma coluna.
//
// Módulo PURO: sem banco, sem React.

import type { ContentCard } from "@/lib/types";

export type StatusDoCard = ContentCard["status"];

export type Etapa = "pauta" | "com_designer" | "revisao" | "com_cliente" | "agendado" | "no_ar";

export interface InfoEtapa {
  id: Etapa;
  /** Como a etapa aparece na tela (coluna, chip, filtro). */
  rotulo: string;
  /** Posição no fluxo (0 = começo). */
  ordem: number;
  /** Bolinha/barra da etapa. Token do design system — funciona nos dois temas. */
  cor: string;
  /** Status gravado quando um card ENTRA na etapa. */
  statusPadrao: StatusDoCard;
  /** Todos os status do banco que caem nesta etapa. */
  status: readonly StatusDoCard[];
  /** Uma frase curta do que acontece aqui (ajuda na coluna vazia e no ⌘K). */
  descricao: string;
}

export const ETAPAS: readonly InfoEtapa[] = [
  { id: "pauta", rotulo: "Pauta", ordem: 0, cor: "bg-muted-foreground", statusPadrao: "ideas",
    status: ["ideas", "script"], descricao: "Ideia e roteiro — ainda não foi pro designer." },
  { id: "com_designer", rotulo: "Com o designer", ordem: 1, cor: "bg-chart-4", statusPadrao: "in_production",
    status: ["in_production", "blocked"], descricao: "Pedido de arte aberto: na fila, em produção ou em alteração." },
  { id: "revisao", rotulo: "Revisão interna", ordem: 2, cor: "bg-lone-warning", statusPadrao: "approval",
    status: ["approval"], descricao: "Arte entregue — o social confere antes de mandar pro cliente." },
  { id: "com_cliente", rotulo: "Com o cliente", ordem: 3, cor: "bg-lone-info", statusPadrao: "client_approval",
    status: ["client_approval"], descricao: "Esperando o aceite do cliente." },
  { id: "agendado", rotulo: "Agendado", ordem: 4, cor: "bg-chart-2", statusPadrao: "scheduled",
    status: ["scheduled"], descricao: "Aprovado e programado para ir ao ar." },
  { id: "no_ar", rotulo: "No ar", ordem: 5, cor: "bg-lone-success", statusPadrao: "published",
    status: ["published"], descricao: "Publicado (conferido no Instagram ou à mão)." },
] as const;

const POR_ID = new Map<Etapa, InfoEtapa>(ETAPAS.map((e) => [e.id, e]));
const POR_STATUS = new Map<string, InfoEtapa>();
for (const e of ETAPAS) for (const s of e.status) POR_STATUS.set(s, e);

/** Rótulo da marca "Bloqueado" (o designer devolveu o card por falta de algo). */
export const ROTULO_BLOQUEADO = "Bloqueado";
/** Cor da marca "Bloqueado". */
export const COR_BLOQUEADO = "bg-destructive";

export function infoEtapa(etapa: Etapa): InfoEtapa {
  return POR_ID.get(etapa)!;
}

/**
 * A etapa de um status do banco. Status desconhecido (null, texto velho) cai em Pauta: é o começo do
 * fluxo e o lugar onde um card perdido chama atenção sem fingir que andou.
 */
export function etapaDoStatus(status: string | null | undefined): Etapa {
  return POR_STATUS.get(status ?? "")?.id ?? "pauta";
}

export function infoDoStatus(status: string | null | undefined): InfoEtapa {
  return infoEtapa(etapaDoStatus(status));
}

/** O designer devolveu o card (status `blocked`). Aparece como marca dentro de "Com o designer". */
export function estaBloqueado(status: string | null | undefined): boolean {
  return status === "blocked";
}

/** Status gravado quando o card entra na etapa. */
export function statusDaEtapa(etapa: Etapa): StatusDoCard {
  return infoEtapa(etapa).statusPadrao;
}

/** Todos os status do banco destas etapas — para filtro de consulta (`.in("status", …)`). */
export function statusDasEtapas(...etapas: Etapa[]): StatusDoCard[] {
  return etapas.flatMap((e) => [...infoEtapa(e).status]);
}

/** O status pertence a alguma destas etapas? */
export function statusNaEtapa(status: string | null | undefined, ...etapas: Etapa[]): boolean {
  return etapas.includes(etapaDoStatus(status));
}

/** Rótulo de um status, do jeito que a tela mostra ("Com o designer"). */
export function rotuloDoStatus(status: string | null | undefined): string {
  return infoDoStatus(status).rotulo;
}

/** Rótulo com a marca de bloqueio ("Com o designer · Bloqueado"). */
export function rotuloCompleto(status: string | null | undefined): string {
  const r = rotuloDoStatus(status);
  return estaBloqueado(status) ? `${r} · ${ROTULO_BLOQUEADO}` : r;
}

/** Rótulo para usar NO MEIO de uma frase ("movi pra revisão interna"). */
export function rotuloEmFrase(status: string | null | undefined): string {
  return rotuloDoStatus(status).toLowerCase();
}

/** Cor da bolinha de um status (bloqueado usa a cor de alerta, não a da etapa). */
export function corDoStatus(status: string | null | undefined): string {
  return estaBloqueado(status) ? COR_BLOQUEADO : infoDoStatus(status).cor;
}

/** Posição do status no fluxo — para ordenar cards por etapa. */
export function ordemDoStatus(status: string | null | undefined): number {
  return infoDoStatus(status).ordem;
}

/** Mapa status → rótulo, para quem precisa de um Record (select, legenda de gráfico). */
export const ROTULO_DO_STATUS: Record<StatusDoCard, string> = {
  ideas: rotuloDoStatus("ideas"),
  script: rotuloDoStatus("script"),
  in_production: rotuloDoStatus("in_production"),
  blocked: rotuloCompleto("blocked"),
  approval: rotuloDoStatus("approval"),
  client_approval: rotuloDoStatus("client_approval"),
  scheduled: rotuloDoStatus("scheduled"),
  published: rotuloDoStatus("published"),
};

// ─── Grupos que as regras usam ───────────────────────────────────────────────

/**
 * Trabalho PROMETIDO: onde prazo vencido é atraso de verdade. Pauta fica de fora (é backlog — o
 * prazo ali é aspiração); Agendado e No ar já saíram da mão do time.
 * Antes: ["script", "in_production", "approval", "client_approval"] em três arquivos.
 */
export const ETAPAS_COMPROMETIDAS: readonly Etapa[] = ["com_designer", "revisao", "com_cliente"];

/** Já saiu da mão do time (agendado ou no ar). */
export const ETAPAS_FINAIS: readonly Etapa[] = ["agendado", "no_ar"];

/** Em aprovação (interna ou do cliente). */
export const ETAPAS_DE_APROVACAO: readonly Etapa[] = ["revisao", "com_cliente"];

/** O card já está em alguma etapa depois da entrega da arte? */
export function passouDaEntrega(status: string | null | undefined): boolean {
  return ordemDoStatus(status) >= infoEtapa("revisao").ordem;
}
