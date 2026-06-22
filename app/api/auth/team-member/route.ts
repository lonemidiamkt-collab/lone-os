export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";

export async function GET(req: NextRequest) {
  const authId = req.nextUrl.searchParams.get("auth_id");
  if (!authId) return NextResponse.json({ id: null });

  // Só logado e só o PRÓPRIO auth_id (evita enumeração de team_members).
  const user = await getServerUser(req);
  if (!user || (authId !== user.id && !user.isAdmin)) return NextResponse.json({ id: null });

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
