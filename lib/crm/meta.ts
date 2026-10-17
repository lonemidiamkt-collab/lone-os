// lib/crm/meta.ts — A BARRA DA META do comercial ("faltam R$ Y · X%"). Módulo PURO, testado.
//
// Meta do mês = MRR novo vendido: a soma das MENSALIDADES dos negócios ganhos no mês. Tudo aqui é
// conta em código, no fuso de São Paulo — a IA nunca calcula número de meta.
//   progresso  = vendido ÷ meta;  falta = meta − vendido
//   ritmo      = falta ÷ dias úteis restantes (seg–sex, sem feriado nacional; hoje conta se for útil)
//   projeção   = vendido ÷ dias úteis decorridos × dias úteis do mês (nula antes do 3º dia útil:
//                engana quando as vendas se concentram no fim do mês, por isso vai sempre ao lado
//                do ponderado)
//   ponderado  = Σ mensalidade × chance dos negócios ABERTOS que fecham neste mês
//   cobertura  = ponderado ÷ falta → < 1 vermelho, 1–2 amarelo, ≥ 2 verde

import { getStaticHolidays } from "@/lib/holidays/static-fallback";
import { chanceDe, ehAberta, normalizarEtapa } from "@/lib/crm/etapas";

export const hojeSP = (agora: Date = new Date()): string => agora.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
export const mesSP = (agora: Date = new Date()): string => hojeSP(agora).slice(0, 7);

/** Dia (YYYY-MM-DD) de uma data do banco. `fechado_em` é gravado como a data de SP à meia-noite
 * UTC ("2026-10-17" → 2026-10-17T00:00:00Z): o dia certo é o prefixo, não a conversão de fuso. */
export const diaDe = (v: string): string => v.slice(0, 10);

const feriadosCache = new Map<number, Set<string>>();
function feriados(ano: number): Set<string> {
  let s = feriadosCache.get(ano);
  if (!s) { s = new Set(getStaticHolidays(ano).map((h) => h.date)); feriadosCache.set(ano, s); }
  return s;
}

export function ehDiaUtil(ymd: string): boolean {
  const d = new Date(`${ymd}T12:00:00Z`);
  const dow = d.getUTCDay();
  return dow !== 0 && dow !== 6 && !feriados(d.getUTCFullYear()).has(ymd);
}

export function diasUteisDoMes(ym: string): string[] {
  const [ano, mes] = ym.split("-").map(Number);
  const total = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const dias: string[] = [];
  for (let d = 1; d <= total; d++) {
    const ymd = `${ym}-${String(d).padStart(2, "0")}`;
    if (ehDiaUtil(ymd)) dias.push(ymd);
  }
  return dias;
}

export interface LeadParaMeta {
  estagio: unknown;
  valorOrcamento: number | null;
  probabilidade?: number | null;
  fechadoEm: string | null;
  previsaoFechamento?: string | null;
}

export type NivelCobertura = "vermelho" | "amarelo" | "verde";

export interface ResumoMeta {
  mes: string;
  meta: number | null;
  vendido: number;
  ganhos: number;
  progresso: number | null;     // 0..n (1 = bateu)
  falta: number | null;
  bateu: boolean;
  diasUteisMes: number;
  decorridos: number;
  restantes: number;
  ritmoNecessario: number | null;
  projecao: number | null;
  ponderado: number;
  abertosNoMes: number;
  cobertura: number | null;
  nivelCobertura: NivelCobertura | null;
}

const valor = (l: LeadParaMeta) => (typeof l.valorOrcamento === "number" && l.valorOrcamento > 0 ? l.valorOrcamento : 0);

export function calcularMeta(p: { leads: LeadParaMeta[]; metaValor: number | null; hoje: string; mes?: string }): ResumoMeta {
  const mes = p.mes ?? p.hoje.slice(0, 7);
  const ehMesAtual = mes === p.hoje.slice(0, 7);
  const meta = typeof p.metaValor === "number" && p.metaValor > 0 ? p.metaValor : null;

  const ganhosMes = p.leads.filter((l) => normalizarEtapa(l.estagio) === "ganho" && l.fechadoEm && diaDe(l.fechadoEm).slice(0, 7) === mes);
  const vendido = ganhosMes.reduce((s, l) => s + valor(l), 0);

  const uteis = diasUteisDoMes(mes);
  const decorridos = ehMesAtual ? uteis.filter((d) => d <= p.hoje).length : mes < p.hoje.slice(0, 7) ? uteis.length : 0;
  const restantes = ehMesAtual ? uteis.filter((d) => d >= p.hoje).length : mes > p.hoje.slice(0, 7) ? uteis.length : 0;

  const falta = meta == null ? null : Math.max(0, meta - vendido);
  const progresso = meta == null ? null : vendido / meta;
  const ritmoNecessario = falta == null || falta === 0 || restantes === 0 ? null : falta / restantes;
  const projecao = decorridos >= 3 ? (vendido / decorridos) * uteis.length : null;

  // Abertos que fecham neste mês: previsão no mês, ou sem previsão (conta no mês corrente).
  const abertos = p.leads.filter((l) => ehAberta(l.estagio) && valor(l) > 0 &&
    (l.previsaoFechamento ? diaDe(l.previsaoFechamento).slice(0, 7) === mes : ehMesAtual));
  const ponderado = abertos.reduce((s, l) => s + valor(l) * chanceDe({ estagio: l.estagio, probabilidade: l.probabilidade }), 0);

  const cobertura = falta && falta > 0 ? ponderado / falta : null;
  const nivelCobertura: NivelCobertura | null = cobertura == null ? null : cobertura < 1 ? "vermelho" : cobertura < 2 ? "amarelo" : "verde";

  return {
    mes, meta, vendido, ganhos: ganhosMes.length, progresso, falta, bateu: meta != null && vendido >= meta,
    diasUteisMes: uteis.length, decorridos, restantes, ritmoNecessario, projecao,
    ponderado, abertosNoMes: abertos.length, cobertura, nivelCobertura,
  };
}

/** Esforço da semana (seg–dom de SP) e do mês: contatos pelas datas dos toques, propostas pela data de envio. */
export function calcularEsforco(p: { toques: string[]; propostasEnviadasEm: (string | null)[]; hoje: string }) {
  const d = new Date(`${p.hoje}T12:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // 0 = segunda
  const inicioSemana = new Date(d.getTime() - dow * 86_400_000).toISOString().slice(0, 10);
  const diaSPde = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : hojeSP(new Date(iso)));
  const contatosSemana = p.toques.filter((t) => { const x = diaSPde(t); return x >= inicioSemana && x <= p.hoje; }).length;
  const propostasMes = p.propostasEnviadasEm.filter((x): x is string => !!x && diaDe(x).slice(0, 7) === p.hoje.slice(0, 7)).length;
  return { contatosSemana, propostasMes, inicioSemana };
}

export const brl = (v: number): string =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
