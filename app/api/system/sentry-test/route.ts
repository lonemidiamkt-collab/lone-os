export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Endpoint temporário para verificar integração Sentry. Remover após validação.

import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

export async function GET() {
  Sentry.setTag("cron_endpoint", "test");
  Sentry.setContext("sentry_test", { timestamp: new Date().toISOString() });
  Sentry.captureException(new Error(`Sentry test Lone OS — ${new Date().toISOString()}`));
  return NextResponse.json({ ok: true, message: "Erro de teste enviado ao Sentry" });
}
