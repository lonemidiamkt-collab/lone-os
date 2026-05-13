// Auditoria: compara spend agregado por conta (Portal) vs soma por campanha (/traffic).
// Detecta SUSPEITO-1: divergência por campanhas pausadas/deletadas no período.
//
// Uso:
//   npx tsx scripts/audit-portal-vs-traffic.ts
//
// Requer: SUPABASE_SERVICE_ROLE_KEY e META_TOKEN (ou meta_token no banco) no .env.local

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const GRAPH = "https://graph.facebook.com/v20.0";
const DAYS = 30;
const THRESHOLD_PCT = 5;

function getBRTDateRange(days: number): { since: string; until: string } {
  const brt = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  const until = new Date();
  until.setDate(until.getDate() - 1);
  const since = new Date(until);
  since.setDate(since.getDate() - (days - 1));
  return { since: brt(since), until: brt(until) };
}

async function fetchAccountSpend(accountId: string, token: string, since: string, until: string): Promise<number> {
  const params = new URLSearchParams({
    access_token: token,
    fields: "spend",
    time_range: JSON.stringify({ since, until }),
    action_attribution_windows: '["7d_click","1d_view"]',
    limit: "1",
  });
  const res = await fetch(`${GRAPH}/${accountId}/insights?${params}`);
  if (!res.ok) throw new Error(`Account insights failed: ${res.status}`);
  const data = await res.json();
  return parseFloat(data.data?.[0]?.spend ?? "0");
}

async function fetchCampaignSpends(accountId: string, token: string, since: string, until: string): Promise<{ id: string; name: string; spend: number }[]> {
  const campParams = new URLSearchParams({
    access_token: token,
    fields: "id,name,status",
    limit: "200",
  });
  const campRes = await fetch(`${GRAPH}/${accountId}/campaigns?${campParams}`);
  if (!campRes.ok) throw new Error(`Campaigns failed: ${campRes.status}`);
  const campData = await campRes.json();
  const campaigns: { id: string; name: string; status: string }[] = campData.data ?? [];

  const results: { id: string; name: string; spend: number }[] = [];
  for (const c of campaigns) {
    const params = new URLSearchParams({
      access_token: token,
      fields: "spend",
      time_range: JSON.stringify({ since, until }),
      action_attribution_windows: '["7d_click","1d_view"]',
      limit: "1",
    });
    const res = await fetch(`${GRAPH}/${c.id}/insights?${params}`);
    if (!res.ok) continue;
    const data = await res.json();
    const spend = parseFloat(data.data?.[0]?.spend ?? "0");
    if (spend > 0) results.push({ id: c.id, name: c.name, spend });
    await new Promise((r) => setTimeout(r, 200));
  }
  return results;
}

async function main() {
  const { data: settings } = await supabase
    .from("agency_settings")
    .select("key, value")
    .eq("key", "meta_token")
    .maybeSingle();

  const token = (settings as { key: string; value: string } | null)?.value ?? process.env.META_TOKEN;
  if (!token) { console.error("Token Meta não encontrado"); process.exit(1); }

  const { data: clients } = await supabase
    .from("clients")
    .select("id, nome_fantasia, meta_ad_account_id")
    .not("meta_ad_account_id", "is", null)
    .limit(3);

  if (!clients?.length) { console.log("Nenhum cliente com conta Meta conectada"); return; }

  const { since, until } = getBRTDateRange(DAYS);
  console.log(`\nAuditoria Portal vs Traffic — ${since} → ${until} (${DAYS} dias, BRT)\n`);

  const report: {
    client: string;
    account: string;
    portal_spend: number;
    traffic_spend: number;
    diff_abs: number;
    diff_pct: number;
    status: "ok" | "diverge";
  }[] = [];

  for (const c of clients as Array<{ id: string; nome_fantasia: string; meta_ad_account_id: string }>) {
    console.log(`Auditando ${c.nome_fantasia} (${c.meta_ad_account_id})...`);
    try {
      const portalSpend = await fetchAccountSpend(c.meta_ad_account_id, token, since, until);
      const campaigns = await fetchCampaignSpends(c.meta_ad_account_id, token, since, until);
      const trafficSpend = campaigns.reduce((acc, cam) => acc + cam.spend, 0);

      const diffAbs = Math.abs(portalSpend - trafficSpend);
      const diffPct = portalSpend > 0 ? (diffAbs / portalSpend) * 100 : 0;

      report.push({
        client: c.nome_fantasia,
        account: c.meta_ad_account_id,
        portal_spend: Math.round(portalSpend * 100) / 100,
        traffic_spend: Math.round(trafficSpend * 100) / 100,
        diff_abs: Math.round(diffAbs * 100) / 100,
        diff_pct: Math.round(diffPct * 10) / 10,
        status: diffPct > THRESHOLD_PCT ? "diverge" : "ok",
      });

      await new Promise((r) => setTimeout(r, 500));
    } catch (err) {
      console.error(`  ERRO: ${err}`);
    }
  }

  console.log("\n── Resultado ──────────────────────────────────────────────────────\n");
  for (const r of report) {
    const flag = r.status === "diverge" ? "⚠️  DIVERGE" : "✅ OK";
    console.log(`${flag}  ${r.client}`);
    console.log(`   Portal: R$ ${r.portal_spend}  |  Traffic: R$ ${r.traffic_spend}`);
    console.log(`   Diferença: R$ ${r.diff_abs} (${r.diff_pct}%)`);
    console.log();
  }

  const hasDivergence = report.some((r) => r.status === "diverge");
  if (hasDivergence) {
    console.log("CONCLUSÃO: Divergência detectada em ≥1 cliente. Candidato a BUG-5.");
    console.log("Adicionar à auditoria em docs/METRICS_AUDIT.md com evidência numérica.");
  } else {
    console.log(`CONCLUSÃO: Sem divergência relevante (threshold: ${THRESHOLD_PCT}%).`);
    console.log("Documentar como SUSPEITO-1 monitorado sem evidência em docs/METRICS_AUDIT.md.");
  }

  console.log("\nJSON completo:");
  console.log(JSON.stringify(report, null, 2));
}

main().catch(console.error);
