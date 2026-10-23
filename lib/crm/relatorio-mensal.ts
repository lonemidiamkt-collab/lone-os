// lib/crm/relatorio-mensal.ts — o RELATÓRIO MENSAL DE VENDAS do Comercial (out/2026), em PDF no grupo de vendas.
//
// Pedido do Roberto (23/10/2026): "todo mês, no grupo de vendas, mandar um relatório bem feito e bem organizado mostrando
// tudo". Decisão (prompt v2): o grupo recebe QUANTIDADES e TAXAS; os valores em R$ (vendido, ticket, meta, ponderado) vão
// só na versão do Roberto — regra da Lone: número financeiro da agência não vai para grupo de WhatsApp.
//
// Aqui só a montagem dos números (puro: sem banco, sem relógio — "hoje" e o mês chegam de fora). As contas de taxa são as
// MESMAS do Dashboard (lib/crm/taxas.ts); o desenho é lib/crm/relatorio-mensal-html.ts; o envio é
// app/api/system/crm-relatorio-mensal. Testado em tests/comercial-relatorio-mensal.test.ts.

import { ROTULO_ETAPA, normalizarEtapa, rotuloMotivo, ETAPAS_ABERTAS } from "@/lib/crm/etapas";
import { ehDiaUtil } from "@/lib/crm/meta";
import { cicloMedioDias, diaDaOportunidade, diaSP, oportunidadesParaContrato, porGrupo, taxaDeFechamento, type EtapaHist, type Fracao, type LeadTaxa, type LinhaGrupo } from "@/lib/crm/taxas";

export interface LeadRel extends LeadTaxa {
  empresa: string | null;
  contatoNome: string;
  valorOrcamento?: number | null;
  valorImplantacao?: number | null;
  probabilidade?: number | null;
  motivoPerdaCodigo?: string | null;
  motivoPerda?: string | null;
  clienteId?: string | null;
  updatedAt?: string | null;
}
export interface AtividadeRel { leadId: string; tipo: string; createdAt: string }
export interface ReuniaoRel { leadId: string; inicio: string; estado: string; criadoEm: string }

const NOME_MES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
export const nomeDoMes = (ym: string) => NOME_MES[Number(ym.slice(5, 7)) - 1];
export const rotuloDoMes = (ym: string) => `${nomeDoMes(ym)} de ${ym.slice(0, 4)}`;
export function mesAnterior(ym: string): string {
  const [a, m] = ym.split("-").map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`;
}
export function mesSeguinte(ym: string): string {
  const [a, m] = ym.split("-").map(Number);
  return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, "0")}`;
}
const ultimoDia = (ym: string) => { const [a, m] = ym.split("-").map(Number); return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10); };
const intervaloDoMes = (ym: string) => ({ ini: `${ym}-01`, fim: ultimoDia(ym) });

/** 1º dia útil do mês (seg–sex, sem feriado nacional): o dia em que o relatório do mês anterior sai. */
export function primeiroDiaUtil(ym: string): string {
  for (let d = 1; d <= 10; d++) {
    const ymd = `${ym}-${String(d).padStart(2, "0")}`;
    if (ehDiaUtil(ymd)) return ymd;
  }
  return `${ym}-01`;
}

const nomeDo = (l: LeadRel) => (l.empresa || "").trim() || l.contatoNome;
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

export interface RelatorioMensal {
  mes: string;
  rotulo: string;
  resumo: {
    vendas: number; vendasAnterior: number;
    oportunidades: number; oportunidadesAnterior: number;
    leads: number; leadsAnterior: number;
    conversao: Fracao;        // das oportunidades do mês, quantas viraram contrato
    fechamento: Fracao;       // dos decididos no mês, quantos ganhos
    cicloDias: number | null;
    frase: string;
  };
  funil: { rotulo: string; n: number }[];
  vendas: { nome: string; origem: string; responsavel: string; cicloDias: number | null; virouCliente: boolean }[];
  origens: LinhaGrupo[];
  perdas: { motivo: string; n: number }[];
  ritmo: { toques: number; propostas: number; reunioesMarcadas: number; reunioesRealizadas: number; naoVeio: number; primeiraRespostaHoras: number | null; primeiraRespostaN: number };
  rota: { visitas: number; oportunidades: number };
  proximo: { abertasPorEtapa: { rotulo: string; n: number }[]; reunioes: { nome: string; dia: string }[]; parados: { nome: string; etapa: string; dias: number }[] };
  /** SÓ na versão do Roberto. Nunca no grupo. */
  dinheiro: { vendido: number; implantacao: number; ticket: number | null; meta: number | null; ponderadoAberto: number };
}

const ORDEM = ["novo", "contato", "diagnostico", "proposta", "negociacao", "ganho"];

/** A etapa mais avançada que o lead já alcançou (pelo histórico e pela etapa atual). */
function etapaMaxima(l: LeadRel, hist: EtapaHist[]): number {
  let max = ORDEM.indexOf(normalizarEtapa(l.estagio));
  for (const h of hist) max = Math.max(max, ORDEM.indexOf(normalizarEtapa(h.para)));
  if (diaDaOportunidade(l, hist)) max = Math.max(max, ORDEM.indexOf("proposta"));
  return max;
}

export function montarRelatorioMensal(p: {
  mes: string;
  agora: Date;
  leads: LeadRel[];
  historico: EtapaHist[];
  atividades: AtividadeRel[];
  reunioes: ReuniaoRel[];
  metaValor: number | null;
}): RelatorioMensal {
  const { mes, leads, historico, atividades, reunioes } = p;
  const iv = intervaloDoMes(mes);
  const ivAnt = intervaloDoMes(mesAnterior(mes));
  const dentro = (v: string | null | undefined, i = iv) => { const d = diaSP(v); return !!d && d >= i.ini && d <= i.fim; };
  const porLead = new Map<string, EtapaHist[]>();
  for (const h of historico) porLead.set(h.leadId, [...(porLead.get(h.leadId) ?? []), h]);
  const histDe = (l: LeadRel) => porLead.get(l.id) ?? [];

  const ganhosDoMes = leads.filter((l) => normalizarEtapa(l.estagio) === "ganho" && dentro(l.fechadoEm));
  const vendasAnterior = leads.filter((l) => normalizarEtapa(l.estagio) === "ganho" && dentro(l.fechadoEm, ivAnt)).length;
  const conv = oportunidadesParaContrato(leads, historico, iv);
  const convAnt = oportunidadesParaContrato(leads, historico, ivAnt);
  const fech = taxaDeFechamento(leads, iv);
  const leadsDoMes = leads.filter((l) => dentro(l.createdAt));
  const leadsAnterior = leads.filter((l) => dentro(l.createdAt, ivAnt)).length;
  const abertos = leads.filter((l) => (ETAPAS_ABERTAS as readonly string[]).includes(normalizarEtapa(l.estagio)));

  // Frase de leitura — em código, sem IA: o número é o que o sistema registrou.
  const nomeMes = nomeDoMes(mes);
  const abertasOport = abertos.filter((l) => diaDaOportunidade(l, histDe(l))).length;
  let frase: string;
  if (ganhosDoMes.length === 0) {
    frase = `Nenhuma venda fechada em ${nomeMes}.${abertasOport ? ` ${plural(abertasOport, "oportunidade segue aberta", "oportunidades seguem abertas")} para ${nomeDoMes(mesSeguinte(mes))}.` : ""}`;
  } else {
    const dif = ganhosDoMes.length - vendasAnterior;
    const semHistorico = leads.every((l) => (diaSP(l.createdAt) ?? "") >= iv.ini);
    const comparacao = semHistorico ? "o primeiro mês do Comercial" : dif > 0 ? `${dif} a mais que ${nomeDoMes(mesAnterior(mes))}` : dif < 0 ? `${-dif} a menos que ${nomeDoMes(mesAnterior(mes))}` : `o mesmo que ${nomeDoMes(mesAnterior(mes))}`;
    frase = `${plural(ganhosDoMes.length, "venda fechada", "vendas fechadas")} em ${nomeMes} — ${comparacao}.`;
  }

  // Funil dos leads que ENTRARAM no mês: até onde cada um já chegou.
  const passos: [string, number][] = [["Entraram", 0], ["Contato feito", 1], ["Diagnóstico", 2], ["Proposta", 3], ["Contrato", 5]];
  const funil = passos.map(([rotulo, idx]) => ({
    rotulo,
    n: idx === 0 ? leadsDoMes.length : idx === 5 ? leadsDoMes.filter((l) => normalizarEtapa(l.estagio) === "ganho").length : leadsDoMes.filter((l) => etapaMaxima(l, histDe(l)) >= idx).length,
  }));

  const perdasMap = new Map<string, number>();
  for (const l of leads.filter((x) => normalizarEtapa(x.estagio) === "perdido" && dentro(x.fechadoEm))) {
    const m = rotuloMotivo(l.motivoPerdaCodigo) ?? ((l.motivoPerda || "").trim() || "Sem motivo registrado");
    perdasMap.set(m, (perdasMap.get(m) ?? 0) + 1);
  }

  // Primeira resposta: só lead que CHEGOU sozinho (site, anúncio) — visita da Rota conta contato na hora e engana.
  const chegaramSozinhos = leadsDoMes.filter((l) => /site|anúncio|anuncio|instagram|whatsapp/i.test(l.origem ?? "") && l.primeiroContatoEm);
  const horas = chegaramSozinhos.map((l) => (Date.parse(l.primeiroContatoEm!) - Date.parse(l.createdAt)) / 3_600_000).filter((h) => h >= 0);
  const reunioesDoMes = reunioes.filter((r) => dentro(r.inicio));

  const hoje = diaSP(p.agora.toISOString())!;
  const diasDesde = (v: string | null | undefined) => { const d = diaSP(v); return d ? Math.max(0, Math.round((Date.parse(`${hoje}T12:00:00Z`) - Date.parse(`${d}T12:00:00Z`)) / 86_400_000)) : 0; };

  const vendido = ganhosDoMes.reduce((s, l) => s + (l.valorOrcamento ?? 0), 0);
  return {
    mes,
    rotulo: rotuloDoMes(mes),
    resumo: {
      vendas: ganhosDoMes.length, vendasAnterior,
      oportunidades: conv.oportunidades, oportunidadesAnterior: convAnt.oportunidades,
      leads: leadsDoMes.length, leadsAnterior,
      conversao: conv.fracao, fechamento: fech.fracao,
      cicloDias: cicloMedioDias(leads, iv),
      frase,
    },
    funil,
    vendas: ganhosDoMes
      .sort((a, b) => (diaSP(a.fechadoEm) ?? "").localeCompare(diaSP(b.fechadoEm) ?? ""))
      .map((l) => ({ nome: nomeDo(l), origem: (l.origem || "").trim() || "—", responsavel: (l.responsavel || "").trim() || "—", cicloDias: cicloMedioDias([l], iv), virouCliente: !!l.clienteId })),
    origens: porGrupo(leads, historico, iv, (l) => l.origem, "Sem origem"),
    perdas: [...perdasMap.entries()].map(([motivo, n]) => ({ motivo, n })).sort((a, b) => b.n - a.n),
    ritmo: {
      toques: atividades.filter((a) => ["whatsapp", "ligacao", "visita", "email"].includes(a.tipo) && dentro(a.createdAt)).length,
      propostas: leads.filter((l) => dentro(l.propostaEnviadaEm)).length,
      reunioesMarcadas: reunioes.filter((r) => dentro(r.criadoEm)).length,
      reunioesRealizadas: reunioesDoMes.filter((r) => r.estado === "realizada").length,
      naoVeio: reunioesDoMes.filter((r) => r.estado === "nao_veio").length,
      primeiraRespostaHoras: horas.length ? Math.round((horas.reduce((s, h) => s + h, 0) / horas.length) * 10) / 10 : null,
      primeiraRespostaN: horas.length,
    },
    rota: {
      visitas: leadsDoMes.filter((l) => /rota/i.test(l.origem ?? "")).length,
      oportunidades: leadsDoMes.filter((l) => /rota/i.test(l.origem ?? "") && diaDaOportunidade(l, histDe(l))).length,
    },
    proximo: {
      abertasPorEtapa: (ETAPAS_ABERTAS as readonly string[]).map((e) => ({ rotulo: ROTULO_ETAPA[e as keyof typeof ROTULO_ETAPA] ?? e, n: abertos.filter((l) => normalizarEtapa(l.estagio) === e).length })).filter((x) => x.n > 0),
      reunioes: reunioes
        .filter((r) => r.estado === "agendada" && Date.parse(r.inicio) >= p.agora.getTime())
        .sort((a, b) => a.inicio.localeCompare(b.inicio))
        .slice(0, 8)
        .map((r) => { const l = leads.find((x) => x.id === r.leadId); return { nome: l ? nomeDo(l) : "Lead", dia: diaSP(r.inicio)! }; }),
      parados: abertos
        .filter((l) => normalizarEtapa(l.estagio) !== "novo")
        .map((l) => ({ nome: nomeDo(l), etapa: ROTULO_ETAPA[normalizarEtapa(l.estagio) as keyof typeof ROTULO_ETAPA] ?? l.estagio, dias: diasDesde(l.etapaDesde ?? l.updatedAt ?? l.createdAt) }))
        .sort((a, b) => b.dias - a.dias)
        .slice(0, 5),
    },
    dinheiro: {
      vendido,
      implantacao: ganhosDoMes.reduce((s, l) => s + (l.valorImplantacao ?? 0), 0),
      ticket: ganhosDoMes.length ? Math.round(vendido / ganhosDoMes.length) : null,
      meta: p.metaValor,
      ponderadoAberto: Math.round(abertos.reduce((s, l) => s + (l.valorOrcamento ?? 0) * (l.probabilidade ?? 0), 0)),
    },
  };
}

