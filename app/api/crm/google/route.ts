export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/api/require-role";
import { PAPEIS_COMERCIAL } from "@/lib/crm/acesso";
import { conferirNoGoogle, desconectarGoogle, estadoGoogle, gravarCredenciais, origemDasCredenciais, redirectUri, urlDeAutorizacao } from "@/lib/prospeccao/google";
import { assinarState } from "@/lib/google/estado-oauth";
import { problemaNoFormato } from "@/lib/google/credencial";

// Conexão do Google Agenda da Lone pelo Comercial (só sócios).
//   GET    → { configurado, conectado, email, origem: "ambiente"|"tela"|null, redirect_uri }
//   POST   { acao: "credenciais", id, secret } → confere no Google e guarda Client ID + segredo CIFRADOS (o Roberto cola
//          na tela; enquanto não conecta, pode trocar — substitui a anterior)
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
    // O acesso guardado só vale com a credencial que o gerou: trocar com a agenda conectada a derrubaria.
    if ((await estadoGoogle()).conectado) return NextResponse.json({ error: "O Google Agenda está conectado. Desconecte antes de trocar a credencial." }, { status: 409 });
    const formato = problemaNoFormato(id, secret);
    if (formato) return NextResponse.json({ error: formato }, { status: 400 });
    // Só guarda o que o Google aceita: credencial errada guardada esconde o formulário e a conexão falha depois.
    const teste = await conferirNoGoogle(id, secret);
    if (teste === "segredo_errado") return NextResponse.json({ error: "O Google recusou: esse segredo não é deste Client ID. Copie a \"Chave secreta do cliente\" (GOCSPX-…) do mesmo cliente." }, { status: 400 });
    if (teste === "cliente_inexistente") return NextResponse.json({ error: "O Google não achou esse Client ID — confira se o cliente OAuth não foi excluído." }, { status: 400 });
    await gravarCredenciais(id, secret);
    return NextResponse.json({ ok: true, conferido: teste === "ok" });
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
