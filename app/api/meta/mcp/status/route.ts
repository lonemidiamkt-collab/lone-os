export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireCronOrUser } from "@/lib/api/cron-guard";
import { getMetaToken } from "@/lib/traffic/sync-core";
import { mcpProvider, scopesDoToken, SCOPES_MCP } from "@/lib/meta/gateway/mcp";
import { META_CONFIG } from "@/lib/meta/config";

// GET /api/meta/mcp/status — por que o MCP da Meta não conecta, e o link que resolve.
//
// Existe porque o diagnóstico anterior ("a conta não está no rollout") mandava esperar por algo
// que não ia chegar. O bloqueio real é consentimento: o token nunca pediu `ads_mcp_management`
// nem `catalog_management`. Só o dono da conta pode conceder — então o máximo que dá para
// automatizar é deixar a ação a UM clique, com o link já montado com os scopes certos.

export async function GET(req: NextRequest) {
  const denied = await requireCronOrUser(req);
  if (denied) return denied;

  const token = await getMetaToken();
  if (!token) {
    return NextResponse.json({ conectado: false, motivo: "sem token da Meta salvo em agency_settings" });
  }

  const [cap, tem] = await Promise.all([mcpProvider.disponivel(token), scopesDoToken(token)]);
  const faltam = SCOPES_MCP.filter((s) => !tem.includes(s));

  // O redirect_uri tem que bater EXATAMENTE com o cadastrado no app da Meta, senão o dialog recusa.
  const redirectUri = META_CONFIG.redirectUri;
  const url = new URL("https://www.facebook.com/v21.0/dialog/oauth");
  url.searchParams.set("client_id", META_CONFIG.appId);
  url.searchParams.set("redirect_uri", redirectUri);
  // Pede o conjunto que já tínhamos MAIS o que o MCP exige — reautorizar com menos derrubaria o
  // que hoje funciona (relatórios, portal, Instagram).
  url.searchParams.set("scope", [...new Set([...META_CONFIG.scopes, ...SCOPES_MCP])].join(","));
  url.searchParams.set("response_type", "token");

  return NextResponse.json({
    conectado: cap.disponivel,
    detalhe: cap.detalhe,
    verificadoEm: cap.verificadoEm,
    scopes_do_token: tem,
    scopes_exigidos: SCOPES_MCP,
    scopes_faltando: faltam,
    // Sem os scopes não adianta reautorizar contra um app que não os declara: as permissões
    // precisam existir no app da Meta (App Dashboard → Permissions) antes do dialog aceitar.
    proximo_passo: cap.disponivel
      ? "nada — MCP conectado"
      : faltam.length
        ? `abrir o link, autorizar com a conta que administra o Business, colar o token em /settings`
        : "scopes ok mas 401 — conferir se o usuário do token administra o Business da conta de anúncio",
    link_autorizacao: cap.disponivel ? null : url.toString(),
  });
}
