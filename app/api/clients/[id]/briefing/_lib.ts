/**
 * Utilitários compartilhados entre as rotas de briefing.
 * Arquivo prefixado com _ → Next.js não expõe como rota.
 */

import { supabaseAdmin } from "@/lib/supabase/server";
import type { ServerUser } from "@/lib/supabase/auth-server";
import type { BriefingWithMeta, BriefingHistoryItem } from "@/lib/types/briefing";

// ── RBAC ─────────────────────────────────────────────────────

/** Qualquer usuário autenticado pode ler briefings. */
export function canRead(_user: ServerUser): true { return true; }

/**
 * Admin e manager podem criar/editar briefings.
 * No sistema atual, isAdmin === true cobre admin + manager.
 */
export function canWrite(user: ServerUser): boolean { return user.isAdmin; }

/**
 * Restore é operação destrutiva — restrita a admin.
 * TODO: quando granularidade de role aumentar, distinguir admin de manager.
 */
export function canRestore(user: ServerUser): boolean { return user.isAdmin; }

// ── TEAM MEMBER ───────────────────────────────────────────────

/** Resolve o UUID de team_members a partir do email da sessão. */
export async function resolveMemberId(email: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("team_members")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  return data?.id ?? null;
}

// ── DB QUERIES ────────────────────────────────────────────────

/** Busca o briefing atual enriquecido + total de versões. */
export async function fetchCurrentBriefing(
  clientId: string,
): Promise<{ briefing: BriefingWithMeta | null; total_versions: number }> {
  const [{ data: row }, { count }] = await Promise.all([
    supabaseAdmin
      .from("current_client_briefings")
      .select("*")
      .eq("client_id", clientId)
      .maybeSingle(),
    supabaseAdmin
      .from("client_briefings")
      .select("id", { count: "exact", head: true })
      .eq("client_id", clientId),
  ]);

  return {
    briefing: row ? (row as unknown as BriefingWithMeta) : null,
    total_versions: count ?? 0,
  };
}

/** Busca lista de versões históricas (metadados, sem conteúdo). */
export async function fetchBriefingHistory(
  clientId: string,
  limit: number,
  offset: number,
): Promise<{ versions: BriefingHistoryItem[]; total: number }> {
  const { data, count } = await supabaseAdmin
    .from("client_briefings")
    .select(
      `id, version, is_current, created_at,
       team_members!client_briefings_created_by_fkey(name)`,
      { count: "exact" },
    )
    .eq("client_id", clientId)
    .order("version", { ascending: false })
    .range(offset, offset + limit - 1);

  const versions: BriefingHistoryItem[] = (data ?? []).map((row: Record<string, unknown>) => ({
    id:                   row.id as string,
    version:              row.version as number,
    is_current:           row.is_current as boolean,
    created_at:           row.created_at as string,
    created_by_name:      (row.team_members as { name?: string } | null)?.name ?? null,
    completeness_percent: 0, // calculado via função SQL — omitido no histórico leve
  }));

  return { versions, total: count ?? 0 };
}

/** Busca uma versão específica pelo UUID. */
export async function fetchBriefingVersion(
  briefingId: string,
  clientId: string,
): Promise<BriefingWithMeta | null> {
  const { data } = await supabaseAdmin
    .from("client_briefings")
    .select(`*, team_members!client_briefings_created_by_fkey(name), clients!client_briefings_client_id_fkey(name)`)
    .eq("id", briefingId)
    .eq("client_id", clientId)
    .maybeSingle();

  if (!data) return null;

  const row = data as Record<string, unknown>;
  return {
    ...row,
    client_name:          (row.clients as { name?: string } | null)?.name ?? "",
    created_by_name:      (row.team_members as { name?: string } | null)?.name ?? null,
    completeness_percent: 0, // não calculado aqui — disponível via current_client_briefings
  } as unknown as BriefingWithMeta;
}

// ── IDEMPOTENCY ───────────────────────────────────────────────
// Cache em memória com TTL de 24h.
// Sobrevive dentro do mesmo processo Next.js; não sobrevive a restart.
// Suficiente para evitar duplo-submit do mesmo cliente num curto período.

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
const _idemCache = new Map<string, { status: number; body: unknown; expiresAt: number }>();

function _pruneCache() {
  const now = Date.now();
  for (const [k, v] of _idemCache) {
    if (v.expiresAt < now) _idemCache.delete(k);
  }
}

export function idemCacheKey(clientId: string, userId: string, key: string): string {
  return `briefing:post:${clientId}:${userId}:${key}`;
}

export function getIdemCached(cacheKey: string) {
  _pruneCache();
  const entry = _idemCache.get(cacheKey);
  if (!entry || entry.expiresAt < Date.now()) return null;
  return entry;
}

export function setIdemCached(cacheKey: string, status: number, body: unknown) {
  _pruneCache();
  _idemCache.set(cacheKey, { status, body, expiresAt: Date.now() + IDEMPOTENCY_TTL_MS });
}
