// lib/crm-externo/kommo.ts — O KOMMO (API v4) NA LÍNGUA COMUM. Módulo PURO: valida o endereço e traduz as listas
// que lib/crm-externo/kommo-server.ts busca.
//
// O que o Kommo dá, e de onde:
//   leads        — negócios CRIADOS no período (`filter[created_at]`);
//   vendas       — fechados no período em "ganho" (status 142), com o `price` da conta;
//   perdidos     — fechados no período em "perdido" (status 143);
//   ciclo        — das vendas do período: da criação ao fechamento;
//   conversão    — dos leads do período, quantos estão em "ganho";
//   orçamentos   — negócios que ENTRARAM na etapa de orçamento no período (eventos `lead_status_changed`).
//                  Só com a etapa escolhida na ficha; sem ela, o Kommo não sabe o que é "orçamento";
//   funil/abertos — foto de agora, por etapa, na ordem do funil.
// O que o Kommo NÃO dá: tempo de primeira resposta (a API não expõe) e venda recuperada → `naoOferece`.

import { metricasVazias, percentil, type MetricasCrm } from "./metricas";

export const KOMMO_GANHO = 142;
export const KOMMO_PERDIDO = 143;

/**
 * "minhaempresa", "minhaempresa.kommo.com" ou a URL inteira → o host. Só hosts do Kommo (e do amoCRM, o nome
 * antigo): o servidor nunca chama endereço que alguém digitou livre (SSRF).
 */
export function hostDoKommo(entrada: string): string | null {
  let s = (entrada ?? "").trim().toLowerCase();
  s = s.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (/^[a-z0-9][a-z0-9-]{0,62}$/.test(s)) return `${s}.kommo.com`;
  const m = /^([a-z0-9][a-z0-9-]{0,62})\.(kommo\.com|amocrm\.com|amocrm\.ru)$/.exec(s);
  return m ? `${m[1]}.${m[2]}` : null;
}

export interface KommoLead {
  id: number;
  price: number | null;
  status_id: number;
  pipeline_id: number;
  created_at: number;
  closed_at: number | null;
}

export interface KommoEtapa { id: number; nome: string; ordem: number; fechada: boolean }
export interface KommoFunil { id: number; nome: string; principal: boolean; etapas: KommoEtapa[] }

/** `GET /api/v4/leads/pipelines` → funis com as etapas na ordem. As de fechamento (142/143) ficam marcadas. */
export function lerFunis(cru: unknown): KommoFunil[] {
  const lista = (cru as { _embedded?: { pipelines?: unknown[] } } | null)?._embedded?.pipelines;
  if (!Array.isArray(lista)) throw new Error("O Kommo respondeu os funis num formato inesperado.");
  return lista.map((p) => {
    const f = p as { id: number; name?: string; is_main?: boolean; _embedded?: { statuses?: { id: number; name?: string; sort?: number }[] } };
    return {
      id: Number(f.id),
      nome: String(f.name ?? "").trim() || `Funil ${f.id}`,
      principal: !!f.is_main,
      etapas: (f._embedded?.statuses ?? []).map((s) => ({
        id: Number(s.id), nome: String(s.name ?? "").trim() || `Etapa ${s.id}`, ordem: Number(s.sort ?? 0),
        fechada: s.id === KOMMO_GANHO || s.id === KOMMO_PERDIDO,
      })).sort((a, b) => a.ordem - b.ordem),
    };
  });
}

/** Uma página de `GET /api/v4/leads`. 204 (sem corpo) é lista vazia — chega aqui como null. */
export function lerLeads(cru: unknown): KommoLead[] {
  if (cru == null) return [];
  const lista = (cru as { _embedded?: { leads?: unknown[] } })._embedded?.leads;
  if (!Array.isArray(lista)) throw new Error("O Kommo respondeu os negócios num formato inesperado.");
  return lista.map((l) => {
    const x = l as Record<string, unknown>;
    return {
      id: Number(x.id), price: x.price == null ? null : Number(x.price), status_id: Number(x.status_id),
      pipeline_id: Number(x.pipeline_id), created_at: Number(x.created_at), closed_at: x.closed_at == null ? null : Number(x.closed_at),
    };
  });
}

export interface LeiturasKommo {
  /** de = início e ate = fim do período, em segundos unix (fim inclusivo) */
  de: number;
  ate: number;
  funis: KommoFunil[];
  /** null = a leitura falhou (vira indisponível); [] = não houve */
  criados: KommoLead[] | null;
  fechados: KommoLead[] | null;
  abertos: KommoLead[] | null;
  /** quantos negócios entraram na etapa de orçamento no período; undefined = etapa não escolhida; null = falhou */
  entradasNoOrcamento: number | null | undefined;
  /** só este funil (null = todos) */
  funilId: number | null;
}

const centavos = (v: number | null) => (v == null || !Number.isFinite(v) ? 0 : Math.round(v * 100));

export function deKommo(k: LeiturasKommo): MetricasCrm {
  const m = metricasVazias();
  const doFunil = (l: KommoLead) => k.funilId == null || l.pipeline_id === k.funilId;
  m.naoOferece.push("resposta", "recuperadas");

  if (k.criados) {
    const c = k.criados.filter(doFunil);
    m.leads = c.length;
    m.conversao = { leads: c.length, convertidos: c.filter((l) => l.status_id === KOMMO_GANHO).length };
  } else m.indisponivel.push("leads", "conversao");

  if (k.fechados) {
    const naJanela = k.fechados.filter((l) => doFunil(l) && l.closed_at != null && l.closed_at >= k.de && l.closed_at <= k.ate);
    const ganhos = naJanela.filter((l) => l.status_id === KOMMO_GANHO);
    m.vendas = { quantidade: ganhos.length, valorCentavos: ganhos.reduce((s, l) => s + centavos(l.price), 0) };
    m.perdidos = naJanela.filter((l) => l.status_id === KOMMO_PERDIDO).length;
    const horas = ganhos.map((l) => (l.closed_at! - l.created_at) / 3600).filter((h) => Number.isFinite(h) && h >= 0).sort((a, b) => a - b);
    const med = percentil(horas, 0.5);
    m.ciclo = { medianaHoras: med == null ? null : Math.round(med * 10) / 10, contados: horas.length };
  } else m.indisponivel.push("vendas", "perdidos", "ciclo");

  if (k.entradasNoOrcamento === undefined) m.naoOferece.push("orcamentos");
  else if (k.entradasNoOrcamento === null) m.indisponivel.push("orcamentos");
  else m.orcamentos = { quantidade: k.entradasNoOrcamento, valorCentavos: null };

  if (k.abertos) {
    const abertos = k.abertos.filter((l) => doFunil(l) && l.status_id !== KOMMO_GANHO && l.status_id !== KOMMO_PERDIDO);
    const porEtapa = new Map<number, number>();
    for (const l of abertos) porEtapa.set(l.status_id, (porEtapa.get(l.status_id) ?? 0) + 1);
    const funis = k.funis.filter((f) => k.funilId == null || f.id === k.funilId)
      .sort((a, b) => Number(b.principal) - Number(a.principal) || a.id - b.id);
    const varios = funis.length > 1;
    m.funil = funis.flatMap((f) => f.etapas.filter((e) => !e.fechada && (porEtapa.get(e.id) ?? 0) > 0)
      .map((e) => ({ etapa: varios ? `${f.nome} · ${e.nome}` : e.nome, negocios: porEtapa.get(e.id)! })));
    m.abertos = { quantidade: abertos.length, valorCentavos: abertos.reduce((s, l) => s + centavos(l.price), 0) };
  } else m.indisponivel.push("funil");

  return m;
}
