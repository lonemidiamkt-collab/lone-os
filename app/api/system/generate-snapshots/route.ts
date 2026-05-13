export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { buildSnapshot } from "@/lib/portal/buildSnapshot";

export async function POST(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { data: clients } = await supabaseAdmin
    .from("clients")
    .select("id, nome_fantasia, name")
    .eq("public_report_enabled", true)
    .is("public_report_token_revoked_at", null);

  if (!clients || clients.length === 0) {
    return NextResponse.json({ generated: 0, errors: 0 });
  }

  const now = new Date();
  const isFirstOfMonth = now.getDate() === 1;

  let generated = 0;
  const errors: string[] = [];

  for (const c of clients as Array<{ id: string; nome_fantasia?: string; name: string }>) {
    const clientName = c.nome_fantasia || c.name;
    try {
      const snap = await buildSnapshot({ clientId: c.id, periodKind: "last_week", now });
      await supabaseAdmin
        .from("client_report_snapshots")
        .upsert(
          {
            client_id: c.id,
            period_kind: "last_week",
            period_start: snap.period.start,
            period_end: snap.period.end,
            data: snap,
            generated_at: now.toISOString(),
          },
          { onConflict: "client_id,period_kind,period_start" },
        );
      generated++;

      if (isFirstOfMonth) {
        const snapMonth = await buildSnapshot({ clientId: c.id, periodKind: "last_month", now });
        await supabaseAdmin
          .from("client_report_snapshots")
          .upsert(
            {
              client_id: c.id,
              period_kind: "last_month",
              period_start: snapMonth.period.start,
              period_end: snapMonth.period.end,
              data: snapMonth,
              generated_at: now.toISOString(),
            },
            { onConflict: "client_id,period_kind,period_start" },
          );
        generated++;
      }
    } catch (err) {
      const msg = `${clientName}: ${String(err)}`;
      errors.push(msg);
      console.error("[generate-snapshots]", msg);
    }
  }

  return NextResponse.json({ generated, errors: errors.length, details: errors });
}
