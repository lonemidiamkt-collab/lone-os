// lib/google/relatorio.ts — o bloco GOOGLE do relatório (semanal e mensal) e do painel de resultados, montado a
// partir das linhas que a rotina diária gravou (lib/google/sincronizar.ts). Módulo PURO: sem banco, sem fetch.
// A leitura fica em relatorio-dados.ts; o HTML em lib/reports/relatorioGooglePdf.ts; o painel em
// components/portal/PortalGoogle.tsx. Os três mostram os MESMOS números porque saem daqui.
//
// Dois blocos independentes — o cliente pode ter um, o outro ou os dois:
//   · Google Ads: investimento, cliques, impressões, CTR, CPC, conversões, custo por conversão, ligações pelo
//     anúncio, ações de conversão por tipo (ligação, rota, contato, formulário...) e as campanhas.
//   · Perfil da Empresa (Google Meu Negócio): ligações, rotas pedidas, cliques no site, conversas, reservas e
//     quantas vezes o perfil apareceu (busca × mapas), por dia, e os termos que mais mostraram o perfil.
//
// Comparação: com o período anterior pela MESMA regra do relatório da Meta (janelaAnterior). Período anterior sem
// nenhum número não é base ("0 → 38" não é "+∞%").
//
// O Perfil chega com atraso (2–5 dias): janelaDoPerfil recua a semana para os últimos 7 dias que o Google já
// entregou, e corta o mês no último dia entregue — sempre com nota dizendo qual período o bloco cobre.

import { variacao, tomDaVariacao, type Natureza, type Tom } from "@/components/ui/painel-comparativo-utils";
import {
  janelaDoRelatorio, janelaAnterior, somarDias, diasEntre, diaCurto, vocabulario, LIMIAR_NEUTRO,
  type Janela, type Vocabulario,
} from "@/lib/reports/relatorioCliente";

// ── Linhas do banco ──────────────────────────────────────────────────────────────────────────────────

export interface LinhaAdsDia {
  dia: string;
  campaign_id: string;
  campanha: string | null;
  canal: string | null;
  impressoes: number;
  cliques: number;
  custo: number;
  conversoes: number;
  valor_conversoes: number;
  ligacoes: number | null;
}

export interface LinhaAcaoDia { dia: string; categoria: string; acao: string; conversoes: number; todas_conversoes: number }

export interface LinhaPerfilDia {
  dia: string;
  impressoes_busca_celular: number;
  impressoes_busca_computador: number;
  impressoes_mapas_celular: number;
  impressoes_mapas_computador: number;
  ligacoes: number;
  rotas: number;
  cliques_site: number;
  conversas: number;
  reservas: number;
  cardapio: number;
}

export interface LinhaTermo { termo: string; valor: number | null; limiar: number | null }

// ── Formatos ─────────────────────────────────────────────────────────────────────────────────────────

export type Formato = "inteiro" | "dinheiro" | "pct" | "decimal";

const num = (v: unknown) => { const x = Number(v ?? 0); return Number.isFinite(x) ? x : 0; };

/** Valor no formato do KPI ("R$ 1.230,00", "4,2%", "1.204"). Pura. */
export function formatarValor(v: number | null, formato: Formato, moeda = "BRL"): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (formato === "dinheiro") {
    try { return v.toLocaleString("pt-BR", { style: "currency", currency: moeda || "BRL" }); }
    catch { return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
  }
  if (formato === "pct") return `${v.toLocaleString("pt-BR", { minimumFractionDigits: v < 10 ? 1 : 0, maximumFractionDigits: v < 10 ? 1 : 0 })}%`;
  if (formato === "decimal") return v.toLocaleString("pt-BR", { maximumFractionDigits: Number.isInteger(v) ? 0 : 1 });
  return Math.round(v).toLocaleString("pt-BR");
}

// ── KPI ──────────────────────────────────────────────────────────────────────────────────────────────

export interface KpiGoogle {
  chave: string;
  rotulo: string;
  valor: number | null;
  anterior: number | null;
  variacaoPct: number | null;
  natureza: Natureza;
  tom: Tom;
  formato: Formato;
  nota?: string | null;
}

function kpi(chave: string, rotulo: string, valor: number | null, anterior: number | null, natureza: Natureza, formato: Formato, nota?: string | null): KpiGoogle {
  const v = variacao(valor, anterior);
  return { chave, rotulo, valor, anterior, variacaoPct: v, natureza, tom: tomDaVariacao(v, natureza, LIMIAR_NEUTRO), formato, nota: nota ?? null };
}

export interface PontoGoogle { dia: string; atual: number; anterior: number | null }

const dentro = (j: Janela) => <T extends { dia: string }>(l: T) => l.dia >= j.inicio && l.dia <= j.fim;

// ── Google Ads ───────────────────────────────────────────────────────────────────────────────────────

/** Categoria da ação de conversão (conversion_action_category) → como o cliente lê. */
export const ROTULO_CATEGORIA: Record<string, string> = {
  PHONE_CALL_LEAD: "Ligações",
  GET_DIRECTIONS: "Rotas pedidas",
  STORE_VISIT: "Visitas à loja",
  CONTACT: "Contatos (WhatsApp, e-mail, chat)",
  SUBMIT_LEAD_FORM: "Formulários enviados",
  REQUEST_QUOTE: "Pedidos de orçamento",
  BOOK_APPOINTMENT: "Agendamentos",
  SIGNUP: "Cadastros",
  QUALIFIED_LEAD: "Leads qualificados",
  CONVERTED_LEAD: "Leads convertidos",
  IMPORTED_LEAD: "Leads",
  PURCHASE: "Compras",
  STORE_SALE: "Vendas na loja",
  ADD_TO_CART: "Produtos no carrinho",
  BEGIN_CHECKOUT: "Inícios de compra",
  SUBSCRIBE_PAID: "Assinaturas",
  OUTBOUND_CLICK: "Cliques para fora",
  PAGE_VIEW: "Visitas a páginas-chave",
  DOWNLOAD: "Downloads",
  ENGAGEMENT: "Engajamentos",
  BOOK_APPOINTMENT_LEGACY: "Agendamentos",
  DEFAULT: "Outras conversões",
};

const ROTULO_CANAL: Record<string, string> = {
  SEARCH: "Pesquisa", PERFORMANCE_MAX: "Performance Max", DISPLAY: "Display", VIDEO: "YouTube", SHOPPING: "Shopping",
  LOCAL: "Local", SMART: "Inteligente", DEMAND_GEN: "Demand Gen", DISCOVERY: "Discovery", LOCAL_SERVICES: "Serviços locais",
  MULTI_CHANNEL: "App",
};
export const rotuloCanal = (c: string | null) => (c ? ROTULO_CANAL[c] ?? c.toLowerCase() : "—");

export interface AcaoAds { categoria: string; rotulo: string; principais: number; todas: number; anterior: number | null }
export interface CampanhaAds { id: string; nome: string; canal: string; custo: number; cliques: number; impressoes: number; conversoes: number; custoPorConversao: number | null }

export interface RelatorioGoogleAds {
  janela: Janela;
  anterior: Janela | null;
  vocab: Vocabulario;
  moeda: string;
  frase: string;
  kpis: KpiGoogle[];
  /** Cliques por dia, com o dia equivalente do período anterior. */
  serieCliques: PontoGoogle[];
  serieConversoes: PontoGoogle[];
  acoes: AcaoAds[];
  campanhas: CampanhaAds[];
  semVeiculacao: boolean;
}

interface SomaAds { custo: number; cliques: number; impressoes: number; conversoes: number; valor: number; ligacoes: number | null; linhas: number }

function somarAds(linhas: readonly LinhaAdsDia[]): SomaAds {
  const s: SomaAds = { custo: 0, cliques: 0, impressoes: 0, conversoes: 0, valor: 0, ligacoes: null, linhas: linhas.length };
  for (const l of linhas) {
    s.custo += num(l.custo); s.cliques += num(l.cliques); s.impressoes += num(l.impressoes);
    s.conversoes += num(l.conversoes); s.valor += num(l.valor_conversoes);
    if (l.ligacoes != null) s.ligacoes = (s.ligacoes ?? 0) + num(l.ligacoes);
  }
  s.custo = Math.round(s.custo * 100) / 100;
  s.conversoes = Math.round(s.conversoes * 100) / 100;
  return s;
}

const div = (a: number, b: number) => (b > 0 ? a / b : null);

function serie(janela: Janela, anterior: Janela | null, antValido: boolean, valorDoDia: (dia: string) => number): PontoGoogle[] {
  const dias = diasEntre(janela.inicio, janela.fim);
  const diasAnt = anterior ? diasEntre(anterior.inicio, anterior.fim) : [];
  return dias.map((dia, i) => ({ dia, atual: valorDoDia(dia), anterior: antValido && diasAnt[i] ? valorDoDia(diasAnt[i]) : null }));
}

export interface EntradaAds {
  janela: Janela;
  moeda?: string | null;
  /** Linhas de campanha × dia cobrindo a janela E o período anterior (filtra aqui). */
  linhas: readonly LinhaAdsDia[];
  acoes: readonly LinhaAcaoDia[];
  /** O período de comparação. Ausente = janelaAnterior(janela) (a regra do relatório); null = sem comparação. */
  anterior?: Janela | null;
}

export function montarRelatorioAds(e: EntradaAds): RelatorioGoogleAds {
  const ant = e.anterior === undefined ? janelaAnterior(e.janela) : e.anterior;
  const doPeriodo = e.linhas.filter(dentro(e.janela));
  const doAnterior = ant ? e.linhas.filter(dentro(ant)) : [];
  const a = somarAds(doPeriodo), b = somarAds(doAnterior);
  const antValido = !!ant && b.linhas > 0 && (b.impressoes > 0 || b.custo > 0);
  const B = <T,>(v: T) => (antValido ? v : null);
  const moeda = e.moeda || "BRL";

  const kpis: KpiGoogle[] = [
    kpi("investimento", "Investimento", a.custo, B(b.custo), "neutra", "dinheiro"),
    kpi("cliques", "Cliques", a.cliques, B(b.cliques), "direta", "inteiro"),
    kpi("impressoes", "Impressões", a.impressoes, B(b.impressoes), "direta", "inteiro"),
    kpi("ctr", "Taxa de cliques (CTR)", div(a.cliques * 100, a.impressoes), antValido ? div(b.cliques * 100, b.impressoes) : null, "direta", "pct"),
    kpi("cpc", "Custo por clique", div(a.custo, a.cliques), antValido ? div(b.custo, b.cliques) : null, "inversa", "dinheiro"),
    kpi("conversoes", "Conversões", a.conversoes, B(b.conversoes), "direta", "decimal", "ações principais da conta"),
    kpi("custo_conversao", "Custo por conversão", div(a.custo, a.conversoes), antValido ? div(b.custo, b.conversoes) : null, "inversa", "dinheiro"),
  ];
  if (a.ligacoes != null) kpis.push(kpi("ligacoes", "Ligações pelo anúncio", a.ligacoes, antValido ? b.ligacoes : null, "direta", "inteiro", "toques no botão de ligar do anúncio"));
  if (a.valor > 0) kpis.push(kpi("valor", "Valor das conversões", Math.round(a.valor * 100) / 100, B(Math.round(b.valor * 100) / 100), "direta", "dinheiro"));

  // Ações de conversão por categoria (soma das ações com a mesma categoria). "Todas" inclui as secundárias —
  // é onde a Performance Max conta rota e ligação do perfil.
  const porCat = (linhas: readonly LinhaAcaoDia[]) => {
    const m = new Map<string, { principais: number; todas: number }>();
    for (const l of linhas) {
      const x = m.get(l.categoria) ?? { principais: 0, todas: 0 };
      x.principais += num(l.conversoes); x.todas += num(l.todas_conversoes);
      m.set(l.categoria, x);
    }
    return m;
  };
  const catA = porCat(e.acoes.filter(dentro(e.janela)));
  const catB = ant ? porCat(e.acoes.filter(dentro(ant))) : new Map();
  const acoes: AcaoAds[] = [...catA.entries()]
    .map(([categoria, v]) => ({
      categoria, rotulo: ROTULO_CATEGORIA[categoria] ?? categoria.toLowerCase().replace(/_/g, " "),
      principais: Math.round(v.principais * 100) / 100, todas: Math.round(v.todas * 100) / 100,
      anterior: antValido ? Math.round((catB.get(categoria)?.todas ?? 0) * 100) / 100 : null,
    }))
    .filter((x) => x.todas > 0)
    .sort((x, y) => y.todas - x.todas);

  // Campanhas do período, por investimento.
  const porCamp = new Map<string, { nome: string; canal: string | null; linhas: LinhaAdsDia[] }>();
  for (const l of doPeriodo) {
    const c = porCamp.get(l.campaign_id) ?? { nome: l.campanha || `Campanha ${l.campaign_id}`, canal: l.canal, linhas: [] };
    c.linhas.push(l);
    if (l.campanha) c.nome = l.campanha;
    porCamp.set(l.campaign_id, c);
  }
  const campanhas: CampanhaAds[] = [...porCamp.entries()].map(([id, c]) => {
    const s = somarAds(c.linhas);
    return { id, nome: c.nome, canal: rotuloCanal(c.canal), custo: s.custo, cliques: s.cliques, impressoes: s.impressoes, conversoes: s.conversoes, custoPorConversao: div(s.custo, s.conversoes) };
  }).filter((c) => c.custo > 0 || c.impressoes > 0).sort((x, y) => y.custo - x.custo || y.cliques - x.cliques);

  const porDia = (campo: "cliques" | "conversoes") => {
    const m = new Map<string, number>();
    for (const l of e.linhas) m.set(l.dia, (m.get(l.dia) ?? 0) + num(l[campo]));
    return (dia: string) => Math.round((m.get(dia) ?? 0) * 100) / 100;
  };

  const vocab = vocabulario(e.janela, ant);
  const r: RelatorioGoogleAds = {
    janela: e.janela, anterior: ant, vocab, moeda, frase: "", kpis,
    serieCliques: serie(e.janela, ant, antValido, porDia("cliques")),
    serieConversoes: serie(e.janela, ant, antValido, porDia("conversoes")),
    acoes, campanhas,
    semVeiculacao: a.impressoes === 0 && a.custo === 0,
  };
  r.frase = fraseDoAds(r);
  return r;
}

const pctAbs = (p: number) => `${Math.round(Math.abs(p)).toLocaleString("pt-BR")}%`;
const valorDe = (kpis: KpiGoogle[], chave: string) => kpis.find((k) => k.chave === chave);

function comparacao(k: KpiGoogle | undefined, vocab: Vocabulario): string {
  if (!k || k.variacaoPct == null) return "";
  if (Math.abs(k.variacaoPct) <= LIMIAR_NEUTRO) return ", no mesmo ritmo do período anterior";
  return `, ${pctAbs(k.variacaoPct)} ${k.variacaoPct > 0 ? "a mais" : "a menos"} que ${vocab.referenciaAnterior}`;
}

/** "Na última semana, os anúncios no Google tiveram 412 cliques (12% a mais que na semana anterior) e 18 conversões, com R$ 1.230,00 investidos." */
export function fraseDoAds(r: RelatorioGoogleAds): string {
  if (r.semVeiculacao) return `${r.vocab.abertura}, os anúncios no Google não rodaram.`;
  const cliques = valorDe(r.kpis, "cliques")!, conv = valorDe(r.kpis, "conversoes")!, inv = valorDe(r.kpis, "investimento")!;
  let f = `${r.vocab.abertura}, os anúncios no Google tiveram ${formatarValor(cliques.valor, "inteiro")} ${cliques.valor === 1 ? "clique" : "cliques"}${comparacao(cliques, r.vocab)}`;
  if ((conv.valor ?? 0) > 0) f += ` e ${formatarValor(conv.valor, "decimal")} ${conv.valor === 1 ? "conversão" : "conversões"}`;
  f += `, com ${formatarValor(inv.valor, "dinheiro", r.moeda)} investidos`;
  return `${f}.`;
}

// ── Perfil da Empresa ────────────────────────────────────────────────────────────────────────────────

export const ACOES_PERFIL = [
  { chave: "ligacoes", rotulo: "Ligações", um: "ligação", nota: "toques em \"Ligar\" no perfil" },
  { chave: "rotas", rotulo: "Rotas pedidas", um: "rota pedida", nota: "pedidos de rota até o endereço" },
  { chave: "cliques_site", rotulo: "Visitas ao site", um: "visita ao site", nota: "cliques no site a partir do perfil" },
  { chave: "conversas", rotulo: "Conversas", um: "conversa", nota: "mensagens iniciadas pelo perfil" },
  { chave: "reservas", rotulo: "Reservas", um: "reserva", nota: "reservas feitas pelo perfil" },
  { chave: "cardapio", rotulo: "Cliques no cardápio", um: "clique no cardápio", nota: "toques no cardápio" },
] as const;
type ChaveAcaoPerfil = (typeof ACOES_PERFIL)[number]["chave"];

const totalAcoes = (l: LinhaPerfilDia) => ACOES_PERFIL.reduce((s, a) => s + num(l[a.chave]), 0);
const totalVisualizacoes = (l: LinhaPerfilDia) =>
  num(l.impressoes_busca_celular) + num(l.impressoes_busca_computador) + num(l.impressoes_mapas_celular) + num(l.impressoes_mapas_computador);

/**
 * A janela que o bloco do Perfil pode mostrar, dado o último dia que o Google já entregou. Pura (testada).
 *   · Google já entregou o período inteiro → a própria janela.
 *   · Semana/N dias: recua para os N dias que terminam no último dia entregue (mesmo tamanho, comparação justa).
 *   · Mês: corta no último dia entregue e compara com os MESMOS dias do mês anterior (1–27 × 1–27).
 *   · Nada entregue no período → null.
 */
export function janelaDoPerfil(janela: Janela, ultimoDia: string | null): { janela: Janela; anterior: Janela; nota: string | null } | null {
  if (!ultimoDia) return null;
  if (ultimoDia >= janela.fim) return { janela, anterior: janelaAnterior(janela), nota: null };
  if (janela.tipo === "mes") {
    if (ultimoDia < janela.inicio) return null;
    const j = { ...janelaDoRelatorio(janela.inicio, ultimoDia), rotulo: janela.rotulo, tipo: "mes" as const };
    const iniAnt = janelaAnterior(janela).inicio;
    const fimAntCheio = somarDias(janela.inicio, -1);
    const fimAnt = [somarDias(iniAnt, j.dias - 1), fimAntCheio].sort()[0];
    const anterior = { ...janelaDoRelatorio(iniAnt, fimAnt), tipo: "mes" as const, rotulo: janelaAnterior(janela).rotulo };
    return { janela: j, anterior, nota: `O Google libera os números do perfil com alguns dias de atraso: este bloco vai até ${diaCurto(ultimoDia)} e compara com os mesmos dias do mês anterior.` };
  }
  const fim = ultimoDia;
  const j = janelaDoRelatorio(somarDias(fim, -(janela.dias - 1)), fim);
  return { janela: j, anterior: janelaAnterior(j), nota: `O Google libera os números do perfil com alguns dias de atraso: este bloco mostra os ${janela.dias} dias de ${j.rotulo}.` };
}

export interface AcaoPerfil { chave: ChaveAcaoPerfil; rotulo: string; um: string; nota: string; valor: number; anterior: number | null; variacaoPct: number | null; tom: Tom }

export interface RelatorioGooglePerfil {
  janela: Janela;
  anterior: Janela | null;
  vocab: Vocabulario;
  /** Por que o bloco cobre outro período que o do relatório (atraso do Google). */
  nota: string | null;
  frase: string;
  kpis: KpiGoogle[];
  acoes: AcaoPerfil[];
  visualizacoes: { busca: number; mapas: number; celular: number; computador: number; total: number };
  serieAcoes: PontoGoogle[];
  termos: LinhaTermo[];
  /** Mês dos termos ("outubro de 2026") — o Google só fecha por mês. */
  termosMes: string | null;
  semDados: boolean;
}

export interface EntradaPerfil {
  janela: Janela;
  ultimoDia: string | null;
  /** Linhas por dia cobrindo a janela E o período anterior. */
  linhas: readonly LinhaPerfilDia[];
  termos?: readonly LinhaTermo[] | null;
  termosMes?: string | null;
  /** Comparação quando o Google já entregou a janela inteira (o painel compara "este mês" com os mesmos dias do anterior). */
  anterior?: Janela;
}

export function montarRelatorioPerfil(e: EntradaPerfil): RelatorioGooglePerfil | null {
  const jp = janelaDoPerfil(e.janela, e.ultimoDia);
  if (!jp) return null;
  const { janela, nota } = jp;
  const ant = !nota && e.anterior ? e.anterior : jp.anterior;
  const atual = e.linhas.filter(dentro(janela));
  const anterior = e.linhas.filter(dentro(ant));
  const antValido = anterior.some((l) => totalVisualizacoes(l) > 0 || totalAcoes(l) > 0);
  const soma = (ls: readonly LinhaPerfilDia[], f: (l: LinhaPerfilDia) => number) => ls.reduce((s, l) => s + f(l), 0);

  const acoes: AcaoPerfil[] = ACOES_PERFIL.map((a) => {
    const valor = soma(atual, (l) => num(l[a.chave]));
    const antV = antValido ? soma(anterior, (l) => num(l[a.chave])) : null;
    const v = variacao(valor, antV);
    return { chave: a.chave, rotulo: a.rotulo, um: a.um, nota: a.nota, valor, anterior: antV, variacaoPct: v, tom: tomDaVariacao(v, "direta", LIMIAR_NEUTRO) };
  });
  // Reserva e cardápio só aparecem se o perfil usa (restaurante, salão...). As 4 principais sempre.
  const visiveis = acoes.filter((a) => ["ligacoes", "rotas", "cliques_site", "conversas"].includes(a.chave) || a.valor > 0 || (a.anterior ?? 0) > 0);

  const vis = {
    busca: soma(atual, (l) => num(l.impressoes_busca_celular) + num(l.impressoes_busca_computador)),
    mapas: soma(atual, (l) => num(l.impressoes_mapas_celular) + num(l.impressoes_mapas_computador)),
    celular: soma(atual, (l) => num(l.impressoes_busca_celular) + num(l.impressoes_mapas_celular)),
    computador: soma(atual, (l) => num(l.impressoes_busca_computador) + num(l.impressoes_mapas_computador)),
    total: soma(atual, totalVisualizacoes),
  };
  const visAnt = antValido ? soma(anterior, totalVisualizacoes) : null;
  const acoesTotal = soma(atual, totalAcoes);
  const acoesAnt = antValido ? soma(anterior, totalAcoes) : null;

  const kpis: KpiGoogle[] = [
    kpi("acoes", "Contatos pelo perfil", acoesTotal, acoesAnt, "direta", "inteiro", "ligações + rotas + site + conversas"),
    ...visiveis.slice(0, 4).map((a) => kpi(a.chave, a.rotulo, a.valor, a.anterior, "direta", "inteiro", a.nota)),
    kpi("visualizacoes", "Vezes que o perfil apareceu", vis.total, visAnt, "direta", "inteiro", "na Busca e no Maps"),
  ];

  const porDia = new Map(e.linhas.map((l) => [l.dia, totalAcoes(l)]));
  const vocab = vocabulario(janela, ant);
  const termos = [...(e.termos ?? [])]
    .sort((a, b) => (b.valor ?? b.limiar ?? 0) - (a.valor ?? a.limiar ?? 0))
    .slice(0, 10);

  const r: RelatorioGooglePerfil = {
    janela, anterior: ant, vocab, nota, frase: "", kpis, acoes: visiveis, visualizacoes: vis,
    serieAcoes: serie(janela, ant, antValido, (d) => porDia.get(d) ?? 0),
    termos, termosMes: termos.length ? (e.termosMes ?? null) : null,
    semDados: vis.total === 0 && acoesTotal === 0,
  };
  r.frase = fraseDoPerfil(r);
  return r;
}

/** "Na última semana, o seu perfil no Google apareceu 3.204 vezes e gerou 34 ligações, 21 rotas e 58 visitas ao site." */
export function fraseDoPerfil(r: RelatorioGooglePerfil): string {
  const abertura = r.nota ? `De ${r.janela.rotulo}` : r.vocab.abertura;
  if (r.semDados) return `${abertura}, o Google não registrou visualizações nem contatos no perfil.`;
  const partes = r.acoes
    .filter((a) => a.valor > 0)
    .slice(0, 4)
    .map((a) => `${formatarValor(a.valor, "inteiro")} ${a.valor === 1 ? a.um : a.rotulo.toLowerCase()}`);
  const vezes = `apareceu ${formatarValor(r.visualizacoes.total, "inteiro")} ${r.visualizacoes.total === 1 ? "vez" : "vezes"} no Google`;
  if (!partes.length) return `${abertura}, o seu perfil ${vezes}, sem ligações, rotas ou visitas ao site registradas.`;
  const lista = partes.length > 1 ? `${partes.slice(0, -1).join(", ")} e ${partes[partes.length - 1]}` : partes[0];
  const total = valorDe(r.kpis, "acoes");
  let fim = "";
  if (total?.variacaoPct != null) {
    fim = Math.abs(total.variacaoPct) <= LIMIAR_NEUTRO
      ? " — no mesmo ritmo do período anterior"
      : ` — ${pctAbs(total.variacaoPct)} ${total.variacaoPct > 0 ? "mais" : "menos"} contatos que ${r.vocab.referenciaAnterior}`;
  }
  return `${abertura}, o seu perfil ${vezes} e gerou ${lista}${fim}.`;
}

// ── Os dois juntos ───────────────────────────────────────────────────────────────────────────────────

export interface BlocoIndisponivel { motivo: string }

export interface RelatorioGoogle {
  ads: RelatorioGoogleAds | null;
  /** O cliente tem conta vinculada mas os números não podem ser mostrados (motivo em frase). */
  adsIndisponivel: BlocoIndisponivel | null;
  perfil: RelatorioGooglePerfil | null;
  perfilIndisponivel: BlocoIndisponivel | null;
}

export const temAlgoDoGoogle = (g: RelatorioGoogle | null | undefined) => !!g && (!!g.ads || !!g.perfil || !!g.adsIndisponivel || !!g.perfilIndisponivel);
