// lib/meta/resultado.ts — o RESULTADO de um anúncio conforme o objetivo da campanha (Leva 7A, N4).
//
// POR QUE ISTO EXISTE. O sistema inteiro contava "resultado" como CONVERSA iniciada
// (lib/meta/messages.ts). Para quem anuncia no WhatsApp está certo; para quem roda formulário de
// cadastro (lead) ou venda no site, o resultado era ~0 — o Hoje, o "Resultado de ontem", a Defesa e
// o diagnóstico viam essas contas como "gastando sem trazer nada". O Gerenciador de Anúncios faz o
// que fazemos aqui: o resultado da campanha é o evento do OBJETIVO dela.
//
// Regras (mesmo espírito do messages.ts — prioridade, NUNCA somar tipos de ação que se sobrepõem):
//   - objetivo de mensagem/engajamento (e os de tráfego/alcance, que aqui sempre significaram
//     conversa) → conversas;
//   - objetivo de cadastro (LEADS / LEAD_GENERATION) → leads; sem lead registrado, conversas (campanha
//     de cadastro com destino WhatsApp devolve conversa);
//   - objetivo de venda (SALES / CONVERSIONS / catálogo) → compras; sem compra, leads; sem lead, conversas.
// A conta soma o resultado de cada campanha — é o "Resultados" do Gerenciador somado.
//
// Módulo puro (sem banco, sem fetch). Testado em tests/meta-resultado.test.ts.

import { countMessagesFromActions } from "@/lib/meta/messages";

export type TipoResultado = "mensagens" | "leads" | "compras";
/** Conta que mistura tipos (ex.: campanha de WhatsApp + campanha de cadastro). */
export type TipoResultadoConta = TipoResultado | "misto";

export interface Contagem {
  mensagens: number;
  leads: number;
  compras: number;
}

type Acao = { action_type: string; value: string };

/** Lead: o agregado ("lead", que a Meta já soma de formulário + pixel) vem primeiro. */
export const LEAD_ACTION_TYPES = [
  "lead",
  "onsite_conversion.lead_grouped",
  "offsite_conversion.fb_pixel_lead",
  "onsite_conversion.lead",
] as const;

/** Compra: omni_purchase é o agregado (site + app + loja). */
export const PURCHASE_ACTION_TYPES = [
  "omni_purchase",
  "purchase",
  "offsite_conversion.fb_pixel_purchase",
  "onsite_web_purchase",
  "onsite_conversion.purchase",
] as const;

function primeiro(actions: Acao[] | undefined | null, tipos: readonly string[]): number {
  if (!actions) return 0;
  for (const t of tipos) {
    const a = actions.find((x) => x.action_type === t);
    if (a) {
      const v = parseInt(a.value, 10);
      return Number.isFinite(v) ? v : 0;
    }
  }
  return 0;
}

export function contarLeads(actions?: Acao[] | null): number {
  return primeiro(actions, LEAD_ACTION_TYPES);
}

export function contarCompras(actions?: Acao[] | null): number {
  return primeiro(actions, PURCHASE_ACTION_TYPES);
}

export function contarPorTipo(actions?: Acao[] | null): Contagem {
  return {
    mensagens: countMessagesFromActions(actions ?? undefined),
    leads: contarLeads(actions),
    compras: contarCompras(actions),
  };
}

/** Tipo de resultado que o OBJETIVO da campanha pede. Objetivo desconhecido = conversas (o de sempre). */
export function tipoDoObjetivo(objetivo?: string | null): TipoResultado {
  const o = (objetivo ?? "").toUpperCase();
  if (/SALES|CONVERSIONS|PRODUCT_CATALOG|CATALOG_SALES|STORE_VISITS/.test(o)) return "compras";
  if (/LEAD/.test(o)) return "leads";
  return "mensagens";
}

export interface ResultadoCampanha {
  valor: number;
  tipo: TipoResultado;
}

/** Resultado de UMA campanha (ou conjunto/anúncio) pelas ações dela e o objetivo da campanha. */
export function resultadoDaCampanha(objetivo: string | null | undefined, actions?: Acao[] | null): ResultadoCampanha {
  const c = contarPorTipo(actions);
  const pedido = tipoDoObjetivo(objetivo);
  if (pedido === "compras") {
    if (c.compras > 0) return { valor: c.compras, tipo: "compras" };
    if (c.leads > 0) return { valor: c.leads, tipo: "leads" };
    return { valor: c.mensagens, tipo: c.mensagens > 0 ? "mensagens" : "compras" };
  }
  if (pedido === "leads") {
    if (c.leads > 0) return { valor: c.leads, tipo: "leads" };
    return { valor: c.mensagens, tipo: c.mensagens > 0 ? "mensagens" : "leads" };
  }
  return { valor: c.mensagens, tipo: "mensagens" };
}

export interface ResultadoSomado {
  resultados: number;
  /** O tipo que domina (≥ 80% do total) ou "misto". Sem resultado: o tipo pedido pela maioria. */
  tipo: TipoResultadoConta;
  porTipo: Contagem;
}

/** Soma os resultados de várias campanhas (a conta num dia, por exemplo). */
export function somarResultados(itens: ResultadoCampanha[]): ResultadoSomado {
  const porTipo: Contagem = { mensagens: 0, leads: 0, compras: 0 };
  for (const i of itens) porTipo[i.tipo] += i.valor;
  const resultados = porTipo.mensagens + porTipo.leads + porTipo.compras;
  return { resultados, tipo: tipoDominante(porTipo, itens.map((i) => i.tipo)), porTipo };
}

export function tipoDominante(c: Contagem, pedidos: TipoResultado[] = []): TipoResultadoConta {
  const total = c.mensagens + c.leads + c.compras;
  if (total === 0) {
    // Sem resultado nenhum: rotula pelo que as campanhas PEDEM (conta de cadastro zerada é "0 leads").
    const conta = { mensagens: 0, leads: 0, compras: 0 } as Contagem;
    for (const p of pedidos) conta[p]++;
    const max = (Object.keys(conta) as TipoResultado[]).sort((a, b) => conta[b] - conta[a])[0];
    return pedidos.length ? max : "mensagens";
  }
  for (const t of ["mensagens", "leads", "compras"] as const) {
    if (c[t] / total >= 0.8) return t;
  }
  return "misto";
}

/**
 * Sem o objetivo por campanha (só as ações da CONTA): conversas, como sempre — a não ser que a conta
 * não tenha conversa nenhuma e tenha lead ou compra. Usado onde só existe a leitura da conta.
 */
export function resultadoSemObjetivo(actions?: Acao[] | null): ResultadoCampanha {
  const c = contarPorTipo(actions);
  if (c.mensagens > 0) return { valor: c.mensagens, tipo: "mensagens" };
  if (c.leads > 0) return { valor: c.leads, tipo: "leads" };
  if (c.compras > 0) return { valor: c.compras, tipo: "compras" };
  return { valor: 0, tipo: "mensagens" };
}

/** A conta tem lead ou compra? Só então vale pagar a leitura por campanha (com objetivo). */
export function temLeadOuCompra(actions?: Acao[] | null): boolean {
  const c = contarPorTipo(actions);
  return c.leads > 0 || c.compras > 0;
}

export const ROTULO_RESULTADO: Record<TipoResultadoConta, { um: string; varios: string; custo: string }> = {
  mensagens: { um: "conversa",  varios: "conversas",  custo: "custo por conversa" },
  leads:     { um: "lead",      varios: "leads",      custo: "custo por lead" },
  compras:   { um: "compra",    varios: "compras",    custo: "custo por compra" },
  misto:     { um: "resultado", varios: "resultados", custo: "custo por resultado" },
};

/** "1 conversa", "12 leads", "0 resultados". */
export function rotularResultado(n: number, tipo: TipoResultadoConta | null | undefined): string {
  const r = ROTULO_RESULTADO[tipo ?? "mensagens"];
  return `${n.toLocaleString("pt-BR")} ${n === 1 ? r.um : r.varios}`;
}

/** Valida o que veio do banco (result_kind). */
export function comoTipoResultado(v: unknown): TipoResultadoConta | null {
  return v === "mensagens" || v === "leads" || v === "compras" || v === "misto" ? v : null;
}
