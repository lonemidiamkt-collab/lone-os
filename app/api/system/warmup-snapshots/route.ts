export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { buildSnapshot } from "@/lib/portal/buildSnapshot";
import type { PeriodKind } from "@/lib/portal/types";

const PERIODS: PeriodKind[] = ["last_week", "last_2_weeks", "this_month", "last_month"];
const SLEEP_MS = 500;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

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
    return NextResponse.json({ clients_processed: 0, snapshots_generated: 0, errors: [] });
  }

  const now = new Date();
  const log: { client: string; period: PeriodKind; status: "ok" | "error"; error?: string }[] = [];

  for (const c of clients as Array<{ id: string; nome_fantasia?: string; name: string }>) {
    const clientName = c.nome_fantasia || c.name;

    for (const period of PERIODS) {
      try {
        const snap = await buildSnapshot({ clientId: c.id, periodKind: period, now });
        await supabaseAdmin
          .from("client_report_snapshots")
          .upsert(
            {
              client_id: c.id,
              period_kind: period,
              period_start: snap.period.start,
              period_end: snap.period.end,
              data: snap,
              generated_at: now.toISOString(),
            },
            { onConflict: "client_id,period_kind,period_start" },
          );
        log.push({ client: clientName, period, status: "ok" });
      } catch (err) {
        const error = String(err);
        log.push({ client: clientName, period, status: "error", error });
        console.error(`[warmup-snapshots] ${clientName} / ${period}: ${error}`);
      }
    }

    await sleep(SLEEP_MS);
  }

  const success = log.filter((l) => l.status === "ok").length;
  const failed = log.filter((l) => l.status === "error").length;

  return NextResponse.json({
    clients_processed: clients.length,
    snapshots_generated: success,
    snapshots_failed: failed,
    log,
  });
}
