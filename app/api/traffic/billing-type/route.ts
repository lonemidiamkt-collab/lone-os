export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const { accountId, isPrepaid } = await req.json();
    if (!accountId || typeof isPrepaid !== "boolean") {
      return NextResponse.json({ error: "accountId e isPrepaid são obrigatórios" }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("ad_accounts")
      .update({ is_prepaid: isPrepaid, billing_type_source: "manual" })
      .eq("id", accountId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
