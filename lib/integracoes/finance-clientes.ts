// lib/integracoes/finance-clientes.ts — o que o Lone OS entrega ao sistema financeiro privado dos sócios (out/2026).
//
// Direção única, decidida em 25/09/2026: o financeiro LÊ o Lone OS; o Lone OS nunca lê o financeiro (o time loga
// aqui e o agente lê este banco). Por isso este pacote leva só a SITUAÇÃO de cada cliente — entrada, serviço,
// pausa, saída, faixa de faturamento declarada — e nunca valor, telefone ou e-mail. Quem cruza com contrato e dinheiro é o outro lado.
//
// Puro (sem banco, sem relógio): a rota /api/integracoes/finance/clientes busca as linhas e chama montar().

export const CAMINHO_CLIENTES = "/api/integracoes/finance/clientes";

/** O que entra na assinatura de uma leitura (GET não tem corpo): método + caminho. */
export const mensagemAssinada = (caminho: string) => `GET ${caminho}`;

export interface LinhaCliente {
  id: string;
  name: string | null;
  service_type: string | null;
  lifecycle: string | null;
  active: boolean | null;
  draft_status: string | null;
  join_date: string | null;
  activated_at: string | null;
  paused_at: string | null;
  paused_until: string | null;
  churned_at: string | null;
  churn_category: string | null;
  churn_reason: string | null;
  source_lead_id: string | null;
  faturamento_faixa: string | null;
}

export interface LinhaSaida {
  client_id: string;
  estado: string | null;
  iniciativa: string | null;
  motivo: string | null;
  solicitado_em: string | null;
  encerra_em: string | null;
  cancelado_em: string | null;
  created_at: string;
}

export interface ClienteParaFinance {
  id: string;
  nome: string;
  /** service_type do Lone OS (lone_growth, assessoria_trafego, trafego_pago, assessoria_social…). */
  servico: string | null;
  /** ativo | encerrando | pausado | inativo */
  ciclo: string;
  ativo: boolean;
  /** Cadastro criado na venda e ainda esperando o cliente preencher o onboarding. */
  rascunho: boolean;
  entrouEm: string | null;
  pausadoDesde: string | null;
  pausadoAte: string | null;
  saiuEm: string | null;
  categoriaSaida: string | null;
  motivoSaida: string | null;
  /** Saída em andamento ou concluída pelo fluxo de encerramento (a mais recente não cancelada). */
  saida: { estado: string; iniciativa: string | null; motivo: string | null; solicitadoEm: string | null; encerraEm: string | null } | null;
  leadId: string | null;
  /** Faixa de faturamento MENSAL declarada pelo cliente (ate_30k … acima_500k, nao_informado) — lib/empresa/receita.ts.
   *  É dado do negócio do cliente, não da Lone; o porte da Receita fica de fora de propósito (é teto legal, não faturamento). */
  faixaFaturamento: string | null;
}

/** Data AAAA-MM-DD no fuso de São Paulo (timestamptz) ou a própria data (coluna date). */
export function diaSP(v: string | null): string | null {
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

const curto = (v: string | null, max = 200) => {
  const t = (v ?? "").replace(/\s+/g, " ").trim();
  return t ? t.slice(0, max) : null;
};

export function montarClientesParaFinance(clientes: LinhaCliente[], saidas: LinhaSaida[]): ClienteParaFinance[] {
  const saidaPorCliente = new Map<string, LinhaSaida>();
  for (const s of saidas) {
    if (s.cancelado_em) continue;
    const atual = saidaPorCliente.get(s.client_id);
    if (!atual || s.created_at > atual.created_at) saidaPorCliente.set(s.client_id, s);
  }
  return clientes.map((c) => {
    const s = saidaPorCliente.get(c.id);
    return {
      id: c.id,
      nome: curto(c.name, 200) ?? "(sem nome)",
      servico: c.service_type ?? null,
      ciclo: c.lifecycle ?? (c.active === false ? "inativo" : "ativo"),
      ativo: c.active !== false,
      rascunho: c.draft_status === "pending_invite",
      entrouEm: diaSP(c.join_date) ?? diaSP(c.activated_at),
      pausadoDesde: diaSP(c.paused_at),
      pausadoAte: diaSP(c.paused_until),
      saiuEm: diaSP(c.churned_at),
      categoriaSaida: curto(c.churn_category, 60),
      motivoSaida: curto(c.churn_reason),
      saida: s ? { estado: s.estado ?? "rascunho", iniciativa: s.iniciativa, motivo: curto(s.motivo), solicitadoEm: diaSP(s.solicitado_em), encerraEm: diaSP(s.encerra_em) } : null,
      leadId: c.source_lead_id ?? null,
      faixaFaturamento: c.faturamento_faixa ?? null,
    };
  });
}
