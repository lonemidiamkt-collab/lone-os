export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import * as Sentry from "@sentry/nextjs";
import { NextRequest, NextResponse } from "next/server";
import { lerLinkDoPortal, FRASE_INDISPONIVEL } from "@/lib/portal/token";
import { supabaseAdmin } from "@/lib/supabase/server";
import { obterSnapshot } from "@/lib/portal/snapshotCache";
import type { PeriodKind } from "@/lib/portal/types";
import { criarLimite } from "@/lib/portal/limite";

const VALID_PERIODS: PeriodKind[] = ["last_week", "last_2_weeks", "this_month", "last_month"];
const LIMITE = criarLimite(30, 60_000); // 30 buscas/min por cliente

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  // Valida token. Ex-cliente, revogado, desligado e pausado = 404; banco que oscila = 503 com
  // "tente de novo" — não é link inválido (26/10/2026, lib/portal/token.ts).
  const lido = await lerLinkDoPortal(token);
  if (lido.estado === "indisponivel") return NextResponse.json({ error: FRASE_INDISPONIVEL }, { status: 503 });
  if (lido.estado === "invalido") return NextResponse.json({ error: "Token inválido ou revogado" }, { status: 404 });
  const client = lido.linha;

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
