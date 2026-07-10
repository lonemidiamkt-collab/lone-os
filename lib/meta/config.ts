// Meta Ads API configuration

export const META_CONFIG = {
  appId: process.env.META_APP_ID ?? process.env.NEXT_PUBLIC_META_APP_ID ?? "",
  appSecret: process.env.META_APP_SECRET ?? "",
  redirectUri: process.env.META_REDIRECT_URI ?? "http://localhost:3000/api/meta/callback",
  graphApiVersion: "v21.0",
  graphApiBase: "https://graph.facebook.com",
  scopes: [
    "ads_read",
    "ads_management",
    "read_insights",
    "business_management",
    // Orgânico (Instagram): SÓ funciona depois que o app do Facebook tiver o produto "Instagram
    // Graph API" adicionado no painel de desenvolvedor — senão a Meta rejeita ("Invalid Scopes") e
    // trava o reconectar pra desenvolvedor. Ative via META_IG_SCOPES=1 quando o produto estiver no app.
    ...(process.env.NEXT_PUBLIC_META_IG_SCOPES === "1"
      ? ["instagram_basic", "instagram_manage_insights", "pages_read_engagement", "pages_show_list"]
      : []),
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
