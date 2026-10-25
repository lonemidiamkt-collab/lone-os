// lib/trafego/vendas.ts — VENDAS DO CLIENTE × INVESTIMENTO (Leva 7A, N9). Regras puras.
//
// O anúncio traz conversa; quem fecha a venda é o cliente — e a Meta nunca fica sabendo. Aqui o
// cliente (no portal) ou o time (CS/tráfego) registra as vendas que vieram dos anúncios, e o sistema
// mostra o CUSTO POR VENDA (investimento em anúncio ÷ vendas) e o retorno (faturamento ÷ investimento).
// É o dinheiro DO CLIENTE (o que ele investiu na Meta e o que ele vendeu) — nada da agência.
//
// Tabela client_sales (migração 20260925120000). Investimento = metric_snapshots (dias fechados).
// Testado em tests/trafego-vendas.test.ts.

export interface VendaRegistro {
  id: string;
  client_id: string;
  sold_on: string;
  quantity: number;
  amount: number | null;
  channel: string | null;
  note: string | null;
  source: "interno" | "portal";
  created_by: string | null;
  created_at: string;
}

export const CANAIS_VENDA = ["whatsapp", "loja", "telefone", "site", "outro"] as const;
export type CanalVenda = (typeof CANAIS_VENDA)[number];
export const ROTULO_CANAL: Record<CanalVenda, string> = {
  whatsapp: "WhatsApp", loja: "Na loja", telefone: "Telefone", site: "Site", outro: "Outro",
};

export interface NovaVenda {
  soldOn: string;
  quantity: number;
  amount: number | null;
  channel: CanalVenda | null;
  note: string | null;
}

// ─── Valor em reais como o cliente digita ───────────────────────────────────
// POR QUE (24/10/2026, auditoria de erro recuperável, item 1.8). O valor só tratava o ponto como
// milhar quando havia vírgula: "1.500" virava R$ 1,50 e "45.000" virava R$ 45 — e a venda entrava
// assim no faturamento e no retorno do portal. Agora:
//   · com vírgula: ponto é milhar, vírgula é centavo ("1.500,50", "45,5");
//   · sem vírgula: "1.500" / "45.000" / "1.500.000" (grupos de 3) é milhar; "1500.50" (1 ou 2 casas
//     depois de UM ponto) é centavo, como vem de planilha; o resto não é entendido;
//   · não entendido = null — quem chama mostra o erro, nunca grava um número inventado.

/** Valor em reais; null = vazio ou não entendido. Número passa como está (se for válido). */
export function lerReais(entrada: unknown): number | null {
  if (typeof entrada === "number") return Number.isFinite(entrada) && entrada >= 0 ? entrada : null;
  if (typeof entrada !== "string") return null;
  const t = entrada.replace(/^\s*R\$/i, "").replace(/[\s\u00a0]/g, "");
  if (!t || !/^[\d.,]+$/.test(t)) return null;
  let normal: string | null = null;
  if (t.includes(",")) {
    const m = /^(\d+|\d{1,3}(?:\.\d{3})+),(\d{0,2})$/.exec(t);
    if (m) normal = `${m[1].replace(/\./g, "")}.${m[2] || "0"}`;
  } else if (/^\d+$/.test(t)) {
    normal = t;
  } else if (/^\d{1,3}(?:\.\d{3})+$/.test(t)) {
    normal = t.replace(/\./g, "");
  } else if (/^\d+\.\d{1,2}$/.test(t)) {
    normal = t;
  }
  if (normal == null) return null;
  const v = Number(normal);
  return Number.isFinite(v) ? v : null;
}

/** "R$ 1.500,00". */
export function formatarReais(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** O que o campo de valor mostra embaixo, antes de salvar. null = campo vazio (valor é opcional). */
export function previaDoValor(texto: string): { ok: true; valor: number; frase: string } | { ok: false; frase: string } | null {
  if (!texto.trim()) return null;
  const v = lerReais(texto);
  if (v == null || v > 10_000_000) return { ok: false, frase: "Não entendi o valor. Escreva assim: 1.500,00" };
  return { ok: true, valor: Math.round(v * 100) / 100, frase: `Vai salvar ${formatarReais(Math.round(v * 100) / 100)}` };
}

/** Máscara ao sair do campo: "1500" → "1.500,00". Não entendido fica como o cliente digitou. */
export function mascararReais(texto: string): string {
  const v = lerReais(texto);
  if (v == null) return texto;
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Valida o que veio da tela (ou do portal). Devolve a venda limpa ou a frase do erro. */
export function validarVenda(bruto: unknown, hoje: string): { ok: true; venda: NovaVenda } | { ok: false; erro: string } {
  const b = (bruto ?? {}) as Record<string, unknown>;
  const soldOn = typeof b.soldOn === "string" ? b.soldOn.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(soldOn) || Number.isNaN(Date.parse(`${soldOn}T12:00:00Z`))) return { ok: false, erro: "Informe a data da venda." };
  if (soldOn > hoje) return { ok: false, erro: "A data da venda não pode ser no futuro." };
  const limite = new Date(`${hoje}T12:00:00Z`); limite.setUTCDate(limite.getUTCDate() - 120);
  if (soldOn < limite.toISOString().slice(0, 10)) return { ok: false, erro: "Venda com mais de 120 dias: registre só as recentes." };
  const quantity = b.quantity == null || b.quantity === "" ? 1 : Number(b.quantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) return { ok: false, erro: "Quantidade inválida (1 a 999)." };
  let amount: number | null = null;
  if (b.amount != null && b.amount !== "") {
    // Ponto de milhar entendido (24/10/2026): antes "1.500" virava R$ 1,50 e "45.000" virava R$ 45.
    const v = lerReais(b.amount);
    if (v == null || v > 10_000_000) return { ok: false, erro: "Valor da venda inválido. Escreva assim: 1.500,00" };
    amount = Math.round(v * 100) / 100;
  }
  const channel = typeof b.channel === "string" && (CANAIS_VENDA as readonly string[]).includes(b.channel) ? (b.channel as CanalVenda) : null;
  const note = typeof b.note === "string" && b.note.trim() ? b.note.trim().slice(0, 300) : null;
  return { ok: true, venda: { soldOn, quantity, amount, channel, note } };
}

export interface ResumoVendas {
  vendas: number;
  /** Soma dos valores informados (vendas sem valor não entram). */
  faturamento: number | null;
  /** Vendas que vieram com valor. */
  vendasComValor: number;
  /** `null` = ainda não apurado (nenhum dia fechado ou nenhuma métrica lida). 0 = gastou zero de verdade. */
  investimento: number | null;
  custoPorVenda: number | null;
  /** Faturamento ÷ investimento (só com valor informado). */
  retorno: number | null;
  ticketMedio: number | null;
}

/** O que a tela diz quando `investimento` é null (portal e aba Vendas do tráfego). */
export const INVESTIMENTO_NAO_APURADO = "investimento ainda não apurado";

/**
 * Janela em que o investimento é lido: só dias FECHADOS (até ontem). `null` quando o período ainda
 * não tem nenhum dia fechado — todo dia 1º, o mês corrente vai de hoje a hoje e "ontem" é do mês
 * passado. Sem janela não há o que somar: o investimento fica "não apurado", nunca R$ 0 (21/10/2026).
 */
export function janelaDoInvestimento(desde: string, ate: string, hoje: string): { desde: string; ate: string } | null {
  const d = new Date(`${hoje}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  const ontem = d.toISOString().slice(0, 10);
  const fim = ate < hoje ? ate : ontem;
  return fim < desde ? null : { desde, ate: fim };
}

/**
 * Gasto por dia de cada cliente a partir das linhas do metric_snapshots (dia repetido vale a última).
 * Cliente SEM linha fica fora do mapa — e `resumoVendas` recebe `null`, não `[]`: "não li gasto" é
 * diferente de "gastou zero" (21/10/2026).
 */
export function gastoPorDiaDosClientes(
  linhas: { client_id: string; metric_date: string; spend: number | string | null }[],
  clientId?: string,
): Map<string, number[]> {
  const porDia = new Map<string, number>();
  for (const l of linhas) {
    if (clientId && l.client_id !== clientId) continue;
    porDia.set(`${l.client_id}|${String(l.metric_date).slice(0, 10)}`, Number(l.spend) || 0);
  }
  const out = new Map<string, number[]>();
  for (const [chave, gasto] of porDia) {
    const id = chave.split("|")[0];
    const lista = out.get(id) ?? [];
    lista.push(gasto);
    out.set(id, lista);
  }
  return out;
}

/**
 * `gastoPorDia`: investimento do cliente por dia (uma entrada por dia fechado do período).
 * `null` ou lista vazia = nenhuma linha de métrica lida → investimento `null` ("ainda não apurado").
 * Antes a lista vazia somava 0 e o portal mostrava "Custo por venda R$ 0,00" todo dia 1º (21/10/2026).
 */
export function resumoVendas(vendas: Pick<VendaRegistro, "quantity" | "amount">[], gastoPorDia: number[] | null): ResumoVendas {
  const total = vendas.reduce((s, v) => s + (v.quantity || 0), 0);
  const comValor = vendas.filter((v) => v.amount != null);
  const faturamento = comValor.length ? comValor.reduce((s, v) => s + Number(v.amount), 0) : null;
  const vendasComValor = comValor.reduce((s, v) => s + (v.quantity || 0), 0);
  const investimento = gastoPorDia && gastoPorDia.length ? gastoPorDia.reduce((s, g) => s + g, 0) : null;
  return {
    vendas: total,
    faturamento,
    vendasComValor,
    investimento,
    custoPorVenda: investimento != null && total > 0 ? investimento / total : null,
    retorno: investimento && investimento > 0 && faturamento != null ? faturamento / investimento : null,
    ticketMedio: faturamento != null && vendasComValor > 0 ? faturamento / vendasComValor : null,
  };
}

/** Primeiro e último dia de um mês "AAAA-MM" (o último limitado a `ate`, para o mês corrente). */
export function periodoDoMes(mes: string, ate: string): { desde: string; ate: string } | null {
  if (!/^\d{4}-\d{2}$/.test(mes)) return null;
  const [y, m] = mes.split("-").map(Number);
  const ultimo = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const desde = `${mes}-01`;
  const fim = ultimo < ate ? ultimo : ate;
  return fim < desde ? null : { desde, ate: fim };
}

// ─── Respostas das rotas ────────────────────────────────────────────────────

export interface RespostaVendasCliente {
  disponivel: boolean;
  desde: string;
  ate: string;
  vendas: VendaRegistro[];
  resumo: ResumoVendas;
}

export interface LinhaVendasCarteira {
  clientId: string;
  nome: string;
  gestor: string | null;
  resumo: ResumoVendas;
  ultimaVenda: string | null;
}

export interface RespostaVendasCarteira {
  disponivel: boolean;
  desde: string;
  ate: string;
  linhas: LinhaVendasCarteira[];
}
