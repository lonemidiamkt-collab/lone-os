// lib/clientes/radar-renovacao.ts — RADAR DE RENOVAÇÃO DE CONTRATO (Leva 7C, N22). Módulo PURO.
//
// Quem está a 60 ou 30 dias do fim do contrato e AINDA NÃO tem renovação andando. Só DATAS — nenhum
// valor de contrato sai daqui (pedido do CEO: nada de faturamento da agência no painel). A entrada nem
// aceita valor: quem monta as linhas seleciona só id, cliente, status, datas e o elo de versão.
//
// "Renovação em andamento" = existe outro contrato do mesmo cliente que continua este: rascunho de
// renovação (renewal_draft_of — o cron contract-renewal cria aos 30 dias), contrato seguinte
// (previous_contract_id) ou uma versão mais nova que não seja vencida. Contrato com renovação já
// andando não entra no radar: ele é para o que está parado.

export interface ContratoRadarRow {
  id: string;
  client_id: string;
  status: string | null;
  end_date: string | null;
  version: number | null;
  renewal_draft_of?: string | null;
  previous_contract_id?: string | null;
}

export interface ClienteRadarRow { id: string; nome: string; social?: string | null }

export type FaixaRadar = "30" | "60";

export interface ItemRadar {
  clientId: string;
  cliente: string;
  contratoId: string;
  fim: string;           // YYYY-MM-DD
  dias: number;          // dias até o fim (0 = hoje)
  faixa: FaixaRadar;     // ≤ 30 dias ou 31–60
  social: string | null; // quem conversa com o cliente
}

export interface RadarRenovacao {
  itens: ItemRadar[];
  /** Quantos estão na janela de 60 dias mas já têm renovação andando (fora da lista). */
  emAndamento: number;
}

export const JANELA_RADAR = 60;
export const FAIXA_URGENTE = 30;

/** Dias inteiros entre dois YYYY-MM-DD (fim − hoje). */
export function diasAte(hoje: string, fim: string): number {
  const a = Date.parse(`${hoje}T12:00:00Z`);
  const b = Date.parse(`${fim.slice(0, 10)}T12:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/** O contrato já tem continuação (rascunho, seguinte ou versão mais nova viva)? */
export function temRenovacaoAndando(c: ContratoRadarRow, doCliente: ContratoRadarRow[]): boolean {
  return doCliente.some((o) => {
    if (o.id === c.id) return false;
    const st = (o.status ?? "").toLowerCase();
    if (st === "expired" || st.startsWith("cancel")) return false;
    if (o.renewal_draft_of === c.id || o.previous_contract_id === c.id) return true;
    return (o.version ?? 0) > (c.version ?? 0);
  });
}

export function montarRadar(contratos: ContratoRadarRow[], clientes: ClienteRadarRow[], hoje: string): RadarRenovacao {
  const porCliente = new Map<string, ContratoRadarRow[]>();
  for (const c of contratos) (porCliente.get(c.client_id) ?? porCliente.set(c.client_id, []).get(c.client_id)!).push(c);
  const nome = new Map(clientes.map((c) => [c.id, c]));

  const itens: ItemRadar[] = [];
  let emAndamento = 0;
  for (const c of contratos) {
    if ((c.status ?? "").toLowerCase() !== "active" || !c.end_date) continue;
    const cli = nome.get(c.client_id);
    if (!cli) continue; // cliente fora da carteira (encerrado, rascunho): não é renovação a fazer
    const dias = diasAte(hoje, c.end_date);
    if (dias < 0 || dias > JANELA_RADAR) continue;
    if (temRenovacaoAndando(c, porCliente.get(c.client_id) ?? [])) { emAndamento += 1; continue; }
    itens.push({
      clientId: c.client_id, cliente: cli.nome, contratoId: c.id, fim: c.end_date.slice(0, 10), dias,
      faixa: dias <= FAIXA_URGENTE ? "30" : "60", social: cli.social ?? null,
    });
  }
  // Um cliente com dois contratos ativos na janela aparece pelo que vence primeiro.
  const unicos = new Map<string, ItemRadar>();
  for (const i of itens.sort((a, b) => a.dias - b.dias)) if (!unicos.has(i.clientId)) unicos.set(i.clientId, i);
  return { itens: [...unicos.values()], emAndamento };
}

/** Frase curta de prazo: "vence hoje", "vence amanhã", "vence em 12 dias". */
export function prazoRadar(dias: number): string {
  if (dias <= 0) return "vence hoje";
  if (dias === 1) return "vence amanhã";
  return `vence em ${dias} dias`;
}
