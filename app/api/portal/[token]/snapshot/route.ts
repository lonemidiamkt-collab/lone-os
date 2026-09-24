export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import * as Sentry from "@sentry/nextjs";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { obterSnapshot } from "@/lib/portal/snapshotCache";
import type { PeriodKind } from "@/lib/portal/types";
import { estaPausado } from "@/lib/clients/pausa";
import { criarLimite } from "@/lib/portal/limite";

const VALID_PERIODS: PeriodKind[] = ["last_week", "last_2_weeks", "this_month", "last_month"];
const LIMITE = criarLimite(30, 60_000); // 30 buscas/min por cliente

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  // Valida token
  const { data: client } = await supabaseAdmin
    .from("clients")
    .select("id, public_report_enabled, public_report_token_revoked_at, active, churned_at, paused_at, paused_until")
    .eq("public_report_token", token)
    .maybeSingle();

  // Ex-cliente (inativo/arquivado) não acessa mais o portal — ver app/portal/[token]/page.tsx.
  if (!client || !client.public_report_enabled || client.public_report_token_revoked_at || client.active === false || client.churned_at || estaPausado(client)) {
    return NextResponse.json({ error: "Token inválido ou revogado" }, { status: 404 });
  }

  if (LIMITE.estourou(client.id as string)) {
    return NextResponse.json({ error: "Muitas buscas seguidas. Tente em 1 minuto." }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const periodKind: PeriodKind = VALID_PERIODS.includes(body.period_kind)
    ? body.period_kind
    : "last_week";

  Sentry.setContext("portal_snapshot", { client_id: client.id, period_kind: periodKind });
  Sentry.setTag("portal_endpoint", "true");
  // "indisponivel" volta com 200 e números null: a tela mostra "atualizando", nunca zero.
  return NextResponse.json(await obterSnapshot(client.id as string, periodKind));
}
