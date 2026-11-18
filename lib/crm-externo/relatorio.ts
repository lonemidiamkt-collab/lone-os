// lib/crm-externo/relatorio.ts — o bloco "ATENDIMENTO E VENDAS" do relatório (semanal, mensal) e do portal.
// Módulo PURO: recebe as métricas do período e do anterior (lib/crm-externo/metricas.ts) e devolve o que o PDF e o
// portal desenham. Os dois usam ESTE módulo — o cliente vê no painel o mesmo número que recebeu no PDF.
//
// Comparação: a MESMA regra do relatório da Meta e do Google (janelaAnterior: mês × mês anterior inteiro; semana ×
// semana anterior). As duas leituras são feitas no CRM, cada uma com a sua janela exata.
//
// Bloco indisponível no período atual NÃO vira zero: some do bloco e volta em `faltando` (o relatório avisa o time).
// Indisponível só no período anterior: o número aparece, sem comparação.

import { variacao, tomDaVariacao, type Natureza, type Tom } from "@/components/ui/painel-comparativo-utils";
import { vocabulario, LIMIAR_NEUTRO, type Janela, type Vocabulario } from "@/lib/reports/relatorioCliente";
import { ROTULO_BLOCO, ROTULO_PROVEDOR, type BlocoCrm, type MetricasCrm, type ProvedorCrm } from "./metricas";

export type FormatoCrm = "inteiro" | "dinheiro" | "duracao" | "horas" | "pct";

export interface KpiCrm {
  chave: string;
  rotulo: string;
  valor: number | null;
  anterior: number | null;
  variacaoPct: number | null;
  natureza: Natureza;
  tom: Tom;
  formato: FormatoCrm;
  nota: string | null;
}

export interface RelatorioCrm {
  provedor: ProvedorCrm;
  rotuloProvedor: string;
  janela: Janela;
  anterior: Janela | null;
  vocab: Vocabulario;
  frase: string;
  kpis: KpiCrm[];
  /** primeira resposta pela régua de 5 e 10 minutos — null quando o CRM não mede */
  resposta: { boa: number; atencao: number; estourada: number; p90Seg: number | null } | null;
  /** foto de agora */
  funil: { etapa: string; negocios: number }[] | null;
  abertos: { quantidade: number; valorCentavos: number | null } | null;
  recuperadas: { negocios: number; valorCentavos: number } | null;
  /** blocos que o CRM não respondeu no período (vai para o time, nunca para o cliente como zero) */
  faltando: string[];
  /** nada para mostrar (tudo indisponível): o bloco não entra no PDF */
  semDados: boolean;
}

// ── Formatos ─────────────────────────────────────────────────────────────────

const inteiro = (v: number) => Math.round(v).toLocaleString("pt-BR");
const umaCasa = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

/** 45 s · 4 min · 1 h 20 min · 2,5 dias */
export function formatarDuracao(seg: number): string {
  if (seg < 60) return `${Math.max(0, Math.round(seg))} s`;
  const min = Math.round(seg / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), r = min % 60;
  if (h < 24) return r ? `${h} h ${r} min` : `${h} h`;
  return `${umaCasa(seg / 86_400)} dias`;
}

/** 5 h · 2,3 dias */
export function formatarHoras(h: number): string {
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
  if (h < 48) return `${umaCasa(h)} h`;
  return `${umaCasa(h / 24)} dias`;
}

export function formatarCentavos(c: number): string {
  return (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: c >= 100_000 ? 0 : 2 });
}

export function formatarCrm(v: number | null, f: FormatoCrm): string {
  if (v == null || !Number.isFinite(v)) return "—";
  switch (f) {
    case "inteiro": return inteiro(v);
    case "dinheiro": return formatarCentavos(v);
    case "duracao": return formatarDuracao(v);
    case "horas": return formatarHoras(v);
    case "pct": return `${Math.round(v)}%`;
  }
}

// ── Montagem ─────────────────────────────────────────────────────────────────

function kpi(chave: string, rotulo: string, valor: number | null, anterior: number | null, natureza: Natureza, formato: FormatoCrm, nota: string | null = null): KpiCrm {
  const v = variacao(valor, anterior);
  return { chave, rotulo, valor, anterior, variacaoPct: v, natureza, tom: tomDaVariacao(v, natureza, LIMIAR_NEUTRO), formato, nota };
}

const pctBoa = (m: MetricasCrm) => {
  const f = m.resposta?.faixas;
  const total = f ? f.boa + f.atencao + f.estourada : 0;
  return f && total > 0 ? (f.boa / total) * 100 : null;
};
const pctConv = (m: MetricasCrm) => (m.conversao && m.conversao.leads > 0 ? (m.conversao.convertidos / m.conversao.leads) * 100 : null);

export interface EntradaCrm {
  provedor: ProvedorCrm;
  janela: Janela;
  anterior: Janela | null;
  atual: MetricasCrm;
  /** null = sem comparação (a leitura do anterior falhou ou não foi feita) */
  doAnterior: MetricasCrm | null;
}

export function montarRelatorioCrm(e: EntradaCrm): RelatorioCrm {
  const a = e.atual, p = e.doAnterior;
  const ant = p ? e.anterior : null;
  const vocab = vocabulario(e.janela, ant);
  const kpis: KpiCrm[] = [];
  const add = (k: KpiCrm | null) => { if (k && k.valor != null) kpis.push(k); };

  add(a.leads != null ? kpi("leads", "Leads", a.leads, p?.leads ?? null, "direta", "inteiro", "Contatos que chegaram no período") : null);
  add(a.resposta ? kpi("resposta", "Tempo de resposta", a.resposta.medianaSeg, p?.resposta?.medianaSeg ?? null, "inversa", "duracao",
    "Mediana da primeira resposta ao lead") : null);
  add(a.resposta ? kpi("resposta_boa", "Respondidos em menos de 5 min", pctBoa(a), p ? pctBoa(p) : null, "direta", "pct") : null);
  add(a.vendas ? kpi("vendas", "Vendas", a.vendas.quantidade, p?.vendas?.quantidade ?? null, "direta", "inteiro") : null);
  add(a.vendas?.valorCentavos != null ? kpi("faturamento", "Vendido", a.vendas.valorCentavos, p?.vendas?.valorCentavos ?? null, "direta", "dinheiro",
    "Soma das vendas fechadas no período") : null);
  add(a.orcamentos ? kpi("orcamentos", "Orçamentos", a.orcamentos.quantidade, p?.orcamentos?.quantidade ?? null, "direta", "inteiro",
    e.provedor === "kommo" ? "Negócios que entraram na etapa de orçamento" : "Orçamentos criados no período") : null);
  add(a.ciclo ? kpi("ciclo", "Ciclo de venda", a.ciclo.medianaHoras, p?.ciclo?.medianaHoras ?? null, "inversa", "horas",
    a.ciclo.contados ? `Mediana de ${a.ciclo.contados} venda${a.ciclo.contados === 1 ? "" : "s"}, do primeiro contato ao fechamento` : null) : null);
  add(a.conversao ? kpi("conversao", "Conversão", pctConv(a), p ? pctConv(p) : null, "direta", "pct", "Dos leads do período, quantos já compraram") : null);
  add(a.perdidos != null ? kpi("perdidos", "Perdidos", a.perdidos, p?.perdidos ?? null, "inversa", "inteiro") : null);

  const faltando = a.indisponivel.map((b: BlocoCrm) => ROTULO_BLOCO[b]);
  const f = a.resposta?.faixas;
  const r: RelatorioCrm = {
    provedor: e.provedor,
    rotuloProvedor: ROTULO_PROVEDOR[e.provedor],
    janela: e.janela,
    anterior: ant,
    vocab,
    frase: "",
    kpis,
    resposta: f && f.boa + f.atencao + f.estourada > 0 ? { ...f, p90Seg: a.resposta?.p90Seg ?? null } : null,
    funil: a.funil,
    abertos: a.abertos,
    recuperadas: a.recuperadas && a.recuperadas.negocios > 0 ? a.recuperadas : null,
    faltando,
    semDados: kpis.length === 0 && !a.funil?.length,
  };
  r.frase = fraseDoCrm(r);
  return r;
}

const pctAbs = (v: number) => `${Math.round(Math.abs(v))}%`;

function comparacao(k: KpiCrm | undefined, vocab: Vocabulario): string {
  if (!k || k.variacaoPct == null || Math.abs(k.variacaoPct) <= LIMIAR_NEUTRO) return "";
  return ` (${pctAbs(k.variacaoPct)} ${k.variacaoPct > 0 ? "a mais" : "a menos"} que ${vocab.referenciaAnterior})`;
}

/** "Na última semana, chegaram 42 leads (12% a mais que na semana anterior), a primeira resposta saiu em 3 min e foram 8 vendas, somando R$ 12.400." */
export function fraseDoCrm(r: RelatorioCrm): string {
  const k = (c: string) => r.kpis.find((x) => x.chave === c);
  const partes: string[] = [];
  const leads = k("leads"), resp = k("resposta"), vendas = k("vendas"), fat = k("faturamento");
  if (leads) partes.push(leads.valor === 0 ? "não chegou lead novo" : `${leads.valor === 1 ? "chegou 1 lead" : `chegaram ${inteiro(leads.valor!)} leads`}${comparacao(leads, r.vocab)}`);
  if (resp) partes.push(`a primeira resposta saiu em ${formatarDuracao(resp.valor!)} (mediana)`);
  if (vendas) {
    const v = vendas.valor!;
    const total = fat && fat.valor! > 0 ? `, somando ${formatarCentavos(fat.valor!)}` : "";
    partes.push(v === 0 ? "nenhuma venda foi fechada" : `${v === 1 ? "foi fechada 1 venda" : `foram fechadas ${inteiro(v)} vendas`}${total}${comparacao(fat ?? vendas, r.vocab)}`);
  }
  if (!partes.length) return `${r.vocab.abertura}, o ${r.rotuloProvedor} registrou o funil abaixo.`;
  const ultimo = partes.pop()!;
  return `${r.vocab.abertura}, ${partes.length ? `${partes.join(", ")} e ${ultimo}` : ultimo}.`;
}
