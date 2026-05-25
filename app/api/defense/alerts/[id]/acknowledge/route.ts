export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";

/**
 * POST /api/defense/alerts/[id]/acknowledge
 * Marca alerta como ack'd. Qualquer staff autenticado pode.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;

  const { error } = await supabaseAdmin
    .from("anomaly_alerts")
    .update({
      acknowledged_at: new Date().toISOString(),
      acknowledged_by: user.email,
    })
    .eq("id", id)
    .is("acknowledged_at", null); // só ack se ainda não foi

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
