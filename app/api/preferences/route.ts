export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";

// GET /api/preferences?keys=key1,key2
// Returns { key1: value1, key2: value2 }
export async function GET(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Sessão inválida" }, { status: 401 });

  const keysParam = req.nextUrl.searchParams.get("keys");
  const keys = keysParam ? keysParam.split(",").map((k) => k.trim()).filter(Boolean) : [];

  let query = supabaseAdmin
    .from("user_preferences")
    .select("key, value")
    .eq("user_id", user.id);

  if (keys.length > 0) query = query.in("key", keys);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const result: Record<string, unknown> = {};
  for (const row of data ?? []) result[row.key] = row.value;
  return NextResponse.json(result);
}

// PATCH /api/preferences  body: { key: string, value: unknown }
// Upserts a single preference for the authenticated user
export async function PATCH(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Sessão inválida" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body.key !== "string" || body.key.length === 0) {
    return NextResponse.json({ error: "key obrigatório" }, { status: 400 });
  }
  if (body.key.length > 128) {
    return NextResponse.json({ error: "key muito longa (máx 128)" }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from("user_preferences").upsert(
    { user_id: user.id, key: body.key, value: body.value ?? null, updated_at: new Date().toISOString() },
    { onConflict: "user_id,key" }
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
