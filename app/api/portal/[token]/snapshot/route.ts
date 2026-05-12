export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { buildSnapshot } from "@/lib/portal/buildSnapshot";
import type { PeriodKind } from "@/lib/portal/types";

const VALID_PERIODS: PeriodKind[] = ["last_week", "last_2_weeks", "this_month", "last_month"];
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h
const RATE_LIMIT = new Map<string, { count: number; reset: number }>();

function checkRateLimit(token: string): boolean {
  const now = Date.now();
  const window = 60_000; // 1 min
  const entry = RATE_LIMIT.get(token);
  if (!entry || entry.reset < now) {
    RATE_LIMIT.set(token, { count: 1, reset: now + window });
    return true;
  }
  if (entry.count >= 30) return false;
  entry.count++;
  return true;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  if (!checkRateLimit(token)) {
    return NextResponse.json({ error: "Rate limit excedido. Tente em 1 minuto." }, { status: 429 });
  }

  // Valida token
  const { data: client } = await supabaseAdmin
    .from("clients")
    .select("id, public_report_enabled, public_report_token_revoked_at")
    .eq("public_report_token", token)
    .single();

  if (!client || !client.public_report_enabled || client.public_report_token_revoked_at) {
    return NextResponse.json({ error: "Token inválido ou revogado" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const periodKind: PeriodKind = VALID_PERIODS.includes(body.period_kind)
    ? body.period_kind
    : "last_week";

  // Calcula datas para lookup no cache
  const now = new Date();

  // Busca snapshot cacheado
  const { data: cached } = await supabaseAdmin
    .from("client_report_snapshots")
    .select("data, generated_at")
    .eq("client_id", client.id)
    .eq("period_kind", periodKind)
    .order("generated_at", { ascending: false })
    .limit(1)
    .single();

  const cacheAge = cached ? now.getTime() - new Date(cached.generated_at as string).getTime() : Infinity;

  if (cached && cacheAge < CACHE_TTL_MS) {
    return NextResponse.json(cached.data);
  }

  // Gera snapshot fresco
  const data = await buildSnapshot({ clientId: client.id as string, periodKind, now });

  // Calcula period_start/end para o upsert
  const { period } = data;

  await supabaseAdmin
    .from("client_report_snapshots")
    .upsert(
      {
        client_id: client.id,
        period_kind: periodKind,
        period_start: period.start,
        period_end: period.end,
        data,
        generated_at: now.toISOString(),
      },
      { onConflict: "client_id,period_kind,period_start" },
    );

  return NextResponse.json(data);
}
