// lib/crm/painel.ts — as contas do DASHBOARD do Comercial (redesign de out/2026, Leva D2 do
// PROMPT-DESIGN-COMERCIAL.md). Módulo PURO, testado; o componente só desenha.
//
// Princípios (pesquisa de mercado + Âncora): todo número tem JANELA ("este mês", "agora") e, quando dá,
// VARIAÇÃO contra o período anterior; número com amostra pequena vira "X de Y" em vez de porcentagem;
// nada de métrica que engana (o "1º contato" só conta lead que chegou sozinho — visita é contato na hora).

import { ETAPAS_ABERTAS, ehAberta, normalizarEtapa } from "@/lib/crm/etapas";
import { calcularMeta, diaDe, diasUteisDoMes, type LeadParaMeta, type ResumoMeta } from "@/lib/crm/meta";
import { proximoToque } from "@/lib/crm/cadencia";
import { diasParado, inicioDaCadencia, montarFilaHoje, type LeadHoje } from "@/lib/crm/hoje";
import type { CrmEstagio } from "@/lib/types";
import type { Fatia } from "@/lib/crm/graficos";

export type Periodo = "mes" | "mes_passado" | "30d";
export const ROTULO_PERIODO: Record<Periodo, string> = { mes: "Este mês", mes_passado: "Mês passado", "30d": "30 dias" };

export interface LeadPainel extends LeadHoje, LeadParaMeta {
  estagio: string;
  responsavel?: string | null;
}

// ─── Datas ──────────────────────────────────────────────────────────────────────────────────────

const somaDias = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const ultimoDiaDoMes = (ym: string) => { const [a, m] = ym.split("-").map(Number); return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10); };
const mesAnterior = (ym: string) => { const [a, m] = ym.split("-").map(Number); return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`; };
const diaSP = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }));
const dentro = (ymd: string, ini: string, fim: string) => ymd >= ini && ymd <= fim;

export interface Intervalo {
  ini: string; fim: string;              // período mostrado
  antIni: string; antFim: string;        // período anterior, do mesmo tamanho (para a variação)
  mes: string;                           // mês da meta
  rotuloAnterior: string;                // "vs. setembro", "vs. 30 dias anteriores"
}

const NOME_MES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
export const nomeDoMes = (ym: string) => NOME_MES[Number(ym.slice(5, 7)) - 1];

/**
 * Este mês = do dia 1 até hoje, comparado com o mês anterior até o MESMO dia (como o Âncora: comparar
 * mês inteiro com meio mês engana). Mês passado = mês fechado contra o anterior fechado. 30 dias = os
 * 30 últimos contra os 30 de antes.
 */
export function intervaloDoPeriodo(periodo: Periodo, hoje: string): Intervalo {
  const mes = hoje.slice(0, 7);
  if (periodo === "mes") {
    const ant = mesAnterior(mes);
    const dia = Math.min(Number(hoje.slice(8, 10)), Number(ultimoDiaDoMes(ant).slice(8, 10)));
    return { ini: `${mes}-01`, fim: hoje, antIni: `${ant}-01`, antFim: `${ant}-${String(dia).padStart(2, "0")}`, mes, rotuloAnterior: `vs. ${nomeDoMes(ant)}` };
  }
  if (periodo === "mes_passado") {
    const m = mesAnterior(mes);
    const ant = mesAnterior(m);
    return { ini: `${m}-01`, fim: ultimoDiaDoMes(m), antIni: `${ant}-01`, antFim: ultimoDiaDoMes(ant), mes: m, rotuloAnterior: `vs. ${nomeDoMes(ant)}` };
  }
  return { ini: somaDias(hoje, -29), fim: hoje, antIni: somaDias(hoje, -59), antFim: somaDias(hoje, -30), mes, rotuloAnterior: "vs. 30 dias anteriores" };
}

export interface Variacao { pct: number | null; direcao: "sobe" | "desce" | "igual" | "sem_base" }

/** Variação contra o período anterior. Anterior zero não dá porcentagem: "sem base para comparar". */
export function variacao(atual: number, anterior: number): Variacao {
  if (anterior <= 0) return { pct: null, direcao: atual > 0 ? "sem_base" : "igual" };
  const pct = Math.round(((atual - anterior) / anterior) * 100);
  return { pct, direcao: pct > 0 ? "sobe" : pct < 0 ? "desce" : "igual" };
}

// ─── Herói da meta ──────────────────────────────────────────────────────────────────────────────

export interface HeroiMeta extends ResumoMeta {
  fracaoDoMes: number;         // 0..1 de dias úteis já passados (o tique na barra)
  vendidoAnterior: number;     // mesmo recorte do período anterior
  variacao: Variacao;
  sugestao: number;            // meta sugerida quando não há meta
  esperadoAteHoje: number | null; // "no ritmo do mês já teriam entrado R$ X"
}

const valorDe = (l: LeadParaMeta) => (typeof l.valorOrcamento === "number" && l.valorOrcamento > 0 ? l.valorOrcamento : 0);

/** Sugestão quando não há meta: o que já entrou + o ponderado do funil, arredondado para cima ao milhar. */
export function sugestaoDeMeta(vendido: number, ponderado: number): number {
  return Math.max(1000, Math.ceil((vendido + ponderado) / 1000) * 1000);
}

export function heroiDaMeta(p: { leads: LeadPainel[]; metaValor: number | null; hoje: string; intervalo: Intervalo }): HeroiMeta {
  const { intervalo: iv } = p;
  const ehMesAtual = iv.mes === p.hoje.slice(0, 7);
  const r = calcularMeta({ leads: p.leads, metaValor: p.metaValor, hoje: ehMesAtual ? p.hoje : iv.fim, mes: iv.mes });
  const uteis = diasUteisDoMes(iv.mes);
  const fracaoDoMes = uteis.length ? Math.min(1, r.decorridos / uteis.length) : 0;
  const vendidoAnterior = p.leads
    .filter((l) => normalizarEtapa(l.estagio) === "ganho" && l.fechadoEm && dentro(diaDe(l.fechadoEm), iv.antIni, iv.antFim))
    .reduce((s, l) => s + valorDe(l), 0);
  return {
    ...r, fracaoDoMes, vendidoAnterior,
    variacao: variacao(r.vendido, vendidoAnterior),
    sugestao: sugestaoDeMeta(r.vendido, r.ponderado),
    esperadoAteHoje: r.meta != null ? Math.round(r.meta * fracaoDoMes) : null,
  };
}

// ─── Números da faixa 1 ─────────────────────────────────────────────────────────────────────────

/** Abaixo disto, porcentagem engana: mostra "2 de 3". */
export const AMOSTRA_MINIMA = 5;

export interface Taxa { feitos: number; total: number; pct: number | null; poucos: boolean }
const taxa = (feitos: number, total: number): Taxa =>
  ({ feitos, total, pct: total ? Math.round((feitos / total) * 100) : null, poucos: total < AMOSTRA_MINIMA });

/** Taxa de ganho desde o início: ganhos ÷ fechados (ganho + perdido), por quantidade e por valor. */
export function taxaDeGanho(leads: LeadPainel[]): Taxa & { pctValor: number | null } {
  const fechados = leads.filter((l) => ["ganho", "perdido"].includes(normalizarEtapa(l.estagio)));
  const ganhos = fechados.filter((l) => normalizarEtapa(l.estagio) === "ganho");
  const vTotal = fechados.reduce((s, l) => s + valorDe(l), 0);
  const vGanho = ganhos.reduce((s, l) => s + valorDe(l), 0);
  return { ...taxa(ganhos.length, fechados.length), pctValor: vTotal ? Math.round((vGanho / vTotal) * 100) : null };
}

/**
 * Follow-up em dia, AGORA: dos leads abertos que têm próximo passo na régua (fora os estacionados de
 * propósito com "retomar em"), quantos NÃO estão atrasados.
 */
export function followUpEmDia(leads: LeadPainel[], hoje: string): Taxa {
  let total = 0, emDia = 0;
  for (const l of leads) {
    if (!ehAberta(l.estagio) || (l.retomarEm && l.retomarEm > hoje)) continue;
    const t = proximoToque({ estagio: l.estagio, inicio: inicioDaCadencia(l), toques: l.avancos ?? [], hoje, retomarEm: l.retomarEm });
    if (!t) continue;
    total++;
    if (t.situacao !== "atrasado") emDia++;
  }
  return taxa(emDia, total);
}

/** Leads que entraram no período (pela data de cadastro) e no anterior. */
export function leadsNovos(leads: LeadPainel[], iv: Intervalo): { atual: number; anterior: number; variacao: Variacao } {
  const atual = leads.filter((l) => dentro(diaSP(l.createdAt), iv.ini, iv.fim)).length;
  const anterior = leads.filter((l) => dentro(diaSP(l.createdAt), iv.antIni, iv.antFim)).length;
  return { atual, anterior, variacao: variacao(atual, anterior) };
}

// ─── Precisa da sua atenção ─────────────────────────────────────────────────────────────────────

/** Dias sem nenhum movimento que tornam um negócio PARADO, por etapa (o "rotting" do Pipedrive). */
export const DIAS_PARADO: Record<string, number> = { novo: 1, contato: 7, diagnostico: 5, proposta: 5, negociacao: 4 };

export type ChaveAtencao = "atrasados" | "parados" | "responder" | "regua" | "sem_telefone";
export interface ItemAtencao<L> { chave: ChaveAtencao; rotulo: string; dica: string; tom: "danger" | "warning" | "primary"; leads: L[] }

export function precisaDeAtencao<L extends LeadPainel>(leads: L[], hoje: string, agora: Date): ItemAtencao<L>[] {
  const fila = montarFilaHoje(leads, hoje, agora);
  const ids = (pred: (i: (typeof fila)[number]) => boolean) => fila.filter(pred).map((i) => i.lead);
  const abertos = leads.filter((l) => ehAberta(l.estagio) && !(l.retomarEm && l.retomarEm > hoje));
  const itens: ItemAtencao<L>[] = [
    { chave: "responder", rotulo: "Lead novo sem resposta", dica: "chegou e ninguém falou ainda", tom: "danger", leads: ids((i) => i.grupo === "responder") },
    { chave: "atrasados", rotulo: "Follow-ups atrasados", dica: "passo da régua vencido", tom: "danger", leads: ids((i) => i.grupo === "toque" && i.toque?.situacao === "atrasado") },
    { chave: "parados", rotulo: "Negócios parados", dica: "sem movimento além do normal da etapa", tom: "warning",
      leads: abertos.filter((l) => diasParado(l, hoje) > (DIAS_PARADO[normalizarEtapa(l.estagio)] ?? 7)) },
    { chave: "regua", rotulo: "Régua encerrada", dica: "decidir: perdido ou retomar", tom: "warning", leads: ids((i) => i.grupo === "fim") },
    { chave: "sem_telefone", rotulo: "Sem WhatsApp", dica: "pegar pelo Instagram", tom: "primary", leads: abertos.filter((l) => !l.telefone) },
  ];
  return itens.filter((i) => i.leads.length > 0);
}

// ─── Funil, origem, atividade e tempo de resposta ───────────────────────────────────────────────

export interface DegrauFunil { etapa: CrmEstagio; n: number; pctDaAnterior: number | null }

/**
 * Quantos leads ALCANÇARAM cada etapa (quem está em Negociação já passou por Contato, Diagnóstico e
 * Proposta; ganho passou por todas). Perdido só conta no primeiro degrau: não guardamos até onde ele foi.
 */
export function funilDeConversao(leads: LeadPainel[]): { degraus: DegrauFunil[]; total: number; ganhos: number; pctTotal: number | null } {
  const ordem: CrmEstagio[] = [...ETAPAS_ABERTAS, "ganho"];
  const pos = (e: CrmEstagio) => ordem.indexOf(e);
  const validos = leads.map((l) => normalizarEtapa(l.estagio));
  const degraus = ordem.map((etapa, i) => ({
    etapa,
    n: validos.filter((e) => (e === "perdido" ? i === 0 : pos(e) >= i)).length,
    pctDaAnterior: null as number | null,
  }));
  for (let i = 1; i < degraus.length; i++) {
    const ant = degraus[i - 1].n;
    degraus[i].pctDaAnterior = ant ? Math.round((degraus[i].n / ant) * 100) : null;
  }
  const total = degraus[0].n;
  const ganhos = degraus[degraus.length - 1].n;
  return { degraus, total, ganhos, pctTotal: total ? Math.round((ganhos / total) * 100) : null };
}

/** Fatias de origem (a rosca junta o que passar de 4 em "Outros"). */
export function fatiasDeOrigem(leads: LeadPainel[], iv: Intervalo | null): Fatia[] {
  const m = new Map<string, number>();
  for (const l of leads) {
    if (iv && !dentro(diaSP(l.createdAt), iv.ini, iv.fim)) continue;
    const k = (l.origem ?? "").trim() || "Sem origem";
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].map(([rotulo, valor]) => ({ chave: rotulo, rotulo, valor }));
}

/** Contatos (WhatsApp, ligação, visita…) por dia na semana corrente (seg–dom), pelas datas dos toques. */
export function atividadeDaSemana(leads: LeadPainel[], hoje: string): { dias: { dia: string; n: number; futuro: boolean }[]; total: number } {
  const d = new Date(`${hoje}T12:00:00Z`);
  const segunda = somaDias(hoje, -((d.getUTCDay() + 6) % 7));
  const dias = Array.from({ length: 7 }, (_, i) => ({ dia: somaDias(segunda, i), n: 0, futuro: somaDias(segunda, i) > hoje }));
  for (const l of leads) for (const t of l.toques ?? []) {
    const x = dias.find((dd) => dd.dia === diaSP(t));
    if (x) x.n++;
  }
  return { dias, total: dias.reduce((s, x) => s + x.n, 0) };
}

const ORIGENS_QUE_CHEGAM = ["Site", "Anúncio → site"];
const mediana = (v: number[]) => { if (!v.length) return null; const s = [...v].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

/** Tempo até o 1º contato, em horas (mediana), só de quem chegou sozinho (site, anúncio). */
export function tempoDePrimeiraResposta(leads: LeadPainel[], iv: Intervalo): { horas: number | null; n: number; anterior: number | null } {
  const horas = (ini: string, fim: string) => leads
    .filter((l) => ORIGENS_QUE_CHEGAM.includes(l.origem ?? "") && l.primeiroContatoEm && dentro(diaSP(l.createdAt), ini, fim))
    .map((l) => Math.max(0, (Date.parse(l.primeiroContatoEm!) - Date.parse(l.createdAt)) / 3_600_000));
  const atual = horas(iv.ini, iv.fim);
  return { horas: mediana(atual), n: atual.length, anterior: mediana(horas(iv.antIni, iv.antFim)) };
}

/** "45 min", "3,5 h", "2 dias". */
export function duracaoCurta(horas: number | null): string {
  if (horas == null) return "—";
  if (horas < 1) return `${Math.max(1, Math.round(horas * 60))} min`;
  if (horas < 48) return `${horas.toFixed(1).replace(".", ",").replace(",0", "")} h`;
  return `${Math.round(horas / 24)} dias`;
}

/** Saudação pela hora de São Paulo. */
export function saudacao(agora: Date): string {
  const h = Number(agora.toLocaleString("en-US", { timeZone: "America/Sao_Paulo", hour: "numeric", hour12: false }));
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

/** "Sábado, 17 de outubro" */
export function dataPorExtenso(hoje: string): string {
  const d = new Date(`${hoje}T12:00:00Z`);
  const semana = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"][d.getUTCDay()];
  return `${semana}, ${Number(hoje.slice(8, 10))} de ${nomeDoMes(hoje.slice(0, 7))}`;
}

