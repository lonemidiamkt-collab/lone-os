// lib/crm-externo/metricas.ts — A LÍNGUA COMUM DOS CRMs. Módulo PURO (sem rede, sem banco).
//
// Roberto (18/11/2026): "preparar o nosso sistema para ter API de integração com esses outros CRMs. Pode ser o
// Kommo, pode ser qualquer outro" — e as métricas entrando no relatório semanal, no mensal e no painel de resultados
// do cliente: tempo de atendimento, ciclo, quantidade de vendas, orçamentos, etapas do funil.
//
// Cada CRM fala do seu jeito; aqui tudo vira `MetricasCrm`, e o relatório (lib/crm-externo/relatorio.ts), o PDF e
// o portal só conhecem esta forma. Conectar um CRM novo = escrever a tradução dele para cá, nada mais.
//
// FALHA ≠ ZERO (docs/ERRO_RECUPERAVEL.md). Três estados por métrica, e a diferença importa:
//   número      → o CRM respondeu (zero é zero de verdade);
//   indisponivel → o CRM devia ter respondido e não respondeu: o bloco sai do PDF e o time é avisado;
//   naoOferece   → este CRM não tem esse dado (o Kommo não mede tempo de resposta): a métrica não aparece.
//
// PII: só número e nome de ETAPA passam por aqui. Nome de contato, de vendedor e telefone nunca entram.

import { z } from "zod";

export type ProvedorCrm = "ancora" | "kommo" | "api_aberta";
export const PROVEDORES_CRM: readonly ProvedorCrm[] = ["ancora", "kommo", "api_aberta"];
export const ROTULO_PROVEDOR: Record<ProvedorCrm, string> = { ancora: "Âncora CRM", kommo: "Kommo", api_aberta: "API aberta" };

export type BlocoCrm = "leads" | "resposta" | "vendas" | "orcamentos" | "ciclo" | "perdidos" | "funil" | "recuperadas" | "conversao";
export const ROTULO_BLOCO: Record<BlocoCrm, string> = {
  leads: "leads", resposta: "tempo de resposta", vendas: "vendas", orcamentos: "orçamentos", ciclo: "ciclo de venda",
  perdidos: "negócios perdidos", funil: "etapas do funil", recuperadas: "vendas recuperadas", conversao: "conversão",
};

/** Régua de tempo de resposta (a mesma do Âncora: lib/conversations/sla de lá). */
export const RESPOSTA_BOA_SEG = 300;
export const RESPOSTA_ESTOURADA_SEG = 600;

export interface MetricasCrm {
  /** contatos que viraram lead no período */
  leads: number | null;
  /** primeira resposta: mediana e p90 em segundos; faixas pela régua de 5 e 10 minutos */
  resposta: { medianaSeg: number | null; p90Seg: number | null; respondidas: number; faixas: { boa: number; atencao: number; estourada: number } | null } | null;
  vendas: { quantidade: number; valorCentavos: number | null } | null;
  /** orçamentos (negócios) criados no período */
  orcamentos: { quantidade: number; valorCentavos: number | null } | null;
  /** da criação do negócio até a venda, das vendas do período */
  ciclo: { medianaHoras: number | null; contados: number } | null;
  perdidos: number | null;
  /** venda de negócio que já tinha sido perdido (reversão) ou de quem tinha perdido outro (reconquista) */
  recuperadas: { negocios: number; valorCentavos: number } | null;
  /** foto de AGORA: negócios abertos por etapa, na ordem do funil */
  funil: { etapa: string; negocios: number }[] | null;
  /** foto de AGORA: negócios em aberto e quanto valem */
  abertos: { quantidade: number; valorCentavos: number | null } | null;
  /** dos leads do período, quantos já compraram */
  conversao: { leads: number; convertidos: number } | null;
  indisponivel: BlocoCrm[];
  naoOferece: BlocoCrm[];
}

export function metricasVazias(): MetricasCrm {
  return { leads: null, resposta: null, vendas: null, orcamentos: null, ciclo: null, perdidos: null, recuperadas: null,
    funil: null, abertos: null, conversao: null, indisponivel: [], naoOferece: [] };
}

// ── Ferramentas de conta ─────────────────────────────────────────────────────

export function percentil(ordenados: readonly number[], p: number): number | null {
  if (!ordenados.length) return null;
  if (ordenados.length === 1) return ordenados[0];
  const pos = (ordenados.length - 1) * p;
  const a = Math.floor(pos), b = Math.ceil(pos);
  return ordenados[a] + (ordenados[b] - ordenados[a]) * (pos - a);
}

export function faixasDeResposta(segundos: readonly number[]): { boa: number; atencao: number; estourada: number } {
  let boa = 0, atencao = 0, estourada = 0;
  for (const s of segundos) {
    if (s < RESPOSTA_BOA_SEG) boa++;
    else if (s <= RESPOSTA_ESTOURADA_SEG) atencao++;
    else estourada++;
  }
  return { boa, atencao, estourada };
}

// ── Âncora CRM (GET /api/parceiro/metricas) ──────────────────────────────────
// Cada bloco é validado SOZINHO: um bloco torto vira indisponível sem derrubar os outros. Bloco AUSENTE (o Âncora
// em produção ainda sem `vendas`/`etapas`) é "não oferece" — não é falha, é versão; `null` é falha.

const n = z.number().finite();
const ni = z.number().int().nonnegative();
const resumoAncora = z.object({
  receita_janela: n, vendas_janela: ni, leads_janela: ni,
  coorte: z.object({ leads: ni, convertidos: ni }),
  funil_por_etapa: z.array(z.object({ stage_id: z.string(), negocios: ni })),
});
const atendimentoAncora = z.object({
  sla: z.object({
    mediana_secs: n.nullable(), p90_secs: n.nullable(), respondidas: ni,
    faixas: z.object({ boa: ni, atencao: ni, estourada: ni }),
  }),
});
const recuperadasAncora = z.object({
  reversao: z.object({ negocios: ni, receita_cents: n }),
  reconquista: z.object({ negocios: ni, receita_cents: n }),
});
const vendasAncora = z.object({
  periodo: z.object({ ciclo_mediana_horas: n.nullable(), ciclos_contados: ni, perdidos: ni, orcamentos_criados: ni, orcamentos_criados_cents: n }),
  agora: z.object({ abertos: ni, pipeline_cents: n }),
});
const etapasAncora = z.array(z.object({ id: z.string(), nome: z.string().nullable(), posicao: z.number().nullable(), funil: z.string().nullable() }));

export function deAncora(data: unknown): MetricasCrm {
  const m = metricasVazias();
  const d = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const falhou = (...b: BlocoCrm[]) => m.indisponivel.push(...b);
  const naoTem = (...b: BlocoCrm[]) => m.naoOferece.push(...b);

  const r = resumoAncora.safeParse(d.resumo);
  if (r.success) {
    m.leads = r.data.leads_janela;
    m.vendas = { quantidade: r.data.vendas_janela, valorCentavos: Math.round(r.data.receita_janela) };
    m.conversao = { leads: r.data.coorte.leads, convertidos: r.data.coorte.convertidos };
  } else falhou("leads", "vendas", "conversao");

  const a = atendimentoAncora.safeParse(d.atendimento);
  if (a.success) {
    const s = a.data.sla;
    m.resposta = { medianaSeg: s.mediana_secs, p90Seg: s.p90_secs, respondidas: s.respondidas, faixas: s.faixas };
  } else falhou("resposta");

  const rc = recuperadasAncora.safeParse(d.recuperadas);
  if (rc.success) {
    m.recuperadas = {
      negocios: rc.data.reversao.negocios + rc.data.reconquista.negocios,
      valorCentavos: Math.round(rc.data.reversao.receita_cents + rc.data.reconquista.receita_cents),
    };
  } else falhou("recuperadas");

  if (d.vendas === undefined) naoTem("ciclo", "perdidos", "orcamentos");
  else {
    const v = vendasAncora.safeParse(d.vendas);
    if (v.success) {
      const p = v.data.periodo;
      m.ciclo = { medianaHoras: p.ciclo_mediana_horas, contados: p.ciclos_contados };
      m.perdidos = p.perdidos;
      m.orcamentos = { quantidade: p.orcamentos_criados, valorCentavos: Math.round(p.orcamentos_criados_cents) };
      m.abertos = { quantidade: v.data.agora.abertos, valorCentavos: Math.round(v.data.agora.pipeline_cents) };
    } else falhou("ciclo", "perdidos", "orcamentos");
  }

  // Funil: precisa do resumo (quantos por etapa) E das etapas (o nome). Sem as etapas, o funil seria uma lista de ids.
  if (d.etapas === undefined) naoTem("funil");
  else {
    const e = etapasAncora.safeParse(d.etapas);
    if (e.success && r.success) {
      const porId = new Map(e.data.map((x) => [x.id, x]));
      m.funil = r.data.funil_por_etapa
        .filter((x) => x.negocios > 0)
        .map((x) => ({ x, et: porId.get(x.stage_id) }))
        .sort((p, q) => (p.et?.funil ?? "").localeCompare(q.et?.funil ?? "") || (p.et?.posicao ?? 1e9) - (q.et?.posicao ?? 1e9))
        .map(({ x, et }) => ({ etapa: (et?.nome ?? "").trim() || "Etapa sem nome", negocios: x.negocios }));
    } else if (!m.indisponivel.includes("funil")) falhou("funil");
  }
  return m;
}

// ── API aberta (eventos guardados em crm_eventos) ────────────────────────────

export const TIPOS_EVENTO = ["lead", "resposta", "orcamento", "venda", "perda", "etapa"] as const;
export type TipoEvento = (typeof TIPOS_EVENTO)[number];

export interface EventoCrm {
  tipo: TipoEvento;
  ocorreu_em: string;
  negocio_ref: string | null;
  valor_centavos: number | null;
  segundos: number | null;
  etapa: string | null;
}

/**
 * As métricas de um período a partir dos eventos. `eventos` traz os do período, os de antes (180 dias, para o ciclo)
 * e os de depois até hoje (o funil é o de agora) — lib/crm-externo/servidor.ts busca; as contas filtram a janela.
 * `tiposRecebidos`: o que esta conexão JÁ mandou alguma vez — tipo nunca mandado é "não oferece", não zero.
 */
export function dosEventos(eventos: readonly EventoCrm[], de: string, ate: string, tiposRecebidos: ReadonlySet<TipoEvento>): MetricasCrm {
  const m = metricasVazias();
  const ini = Date.parse(de), fim = Date.parse(ate);
  const t = (e: EventoCrm) => Date.parse(e.ocorreu_em);
  const noPeriodo = eventos.filter((e) => t(e) >= ini && t(e) <= fim);
  const doTipo = (tipo: TipoEvento) => noPeriodo.filter((e) => e.tipo === tipo);
  const soma = (l: EventoCrm[]) => (l.some((e) => e.valor_centavos != null) ? l.reduce((s, e) => s + (e.valor_centavos ?? 0), 0) : null);
  const tem = (tipo: TipoEvento) => tiposRecebidos.has(tipo);
  const naoTem = (...b: BlocoCrm[]) => m.naoOferece.push(...b);

  if (tem("lead")) m.leads = doTipo("lead").length; else naoTem("leads");

  if (tem("resposta")) {
    const segs = doTipo("resposta").map((e) => e.segundos).filter((s): s is number => s != null && s >= 0).sort((a, b) => a - b);
    m.resposta = { medianaSeg: percentil(segs, 0.5), p90Seg: percentil(segs, 0.9), respondidas: segs.length, faixas: faixasDeResposta(segs) };
  } else naoTem("resposta");

  if (tem("venda")) {
    const vendas = doTipo("venda");
    m.vendas = { quantidade: vendas.length, valorCentavos: soma(vendas) };
    // Ciclo: do PRIMEIRO lead do mesmo negócio até a venda. Venda sem lead conhecido fica fora da conta.
    if (tem("lead")) {
      const primeiroLead = new Map<string, number>();
      for (const e of eventos) {
        if (e.tipo !== "lead" || !e.negocio_ref) continue;
        const v = primeiroLead.get(e.negocio_ref);
        if (v == null || t(e) < v) primeiroLead.set(e.negocio_ref, t(e));
      }
      const horas = vendas.map((v) => (v.negocio_ref ? primeiroLead.get(v.negocio_ref) : undefined) != null
        ? (t(v) - primeiroLead.get(v.negocio_ref!)!) / 3_600_000 : null)
        .filter((h): h is number => h != null && h >= 0).sort((a, b) => a - b);
      const med = percentil(horas, 0.5);
      m.ciclo = { medianaHoras: med == null ? null : Math.round(med * 10) / 10, contados: horas.length };
    } else naoTem("ciclo");
  } else naoTem("vendas", "ciclo");

  if (tem("orcamento")) {
    const o = doTipo("orcamento");
    m.orcamentos = { quantidade: o.length, valorCentavos: soma(o) };
  } else naoTem("orcamentos");

  if (tem("perda")) m.perdidos = doTipo("perda").length; else naoTem("perdidos");

  // Funil de AGORA (como no Âncora e no Kommo): a última etapa de cada negócio que não foi ganho nem perdido depois
  // dela, com TODOS os eventos recebidos até hoje — não só os do período.
  if (tem("etapa")) {
    const ultimo = new Map<string, { quando: number; etapa: string | null; fechado: boolean }>();
    for (const e of [...eventos].filter((x) => x.negocio_ref).sort((a, b) => t(a) - t(b))) {
      if (e.tipo === "etapa") ultimo.set(e.negocio_ref!, { quando: t(e), etapa: (e.etapa ?? "").trim() || null, fechado: false });
      else if (e.tipo === "venda" || e.tipo === "perda") {
        const u = ultimo.get(e.negocio_ref!);
        if (u) u.fechado = true;
      }
    }
    const conta = new Map<string, number>();
    const ordem: string[] = [];
    for (const u of ultimo.values()) {
      if (u.fechado || !u.etapa) continue;
      if (!conta.has(u.etapa)) ordem.push(u.etapa);
      conta.set(u.etapa, (conta.get(u.etapa) ?? 0) + 1);
    }
    m.funil = ordem.map((etapa) => ({ etapa, negocios: conta.get(etapa)! }));
    m.abertos = { quantidade: [...conta.values()].reduce((s, v) => s + v, 0), valorCentavos: null };
  } else naoTem("funil");

  naoTem("recuperadas", "conversao");
  return m;
}
