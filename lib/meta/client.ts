// Wrapper centralizado para chamadas de insights da Meta API — server-side only.
//
// REGRA: toda nova função de insights server-side deve usar metaInsightsFetch()
// em vez de chamar fetch() diretamente para graph.facebook.com.
// Isso garante attribution_windows e timezone BRT em todas as chamadas.
//
// EXEMPT: lib/meta/useMetaAds.ts (hook de browser, auth diferente, lida com
// date_preset em vez de time_range — não compatível com este wrapper).

import * as Sentry from "@sentry/nextjs";
import { getGraphUrl } from "./config";

export interface InsightsFetchOptions {
  accessToken: string;
  fields: string;
  timeRange: { since: string; until: string };
  level?: "account" | "campaign" | "adset" | "ad";
  breakdowns?: string;
  sort?: string;
  limit?: number;
  timeIncrement?: number | "monthly" | "all_days";
}

export async function metaInsightsFetch(
  endpoint: string,
  opts: InsightsFetchOptions,
): Promise<unknown[]> {
  const url = getGraphUrl(endpoint);
  const params = new URLSearchParams({
    access_token: opts.accessToken,
    fields: opts.fields,
    time_range: JSON.stringify(opts.timeRange),
    action_attribution_windows: '["7d_click","1d_view"]',
    limit: String(opts.limit ?? 100),
  });

  if (opts.level) params.set("level", opts.level);
  if (opts.breakdowns) params.set("breakdowns", opts.breakdowns);
  if (opts.sort) params.set("sort", opts.sort);
  if (opts.timeIncrement !== undefined) params.set("time_increment", String(opts.timeIncrement));

  Sentry.addBreadcrumb({
    category: "meta-api",
    message: `GET ${endpoint}`,
    data: { since: opts.timeRange.since, until: opts.timeRange.until, level: opts.level },
    level: "info",
  });

  const res = await fetch(`${url}?${params}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    Sentry.setTag("meta_api_call", true);
    throw new Error(`Meta insights failed for ${endpoint}: ${JSON.stringify(err)}`);
  }
  const data = await res.json();
  return data.data ?? [];
}
