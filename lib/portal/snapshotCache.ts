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
 */
export function decidirCache(generatedAt: string | null | undefined, agora: number): DecisaoCache {
  if (cacheValido(generatedAt, agora)) return "fresco";
  if (cacheValido(generatedAt, agora, STALE_MAX_MS)) return "do-dia";
  return "buscar";
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
  const decisao = cached ? decidirCache(geradoEm, now.getTime()) : "buscar";
  if (decisao === "fresco") return cached!.data as SnapshotData;

  if (decisao === "do-dia") {
    const chave = `${clientId}:${periodKind}`;
    if (!EM_ATUALIZACAO.has(chave)) {
      EM_ATUALIZACAO.add(chave);
      depoisDaResposta(() =>
        reconstruir(clientId, periodKind, new Date(), null, null)
          .catch((e) => console.error("[portal] atualização por trás falhou:", clientId, periodKind, String(e)))
          .finally(() => EM_ATUALIZACAO.delete(chave)),
      );
    }
    return cached!.data as SnapshotData;
  }

  return reconstruir(clientId, periodKind, now, (cached?.data as SnapshotData | undefined) ?? null, geradoEm);
}

/** Busca na Meta e grava o cache. `cached`/`geradoEm` = último dado bom, para quando a Meta não responde. */
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

  // "parcial" (faltou criativo ou público) é mostrado, mas não vira cache — a próxima visita completa.
  if (data.ads_status !== "parcial") {
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
  }

  return data;
}
