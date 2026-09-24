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
    // "1.500,50" (como se digita no Brasil) ou "1500.50".
    const txt = String(b.amount).trim().replace(/^R\$\s*/, "");
    const v = typeof b.amount === "number" ? b.amount : Number(txt.includes(",") ? txt.replace(/\./g, "").replace(",", ".") : txt);
    if (!Number.isFinite(v) || v < 0 || v > 10_000_000) return { ok: false, erro: "Valor da venda inválido." };
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
  investimento: number | null;
  custoPorVenda: number | null;
  /** Faturamento ÷ investimento (só com valor informado). */
  retorno: number | null;
  ticketMedio: number | null;
}

/** `gastoPorDia`: investimento do cliente por dia (uma entrada por dia fechado do período). */
export function resumoVendas(vendas: Pick<VendaRegistro, "quantity" | "amount">[], gastoPorDia: number[] | null): ResumoVendas {
  const total = vendas.reduce((s, v) => s + (v.quantity || 0), 0);
  const comValor = vendas.filter((v) => v.amount != null);
  const faturamento = comValor.length ? comValor.reduce((s, v) => s + Number(v.amount), 0) : null;
  const vendasComValor = comValor.reduce((s, v) => s + (v.quantity || 0), 0);
  const investimento = gastoPorDia ? gastoPorDia.reduce((s, g) => s + g, 0) : null;
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
