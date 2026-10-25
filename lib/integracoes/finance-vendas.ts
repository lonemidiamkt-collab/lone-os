// lib/integracoes/finance-vendas.ts — as VENDAS GANHAS do Comercial para o sistema financeiro privado dos sócios (out/2026).
//
// Fase 2 da integração (24/10/2026): "venda ganha vira contrato no Finance". O spec do Finance (§14) prevê receber do
// Lone OS o plano e o valor mensal; a porta de clientes (finance-clientes.ts) continua sem valor nenhum — esta porta é
// separada e leva SÓ o que o Comercial negociou: mensalidade, implantação, data do ganho e o cadastro ligado.
// O Finance não grava contrato sozinho: mostra a venda na Conferência e o sócio confirma (com motivo e autenticador).
// Direção única: o Finance lê; o Lone OS não sabe se virou contrato.
//
// Puro (sem banco, sem relógio): a rota /api/integracoes/finance/vendas busca as linhas e chama montar().

import { diaSP } from "@/lib/integracoes/finance-clientes";
import { normalizarEtapa } from "@/lib/crm/etapas";

export const CAMINHO_VENDAS = "/api/integracoes/finance/vendas";

export interface LinhaLeadGanho {
  id: string;
  empresa: string | null;
  contato_nome: string | null;
  estagio: string | null;
  valor_orcamento: number | string | null;
  valor_implantacao: number | string | null;
  fechado_em: string | null;
  updated_at: string | null;
}

export interface LinhaClienteDaVenda {
  id: string;
  source_lead_id: string | null;
  draft_status: string | null;
}

export interface VendaParaFinance {
  leadId: string;
  empresa: string;
  /** Dia do ganho (AAAA-MM-DD, São Paulo). */
  ganhoEm: string | null;
  /** Mensalidade negociada em centavos; null = não informada no Comercial. */
  mensalidadeCentavos: number | null;
  /** Taxa única de implantação em centavos; null = não tem. */
  implantacaoCentavos: number | null;
  /** Cadastro do Lone OS ligado ao lead (clients.source_lead_id); null = ainda sem cadastro. */
  clienteId: string | null;
  /** O cadastro existe mas o cliente ainda não preencheu o link. */
  cadastroPendente: boolean;
}

const centavos = (v: number | string | null): number | null => {
  const n = typeof v === "string" ? Number(v) : v;
  return n != null && Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
};

export function montarVendasParaFinance(leads: LinhaLeadGanho[], clientes: LinhaClienteDaVenda[]): VendaParaFinance[] {
  const clientePorLead = new Map<string, LinhaClienteDaVenda>();
  for (const c of clientes) if (c.source_lead_id && !clientePorLead.has(c.source_lead_id)) clientePorLead.set(c.source_lead_id, c);
  return leads
    .filter((l) => normalizarEtapa(l.estagio ?? "") === "ganho")
    .map((l) => {
      const c = clientePorLead.get(l.id);
      return {
        leadId: l.id,
        empresa: (l.empresa || l.contato_nome || "(sem nome)").replace(/\s+/g, " ").trim().slice(0, 200),
        ganhoEm: diaSP(l.fechado_em) ?? diaSP(l.updated_at),
        mensalidadeCentavos: centavos(l.valor_orcamento),
        implantacaoCentavos: centavos(l.valor_implantacao),
        clienteId: c?.id ?? null,
        cadastroPendente: c?.draft_status === "pending_invite",
      };
    })
    .sort((a, b) => (b.ganhoEm ?? "").localeCompare(a.ganhoEm ?? ""));
}
