export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { trocarCodigoPorTokens, appUrl } from "@/lib/prospeccao/google";

// GET /api/auth/google/callback?code=&state= — volta do consentimento do Google (Piloto SDR).
// Público no middleware (/api/auth); a prova de origem é o `state` assinado em /api/prospeccao/google.
function stateValido(state: string | null): boolean {
  if (!state) return false;
  const [ts, mac] = state.split(".");
  if (!ts || !mac) return false;
  const idade = Date.now() - parseInt(ts, 36);
  if (!Number.isFinite(idade) || idade < 0 || idade > 10 * 60_000) return false;
  const segredo = process.env.CRON_SECRET || process.env.VAULT_KEY || "lone";
  const esperado = createHmac("sha256", segredo).update(ts).digest("hex").slice(0, 32);
  const a = Buffer.from(mac), b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const volta = (status: string, extra = "") => NextResponse.redirect(`${appUrl()}/prospeccao?tab=configuracao&google=${status}${extra}`);
  if (q.get("error")) return volta("erro", `&motivo=${encodeURIComponent(q.get("error") ?? "")}`);
  if (!stateValido(q.get("state"))) return volta("erro", "&motivo=state");
  const code = q.get("code");
  if (!code) return volta("erro", "&motivo=sem_codigo");
  const r = await trocarCodigoPorTokens(code);
  if (!r.ok) return volta("erro", `&motivo=${encodeURIComponent(r.error ?? "troca")}`);
  return volta("ok", r.email ? `&email=${encodeURIComponent(r.email)}` : "");
}
