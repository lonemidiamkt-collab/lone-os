export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { trocarCodigoPorTokens, appUrl } from "@/lib/prospeccao/google";
import { lerState, type DestinoGoogle } from "@/lib/google/estado-oauth";
import { trocarCodigoMarketing } from "@/lib/google/marketing-auth";

// GET /api/auth/google/callback?code=&state= — volta do consentimento do Google.
// Público no middleware (/api/auth); a prova de origem é o `state` assinado (lib/google/estado-oauth.ts),
// que também diz para onde voltar: Sistema › Integrações (desde 09/11/2026), a Agenda do Comercial ou o piloto antigo.
const COMERCIAL = "https://comercial.lonemidia.com";

function voltar(destino: DestinoGoogle, status: string, extra = "") {
  const url = destino === "painel" || destino === "marketing"
    ? `${appUrl()}/integracoes?${destino === "marketing" ? "google_marketing" : "google"}=${status}${extra}`
    : destino === "comercial"
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
  // Google Ads e Perfil da Empresa: outra conexão, outra chave (lib/google/marketing-auth.ts).
  const r = st.destino === "marketing" ? await trocarCodigoMarketing(code) : await trocarCodigoPorTokens(code);
  if (!r.ok) return voltar(st.destino, "erro", `&motivo=${encodeURIComponent(r.error ?? "troca")}`);
  return voltar(st.destino, "ok", r.email ? `&email=${encodeURIComponent(r.email)}` : "");
}
