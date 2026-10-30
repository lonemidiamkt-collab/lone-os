// lib/portal/snapshotCache.ts — de onde sai o snapshot que o cliente vê (primeira carga E troca de
// período). Um caminho só: a página pegava "o último snapshot gravado", de qualquer idade, enquanto
// a rota respeitava 6h — o cliente abria o link e lia número de semanas atrás como se fosse de hoje.

import { after } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { buildSnapshot } from "./buildSnapshot";
import type { PeriodKind, SnapshotData } from "./types";

export const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
// Quando a Meta não responde, mostrar o último dado bom (avisando) só se ele for recente.
export const STALE_MAX_MS = 24 * 60 * 60 * 1000;
// Snapshot incompleto (faltou criativo, público ou a lista de anúncios ativos) vale só 5 min: depois
// disso a visita seguinte já recebe ele E dispara a busca que completa (29/10/2026, ver decidirCache).
export const INCOMPLETO_TTL_MS = 5 * 60 * 1000;

/**
 * O snapshot tem tudo o que o painel mostra? Pura (testada).
 * "parcial" = criativos ou público falharam; `active_ads === null` = a lista de anúncios ativos
 * falhou (ela não mexe no ads_status — ver buildSnapshot). Snapshot antigo, sem a chave, conta
 * como completo: ele nunca teve a lista.
 */
export function snapshotCompleto(d: Pick<SnapshotData, "ads_status" | "active_ads"> | null | undefined): boolean {
  if (!d) return false;
  if (d.ads_status === "sem_conta") return true;
  return d.ads_status === "ok" && d.active_ads !== null;
}

/** O cache ainda vale? Snapshot sem generated_at ou do futuro não vale. Pura (testada). */
export function cacheValido(generatedAt: string | null | undefined, agora: number, ttl = CACHE_TTL_MS): boolean {
  if (!generatedAt) return false;
  const t = Date.parse(generatedAt);
  if (!Number.isFinite(t)) return false;
  const idade = agora - t;
  return idade >= 0 && idade < ttl;
}

export type DecisaoCache = "fresco" | "do-dia" | "buscar";

/**
 * O que fazer com o snapshot guardado. Pura (testada).
 *  - fresco (< 6h): entrega;
 *  - do-dia (6h a 24h): entrega NA HORA e atualiza por trás, para a próxima visita;
 *  - buscar (sem cache ou > 24h): busca na Meta com o cliente esperando.
 *
 * POR QUE (16/10/2026). O aquecimento roda 1x por dia (06:40) e o cache vale 6h: de 12:40 em diante,
 * todo cliente que abria o link esperava a Meta responder AO VIVO — 2 a 6 s, às vezes mais. O nginx
 * registrou 3 desistências (499) em 14 dias: Armazém do Ferro, Reformar e Óticas Rhodrigo, sempre à
 * tarde/noite. Para o cliente, isso era "o link está caindo". Número de até 24h, para semana/mês, é
 * o mesmo que ele veria; esperar por ele não é.
 *
 * INCOMPLETO VALE 5 MIN (29/10/2026). Às 6h41–6h46 a Meta recusou com "HTTP 400 code 100 —
 * Invalid parameter" a consulta de criativos e a de anúncios ativos de 18 painéis (a mesma consulta
 * passava minutos depois). O aquecimento gravou esses painéis pela metade e eles valeram como
 * "fresco" por 6h e "do-dia" até o dia seguinte: o cliente abria o link e a seção de anúncios tinha
 * sumido. Incompleto agora é entregue (sem esperar) e já pede a busca que completa.
 */
export function decidirCache(generatedAt: string | null | undefined, agora: number, completo = true): DecisaoCache {
  if (cacheValido(generatedAt, agora, completo ? CACHE_TTL_MS : INCOMPLETO_TTL_MS)) return "fresco";
  if (cacheValido(generatedAt, agora, STALE_MAX_MS)) return "do-dia";
  return "buscar";
}

/**
 * O snapshot novo deve substituir o guardado? Pura (testada).
 *  - indisponível nunca vira cache (zero por falha da Meta não é resultado);
 *  - completo sempre grava;
 *  - incompleto não apaga um completo de até 24h do MESMO período (o cliente vê o completo, um
 *    pouco mais velho, em vez de perder a seção); fora disso grava — número novo vale mais.
 */
export function deveGravar(
  novo: Pick<SnapshotData, "ads_status" | "active_ads" | "period">,
  guardado: Pick<SnapshotData, "ads_status" | "active_ads" | "period"> | null | undefined,
  geradoEm: string | null | undefined,
  agora: number,
): boolean {
  if (novo.ads_status === "indisponivel") return false;
  if (snapshotCompleto(novo)) return true;
  if (!guardado || guardado.period?.start !== novo.period?.start) return true;
  if (!snapshotCompleto(guardado)) return true;
  return !cacheValido(geradoEm, agora, STALE_MAX_MS);
}

// Uma atualização por trás por cliente+período de cada vez — dez abas abertas não viram dez buscas.
const EM_ATUALIZACAO = new Set<string>();

/** Roda depois da resposta (after do Next); fora de uma requisição (teste, script), roda solto. */
function depoisDaResposta(tarefa: () => Promise<unknown>) {
  try {
    after(tarefa);
  } catch {
    void tarefa();
  }
}

export async function obterSnapshot(clientId: string, periodKind: PeriodKind, now = new Date()): Promise<SnapshotData> {
  const { data: cached } = await supabaseAdmin
    .from("client_report_snapshots")
    .select("data, generated_at")
    .eq("client_id", clientId)
    .eq("period_kind", periodKind)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const geradoEm = (cached?.generated_at as string | undefined) ?? null;
  const guardado = (cached?.data as SnapshotData | undefined) ?? null;
  const decisao = cached ? decidirCache(geradoEm, now.getTime(), snapshotCompleto(guardado)) : "buscar";
  if (decisao === "fresco") return guardado!;

  if (decisao === "do-dia") {
    const chave = `${clientId}:${periodKind}`;
    if (!EM_ATUALIZACAO.has(chave)) {
      EM_ATUALIZACAO.add(chave);
      depoisDaResposta(() =>
        reconstruir(clientId, periodKind, new Date(), guardado, geradoEm)
          .catch((e) => console.error("[portal] atualização por trás falhou:", clientId, periodKind, String(e)))
          .finally(() => EM_ATUALIZACAO.delete(chave)),
      );
    }
    return guardado!;
  }

  return reconstruir(clientId, periodKind, now, guardado, geradoEm);
}

/** Busca na Meta e grava o cache. `cached`/`geradoEm` = o que está guardado (último dado bom, quando a Meta não responde). */
async function reconstruir(
  clientId: string, periodKind: PeriodKind, now: Date,
  cached: SnapshotData | null, geradoEm: string | null,
): Promise<SnapshotData> {
  const data = await buildSnapshot({ clientId, periodKind, now });

  // A Meta não respondeu o essencial: nunca vira cache. Último dado bom (e recente) com aviso; senão
  // o próprio "indisponível", que a tela mostra como "atualizando" — nunca como zero.
  if (data.ads_status === "indisponivel") {
    if (cached && cacheValido(geradoEm, now.getTime(), STALE_MAX_MS)) {
      return { ...cached, stale_since: geradoEm };
    }
    return data;
  }

  if (deveGravar(data, cached, geradoEm, now.getTime())) await gravarNoCache(clientId, periodKind, data, now);
  return data;
}

async function gravarNoCache(clientId: string, periodKind: PeriodKind, data: SnapshotData, now: Date): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from("client_report_snapshots")
    .upsert(
      {
        client_id: clientId,
        period_kind: periodKind,
        period_start: data.period.start,
        period_end: data.period.end,
        data,
        generated_at: now.toISOString(),
      },
      { onConflict: "client_id,period_kind,period_start" },
    );
  if (error) console.error("[portal] cache do snapshot não gravou:", clientId, periodKind, error.message);
  return !error;
}

// ── Pré-geração (generate-snapshots 6h e warmup-snapshots 6h40) ──────────────────────────────────

export type ResultadoGeracao = "completo" | "incompleto" | "indisponivel" | "erro";

export interface ItemGeracao {
  clientId: string;
  cliente: string;
  periodo: PeriodKind;
  resultado: ResultadoGeracao;
  tentativas: number;
  gravado: boolean;
  erro?: string;
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Gera os snapshots de vários clientes/períodos para o cache, com as MESMAS regras da visita
 * (deveGravar). As duas rotinas da madrugada gravavam tudo que não fosse "indisponível" — inclusive
 * o painel pela metade, que depois valia o dia inteiro (29/10/2026).
 *
 * O que sai incompleto ou indisponível é tentado de novo no fim, depois de `esperaMs`: a recusa da
 * Meta costuma durar minutos (6h41–6h46 em 29/10), não horas.
 */
export async function gerarParaCache(
  clientes: { id: string; nome: string }[],
  periodosDe: (clientId: string) => PeriodKind[],
  now: Date,
  opts: { pausaEntreClientesMs?: number; esperaMs?: number; repeticoes?: number } = {},
): Promise<ItemGeracao[]> {
  const { pausaEntreClientesMs = 500, esperaMs = 90_000, repeticoes = 2 } = opts;
  const itens: ItemGeracao[] = [];
  const ultimo = new Map<ItemGeracao, SnapshotData>();

  async function tentar(item: ItemGeracao) {
    item.tentativas++;
    try {
      const data = await buildSnapshot({ clientId: item.clientId, periodKind: item.periodo, now });
      ultimo.set(item, data);
      item.resultado = data.ads_status === "indisponivel" ? "indisponivel" : snapshotCompleto(data) ? "completo" : "incompleto";
      item.erro = undefined;
    } catch (e) {
      item.resultado = "erro";
      item.erro = e instanceof Error ? e.message : String(e);
    }
  }

  for (const c of clientes) {
    for (const periodo of periodosDe(c.id)) {
      const item: ItemGeracao = { clientId: c.id, cliente: c.nome, periodo, resultado: "erro", tentativas: 0, gravado: false };
      itens.push(item);
      await tentar(item);
    }
    if (pausaEntreClientesMs) await esperar(pausaEntreClientesMs);
  }

  for (let r = 0; r < repeticoes; r++) {
    const pendentes = itens.filter((i) => i.resultado !== "completo");
    if (!pendentes.length) break;
    await esperar(esperaMs);
    for (const item of pendentes) await tentar(item);
  }

  for (const item of itens) {
    const data = ultimo.get(item);
    if (!data || item.resultado === "indisponivel" || item.resultado === "erro") continue;
    if (item.resultado === "completo") {
      item.gravado = await gravarNoCache(item.clientId, item.periodo, data, now);
      continue;
    }
    // Incompleto depois das repetições: só grava se não for apagar um completo recente do período.
    const { data: guardado, error } = await supabaseAdmin
      .from("client_report_snapshots")
      .select("data, generated_at")
      .eq("client_id", item.clientId)
      .eq("period_kind", item.periodo)
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) { item.erro = `cache não lido: ${error.message}`; continue; }
    if (deveGravar(data, (guardado?.data as SnapshotData | undefined) ?? null, (guardado?.generated_at as string | undefined) ?? null, now.getTime())) {
      item.gravado = await gravarNoCache(item.clientId, item.periodo, data, now);
    }
  }
  return itens;
}
