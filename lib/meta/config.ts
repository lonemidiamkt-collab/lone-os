// Meta Ads API configuration

/**
 * Versão da Graph API usada pelo projeto inteiro (Marketing API, Instagram, Páginas, OAuth). UM lugar só:
 * antes cada arquivo tinha a própria `const GRAPH` (17 em v21.0, 2 em v20.0). A v21.0 da Graph API para
 * de responder em 21/01/2027 (changelog da Meta, conferido em 04/11/2026). tests/meta-versao.test.ts
 * trava versão escrita à mão fora daqui.
 */
export const META_GRAPH_VERSION = "v25.0";
export const GRAPH_URL = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

export const META_CONFIG = {
  appId: process.env.META_APP_ID ?? process.env.NEXT_PUBLIC_META_APP_ID ?? "",
  appSecret: process.env.META_APP_SECRET ?? "",
  redirectUri: process.env.META_REDIRECT_URI ?? "http://localhost:3000/api/meta/callback",
  graphApiVersion: META_GRAPH_VERSION,
  graphApiBase: "https://graph.facebook.com",
  scopes: [
    "ads_read",
    "ads_management",
    "read_insights",
    "business_management",
    // Orgânico (Instagram Graph API via Página) — permissões já adicionadas ao app na Meta (10/jul).
    "instagram_basic",
    "instagram_manage_insights",
    "pages_read_engagement",
    "pages_show_list",
    // MCP oficial da Meta (02/09). O servidor devolve 401 e nomeia a exigência no header
    // www-authenticate; sem estes dois o handshake nunca passa. Ver lib/meta/gateway/mcp.ts.
    "catalog_management",
    "ads_mcp_management",
  ],
};

export function getOAuthUrl(redirectUri?: string): string {
  const params = new URLSearchParams({
    client_id: META_CONFIG.appId,
    redirect_uri: redirectUri ?? META_CONFIG.redirectUri,
    scope: META_CONFIG.scopes.join(","),
    response_type: "token",
    state: crypto.randomUUID(),
  });
  return `https://www.facebook.com/${META_CONFIG.graphApiVersion}/dialog/oauth?${params}`;
}

export function getGraphUrl(path: string): string {
  return `${META_CONFIG.graphApiBase}/${META_CONFIG.graphApiVersion}${path}`;
}
