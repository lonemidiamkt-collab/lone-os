import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const admin = createClient(
  process.env.SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
);

export async function GET(req: NextRequest) {
  const authId = req.nextUrl.searchParams.get("auth_id");
  if (!authId) return NextResponse.json({ id: null });

  try {
    const { data } = await admin
      .from("team_members")
      .select("id")
      .eq("auth_id", authId)
      .maybeSingle();
    return NextResponse.json({ id: data?.id ?? null });
  } catch {
    return NextResponse.json({ id: null });
  }
}
