// lib/traffic/creative-health.ts — SAÚDE DO CRIATIVO. Função pura. Fase 2 do Lone Agent V2.
//
// Substitui "criativo cansado = frequency ≥ 3 && spend ≥ 30" — uma métrica, sem baseline, sem
// amostra. Aqui NENHUM estado nasce de uma métrica só: são sinais independentes (CTR caindo, CPM
// subindo, CPL subindo ou zero conversa com gasto, frequência alta, idade, pior que a própria conta)
// e o estado é a CONCORDÂNCIA deles. Tendência = últimos 3 dias contra os 7 anteriores do mesmo
// anúncio — "ontem × hoje" é ruído estatístico. Sem amostra mínima, não há veredito.
//
// Régua RELATIVA: CPL contra a meta do cliente (client_traffic_policy) e contra a mediana da
// própria conta. R$ 18 é absurdo para um cliente e normal para outro.

export interface DiaCriativo { data: string; spend: number; impressions: number; clicks: number; conversions: number }

export interface BaselineConta { ctrMediano: number | null; cpmMediano: number | null; cplMediano: number | null }

export interface PoliticaCliente { cplAlerta?: number | null; cplCritico?: number | null; convMin?: number | null }

export interface EntradaSaude {
  adId: string;
  nome?: string | null;
  /** Série diária, qualquer ordem — só os dias com gasto contam. */
  serie: DiaCriativo[];
  hoje: string;
  baseline?: BaselineConta | null;
  politica?: PoliticaCliente | null;
  /** Frequência do período (7d) quando o sync trouxer; sem ela, o sinal de frequência não existe (não é 0). */
  freq7d?: number | null;
}

export type EstadoCriativo = "SEM_AMOSTRA" | "HEALTHY" | "WATCH" | "FATIGUE_POSSIBLE" | "FATIGUE_PROBABLE" | "CRITICAL";

export interface Sinal { chave: string; forte: boolean; evidencia: string; magnitude: number }

export interface SaudeCriativo {
  adId: string;
  estado: EstadoCriativo;
  severidade: number;   // 0–100
  confianca: number;    // 0–1
  sinais: Sinal[];
  evidencias: string[];
  amostra: { diasComGasto: number; gasto7d: number; impressoes7d: number; conversas7d: number; gastoTotal: number; conversasTotal: number; diasRodando: number };
  janelas: { ultimos3: Janela; anteriores7: Janela };
  vencedor: { sim: boolean; evidencias: string[] };
}

export interface Janela { dias: number; spend: number; impressions: number; clicks: number; conversions: number; ctr: number | null; cpm: number | null; cpl: number | null }

const AMOSTRA_MIN = { diasComGasto: 5, impressoes7d: 2000, gasto7d: 30 };
const brl = (n: number) => `R$ ${n.toFixed(2).replace(".", ",")}`;
const pct = (n: number) => `${n > 0 ? "+" : ""}${Math.round(n * 100)}%`;

function diasAtras(hoje: string, n: number): string {
  const d = new Date(`${hoje}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10);
}

export function janela(serie: DiaCriativo[], de: string, ate: string): Janela {
  const dias = serie.filter((d) => d.data >= de && d.data <= ate && d.spend > 0);
  const s = dias.reduce((a, d) => ({ spend: a.spend + d.spend, impressions: a.impressions + d.impressions, clicks: a.clicks + d.clicks, conversions: a.conversions + d.conversions }), { spend: 0, impressions: 0, clicks: 0, conversions: 0 });
  return {
    dias: dias.length, ...s,
    ctr: s.impressions > 0 ? (s.clicks / s.impressions) * 100 : null,
    cpm: s.impressions > 0 ? (s.spend / s.impressions) * 1000 : null,
    cpl: s.conversions > 0 ? s.spend / s.conversions : null,
  };
}

export function avaliarCriativo(e: EntradaSaude): SaudeCriativo {
  const serie = [...e.serie].filter((d) => d.data <= e.hoje).sort((a, b) => a.data.localeCompare(b.data));
  const comGasto = serie.filter((d) => d.spend > 0);
  const u3 = janela(serie, diasAtras(e.hoje, 2), e.hoje);
  const a7 = janela(serie, diasAtras(e.hoje, 9), diasAtras(e.hoje, 3));
  const u7 = janela(serie, diasAtras(e.hoje, 6), e.hoje);
  const total = janela(serie, "0000-01-01", e.hoje);
  const diasRodando = comGasto.length ? Math.round((Date.parse(`${e.hoje}T12:00:00Z`) - Date.parse(`${comGasto[0].data}T12:00:00Z`)) / 864e5) + 1 : 0;
  const amostra = { diasComGasto: comGasto.length, gasto7d: u7.spend, impressoes7d: u7.impressions, conversas7d: u7.conversions, gastoTotal: total.spend, conversasTotal: total.conversions, diasRodando };
  const base: SaudeCriativo = { adId: e.adId, estado: "SEM_AMOSTRA", severidade: 0, confianca: 0, sinais: [], evidencias: [], amostra, janelas: { ultimos3: u3, anteriores7: a7 }, vencedor: { sim: false, evidencias: [] } };

  if (amostra.diasComGasto < AMOSTRA_MIN.diasComGasto || amostra.impressoes7d < AMOSTRA_MIN.impressoes7d || amostra.gasto7d < AMOSTRA_MIN.gasto7d) {
    base.evidencias = [`Amostra insuficiente: ${amostra.diasComGasto} dia(s) com gasto, ${amostra.impressoes7d} impressões e ${brl(amostra.gasto7d)} nos últimos 7 dias`];
    return base;
  }

  const sinais: Sinal[] = [];
  // 1. CTR caindo (3d vs 7 anteriores) — precisa de amostra dos DOIS lados: 7 cliques em 600
  // impressões não é queda, é ruído (foi o que quase marcou o TERMOGÊNICO como crítico).
  if (u3.ctr != null && a7.ctr != null && a7.impressions >= 1000 && u3.impressions >= 1500 && u3.clicks >= 10) {
    const var_ = u3.ctr / a7.ctr - 1;
    if (var_ <= -0.25) sinais.push({ chave: "ctr_caindo", forte: var_ <= -0.4, magnitude: -var_, evidencia: `CTR caiu ${pct(var_)}: ${u3.ctr.toFixed(2)}% nos últimos 3 dias contra ${a7.ctr.toFixed(2)}% nos 7 anteriores` });
  }
  // 2. CPM subindo (leilão mais caro para o mesmo público — proxy de saturação)
  if (u3.cpm != null && a7.cpm != null && a7.impressions >= 1000) {
    const var_ = u3.cpm / a7.cpm - 1;
    if (var_ >= 0.3) sinais.push({ chave: "cpm_subindo", forte: var_ >= 0.6, magnitude: var_, evidencia: `CPM subiu ${pct(var_)}: ${brl(u3.cpm)} contra ${brl(a7.cpm)}` });
  }
  // 3. DINHEIRO: conversa contra gasto. Três formas, da mais grave para a mais sutil.
  const meta = e.politica?.cplAlerta ?? e.baseline?.cplMediano ?? null;
  //   a) zero conversa nos últimos 3 dias com gasto que já deveria ter dado 3 conversas
  if (u3.conversions === 0 && u3.spend >= Math.max(20, (meta ?? 10) * 3)) {
    sinais.push({ chave: "sem_conversa", forte: true, magnitude: 1, evidencia: `${brl(u3.spend)} gastos nos últimos 3 dias sem nenhuma conversa${meta ? ` (a meta é ${brl(meta)} por conversa)` : ""}` });
  }
  //   b) 7 dias rendendo menos de 25% das conversas que o gasto deveria dar pela meta do cliente
  //      (1 conversa com R$ 43 quando a meta é R$ 3,39 — CPL "de 1 conversa" não é medida; a
  //      conta esperada × entregue é)
  else if (meta && u7.spend >= meta * 3 && u7.conversions <= Math.max(1, Math.floor((u7.spend / meta) * 0.25))) {
    const esperadas = Math.round(u7.spend / meta);
    sinais.push({ chave: "poucas_conversas", forte: true, magnitude: 1 - u7.conversions / Math.max(1, esperadas), evidencia: `${u7.conversions} conversa${u7.conversions === 1 ? "" : "s"} com ${brl(u7.spend)} em 7 dias — pela meta de ${brl(meta)} eram esperadas ~${esperadas}` });
  }
  //   c) custo por conversa subindo contra o próprio passado (precisa de conversas dos dois lados)
  else if (u3.cpl != null && a7.cpl != null && a7.conversions >= 3 && u3.conversions >= 3) {
    const var_ = u3.cpl / a7.cpl - 1;
    if (var_ >= 0.4) sinais.push({ chave: "cpl_subindo", forte: var_ >= 1, magnitude: var_, evidencia: `Custo por conversa subiu ${pct(var_)}: ${brl(u3.cpl)} contra ${brl(a7.cpl)} nos 7 anteriores` });
  }
  //   d) acima do teto crítico do cliente, com conversas suficientes para o número valer
  if (u7.cpl != null && e.politica?.cplCritico && u7.cpl >= e.politica.cplCritico && u7.conversions >= 3) {
    sinais.push({ chave: "cpl_acima_do_critico", forte: u7.cpl >= e.politica.cplCritico * 2, magnitude: u7.cpl / e.politica.cplCritico, evidencia: `${brl(u7.cpl)} por conversa nos últimos 7 dias — ${(u7.cpl / e.politica.cplCritico).toFixed(1)}× o teto crítico de ${brl(e.politica.cplCritico)}` });
  }
  // 4. Frequência do período (só quando medida)
  if (e.freq7d != null && e.freq7d >= 3) {
    sinais.push({ chave: "frequencia_alta", forte: e.freq7d >= 4.5, magnitude: e.freq7d / 3, evidencia: `Frequência ${e.freq7d.toFixed(1)} em 7 dias — a mesma pessoa viu ${Math.round(e.freq7d)}× ` });
  }
  // 5. Pior que a própria conta (CTR abaixo de 60% da mediana das outras peças)
  if (u7.ctr != null && e.baseline?.ctrMediano && u7.impressions >= 1500 && u7.ctr <= e.baseline.ctrMediano * 0.6) {
    sinais.push({ chave: "abaixo_da_conta", forte: u7.ctr <= e.baseline.ctrMediano * 0.4, magnitude: 1 - u7.ctr / e.baseline.ctrMediano, evidencia: `CTR de ${u7.ctr.toFixed(2)}% contra ${e.baseline.ctrMediano.toFixed(2)}% de mediana da conta` });
  }
  // 6. Idade (fraco sozinho; conta junto com os outros)
  if (diasRodando >= 21) {
    sinais.push({ chave: "idade", forte: false, magnitude: diasRodando / 21, evidencia: `Rodando há ${diasRodando} dias com o mesmo criativo` });
  }

  const fortes = sinais.filter((s) => s.forte).length;
  const n = sinais.length;
  const DINHEIRO = new Set(["sem_conversa", "poucas_conversas", "cpl_subindo", "cpl_acima_do_critico"]);
  const temDinheiroEmJogo = sinais.some((s) => DINHEIRO.has(s.chave));
  const dinheiroForte = sinais.some((s) => DINHEIRO.has(s.chave) && s.forte);
  let estado: EstadoCriativo;
  // CRITICAL = dinheiro saindo agora com evidência forte: ou um sinal forte de dinheiro confirmado
  // por outro sinal, ou "sem/poucas conversas" sozinho quando o gasto já é amostra (3× a meta).
  if (temDinheiroEmJogo && fortes >= 1 && n >= 2) estado = "CRITICAL";
  else if (dinheiroForte && sinais.some((s) => (s.chave === "sem_conversa" || s.chave === "poucas_conversas"))) estado = "CRITICAL";
  else if (dinheiroForte) estado = "FATIGUE_PROBABLE";
  else if (n >= 3 || (n >= 2 && fortes >= 1)) estado = "FATIGUE_PROBABLE";
  else if (n === 2) estado = "FATIGUE_POSSIBLE";
  else if (n === 1) estado = "WATCH";
  else estado = "HEALTHY";

  const severidade = Math.min(100, Math.round(n * 18 + fortes * 15 + (temDinheiroEmJogo ? 15 : 0)));
  // Confiança: amostra (impressões e dias) × concordância (mais sinais independentes = mais certeza)
  const amostraScore = Math.min(1, amostra.impressoes7d / 8000) * 0.6 + Math.min(1, amostra.diasComGasto / 10) * 0.4;
  const concord = n === 0 ? 0.8 : Math.min(1, 0.5 + n * 0.15 + fortes * 0.1);
  const confianca = Math.round(Math.min(0.95, Math.max(0.3, amostraScore * concord)) * 100) / 100;

  // VENCEDOR pela régua do cliente: CPL bem abaixo da meta, conversas mínimas, gasto de decisão.
  const convMin = e.politica?.convMin ?? 5;
  const venc: string[] = [];
  const cplRef = e.politica?.cplAlerta ?? e.baseline?.cplMediano ?? null;
  if (cplRef && u7.cpl != null && u7.cpl <= cplRef * 0.7 && u7.conversions >= convMin && u7.spend >= Math.max(50, cplRef * convMin)) {
    venc.push(`${brl(u7.cpl)} por conversa nos últimos 7 dias — ${Math.round((1 - u7.cpl / cplRef) * 100)}% abaixo da meta de ${brl(cplRef)}`);
    venc.push(`${u7.conversions} conversas com ${brl(u7.spend)} (mínimo do cliente: ${convMin})`);
    if (e.baseline?.ctrMediano && u7.ctr != null && u7.ctr >= e.baseline.ctrMediano * 1.2) venc.push(`CTR ${u7.ctr.toFixed(2)}% acima da mediana da conta (${e.baseline.ctrMediano.toFixed(2)}%)`);
  }
  const vencedor = venc.length > 0 && estado !== "CRITICAL" && estado !== "FATIGUE_PROBABLE";

  return { ...base, estado, severidade, confianca, sinais, evidencias: sinais.map((s) => s.evidencia), vencedor: { sim: vencedor, evidencias: vencedor ? venc : [] } };
}

/** Mediana ponderada simples de uma conta: CTR/CPM/CPL dos criativos com amostra na janela. */
export function baselineDaConta(criativos: { serie: DiaCriativo[] }[], hoje: string): BaselineConta {
  const ctrs: number[] = [], cpms: number[] = [], cpls: number[] = [];
  for (const c of criativos) {
    const j = janela(c.serie, diasAtras(hoje, 6), hoje);
    if (j.impressions >= 1000 && j.ctr != null) ctrs.push(j.ctr);
    if (j.impressions >= 1000 && j.cpm != null) cpms.push(j.cpm);
    if (j.conversions >= 3 && j.cpl != null) cpls.push(j.cpl);
  }
  const med = (xs: number[]) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  return { ctrMediano: med(ctrs), cpmMediano: med(cpms), cplMediano: med(cpls) };
}
