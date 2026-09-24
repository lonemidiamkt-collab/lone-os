// lib/trafego/anuncios.ts — regras puras da aba "Anúncios Meta" (Leva 4).
//
// POR QUE EXISTE. A aba chamava a Meta direto do navegador: ~3 chamadas por campanha a cada visita,
// com o token da agência no browser. Era lenta, zerava ao trocar de tela e, com o token vencido,
// mostrava o que tivesse sobrado em memória como se fosse número de hoje. Agora quem fala com a Meta
// é o servidor (lib/trafego/anuncios-server.ts), que guarda o resultado em `meta_campaign_cache`;
// a aba só lê. Este arquivo tem o que as duas pontas precisam concordar: o período, o mapeamento
// da campanha, o resumo por cliente, o "atualizado há X min" e a regra de quando pode atualizar.
//
// Sem React, sem Supabase, sem fetch — testado em tests/trafego-anuncios.test.ts.

import type { AdCampaign, AdObjective, AdStatus } from "@/lib/types";

// ─── Período ────────────────────────────────────────────────────────────────

export const PRESETS_DIAS = [7, 14, 30, 90] as const;
export type PresetDias = (typeof PRESETS_DIAS)[number];

export type Periodo =
  | { tipo: "preset"; dias: PresetDias }
  | { tipo: "intervalo"; de: string; ate: string };

/** Maior intervalo personalizado aceito (a Meta guarda ~37 meses; 400 dias cobre "o ano"). */
export const MAX_DIAS_INTERVALO = 400;

const YMD = /^\d{4}-\d{2}-\d{2}$/;

function ymdValido(s: string): boolean {
  if (!YMD.test(s)) return false;
  const t = Date.parse(`${s}T12:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === s;
}

function diasEntreYmd(de: string, ate: string): number {
  return Math.round((Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86_400_000);
}

/** Chave estável do período — é a chave do cache no servidor. "7d" · "2026-09-01_2026-09-15". */
export function chavePeriodo(p: Periodo): string {
  return p.tipo === "preset" ? `${p.dias}d` : `${p.de}_${p.ate}`;
}

/**
 * Lê a chave de volta. `null` = inválida (preset fora da lista, data impossível, intervalo
 * invertido, no futuro ou longo demais). `hoje` é o dia de São Paulo ("YYYY-MM-DD").
 */
export function lerPeriodo(chave: string | null | undefined, hoje: string): Periodo | null {
  if (!chave) return null;
  const preset = chave.match(/^(\d{1,3})d$/);
  if (preset) {
    const dias = Number(preset[1]);
    return (PRESETS_DIAS as readonly number[]).includes(dias) ? { tipo: "preset", dias: dias as PresetDias } : null;
  }
  const m = chave.match(/^(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})$/);
  if (!m) return null;
  const [, de, ate] = m;
  if (!ymdValido(de) || !ymdValido(ate)) return null;
  if (de > ate || ate > hoje) return null;
  if (diasEntreYmd(de, ate) + 1 > MAX_DIAS_INTERVALO) return null;
  return { tipo: "intervalo", de, ate };
}

/** Quantos dias o período cobre (intervalo conta as duas pontas). */
export function diasDoPeriodo(p: Periodo): number {
  return p.tipo === "preset" ? p.dias : diasEntreYmd(p.de, p.ate) + 1;
}

/** Argumentos para lib/meta/insights-server (preset usa date_preset da Meta, no fuso da conta). */
export function argumentosMeta(p: Periodo): { dias: number; de?: string; ate?: string } {
  return p.tipo === "preset" ? { dias: p.dias } : { dias: diasDoPeriodo(p), de: p.de, ate: p.ate };
}

/** "Últimos 7 dias" · "01/09 – 15/09". */
export function rotuloPeriodo(p: Periodo): string {
  if (p.tipo === "preset") return `Últimos ${p.dias} dias`;
  const f = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
  return `${f(p.de)} – ${f(p.ate)}`;
}

// ─── Campanha: o que a Meta devolve → AdCampaign ────────────────────────────

/** Objetivo da Meta (OUTCOME_* da v21 ou o formato antigo) → objetivo do painel. */
export function mapearObjetivo(objective?: string | null): AdObjective {
  if (!objective) return "engagement";
  const obj = objective.toUpperCase();
  if (obj.includes("OUTCOME_TRAFFIC")) return "traffic";
  if (obj.includes("OUTCOME_LEADS")) return "leads";
  if (obj.includes("OUTCOME_SALES") || obj.includes("OUTCOME_CONVERSIONS")) return "conversions";
  if (obj.includes("OUTCOME_AWARENESS") || obj.includes("OUTCOME_REACH")) return "reach";
  if (obj.includes("OUTCOME_ENGAGEMENT")) return "engagement";
  if (obj.includes("OUTCOME_APP_PROMOTION")) return "traffic";
  const lower = objective.toLowerCase();
  if (lower.includes("message")) return "messages";
  if (lower.includes("traffic") || lower.includes("link_click")) return "traffic";
  if (lower.includes("conversion") || lower.includes("product_catalog_sales")) return "conversions";
  if (lower.includes("reach") || lower.includes("brand_awareness")) return "reach";
  if (lower.includes("lead")) return "leads";
  return "engagement";
}

function mapearStatus(s: unknown): AdStatus {
  const v = typeof s === "string" ? s.toLowerCase() : "";
  return v === "active" || v === "paused" || v === "completed" ? v : "active";
}

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/**
 * Linhas cruas de `fetchCampaignInsights` (lib/meta/insights-server) → AdCampaign do painel.
 * Campanha cuja leitura falhou (`error`/`insightsFailed`) FICA na lista marcada — some com ela e o
 * total mente; mostrar R$0 mente também.
 */
export function mapearCampanhas(
  brutas: unknown,
  dono: { clientId: string; clientName: string; accountId: string },
): AdCampaign[] {
  if (!Array.isArray(brutas)) return [];
  return brutas
    .filter((c): c is Record<string, unknown> => !!c && typeof c === "object" && typeof (c as { id?: unknown }).id === "string")
    .map((c) => {
      const falhou = c.error === true || c.insightsFailed === true;
      return {
        id: c.id as string,
        accountId: dono.accountId,
        clientId: dono.clientId,
        clientName: dono.clientName,
        name: typeof c.name === "string" ? c.name : String(c.id),
        objective: mapearObjetivo(c.objective as string | undefined),
        status: mapearStatus(c.status),
        dailyBudget: num(c.dailyBudget),
        totalBudget: num(c.totalBudget),
        startDate: typeof c.startDate === "string" ? c.startDate : "",
        endDate: typeof c.endDate === "string" ? c.endDate : undefined,
        spend: num(c.spend),
        impressions: num(c.impressions),
        reach: num(c.reach),
        clicks: num(c.clicks),
        ctr: num(c.ctr),
        cpc: num(c.cpc),
        cpm: num(c.cpm),
        conversions: num(c.conversions),
        costPerConversion: num(c.costPerConversion),
        messages: num(c.messages),
        costPerMessage: num(c.costPerMessage),
        cheapestAdSetCostPerMessage: num(c.cheapestAdSetCostPerMessage),
        cheapestAdSetName: typeof c.cheapestAdSetName === "string" ? c.cheapestAdSetName : "",
        leads: num(c.leads),
        costPerLead: num(c.costPerLead),
        results: num(c.results),
        costPerResult: num(c.costPerResult),
        frequency: num(c.frequency),
        dailyMetrics: Array.isArray(c.dailyMetrics) ? (c.dailyMetrics as AdCampaign["dailyMetrics"]) : [],
        hasData: falhou ? false : c.hasData === true,
        insightsFailed: falhou,
        lastSyncAt: typeof c.lastSyncAt === "string" ? c.lastSyncAt : undefined,
      };
    });
}

// ─── Resumo por cliente (visão "Todos") ─────────────────────────────────────

export interface ResumoAnuncios {
  spend: number;
  results: number;
  leads: number;
  messages: number;
  clicks: number;
  impressions: number;
  campanhas: number;
  ativas: number;
  /** Campanhas cuja leitura falhou — os totais acima NÃO as incluem. */
  semDados: number;
}

export function resumirCampanhas(campanhas: AdCampaign[]): ResumoAnuncios {
  const r: ResumoAnuncios = { spend: 0, results: 0, leads: 0, messages: 0, clicks: 0, impressions: 0, campanhas: 0, ativas: 0, semDados: 0 };
  for (const c of campanhas) {
    r.campanhas++;
    if (c.status === "active") r.ativas++;
    if (c.insightsFailed) { r.semDados++; continue; }
    r.spend += c.spend;
    r.results += c.results ?? 0;
    r.leads += c.leads ?? 0;
    r.messages += c.messages ?? 0;
    r.clicks += c.clicks;
    r.impressions += c.impressions;
  }
  return r;
}

// ─── Frescor e limite de atualização ────────────────────────────────────────

/** Entre duas atualizações do MESMO cliente+período. Cada uma custa ~3 chamadas por campanha. */
export const INTERVALO_MINIMO_MIN = 5;
/** Dado mais velho que isso é atualizado sozinho quando alguém abre o cliente. */
export const VELHO_APOS_MIN = 180;

export function minutosDesde(iso: string | null | undefined, agora: number): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((agora - t) / 60_000));
}

/** "agora" · "há 12 min" · "há 3 h" · "em 12/09 às 08:40" (hora de São Paulo). `null` sem data. */
export function quandoFoi(iso: string | null | undefined, agora: number): string | null {
  const min = minutosDesde(iso, agora);
  if (min === null) return null;
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  if (min < 24 * 60) return `há ${Math.floor(min / 60)} h`;
  const d = new Date(iso!);
  const data = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
  return `em ${data} às ${hora}`;
}

/** "atualizado há 12 min" · "atualizado em 12/09 às 08:40" · "ainda não sincronizado". */
export function rotuloAtualizado(iso: string | null | undefined, agora: number): string {
  const q = quandoFoi(iso, agora);
  return q === null ? "ainda não sincronizado" : `atualizado ${q}`;
}

/** Pode disparar outra atualização? Conta a partir da última TENTATIVA (falha também gasta chamada). */
export function podeSincronizar(
  ultimaTentativa: string | null | undefined,
  agora: number,
  intervaloMin: number = INTERVALO_MINIMO_MIN,
): { pode: boolean; esperarMin: number } {
  const t = ultimaTentativa ? Date.parse(ultimaTentativa) : NaN;
  if (Number.isNaN(t)) return { pode: true, esperarMin: 0 };
  const falta = t + intervaloMin * 60_000 - agora;
  return falta <= 0 ? { pode: true, esperarMin: 0 } : { pode: false, esperarMin: Math.ceil(falta / 60_000) };
}

/** O dado guardado está velho o bastante para atualizar sozinho ao abrir? (Nunca sincronizado = sim.) */
export function precisaAtualizar(sincronizadoEm: string | null | undefined, agora: number, velhoAposMin: number = VELHO_APOS_MIN): boolean {
  const min = minutosDesde(sincronizadoEm, agora);
  return min === null || min >= velhoAposMin;
}

// ─── Conexão com a Meta ─────────────────────────────────────────────────────

export type EstadoConexao = "ok" | "expirada" | "ausente";

/** Erro guardado quando a Meta recusa o token (código 190/401) no meio de uma atualização. */
export const ERRO_TOKEN = "token_invalido";

export function estadoDoToken(token: string | null | undefined, expiraEmMs: number | null, agora: number): EstadoConexao {
  if (!token) return "ausente";
  if (expiraEmMs != null && expiraEmMs < agora) return "expirada";
  return "ok";
}

/**
 * A coisa mais recente que aconteceu com a Meta foi ela recusar o token? (O token pode estar "no
 * prazo" e mesmo assim inválido — senha trocada, permissão removida.) Olha a última TENTATIVA entre
 * as linhas; se ela terminou em ERRO_TOKEN, a conexão caiu, mesmo que outras linhas tenham dado velho.
 */
export function conexaoRecusada(itens: { tentativaEm: string | null; erro: string | null }[]): boolean {
  let ultima: { t: number; erro: string | null } | null = null;
  for (const i of itens) {
    const t = i.tentativaEm ? Date.parse(i.tentativaEm) : NaN;
    if (Number.isNaN(t)) continue;
    if (!ultima || t > ultima.t) ultima = { t, erro: i.erro };
  }
  return ultima?.erro === ERRO_TOKEN;
}

/** Onde reconectar — o mesmo texto em toda tela que depende da Meta. */
export const ONDE_RECONECTAR = "Sistema › Conexão Meta";
export const ROTA_CONEXAO_META = "/conexao-meta";

export function mensagemConexao(estado: EstadoConexao): string | null {
  if (estado === "expirada") return `Conexão com a Meta expirou — reconectar em ${ONDE_RECONECTAR}`;
  if (estado === "ausente") return `A Meta não está conectada — conectar em ${ONDE_RECONECTAR}`;
  return null;
}
