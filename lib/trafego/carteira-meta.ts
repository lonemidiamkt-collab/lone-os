// lib/trafego/carteira-meta.ts — regras PURAS da visão "Carteira" da aba Anúncios Meta (repaginada em 19/11/2026).
//
// O problema que isto resolve: a visão "Todos" da aba somava só o que alguém tinha ABERTO (meta_campaign_cache) —
// 51 de 53 clientes apareciam "sem leitura" e o total da carteira era de 2 clientes. Mas o servidor já grava a conta
// de cada cliente DIA A DIA (metric_snapshots, defense-scan) e a frequência por anúncio (meta_ad_period). A carteira
// agora sai daí: sempre cheia, sem chamar a Meta, comparando o período com o anterior.
//
// Sinais (pesquisa nov/2026 — Meta pós-Andromeda, negócio local, mensagem no WhatsApp/Direct como resultado):
//   · conta com problema (pagamento falhou, carência, análise) e saldo pré-pago para menos de 3 dias → crítico;
//   · gasto parado 2 dias seguidos depois de gastar → crítico; sem resultado com gasto → atenção;
//   · custo por resultado 50%+ acima do período anterior → atenção;
//   · frequência de 7 dias acima de 3 (público local satura rápido) → criativo cansando;
//   · CTR abaixo de 0,8% → criativo/oferta fraca (referência de mercado para serviço local);
//   · ritmo do mês contra a verba (mesma régua de Contas & Verba).
// Testado em tests/trafego-carteira-meta.test.ts.

import { ritmoDoMes, lerRitmo, type RitmoMes, type LeituraRitmo } from "@/lib/trafego/contas-verba";
import { metaAccountStatus } from "@/lib/budgets/account-status";
import type { Gravidade, Sinal } from "@/lib/google/carteira";

export type { Gravidade, Sinal };

export interface DiaMeta {
  metric_date: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;          // conversas iniciadas
  results: number | null;       // resultado pelo objetivo (Leva 7A); null antes da migração
  result_kind: string | null;
  leads?: number | null;
}

export interface ContaMeta {
  monthly_budget: number | null;
  current_month_spend: number | null;
  last_3d_avg_spend: number | null;
  last_balance: number | null;
  is_prepaid: boolean | null;
  account_status: number | null;
  sync_error: string | null;
}

export interface TotaisMeta { gasto: number; impressoes: number; cliques: number; resultados: number; conversas: number; dias: number }

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Uma linha por dia (o defense-scan antigo chegou a gravar cópias do mesmo dia: fica a de maior gasto). Pura. */
export function umPorDia(dias: readonly DiaMeta[]): DiaMeta[] {
  const m = new Map<string, DiaMeta>();
  for (const d of dias) {
    const k = d.metric_date.slice(0, 10);
    const atual = m.get(k);
    if (!atual || Number(d.spend) > Number(atual.spend)) m.set(k, { ...d, metric_date: k });
  }
  return [...m.values()].sort((a, b) => a.metric_date.localeCompare(b.metric_date));
}

/** Resultado do dia: pelo objetivo quando existe; sem ele, as conversas. */
const resultadoDoDia = (d: DiaMeta) => (d.results != null ? Number(d.results) : Number(d.conversions));

export function somarMeta(dias: readonly DiaMeta[]): TotaisMeta {
  const t: TotaisMeta = { gasto: 0, impressoes: 0, cliques: 0, resultados: 0, conversas: 0, dias: 0 };
  for (const d of dias) {
    t.gasto += Number(d.spend); t.impressoes += Number(d.impressions); t.cliques += Number(d.clicks);
    t.resultados += resultadoDoDia(d); t.conversas += Number(d.conversions);
    if (Number(d.spend) > 0) t.dias++;
  }
  t.gasto = r2(t.gasto);
  return t;
}

const ROTULO_RESULTADO: Record<string, string> = {
  mensagens: "conversas", misto: "resultados",
  messages: "conversas", conversas: "conversas", leads: "leads", lead: "leads", purchases: "compras", compras: "compras",
  link_clicks: "cliques", clicks: "cliques", reach: "alcance", engagement: "engajamentos", video_views: "visualizações",
};
/** O tipo de resultado mais frequente no período ("conversas", "leads"…). */
export function tipoDeResultado(dias: readonly DiaMeta[]): string {
  const cont = new Map<string, number>();
  for (const d of dias) if (d.result_kind) cont.set(d.result_kind, (cont.get(d.result_kind) ?? 0) + 1);
  const top = [...cont.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  return top ? ROTULO_RESULTADO[top.toLowerCase()] ?? top.toLowerCase() : "resultados";
}

export interface EntradaLinhaMeta {
  hoje: string;
  /** Período e o anterior do mesmo tamanho (datas YYYY-MM-DD, inclusive). */
  periodo: { de: string; ate: string };
  anterior: { de: string; ate: string };
  dias: readonly DiaMeta[];
  conta: ContaMeta | null;
  /** Frequência de 7 dias da conta (impressões ÷ alcance dos anúncios), null quando não há leitura. */
  frequencia7d: number | null;
}

export interface LinhaMeta {
  atual: TotaisMeta;
  anterior: TotaisMeta;
  tipoResultado: string;
  custoPorResultado: number | null;
  custoPorResultadoAnterior: number | null;
  ctr: number | null;            // %
  cpm: number | null;
  frequencia7d: number | null;
  diasNoPeriodo: number;
  diasComDado: number;
  ritmo: RitmoMes;
  leitura: LeituraRitmo;
  diasDeSaldo: number | null;    // pré-pago: saldo ÷ média de 3 dias
  serie: { dia: string; gasto: number; resultados: number }[];
  sinais: Sinal[];
}

const ordem: Record<Gravidade, number> = { critico: 0, atencao: 1, info: 2 };
const brl0 = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

function diasEntre(de: string, ate: string): string[] {
  const out: string[] = [];
  for (let t = Date.parse(`${de}T12:00:00Z`); t <= Date.parse(`${ate}T12:00:00Z`); t += 86_400_000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

export function montarLinhaMeta(e: EntradaLinhaMeta): LinhaMeta {
  const todos = umPorDia(e.dias);
  const no = (j: { de: string; ate: string }) => todos.filter((d) => d.metric_date >= j.de && d.metric_date <= j.ate);
  const doPeriodo = no(e.periodo);
  const atual = somarMeta(doPeriodo);
  const anterior = somarMeta(no(e.anterior));
  const custoPorResultado = atual.resultados > 0 ? r2(atual.gasto / atual.resultados) : null;
  const custoPorResultadoAnterior = anterior.resultados > 0 ? r2(anterior.gasto / anterior.resultados) : null;
  const ctr = atual.impressoes > 0 ? Math.round((atual.cliques / atual.impressoes) * 10_000) / 100 : null;
  const cpm = atual.impressoes > 0 ? r2((atual.gasto / atual.impressoes) * 1000) : null;
  const calendario = diasEntre(e.periodo.de, e.periodo.ate);
  const porDia = new Map(doPeriodo.map((d) => [d.metric_date, d]));
  const serie = calendario.map((dia) => {
    const d = porDia.get(dia);
    return { dia, gasto: d ? r2(Number(d.spend)) : 0, resultados: d ? resultadoDoDia(d) : 0 };
  });

  const c = e.conta;
  const ritmo = ritmoDoMes({ verba: c?.monthly_budget ?? null, gasto: c?.current_month_spend ?? null, hoje: e.hoje });
  const leitura = lerRitmo(ritmo, c?.last_3d_avg_spend ?? null);
  const media3d = c?.last_3d_avg_spend ?? null;
  const diasDeSaldo = c?.is_prepaid && c.last_balance != null && media3d != null && media3d > 0 ? Math.round((c.last_balance / media3d) * 10) / 10 : null;

  const sinais: Sinal[] = [];
  if (c) {
    const st = metaAccountStatus(c.account_status);
    if (st.gravidade === "critical") sinais.push({ gravidade: "critico", titulo: `Conta: ${st.label}`, detalhe: `A conta está ${st.frase}. Os anúncios param até resolver.` });
    else if (st.gravidade === "paused" && c.account_status != null) sinais.push({ gravidade: "atencao", titulo: `Conta ${st.label.toLowerCase()}` });
    else if (st.gravidade === "review" && c.account_status != null) sinais.push({ gravidade: "atencao", titulo: st.label });
    if (c.sync_error) sinais.push({ gravidade: "atencao", titulo: "Leitura da Meta falhou", detalhe: c.sync_error });
  } else {
    sinais.push({ gravidade: "atencao", titulo: "Conta não sincronizada", detalhe: "A conta de anúncio ainda não aparece em Contas & Verba." });
  }
  if (diasDeSaldo != null && diasDeSaldo < 3) sinais.push({ gravidade: "critico", titulo: diasDeSaldo < 1 ? "Saldo acaba hoje" : `Saldo para ~${Math.floor(diasDeSaldo)} ${Math.floor(diasDeSaldo) === 1 ? "dia" : "dias"}`, detalhe: "Peça a recarga (Pix/boleto) ao cliente." });

  // Parou de gastar: os 2 últimos dias do período sem gasto, depois de ter gastado nele.
  const ult2 = serie.slice(-2);
  if (atual.gasto > 0 && ult2.length === 2 && ult2.every((d) => d.gasto === 0)) {
    sinais.push({ gravidade: "critico", titulo: "Sem gasto há 2 dias", detalhe: "Confira pagamento, reprovação ou campanha pausada." });
  } else if (atual.gasto === 0 && anterior.gasto > 0) {
    sinais.push({ gravidade: "critico", titulo: "Sem gasto no período", detalhe: `Gastou ${brl0(anterior.gasto)} no período anterior.` });
  }
  if (atual.gasto >= 30 && atual.resultados === 0) sinais.push({ gravidade: "atencao", titulo: "Sem resultado no período", detalhe: `${brl0(atual.gasto)} gastos sem ${tipoDeResultado(doPeriodo)}.` });
  else if (custoPorResultado != null && custoPorResultadoAnterior != null && anterior.resultados >= 3 && custoPorResultado > custoPorResultadoAnterior * 1.5) {
    sinais.push({ gravidade: "atencao", titulo: `Custo por resultado +${Math.round((custoPorResultado / custoPorResultadoAnterior - 1) * 100)}%`, detalhe: `${brl0(custoPorResultado)} contra ${brl0(custoPorResultadoAnterior)} no período anterior.` });
  }
  if (e.frequencia7d != null && e.frequencia7d > 3) sinais.push({ gravidade: "atencao", titulo: `Frequência ${e.frequencia7d.toFixed(1).replace(".", ",")}`, detalhe: "A mesma pessoa vê o anúncio mais de 3× por semana: hora de criativo novo (formato ou ângulo diferente)." });
  if (ctr != null && atual.impressoes >= 1000 && ctr < 0.8) sinais.push({ gravidade: "info", titulo: `CTR ${ctr.toFixed(2).replace(".", ",")}%`, detalhe: "Abaixo de 0,8%: o criativo ou a oferta não está chamando clique." });
  if (leitura.tom === "acima") sinais.push({ gravidade: "atencao", titulo: leitura.titulo, detalhe: leitura.detalhe ?? undefined });
  else if (leitura.tom === "abaixo") sinais.push({ gravidade: "info", titulo: "Abaixo do ritmo", detalhe: leitura.detalhe ?? undefined });

  return {
    atual, anterior, tipoResultado: tipoDeResultado(doPeriodo.length ? doPeriodo : todos),
    custoPorResultado, custoPorResultadoAnterior, ctr, cpm, frequencia7d: e.frequencia7d,
    diasNoPeriodo: calendario.length, diasComDado: doPeriodo.length,
    ritmo, leitura, diasDeSaldo, serie,
    sinais: sinais.sort((a, b) => ordem[a.gravidade] - ordem[b.gravidade]),
  };
}

/** Frequência da conta a partir dos anúncios do último retrato de 7 dias: Σ impressões ÷ Σ alcance. Pura. */
export function frequenciaDaConta(anuncios: readonly { ate: string; impressions: number | null; reach: number | null }[]): number | null {
  if (!anuncios.length) return null;
  const ultimo = anuncios.reduce((m, a) => (a.ate > m ? a.ate : m), anuncios[0].ate);
  let imp = 0, alc = 0;
  for (const a of anuncios) if (a.ate === ultimo) { imp += a.impressions ?? 0; alc += a.reach ?? 0; }
  return alc > 0 ? Math.round((imp / alc) * 100) / 100 : null;
}
