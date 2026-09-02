export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { META_CONFIG } from "@/lib/meta/config";
import { SCOPES_MCP } from "@/lib/meta/gateway/mcp";

// GET /api/meta/mcp/conectar — leva direto ao consentimento da Meta.
//
// Existe porque a URL do dialog tem 380 caracteres e dez escopos: mandar isso por WhatsApp para
// alguém copiar e colar é pedir para quebrar no meio. Aqui o link vira
// painel.lonemidia.com/api/meta/mcp/conectar, que cabe numa mensagem e não tem como digitar
// errado. A rota só redireciona — quem autoriza é o dono da conta, na tela da Meta.
//
// Público de propósito (o middleware já libera /api/meta): não há segredo nenhum aqui. O client_id
// aparece em qualquer fluxo OAuth, e o token que volta é entregue ao NAVEGADOR de quem autorizou,
// nunca a esta rota. Salvar o token continua exigindo admin, no POST de /api/meta/mcp/status.
//
// `login_success.html` é o redirect padrão da Meta para fluxo sem servidor — não precisa estar
// cadastrado no app, e é por isso que funciona hoje, sem mexer em configuração nenhuma.
const REDIRECT_MCP = "https://www.facebook.com/connect/login_success.html";

export async function GET() {
  if (!META_CONFIG.appId) {
    return NextResponse.json({ error: "META_APP_ID não configurado" }, { status: 500 });
  }

  const url = new URL(`https://www.facebook.com/${META_CONFIG.graphApiVersion}/dialog/oauth`);
  url.searchParams.set("client_id", META_CONFIG.appId);
  url.searchParams.set("redirect_uri", REDIRECT_MCP);
  // Os que já usamos MAIS os do MCP. Autorizar só os novos derrubaria relatório, portal e
  // Instagram — o token novo SUBSTITUI o antigo, não soma.
  url.searchParams.set("scope", [...new Set([...META_CONFIG.scopes, ...SCOPES_MCP])].join(","));
  url.searchParams.set("response_type", "token");
  // Força a tela de permissões mesmo para quem já autorizou o app antes. Sem isto, quem já disse
  // "sim" uma vez volta direto com o token ANTIGO — sem os escopos novos, e sem entender por quê.
  url.searchParams.set("auth_type", "rerequest");

  return NextResponse.redirect(url.toString(), 302);
}
