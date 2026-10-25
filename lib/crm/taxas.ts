// lib/crm/taxas.ts — taxa de fechamento do Comercial: UMA definição, usada no Dashboard, nos Relatórios e no relatório
// mensal do grupo de vendas (out/2026).
//
// POR QUE: havia 4 números que se contradiziam — "Taxa de ganho 2 de 2" (ganhos ÷ ganhos+perdidos, e ninguém marca
// perdido: 100% para sempre), "Entrada → contrato 6%" (desde o início, ignorando o período), "Conversão por origem" com
// barra cheia em 1 de 1 e "Por responsável 10%". Decisão do Roberto (23/10/2026, recomendação do prompt v2):
//   • OPORTUNIDADE = lead que chegou a Proposta (Proposta, Negociação ou Ganho). Visita da Rota e "contato feito" ainda
//     são prospecção. A data da oportunidade é a primeira entrada numa dessas etapas.
//   • OPORTUNIDADES → CONTRATO = das oportunidades abertas no período, quantas viraram ganho (até hoje). É o número que
//     responde "oportunidades × fechamento".
//   • TAXA DE FECHAMENTO = dos negócios DECIDIDOS no período (ganho ou perdido pela data de fechamento), quantos foram
//     ganhos.
//   • Menos de 5 no denominador → "2 de 9", sem porcentagem (porcentagem de amostra pequena engana).
// Puro: sem banco, sem relógio (o período chega de fora). Testado em tests/comercial-taxas.test.ts.

import { normalizarEtapa } from "@/lib/crm/etapas";

export const AMOSTRA_MINIMA = 5;
export const ETAPAS_DE_OPORTUNIDADE = ["proposta", "negociacao", "ganho"] as const;

export interface EtapaHist { leadId: string; para: string; em: string }

export interface LeadTaxa {
  id: string;
  estagio: string;
  createdAt: string;
  fechadoEm?: string | null;
  etapaDesde?: string | null;
  propostaEnviadaEm?: string | null;
  primeiroContatoEm?: string | null;
  origem?: string | null;
  responsavel?: string | null;
}

export interface Fracao { n: number; de: number; pct: number | null; poucos: boolean }
export const fracao = (n: number, de: number): Fracao => ({ n, de, pct: de >= AMOSTRA_MINIMA ? Math.round((n / de) * 100) : null, poucos: de < AMOSTRA_MINIMA });

/** "2 de 9" com amostra pequena; "22%" quando dá. */
export function textoFracao(f: Fracao): string {
  return f.pct === null ? `${f.n} de ${f.de}` : `${f.pct}%`;
}

export interface Intervalo { ini: string; fim: string } // AAAA-MM-DD, inclusivo

/** Dia em São Paulo (AAAA-MM-DD) de uma data ou timestamp. */
export function diaSP(v: string | null | undefined): string | null {
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}
const dentro = (dia: string | null, iv: Intervalo | null) => !!dia && (!iv || (dia >= iv.ini && dia <= iv.fim));

function historicoPorLead(hist: EtapaHist[]): Map<string, EtapaHist[]> {
  const m = new Map<string, EtapaHist[]>();
  for (const h of hist) m.set(h.leadId, [...(m.get(h.leadId) ?? []), h]);
  return m;
}

/** Primeiro dia em que o lead virou oportunidade (entrou em Proposta, Negociação ou Ganho) — ou null se nunca. */
export function diaDaOportunidade(l: LeadTaxa, hist: EtapaHist[] = []): string | null {
  const candidatos: string[] = [];
  for (const h of hist) if ((ETAPAS_DE_OPORTUNIDADE as readonly string[]).includes(normalizarEtapa(h.para))) candidatos.push(diaSP(h.em)!);
  if (l.propostaEnviadaEm) candidatos.push(diaSP(l.propostaEnviadaEm)!);
  const atual = normalizarEtapa(l.estagio);
  if ((ETAPAS_DE_OPORTUNIDADE as readonly string[]).includes(atual) && candidatos.length === 0) {
    candidatos.push(diaSP(atual === "ganho" ? l.fechadoEm ?? l.etapaDesde : l.etapaDesde ?? l.createdAt) ?? diaSP(l.createdAt)!);
  }
  // Perdido que passou por Proposta conta como oportunidade perdida (pelo histórico ou pela proposta enviada).
  const validos = candidatos.filter(Boolean).sort();
  return validos[0] ?? null;
}

export interface Conversao {
  oportunidades: number;
  ganhas: number;
  perdidas: number;
  abertas: number;
  fracao: Fracao;
}

/** Das oportunidades abertas no período (null = desde o início), quantas viraram contrato até hoje. */
export function oportunidadesParaContrato(leads: LeadTaxa[], hist: EtapaHist[], iv: Intervalo | null): Conversao {
  const porLead = historicoPorLead(hist);
  let oportunidades = 0, ganhas = 0, perdidas = 0;
  for (const l of leads) {
    if (!dentro(diaDaOportunidade(l, porLead.get(l.id)), iv)) continue;
    oportunidades++;
    const e = normalizarEtapa(l.estagio);
    if (e === "ganho") ganhas++;
    else if (e === "perdido") perdidas++;
  }
  return { oportunidades, ganhas, perdidas, abertas: oportunidades - ganhas - perdidas, fracao: fracao(ganhas, oportunidades) };
}

/** Dos negócios decididos no período (ganho ou perdido pela data de fechamento), quantos foram ganhos. */
export function taxaDeFechamento(leads: LeadTaxa[], iv: Intervalo | null): { ganhos: number; perdidos: number; fracao: Fracao } {
  let ganhos = 0, perdidos = 0;
  for (const l of leads) {
    const e = normalizarEtapa(l.estagio);
    if ((e !== "ganho" && e !== "perdido") || !dentro(diaSP(l.fechadoEm), iv)) continue;
    if (e === "ganho") ganhos++; else perdidos++;
  }
  return { ganhos, perdidos, fracao: fracao(ganhos, ganhos + perdidos) };
}

/** Dias do primeiro contato (ou do cadastro) até o ganho, média dos ganhos do período. null sem ganho. */
export function cicloMedioDias(leads: LeadTaxa[], iv: Intervalo | null): number | null {
  const dias: number[] = [];
  for (const l of leads) {
    if (normalizarEtapa(l.estagio) !== "ganho" || !dentro(diaSP(l.fechadoEm), iv)) continue;
    const ini = diaSP(l.primeiroContatoEm) ?? diaSP(l.createdAt);
    const fim = diaSP(l.fechadoEm);
    if (ini && fim) dias.push(Math.max(0, Math.round((Date.parse(`${fim}T12:00:00Z`) - Date.parse(`${ini}T12:00:00Z`)) / 86_400_000)));
  }
  return dias.length ? Math.round(dias.reduce((s, d) => s + d, 0) / dias.length) : null;
}

export interface LinhaGrupo { chave: string; leads: number; oportunidades: number; ganhos: number; fracao: Fracao }

/** Leads que entraram no período, quantos viraram oportunidade e quantos ganharam — por origem ou por responsável. */
export function porGrupo(leads: LeadTaxa[], hist: EtapaHist[], iv: Intervalo | null, chave: (l: LeadTaxa) => string | null | undefined, semValor: string): LinhaGrupo[] {
  const porLead = historicoPorLead(hist);
  const m = new Map<string, LinhaGrupo>();
  for (const l of leads) {
    if (!dentro(diaSP(l.createdAt), iv)) continue;
    const k = (chave(l) ?? "").trim() || semValor;
    const g = m.get(k) ?? { chave: k, leads: 0, oportunidades: 0, ganhos: 0, fracao: fracao(0, 0) };
    g.leads++;
    if (diaDaOportunidade(l, porLead.get(l.id))) g.oportunidades++;
    if (normalizarEtapa(l.estagio) === "ganho") g.ganhos++;
    m.set(k, g);
  }
  return [...m.values()]
    .map((g) => ({ ...g, fracao: fracao(g.ganhos, g.oportunidades) }))
    .sort((a, b) => b.ganhos - a.ganhos || b.oportunidades - a.oportunidades || b.leads - a.leads);
}

export interface LinhaCoorte { ym: string; entraram: number; oportunidade: number; ganharam: number; perderam: number; abertos: number }

/** Coorte por mês de entrada: dos leads que entraram em cada mês, onde estão hoje. */
export function coortePorMes(leads: LeadTaxa[], hist: EtapaHist[], meses: string[]): LinhaCoorte[] {
  const porLead = historicoPorLead(hist);
  return meses.map((ym) => {
    const doMes = leads.filter((l) => (diaSP(l.createdAt) ?? "").slice(0, 7) === ym);
    const ganharam = doMes.filter((l) => normalizarEtapa(l.estagio) === "ganho").length;
    const perderam = doMes.filter((l) => normalizarEtapa(l.estagio) === "perdido").length;
    return {
      ym,
      entraram: doMes.length,
      oportunidade: doMes.filter((l) => diaDaOportunidade(l, porLead.get(l.id))).length,
      ganharam,
      perderam,
      abertos: doMes.length - ganharam - perderam,
    };
  });
}
