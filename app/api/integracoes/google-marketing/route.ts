export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole, GESTAO } from "@/lib/api/require-role";
import { assinarState } from "@/lib/google/estado-oauth";
import { estadoMarketing, urlDeAutorizacaoMarketing, desconectarMarketing } from "@/lib/google/marketing-auth";

// Conexão do Google ADS e do PERFIL DA EMPRESA em Sistema › Integrações (lib/google/marketing-auth.ts). Separada da
// Agenda/Drive: usa a mesma credencial do app, mas outro consentimento (pode ser outro e-mail — o que gerencia as
// contas dos clientes) e outra chave. Só leitura no Google.
//   GET    → { configurado, conectado, email, ads, perfil, podeAlterar }   (gestão)
//   POST   { acao: "conectar" } → { url } do consentimento                  (admin)
//   DELETE → desconecta                                                     (admin)

export async function GET(req: NextRequest) {
  const gate = await requireRole(req, GESTAO);
  if (gate instanceof NextResponse) return gate;
  return NextResponse.json({ ...(await estadoMarketing()), podeAlterar: gate.papel === "admin" });
}

export async function POST(req: NextRequest) {
  const gate = await requireRole(req, ["admin"]);
  if (gate instanceof NextResponse) return gate;
  const b = await req.json().catch(() => null) as { acao?: string } | null;
  if (b?.acao !== "conectar") return NextResponse.json({ error: "ação desconhecida" }, { status: 400 });
  const url = await urlDeAutorizacaoMarketing(assinarState("marketing"));
  if (!url) return NextResponse.json({ error: "Falta a credencial do app do Google (cartão Google — Agenda e Drive)." }, { status: 400 });
  return NextResponse.json({ ok: true, url });
}

export async function DELETE(req: NextRequest) {
  const gate = await requireRole(req, ["admin"]);
  if (gate instanceof NextResponse) return gate;
  await desconectarMarketing();
  return NextResponse.json({ ok: true });
}
