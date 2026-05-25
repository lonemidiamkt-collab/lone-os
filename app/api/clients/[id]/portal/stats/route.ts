export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Sessão inválida" }, { status: 401 });

  const { id } = await params;

  const { data, error } = await supabaseAdmin
    .from("public_report_access_log")
    .select("accessed_at")
    .eq("client_id", id)
    .eq("was_valid", true)
    .order("accessed_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    total_accesses: data?.length ?? 0,
    last_accessed_at: data?.[0]?.accessed_at ?? null,
  });
}
