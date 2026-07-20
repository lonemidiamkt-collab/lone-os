import { NextRequest, NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/auth-server";

export async function POST(req: NextRequest) {
  // SEGURANÇA: só admin logado pode trocar token (usa META_APP_SECRET p/ estender p/ 60d).
  // Sem gate, virava um oráculo aberto de extensão de token com o segredo do app.
  const user = await getServerUser(req);
  if (!user?.isAdmin) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { short_lived_token } = await req.json();

  if (!short_lived_token) {
    return NextResponse.json({ error: "short_lived_token required" }, { status: 400 });
  }

  const appId = process.env.NEXT_PUBLIC_META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;

  if (!appId || !appSecret) {
    return NextResponse.json(
      { error: "META_APP_ID or META_APP_SECRET not configured" },
      { status: 500 }
    );
  }

  const params = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: short_lived_token,
  });

  const res = await fetch(
    `https://graph.facebook.com/v21.0/oauth/access_token?${params}`
  );

  const data = await res.json();

  if (!res.ok || data.error) {
    return NextResponse.json(
      { error: data.error?.message ?? "Token exchange failed" },
      { status: 400 }
    );
  }

  return NextResponse.json({
    access_token: data.access_token,
    expires_in: data.expires_in ?? 5183944, // ~60 days fallback
    token_type: data.token_type,
  });
}
