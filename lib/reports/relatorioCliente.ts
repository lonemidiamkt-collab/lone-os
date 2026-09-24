// lib/reports/relatorioCliente.ts — o RELATÓRIO DO CLIENTE (semanal e mensal) montado a partir das
// linhas cruas da Meta. Módulo PURO: sem banco, sem fetch — a leitura fica em relatorioClienteDados.ts
// e o HTML em relatorioClientePdf.ts. Testado com respostas reais da Graph API em
// tests/relatorio-cliente.test.ts.
//
// POR QUE FOI REESCRITO (24/09, PDF do Horto Naenc de 14–20/09 que o Roberto mandou):
//   - "Conjunto com melhor resultado" saía só com "R$ 4,65 por conversa", sem nome: a leitura por
//     conjunto pedia `effective_status` no `fields` do /insights — campo que NÃO existe lá. A Meta
//     recusa a chamada inteira, o código tratava a recusa como "nenhum conjunto" e caía no custo
//     médio da campanha com nome vazio. Aqui o conjunto vem de uma leitura que a Meta aceita.
//   - O gráfico arredondava o topo em 33/66/100% do pico (eixo 3/5/8) e suavizava a linha com curva
//     de Bézier — o desenho passava por valores que não existiram. Agora: eixo com passos redondos a
//     partir do zero e linha reta ligando os dias de verdade.
//   - Sem comparação com a semana anterior (o portal já tinha): agora os números e o gráfico vêm
//     com o período anterior, pela mesma conta, pra que a variação compare coisas iguais.
//   - "Mensagens" num relatório e "conversas" no resto do sistema: o nome segue o objetivo da
//     campanha (conversas, leads ou compras — lib/meta/resultado.ts).
//   - Público: ver lerPublico.

import {
  resultadoDaCampanha, tipoDominante, ROTULO_RESULTADO,
  type Contagem, type TipoResultado, type TipoResultadoConta,
} from "@/lib/meta/resultado";
import { variacao, tomDaVariacao, type Natureza, type Tom } from "@/components/ui/painel-comparativo-utils";
import { formatarBRL } from "@/lib/portal/formatos";
import { lerPublico, type LinhaDemografia, type Publico } from "@/lib/meta/publico";

export { lerPublico, type LinhaDemografia, type Publico };

type Acao = { action_type: string; value: string };

// ── Linhas cruas da Graph API (o que /act_X/insights devolve) ────────────────

/** level=campaign, time_increment=1: uma linha por campanha por dia com veiculação. */
export interface LinhaCampanhaDia {
  campaign_id?: string;
  campaign_name?: string;
  objective?: string;
  date_start?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  inline_link_clicks?: string;
  actions?: Acao[];
}

/** level=adset, período inteiro. */
export interface LinhaConjunto {
  adset_id?: string;
  adset_name?: string;
  campaign_name?: string;
  objective?: string;
  spend?: string;
  actions?: Acao[];
}

/** level=ad, período inteiro. */
export interface LinhaAnuncio {
  ad_id?: string;
  ad_name?: string;
  campaign_name?: string;
  objective?: string;
  spend?: string;
  impressions?: string;
  actions?: Acao[];
}

const num = (v: string | number | undefined | null): number => {
  if (v === undefined || v === null || v === "") return 0;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};
const zero = (): Contagem => ({ mensagens: 0, leads: 0, compras: 0 });
const somar = (a: Contagem, b: Contagem): Contagem => ({
  mensagens: a.mensagens + b.mensagens, leads: a.leads + b.leads, compras: a.compras + b.compras,
});

// ── Datas (AAAA-MM-DD puras, lidas ao meio-dia UTC: o mesmo dia em qualquer fuso) ──

const meioDia = (ymd: string) => new Date(`${ymd.slice(0, 10)}T12:00:00Z`);
const ymd = (d: Date) => d.toISOString().slice(0, 10);

export function somarDias(dia: string, n: number): string {
  const d = meioDia(dia);
  d.setUTCDate(d.getUTCDate() + n);
  return ymd(d);
}

/** Todos os dias de `inicio` a `fim`, inclusive. */
export function diasEntre(inicio: string, fim: string): string[] {
  const out: string[] = [];
  for (let d = inicio; d <= fim && out.length < 400; d = somarDias(d, 1)) out.push(d);
  return out;
}

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

const partes = (dia: string) => {
  const d = meioDia(dia);
  return { dia: d.getUTCDate(), mes: d.getUTCMonth(), ano: d.getUTCFullYear(), semana: d.getUTCDay() };
};

/** "14 set" */
export function diaCurto(dia: string): string {
  const p = partes(dia);
  return `${p.dia} ${MESES_CURTOS[p.mes]}`;
}

/** "seg 14" — eixo do gráfico semanal. */
export function diaDaSemana(dia: string): string {
  const p = partes(dia);
  return `${SEMANA[p.semana]} ${p.dia}`;
}

/** "ter, 15 set" */
export function diaLongo(dia: string): string {
  const p = partes(dia);
  return `${SEMANA[p.semana]}, ${p.dia} ${MESES_CURTOS[p.mes]}`;
}

export type TipoJanela = "semana" | "mes" | "dias";

export interface Janela {
  inicio: string;
  fim: string;
  dias: number;
  tipo: TipoJanela;
  /** "14 a 20 set 2026", "agosto de 2026" */
  rotulo: string;
}

function mesCheio(inicio: string, fim: string): boolean {
  const a = partes(inicio), b = partes(fim);
  return a.dia === 1 && a.mes === b.mes && a.ano === b.ano && somarDias(fim, 1).slice(8, 10) === "01";
}

/** "14 a 20 set 2026", "28 set a 4 out 2026", "29 dez 2025 a 4 jan 2026". */
export function rotuloIntervaloCurto(inicio: string, fim: string): string {
  const a = partes(inicio), b = partes(fim);
  if (a.ano !== b.ano) return `${a.dia} ${MESES_CURTOS[a.mes]} ${a.ano} a ${b.dia} ${MESES_CURTOS[b.mes]} ${b.ano}`;
  if (a.mes !== b.mes) return `${a.dia} ${MESES_CURTOS[a.mes]} a ${b.dia} ${MESES_CURTOS[b.mes]} ${b.ano}`;
  return `${a.dia} a ${b.dia} ${MESES_CURTOS[b.mes]} ${b.ano}`;
}

export function janelaDoRelatorio(inicio: string, fim: string): Janela {
  const dias = diasEntre(inicio, fim).length;
  const tipo: TipoJanela = mesCheio(inicio, fim) ? "mes" : dias === 7 ? "semana" : "dias";
  const p = partes(inicio);
  const rotulo = tipo === "mes" ? `${MESES[p.mes]} de ${p.ano}` : rotuloIntervaloCurto(inicio, fim);
  return { inicio, fim, dias, tipo, rotulo };
}

/** Os `n` dias que terminam ONTEM (a Meta não fecha o dia de hoje). `hoje` em São Paulo. */
export function janelaDosUltimosDias(n: number, hoje: string): Janela {
  const fim = somarDias(hoje, -1);
  return janelaDoRelatorio(somarDias(fim, -(n - 1)), fim);
}

/** Mês cheio → o mês anterior inteiro (julho × junho). Senão → o mesmo tanto de dias logo antes. */
export function janelaAnterior(j: Janela): Janela {
  if (j.tipo === "mes") {
    const fim = somarDias(j.inicio, -1);
    return janelaDoRelatorio(`${fim.slice(0, 7)}-01`, fim);
  }
  const fim = somarDias(j.inicio, -1);
  return janelaDoRelatorio(somarDias(fim, -(j.dias - 1)), fim);
}

/** Como a janela é chamada nas frases. */
export interface Vocabulario {
  /** "Na última semana", "Em agosto", "Nos 14 dias" */
  abertura: string;
  /** "na semana anterior", "em julho", "nos 14 dias anteriores" — "12% a mais que ___" */
  referenciaAnterior: string;
  /** "Esta semana", "Agosto" — legenda do gráfico */
  legendaAtual: string;
  /** "Semana anterior", "Julho" */
  legendaAnterior: string;
  /** "Relatório semanal", "Relatório mensal" */
  titulo: string;
}

export function vocabulario(j: Janela, anterior: Janela | null): Vocabulario {
  const mesNome = (dia: string) => MESES[partes(dia).mes];
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  if (j.tipo === "semana") {
    return { abertura: "Na última semana", referenciaAnterior: "na semana anterior", legendaAtual: "Esta semana", legendaAnterior: "Semana anterior", titulo: "Relatório semanal" };
  }
  if (j.tipo === "mes") {
    const ant = anterior ? mesNome(anterior.inicio) : "o mês anterior";
    return {
      abertura: `Em ${mesNome(j.inicio)}`,
      referenciaAnterior: anterior ? `em ${ant}` : "no mês anterior",
      legendaAtual: cap(mesNome(j.inicio)),
      legendaAnterior: anterior ? cap(ant) : "Mês anterior",
      titulo: "Relatório mensal",
    };
  }
  return {
    abertura: `Nos ${j.dias} dias do período`,
    referenciaAnterior: `nos ${j.dias} dias anteriores`,
    legendaAtual: "Este período",
    legendaAnterior: "Período anterior",
    titulo: j.dias >= 28 ? "Relatório mensal" : `Relatório de ${j.dias} dias`,
  };
}

// ── Público (gênero e idade) ─────────────────────────────────────────────────
// A leitura das linhas mora em lib/meta/publico.ts (a aba Anúncios usa a mesma).

/** "Seus anúncios foram vistos só por mulheres — a maior parte de 45 a 54 anos (28%)." */
export function leituraDoPublico(p: Publico | null): string | null {
  if (!p) return null;
  const topo = [...p.idades].sort((a, b) => b.pct - a.pct)[0];
  const faixaTexto = (f: string) => (f.endsWith("+") ? `com ${parseInt(f, 10)} anos ou mais` : `de ${f.replace("-", " a ")} anos`);
  const idade = topo && topo.pct > 0 ? `${faixaTexto(topo.faixa)} (${formatarPctCurto(topo.pct)})` : null;
  const g = p.genero;
  if (g && (g.mulheres >= 99.5 || g.homens >= 99.5)) {
    const quem = g.mulheres >= 99.5 ? "mulheres" : "homens";
    return `Seus anúncios foram vistos só por ${quem}${idade ? ` — a maior parte ${idade}` : ""}.`;
  }
  const quem = !g ? "pessoas" : g.mulheres >= 60 ? "mulheres" : g.homens >= 60 ? "homens" : "homens e mulheres";
  if (!idade) return g ? `Quem mais viu seus anúncios: ${quem}.` : null;
  return `Quem mais viu seus anúncios: ${quem} ${idade}.`;
}

/** "28%", "4,2%", "0%" */
export function formatarPctCurto(pct: number): string {
  const casas = Math.abs(pct) < 10 && pct !== 0 && Math.round(pct * 10) % 10 !== 0 ? 1 : 0;
  return `${pct.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;
}

// ── Período: resultados, investimento e série diária ─────────────────────────

export interface ResumoPeriodo {
  investimento: number;
  impressoes: number;
  cliquesLink: number;
  porTipo: Contagem;
  /** Tipo que o objetivo de cada campanha com gasto pede (desempate do rótulo quando não há resultado). */
  pedidos: TipoResultado[];
  porDia: Map<string, Contagem>;
  campanhas: Map<string, { nome: string; investimento: number; porTipo: Contagem }>;
  linhas: number;
}

/** Soma as linhas campanha×dia. O resultado de cada linha segue o OBJETIVO da campanha (resultado.ts). */
export function resumirPeriodo(linhas: readonly LinhaCampanhaDia[]): ResumoPeriodo {
  const r: ResumoPeriodo = {
    investimento: 0, impressoes: 0, cliquesLink: 0, porTipo: zero(), pedidos: [],
    porDia: new Map(), campanhas: new Map(), linhas: linhas.length,
  };
  const pedidoPorCampanha = new Map<string, TipoResultado>();
  for (const l of linhas) {
    const gasto = num(l.spend);
    const res = resultadoDaCampanha(l.objective, l.actions);
    const c = zero();
    c[res.tipo] = res.valor;
    r.investimento += gasto;
    r.impressoes += num(l.impressions);
    r.cliquesLink += num(l.inline_link_clicks);
    r.porTipo = somar(r.porTipo, c);
    if (l.date_start) r.porDia.set(l.date_start, somar(r.porDia.get(l.date_start) ?? zero(), c));
    const id = l.campaign_id || l.campaign_name || "?";
    const camp = r.campanhas.get(id) ?? { nome: l.campaign_name ?? "", investimento: 0, porTipo: zero() };
    camp.investimento += gasto;
    camp.porTipo = somar(camp.porTipo, c);
    r.campanhas.set(id, camp);
    if (gasto > 0 && !pedidoPorCampanha.has(id)) {
      // O tipo PEDIDO pela campanha (não o que ela entregou): é o que rotula conta sem resultado.
      const pedido = resultadoDaCampanha(l.objective, []).tipo;
      pedidoPorCampanha.set(id, pedido);
    }
  }
  r.pedidos = [...pedidoPorCampanha.values()];
  return r;
}

const totalDe = (c: Contagem) => c.mensagens + c.leads + c.compras;

/** Quanto do resultado é do tipo do relatório ("misto" = soma de todos). */
export function resultadoDoTipo(c: Contagem | undefined, tipo: TipoResultadoConta): number {
  if (!c) return 0;
  return tipo === "misto" ? totalDe(c) : c[tipo];
}

/** O tipo do relatório: o do período atual; sem resultado nenhum nele, o do anterior. */
export function tipoDoRelatorio(atual: ResumoPeriodo, anterior: ResumoPeriodo | null): TipoResultadoConta {
  if (totalDe(atual.porTipo) === 0 && anterior && totalDe(anterior.porTipo) > 0) {
    return tipoDominante(anterior.porTipo, anterior.pedidos);
  }
  return tipoDominante(atual.porTipo, atual.pedidos);
}

// ── Criativos e conjuntos ────────────────────────────────────────────────────

const contaNoTipo = (objetivo: string | undefined, actions: Acao[] | undefined, tipo: TipoResultadoConta): number => {
  const r = resultadoDaCampanha(objetivo, actions);
  return tipo === "misto" || r.tipo === tipo ? r.valor : 0;
};

export interface Criativo {
  id: string;
  nome: string;
  campanha: string | null;
  resultados: number;
  investimento: number;
  custo: number | null;
  /** data: URI (preenchida pela leitura do servidor) ou null. */
  miniatura: string | null;
}

/** Os anúncios que mais trouxeram resultado do tipo do relatório (desempate: o mais barato). */
export function topCriativos(linhas: readonly LinhaAnuncio[], tipo: TipoResultadoConta, n = 3): Criativo[] {
  const porId = new Map<string, Criativo>();
  for (const l of linhas) {
    const id = l.ad_id || l.ad_name || "";
    if (!id) continue;
    const atual = porId.get(id) ?? { id, nome: (l.ad_name ?? "").trim() || "Anúncio sem nome", campanha: l.campaign_name?.trim() || null, resultados: 0, investimento: 0, custo: null, miniatura: null };
    atual.resultados += contaNoTipo(l.objective, l.actions, tipo);
    atual.investimento += num(l.spend);
    porId.set(id, atual);
  }
  return [...porId.values()]
    .filter((c) => c.resultados > 0)
    .map((c) => ({ ...c, custo: c.investimento > 0 ? c.investimento / c.resultados : null }))
    .sort((a, b) => b.resultados - a.resultados || (a.custo ?? Infinity) - (b.custo ?? Infinity))
    .slice(0, n);
}

export interface Conjunto {
  nome: string;
  campanha: string | null;
  resultados: number;
  investimento: number;
  custo: number;
}

/**
 * O conjunto com o menor custo por resultado. Precisa de volume (2+ resultados, ou 1 com mais de R$ 10
 * investidos — R$ 1 com 1 conversa não é "o melhor") e de pelo menos DOIS conjuntos na disputa: com
 * um só, "o melhor" não diz nada.
 */
export function melhorConjunto(linhas: readonly LinhaConjunto[], tipo: TipoResultadoConta): Conjunto | null {
  const porId = new Map<string, Conjunto>();
  for (const l of linhas) {
    const id = l.adset_id || l.adset_name || "";
    if (!id) continue;
    const c = porId.get(id) ?? { nome: (l.adset_name ?? "").trim(), campanha: l.campaign_name?.trim() || null, resultados: 0, investimento: 0, custo: 0 };
    c.resultados += contaNoTipo(l.objective, l.actions, tipo);
    c.investimento += num(l.spend);
    porId.set(id, c);
  }
  const candidatos = [...porId.values()]
    .filter((c) => c.nome && c.investimento > 0 && (c.resultados >= 2 || (c.resultados >= 1 && c.investimento > 10)))
    .map((c) => ({ ...c, custo: c.investimento / c.resultados }));
  if (candidatos.length < 2) return null;
  return candidatos.sort((a, b) => a.custo - b.custo || b.resultados - a.resultados)[0];
}

// ── Eixo do gráfico ──────────────────────────────────────────────────────────

/** Marcas do eixo Y a partir do ZERO, com passo redondo (1, 2, 2,5, 5 × 10ⁿ) e no máximo `alvo`+1 marcas. */
export function ticksRedondos(maximo: number, alvo = 4): number[] {
  const max = Math.max(0, maximo);
  if (max === 0) return [0, 1];
  const bruto = max / alvo;
  const potencia = 10 ** Math.floor(Math.log10(bruto));
  const passos = [1, 2, 2.5, 5, 10].map((m) => m * potencia);
  // Contagem inteira (conversa, lead) não tem meio: passo mínimo 1 quando tudo é inteiro.
  const inteiro = Number.isInteger(max);
  const passo = passos.find((p) => p >= bruto && (!inteiro || Number.isInteger(p))) ?? passos[passos.length - 1];
  const topo = Math.ceil(max / passo) * passo;
  const out: number[] = [];
  for (let v = 0; v <= topo + passo / 2; v += passo) out.push(Math.round(v * 1000) / 1000);
  return out;
}

// ── O relatório ──────────────────────────────────────────────────────────────

export interface KpiRelatorio {
  chave: "resultados" | "investimento" | "custo" | "alcance";
  rotulo: string;
  valor: number | null;
  anterior: number | null;
  variacaoPct: number | null;
  natureza: Natureza;
  tom: Tom;
  /** Linha pequena embaixo do número (ex.: a base do custo). */
  nota?: string | null;
}

export interface PontoDia { dia: string; atual: number; anterior: number | null }

export interface PalavrasRelatorio { um: string; varios: string; Varios: string; custo: string; porUm: string; feminino: boolean }

export interface RelatorioAnuncios {
  janela: Janela;
  anterior: Janela | null;
  vocab: Vocabulario;
  tipo: TipoResultadoConta;
  palavras: PalavrasRelatorio;
  frase: string;
  kpis: KpiRelatorio[];
  serie: PontoDia[];
  total: number;
  totalAnterior: number | null;
  melhorDia: { dia: string; valor: number } | null;
  cliquesLink: number;
  impressoes: number;
  criativos: Criativo[];
  /** A leitura por anúncio falhou: o PDF omite o cartão em vez de dizer "nenhum anúncio trouxe". */
  criativosIndisponiveis: boolean;
  conjunto: Conjunto | null;
  publico: Publico | null;
  leituraPublico: string | null;
  semVeiculacao: boolean;
}

export function palavrasDoTipo(tipo: TipoResultadoConta): PalavrasRelatorio {
  const r = ROTULO_RESULTADO[tipo];
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  return { um: r.um, varios: r.varios, Varios: cap(r.varios), custo: cap(r.custo), porUm: `por ${r.um}`, feminino: tipo === "mensagens" || tipo === "compras" };
}

/** Variação abaixo disto (em pontos %) é "parecido" — o mesmo limiar do portal. */
export const LIMIAR_NEUTRO = 5;

export interface EntradaRelatorio {
  janela: Janela;
  /** null = a leitura do período anterior falhou (o relatório sai, só sem comparação). */
  anterior: { janela: Janela; linhas: readonly LinhaCampanhaDia[]; alcance: number | null } | null;
  linhas: readonly LinhaCampanhaDia[];
  alcance: number | null;
  conjuntos?: readonly LinhaConjunto[] | null;
  anuncios?: readonly LinhaAnuncio[] | null;
  demografia?: readonly LinhaDemografia[] | null;
}

export function montarRelatorio(e: EntradaRelatorio): RelatorioAnuncios {
  const atual = resumirPeriodo(e.linhas);
  const ant = e.anterior ? resumirPeriodo(e.anterior.linhas) : null;
  const tipo = tipoDoRelatorio(atual, ant);
  const palavras = palavrasDoTipo(tipo);
  const vocab = vocabulario(e.janela, e.anterior?.janela ?? null);

  const total = resultadoDoTipo(atual.porTipo, tipo);
  // Período anterior SEM veiculação nenhuma não é base de comparação ("0 → 38" não é "+∞%").
  const antValido = !!ant && ant.linhas > 0;
  const totalAnterior = antValido ? resultadoDoTipo(ant!.porTipo, tipo) : null;

  // Custo por resultado = investimento TOTAL ÷ resultados — a mesma regra do portal (Roberto, 24/09:
  // "melhor total"). Antes só contava o gasto das campanhas que trouxeram resultado, e o PDF mostrava
  // um custo menor que o portal para o mesmo cliente e período.
  const custo = total > 0 ? atual.investimento / total : null;
  const custoAnt = antValido && totalAnterior! > 0 ? ant!.investimento / totalAnterior! : null;

  const kpi = (chave: KpiRelatorio["chave"], rotulo: string, valor: number | null, anterior: number | null, natureza: Natureza, nota?: string | null): KpiRelatorio => {
    const v = variacao(valor, anterior);
    return { chave, rotulo, valor, anterior, variacaoPct: v, natureza, tom: tomDaVariacao(v, natureza, LIMIAR_NEUTRO), nota: nota ?? null };
  };


  const kpis: KpiRelatorio[] = [
    kpi("resultados", palavras.Varios, total, totalAnterior, "direta"),
    kpi("investimento", "Investimento", atual.investimento, antValido ? ant!.investimento : null, "neutra"),
    kpi("custo", palavras.custo, custo, custoAnt, "inversa"),
    kpi("alcance", "Pessoas alcançadas", e.alcance, antValido ? e.anterior!.alcance : null, "direta"),
  ];

  const dias = diasEntre(e.janela.inicio, e.janela.fim);
  const diasAnt = e.anterior ? diasEntre(e.anterior.janela.inicio, e.anterior.janela.fim) : [];
  const serie: PontoDia[] = dias.map((dia, i) => ({
    dia,
    atual: resultadoDoTipo(atual.porDia.get(dia), tipo),
    anterior: antValido && diasAnt[i] ? resultadoDoTipo(ant!.porDia.get(diasAnt[i]), tipo) : null,
  }));
  const melhor = serie.reduce<PontoDia | null>((m, p) => (p.atual > 0 && (!m || p.atual > m.atual) ? p : m), null);

  const publico = e.demografia ? lerPublico(e.demografia) : null;
  const semVeiculacao = atual.linhas === 0 || (atual.investimento === 0 && total === 0);

  const r: RelatorioAnuncios = {
    janela: e.janela,
    anterior: e.anterior?.janela ?? null,
    vocab, tipo, palavras,
    frase: "",
    kpis, serie, total, totalAnterior,
    melhorDia: melhor ? { dia: melhor.dia, valor: melhor.atual } : null,
    cliquesLink: atual.cliquesLink,
    impressoes: atual.impressoes,
    criativos: e.anuncios ? topCriativos(e.anuncios, tipo, 3) : [],
    criativosIndisponiveis: !e.anuncios,
    conjunto: e.conjuntos ? melhorConjunto(e.conjuntos, tipo) : null,
    publico,
    leituraPublico: leituraDoPublico(publico),
    semVeiculacao,
  };
  r.frase = fraseDoPeriodo(r);
  return r;
}

const pctAbs = (p: number) => `${Math.round(Math.abs(p)).toLocaleString("pt-BR")}%`;
const n = (v: number) => Math.round(v).toLocaleString("pt-BR");

/**
 * "Sua semana em uma frase": o resultado, a variação contra o período anterior e, se mudou, o custo.
 *   "Na última semana, seus anúncios trouxeram 38 conversas, 12% a mais que na semana anterior —
 *    e cada conversa saiu 9% mais barata."
 */
export function fraseDoPeriodo(r: RelatorioAnuncios): string {
  const { vocab, palavras } = r;
  if (r.semVeiculacao) return `${vocab.abertura}, os anúncios não rodaram.`;
  const alcance = r.kpis.find((k) => k.chave === "alcance")?.valor ?? null;
  if (r.total === 0) {
    return alcance
      ? `${vocab.abertura}, os anúncios alcançaram ${n(alcance)} pessoas, sem ${palavras.varios} registradas pela Meta.`
      : `${vocab.abertura}, os anúncios rodaram, mas a Meta não registrou ${palavras.varios}.`;
  }
  let frase = `${vocab.abertura}, seus anúncios trouxeram ${n(r.total)} ${r.total === 1 ? palavras.um : palavras.varios}`;
  const res = r.kpis.find((k) => k.chave === "resultados")!;
  if (res.variacaoPct != null) {
    if (Math.abs(res.variacaoPct) <= LIMIAR_NEUTRO) frase += `, no mesmo ritmo ${vocab.referenciaAnterior.replace(/^na /, "da ").replace(/^em /, "de ").replace(/^nos /, "dos ")}`;
    else frase += `, ${pctAbs(res.variacaoPct)} ${res.variacaoPct > 0 ? "a mais" : "a menos"} que ${vocab.referenciaAnterior}`;
  }
  const custo = r.kpis.find((k) => k.chave === "custo")!;
  if (custo.valor != null && custo.variacaoPct != null && Math.abs(custo.variacaoPct) > LIMIAR_NEUTRO) {
    frase += custo.variacaoPct < 0
      ? ` — e cada ${palavras.um} saiu ${pctAbs(custo.variacaoPct)} ${palavras.feminino ? "mais barata" : "mais barato"}`
      : ` — e o ${palavras.custo.toLowerCase()} subiu ${pctAbs(custo.variacaoPct)}`;
  } else if (custo.valor != null && res.variacaoPct == null) {
    frase += `, a ${formatarBRL(custo.valor)} ${r.total === 1 ? "" : "cada"}`.trimEnd();
  }
  return `${frase}.`;
}
