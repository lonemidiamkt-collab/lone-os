export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/api/require-role";
import { PAPEIS_COMERCIAL } from "@/lib/crm/acesso";
import { desconectarGoogle, estadoGoogle, gravarCredenciais, origemDasCredenciais, redirectUri, urlDeAutorizacao } from "@/lib/prospeccao/google";
import { assinarState } from "@/lib/google/estado-oauth";

// Conexão do Google Agenda da Lone pelo Comercial (só sócios).
//   GET    → { configurado, conectado, email, origem: "ambiente"|"tela"|null, redirect_uri }
//   POST   { acao: "credenciais", id, secret } → guarda Client ID + segredo CIFRADOS (o Roberto cola na tela)
//   POST   { acao: "conectar" } → { url } do consentimento do Google (volta para a Agenda do Comercial)
//   DELETE → desconecta (apaga o refresh token)

export async function GET(req: NextRequest) {
  const gate = await requireRole(req, PAPEIS_COMERCIAL);
  if (gate instanceof NextResponse) return gate;
  const [e, origem] = await Promise.all([estadoGoogle(), origemDasCredenciais()]);
  return NextResponse.json({ ...e, origem, redirect_uri: redirectUri() });
}

export async function POST(req: NextRequest) {
  const gate = await requireRole(req, PAPEIS_COMERCIAL);
  if (gate instanceof NextResponse) return gate;
  const b = await req.json().catch(() => null) as { acao?: string; id?: string; secret?: string } | null;
  if (b?.acao === "credenciais") {
    const id = (b.id ?? "").trim(), secret = (b.secret ?? "").trim();
    if (!/\.apps\.googleusercontent\.com$/.test(id)) return NextResponse.json({ error: "O Client ID termina em .apps.googleusercontent.com — confira o que foi colado." }, { status: 400 });
    if (secret.length < 15) return NextResponse.json({ error: "Segredo do cliente inválido." }, { status: 400 });
    await gravarCredenciais(id, secret);
    return NextResponse.json({ ok: true });
  }
  if (b?.acao === "conectar") {
    const url = await urlDeAutorizacao(assinarState("comercial"));
    if (!url) return NextResponse.json({ error: "Falta a credencial do Google (Client ID e segredo)." }, { status: 400 });
    return NextResponse.json({ ok: true, url });
  }
  return NextResponse.json({ error: "ação desconhecida" }, { status: 400 });
}

export async function DELETE(req: NextRequest) {
  const gate = await requireRole(req, PAPEIS_COMERCIAL);
  if (gate instanceof NextResponse) return gate;
  await desconectarGoogle();
  return NextResponse.json({ ok: true });
}
