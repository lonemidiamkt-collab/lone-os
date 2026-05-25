import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
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
