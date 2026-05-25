import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

const TOKEN_KEYS = ["meta_token", "meta_token_expires_at", "meta_token_type"];

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("agency_settings")
    .select("key, value")
    .in("key", TOKEN_KEYS);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const map = Object.fromEntries((data ?? []).map((r: { key: string; value: string }) => [r.key, r.value]));
  if (!map.meta_token) return NextResponse.json({ token: null });

  return NextResponse.json({
    token: map.meta_token,
    expiresAt: map.meta_token_expires_at ? parseInt(map.meta_token_expires_at, 10) : null,
    tokenType: (map.meta_token_type as "short" | "long") ?? "short",
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!Array.isArray(body?.rows)) {
    return NextResponse.json({ error: "rows array required" }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("agency_settings")
    .upsert(body.rows, { onConflict: "key" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const { error } = await supabaseAdmin
    .from("agency_settings")
    .delete()
    .in("key", TOKEN_KEYS);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
