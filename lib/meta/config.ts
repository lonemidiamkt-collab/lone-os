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
