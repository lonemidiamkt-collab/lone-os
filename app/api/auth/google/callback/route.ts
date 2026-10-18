export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { trocarCodigoPorTokens, appUrl } from "@/lib/prospeccao/google";
import { lerState, type DestinoGoogle } from "@/lib/google/estado-oauth";

// GET /api/auth/google/callback?code=&state= — volta do consentimento do Google.
// Público no middleware (/api/auth); a prova de origem é o `state` assinado (lib/google/estado-oauth.ts),
// que também diz para onde voltar: a Agenda do Comercial ou a configuração do piloto antigo.
const COMERCIAL = "https://comercial.lonemidia.com";

function voltar(destino: DestinoGoogle, status: string, extra = "") {
  const url = destino === "comercial"
    ? `${COMERCIAL}/crm?aba=agenda&google=${status}${extra}`
    : `${appUrl()}/prospeccao?tab=configuracao&google=${status}${extra}`;
  return NextResponse.redirect(url);
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const st = lerState(q.get("state"));
  if (q.get("error")) return voltar(st.destino, "erro", `&motivo=${encodeURIComponent(q.get("error") ?? "")}`);
  if (!st.valido) return voltar(st.destino, "erro", "&motivo=state");
  const code = q.get("code");
  if (!code) return voltar(st.destino, "erro", "&motivo=sem_codigo");
  const r = await trocarCodigoPorTokens(code);
  if (!r.ok) return voltar(st.destino, "erro", `&motivo=${encodeURIComponent(r.error ?? "troca")}`);
  return voltar(st.destino, "ok", r.email ? `&email=${encodeURIComponent(r.email)}` : "");
}
