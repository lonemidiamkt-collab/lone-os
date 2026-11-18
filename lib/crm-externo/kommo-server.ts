// lib/crm-externo/kommo-server.ts — a leitura do Kommo (API v4), lado servidor.
//
// O token é o "token de longa duração" de uma integração privada criada na conta Kommo do cliente (Configurações ›
// Integrações › Criar integração › Chaves e escopos). Ele chega aqui já decifrado (lib/crm-externo/servidor.ts) e
// NUNCA vai para log nem para o navegador. O host passa por hostDoKommo: só *.kommo.com / *.amocrm.*.
//
// Cada parte (criados, fechados, abertos, orçamento) é lida sozinha: uma que falha vira indisponível sem levar as
// outras junto. O primeiro motivo de falha volta para o time (ficha e aviso do relatório).

import "server-only";
import { deKommo, lerFunis, lerLeads, KOMMO_GANHO, KOMMO_PERDIDO, type KommoFunil, type KommoLead } from "./kommo";
import type { MetricasCrm } from "./metricas";

const PAGINA = 250;
const MAX_PAGINAS = 40; // 10 mil negócios por leitura; acima disso a conta seria parcial — vira falha nomeada

export class ErroKommo extends Error {}

function frase(status: number): string {
  if (status === 401) return "O Kommo recusou o token (venceu ou foi revogado). Gere outro na conta do cliente e cole na ficha.";
  if (status === 402) return "A conta do Kommo do cliente está sem pagamento — a API fica bloqueada.";
  if (status === 403) return "O token do Kommo não tem permissão para ler os negócios.";
  if (status === 429) return "O Kommo limitou as chamadas agora. Tente de novo em alguns minutos.";
  if (status === 404) return "Endereço do Kommo não encontrado — confira o subdomínio.";
  return `O Kommo respondeu ${status}.`;
}

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** GET com até 3 tentativas no 429 (o Kommo limita ~7 chamadas/s por conta), respeitando o Retry-After. */
async function get(host: string, token: string, caminho: string, params: Record<string, string | number>): Promise<unknown | null> {
  for (let tentativa = 1; ; tentativa++) {
    try {
      return await getUmaVez(host, token, caminho, params);
    } catch (e) {
      if (!(e instanceof Limitado) || tentativa >= 3) throw e instanceof Limitado ? new ErroKommo(frase(429)) : e;
      await espera(Math.min(10_000, Math.max(1000, e.esperaMs)) * tentativa);
    }
  }
}

class Limitado extends Error { constructor(public esperaMs: number) { super("429"); } }

async function getUmaVez(host: string, token: string, caminho: string, params: Record<string, string | number>): Promise<unknown | null> {
  const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), 20_000);
  try {
    const r = await fetch(`https://${host}${caminho}${qs ? `?${qs}` : ""}`, {
      headers: { authorization: `Bearer ${token}`, accept: "application/hal+json" },
      cache: "no-store",
      redirect: "error", // nada de seguir redirecionamento para fora do host validado
      signal: controle.signal,
    });
    if (r.status === 204) return null;
    if (r.status === 429) throw new Limitado(Number(r.headers.get("retry-after") ?? "1") * 1000 || 1000);
    if (!r.ok) throw new ErroKommo(frase(r.status));
    return await r.json();
  } catch (e) {
    if (e instanceof ErroKommo || e instanceof Limitado) throw e;
    throw new ErroKommo("Não consegui falar com o Kommo agora.");
  } finally {
    clearTimeout(relogio);
  }
}

async function todosOsLeads(host: string, token: string, filtro: Record<string, string | number>): Promise<KommoLead[]> {
  const out: KommoLead[] = [];
  for (let pagina = 1; pagina <= MAX_PAGINAS; pagina++) {
    const lote = lerLeads(await get(host, token, "/api/v4/leads", { ...filtro, limit: PAGINA, page: pagina }));
    out.push(...lote);
    if (lote.length < PAGINA) return out;
  }
  throw new ErroKommo("Negócios demais no período para contar inteiro (mais de 10 mil).");
}

export async function lerFunisDoKommo(host: string, token: string): Promise<KommoFunil[]> {
  return lerFunis(await get(host, token, "/api/v4/leads/pipelines", {}));
}

/** Quantos negócios ENTRARAM na etapa de orçamento entre `de` e `ate` (segundos unix). */
async function entradasNaEtapa(host: string, token: string, funilId: number, etapaId: number, de: number, ate: number): Promise<number> {
  const ids = new Set<number>();
  for (let pagina = 1; pagina <= MAX_PAGINAS; pagina++) {
    const cru = await get(host, token, "/api/v4/events", {
      "filter[type]": "lead_status_changed",
      "filter[created_at][from]": de, "filter[created_at][to]": ate,
      "filter[value_after][leads_statuses][0][pipeline_id]": funilId,
      "filter[value_after][leads_statuses][0][status_id]": etapaId,
      limit: 100, page: pagina,
    });
    if (cru == null) return ids.size;
    const lista = (cru as { _embedded?: { events?: { entity_id?: number }[] } })._embedded?.events;
    if (!Array.isArray(lista)) throw new ErroKommo("O Kommo respondeu os eventos num formato inesperado.");
    for (const ev of lista) if (ev.entity_id != null) ids.add(Number(ev.entity_id));
    if (lista.length < 100) return ids.size;
  }
  throw new ErroKommo("Eventos demais no período para contar inteiro.");
}

export interface ConfigKommo { host: string; funilId: number | null; etapaOrcamentoId: number | null }

/** As métricas de um período. `de`/`ate` em segundos unix (fim inclusivo). Uma leitura de cada vez (limite do Kommo). */
export async function lerKommo(cfg: ConfigKommo, token: string, de: number, ate: number): Promise<{ metricas: MetricasCrm; erros: string[] }> {
  const erros: string[] = [];
  const tentar = async <T>(f: () => Promise<T>): Promise<T | null> => {
    try { return await f(); } catch (e) { erros.push(e instanceof Error ? e.message : String(e)); return null; }
  };
  const vazio = (): { metricas: MetricasCrm; erros: string[] } => ({
    metricas: deKommo({ de, ate, funis: [], criados: null, fechados: null, abertos: null, entradasNoOrcamento: null, funilId: cfg.funilId }),
    erros: [...new Set(erros)],
  });
  const funis = await tentar(() => lerFunisDoKommo(cfg.host, token));
  // Funil escolhido que sumiu do Kommo (apagado, juntado): o filtro voltaria vazio e viraria "0 leads, 0 vendas".
  if (funis && cfg.funilId != null && !funis.some((f) => f.id === cfg.funilId)) {
    erros.push("O funil escolhido não existe mais no Kommo — escolha de novo na ficha.");
    return vazio();
  }
  const doFunil: Record<string, string | number> = cfg.funilId != null ? { "filter[pipeline_id]": cfg.funilId } : {};
  const criados = await tentar(() => todosOsLeads(cfg.host, token, { ...doFunil, "filter[created_at][from]": de, "filter[created_at][to]": ate }));
  const fechados = await tentar(() => todosOsLeads(cfg.host, token, { ...doFunil, "filter[closed_at][from]": de, "filter[closed_at][to]": ate }));
  // Abertos: todas as etapas que não são de fechamento, dos funis escolhidos — em lotes de 40 etapas por chamada
  // (muitas etapas numa URL só passam do limite do servidor e voltam 414).
  const abertos = funis ? await tentar(async () => {
    const pares = funis.filter((x) => cfg.funilId == null || x.id === cfg.funilId)
      .flatMap((f) => f.etapas.filter((e) => e.id !== KOMMO_GANHO && e.id !== KOMMO_PERDIDO).map((e) => [f.id, e.id] as const));
    const out: KommoLead[] = [];
    for (let i = 0; i < pares.length; i += 40) {
      const filtro: Record<string, string | number> = {};
      pares.slice(i, i + 40).forEach(([f, e], j) => { filtro[`filter[statuses][${j}][pipeline_id]`] = f; filtro[`filter[statuses][${j}][status_id]`] = e; });
      out.push(...await todosOsLeads(cfg.host, token, filtro));
    }
    return out;
  }) : null;
  // Orçamento: só com a etapa escolhida; o funil dela sai da lista de funis.
  let entradas: number | null | undefined;
  if (cfg.etapaOrcamentoId == null) entradas = undefined;
  else if (!funis) entradas = null;
  else {
    const f = funis.find((x) => x.etapas.some((e) => e.id === cfg.etapaOrcamentoId));
    if (!f) { erros.push("A etapa de orçamento escolhida não existe mais no Kommo — escolha de novo na ficha."); entradas = null; }
    else entradas = await tentar(() => entradasNaEtapa(cfg.host, token, f.id, cfg.etapaOrcamentoId!, de, ate));
  }
  return {
    metricas: deKommo({ de, ate, funis: funis ?? [], criados, fechados, abertos, entradasNoOrcamento: entradas, funilId: cfg.funilId }),
    erros: [...new Set(erros)],
  };
}
