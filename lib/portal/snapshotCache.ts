// lib/portal/snapshotCache.ts — de onde sai o snapshot que o cliente vê (primeira carga E troca de
// período). Um caminho só: a página pegava "o último snapshot gravado", de qualquer idade, enquanto
// a rota respeitava 6h — o cliente abria o link e lia número de semanas atrás como se fosse de hoje.

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
  if (cached && cacheValido(geradoEm, now.getTime())) return cached.data as SnapshotData;

  const data = await buildSnapshot({ clientId, periodKind, now });

  // A Meta não respondeu o essencial: nunca vira cache. Último dado bom (e recente) com aviso; senão
  // o próprio "indisponível", que a tela mostra como "atualizando" — nunca como zero.
  if (data.ads_status === "indisponivel") {
    if (cached && cacheValido(geradoEm, now.getTime(), STALE_MAX_MS)) {
      return { ...(cached.data as SnapshotData), stale_since: geradoEm };
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
