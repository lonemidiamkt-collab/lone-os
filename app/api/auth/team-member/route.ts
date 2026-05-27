export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const authId = req.nextUrl.searchParams.get("auth_id");
  if (!authId) return NextResponse.json({ id: null });

  try {
    const { data } = await supabaseAdmin
      .from("team_members")
      .select("id")
      .eq("auth_id", authId)
      .maybeSingle();
    return NextResponse.json({ id: data?.id ?? null });
  } catch {
    return NextResponse.json({ id: null });
  }
}
