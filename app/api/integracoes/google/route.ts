export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole, GESTAO } from "@/lib/api/require-role";
import { conferirNoGoogle, desconectarGoogle, estadoGoogle, gravarCredenciais, origemDasCredenciais, redirectUri, urlDeAutorizacao } from "@/lib/prospeccao/google";
import { assinarState } from "@/lib/google/estado-oauth";
import { problemaNoFormato } from "@/lib/google/credencial";

// Conexão do Google da Lone (Agenda + Drive) em Sistema › Integrações — saiu do Comercial em 09/11/2026
// ("isso deveria estar no Lone OS, não no Lone Comercial"). Mesma conexão de sempre (lib/prospeccao/google.ts);
// muda só onde se faz e para onde o Google devolve (destino "painel" → /integracoes).
//   GET    → { configurado, conectado, email, drive, origem, redirect_uri }       (gestão)
//   POST   { acao: "credenciais", id, secret } → confere no Google e guarda cifrado (admin)
//   POST   { acao: "conectar" } → { url } do consentimento do Google                 (admin)
//   DELETE → desconecta (apaga o refresh token)                                      (admin)

export async function GET(req: NextRequest) {
  const gate = await requireRole(req, GESTAO);
  if (gate instanceof NextResponse) return gate;
  const [e, origem] = await Promise.all([estadoGoogle(), origemDasCredenciais()]);
  return NextResponse.json({ ...e, origem, redirect_uri: redirectUri(), podeAlterar: gate.papel === "admin" });
}

export async function POST(req: NextRequest) {
  const gate = await requireRole(req, ["admin"]);
  if (gate instanceof NextResponse) return gate;
  const b = await req.json().catch(() => null) as { acao?: string; id?: string; secret?: string } | null;
  if (b?.acao === "credenciais") {
    const id = (b.id ?? "").trim(), secret = (b.secret ?? "").trim();
    // O acesso guardado só vale com a credencial que o gerou: trocar com o Google conectado o derrubaria.
    if ((await estadoGoogle()).conectado) return NextResponse.json({ error: "O Google está conectado. Desconecte antes de trocar a credencial." }, { status: 409 });
    const formato = problemaNoFormato(id, secret);
    if (formato) return NextResponse.json({ error: formato }, { status: 400 });
    const teste = await conferirNoGoogle(id, secret);
    if (teste === "segredo_errado") return NextResponse.json({ error: "O Google recusou: esse segredo não é deste Client ID. Copie a \"Chave secreta do cliente\" (GOCSPX-…) do mesmo cliente." }, { status: 400 });
    if (teste === "cliente_inexistente") return NextResponse.json({ error: "O Google não achou esse Client ID — confira se o cliente OAuth não foi excluído." }, { status: 400 });
    await gravarCredenciais(id, secret);
    return NextResponse.json({ ok: true, conferido: teste === "ok" });
  }
  if (b?.acao === "conectar") {
    const url = await urlDeAutorizacao(assinarState("painel"));
    if (!url) return NextResponse.json({ error: "Falta a credencial do Google (Client ID e segredo)." }, { status: 400 });
    return NextResponse.json({ ok: true, url });
  }
  return NextResponse.json({ error: "ação desconhecida" }, { status: 400 });
}

export async function DELETE(req: NextRequest) {
  const gate = await requireRole(req, ["admin"]);
  if (gate instanceof NextResponse) return gate;
  await desconectarGoogle();
  return NextResponse.json({ ok: true });
}
