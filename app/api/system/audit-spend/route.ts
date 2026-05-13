export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Endpoint temporário para auditoria SUSPEITO-1: compara spend por conta (Portal)
// vs spend somado por campanha (/traffic). Remover após auditar.

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getDateRangeBRT } from "@/lib/meta/timezone";

const GRAPH = "https://graph.facebook.com/v20.0";
const THRESHOLD_PCT = 5;

async function accountSpend(accountId: string, token: string, since: string, until: string): Promise<number> {
  const params = new URLSearchParams({
    access_token: token,
    fields: "spend",
    time_range: JSON.stringify({ since, until }),
    action_attribution_windows: '["7d_click","1d_view"]',
    limit: "1",
  });
  const res = await fetch(`${GRAPH}/${accountId}/insights?${params}`);
  if (!res.ok) return 0;
  const data = await res.json();
  return parseFloat(data.data?.[0]?.spend ?? "0");
}

async function campaignSpends(accountId: string, token: string, since: string, until: string): Promise<number> {
  const campParams = new URLSearchParams({
    access_token: token,
    fields: "id,name",
    limit: "200",
  });
  const campRes = await fetch(`${GRAPH}/${accountId}/campaigns?${campParams}`);
  if (!campRes.ok) return 0;
  const campaigns: { id: string }[] = (await campRes.json()).data ?? [];

  let total = 0;
  for (const c of campaigns) {
    const p = new URLSearchParams({
      access_token: token,
      fields: "spend",
      time_range: JSON.stringify({ since, until }),
      action_attribution_windows: '["7d_click","1d_view"]',
      limit: "1",
    });
    const r = await fetch(`${GRAPH}/${c.id}/insights?${p}`);
    if (!r.ok) continue;
    const d = await r.json();
    total += parseFloat(d.data?.[0]?.spend ?? "0");
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return total;
}

export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { data: settings } = await supabaseAdmin
    .from("agency_settings")
    .select("key, value")
    .eq("key", "meta_token")
    .maybeSingle();

  const token = (settings as { value: string } | null)?.value;
  if (!token) return NextResponse.json({ error: "Token Meta não encontrado" }, { status: 500 });

  const { data: clients } = await supabaseAdmin
    .from("clients")
    .select("id, nome_fantasia, meta_ad_account_id")
    .not("meta_ad_account_id", "is", null)
    .limit(3);

  const { since, until } = getDateRangeBRT(30);
  const results = [];

  for (const c of (clients ?? []) as Array<{ id: string; nome_fantasia: string; meta_ad_account_id: string }>) {
    const portal = await accountSpend(c.meta_ad_account_id, token, since, until);
    const traffic = await campaignSpends(c.meta_ad_account_id, token, since, until);
    const diffAbs = Math.abs(portal - traffic);
    const diffPct = portal > 0 ? (diffAbs / portal) * 100 : 0;
    results.push({
      client: c.nome_fantasia,
      account: c.meta_ad_account_id,
      period: `${since} → ${until}`,
      portal_spend: Math.round(portal * 100) / 100,
      traffic_spend: Math.round(traffic * 100) / 100,
      diff_abs: Math.round(diffAbs * 100) / 100,
      diff_pct: Math.round(diffPct * 10) / 10,
      status: diffPct > THRESHOLD_PCT ? "diverge" : "ok",
    });
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  const hasDivergence = results.some((r) => r.status === "diverge");
  return NextResponse.json({
    conclusion: hasDivergence
      ? "Divergência detectada — candidato a BUG-5"
      : `Sem divergência relevante (threshold ${THRESHOLD_PCT}%)`,
    results,
  });
}
