export type PeriodKind = "last_week" | "last_2_weeks" | "this_month" | "last_month";

export interface KpiValue {
  value: number | null;
  delta_pct: number | null;
  direction: "up" | "down" | "neutral";
}

export interface CreativeItem {
  id: string;
  name: string;
  thumbnail_url: string | null;
  /** Path relativo no bucket público meta-thumbnails (ex: "clientId/adId.jpg").
   *  Preferir este sobre thumbnail_url — não expira e não depende da Meta CDN. */
  thumbnail_path: string | null;
  messages: number;
  spend: number;
  cpa: number | null;
  ctr: number;
  frequency: number;
  is_winner: boolean;
}

export interface DemographicRow {
  label: string;
  pct: number;
}

export interface AgencyAction {
  id: string;
  action_date: string;
  title: string;
  description: string | null;
  icon: string | null;
}

export interface SnapshotData {
  period: {
    kind: PeriodKind;
    start: string;
    end: string;
    label: string;
    previous_start: string;
    previous_end: string;
  };
  kpis: {
    messages: KpiValue;
    spend: KpiValue;
    cpa: KpiValue;
    reach: KpiValue;
  };
  chart: {
    days: string[];
    series: {
      messages: number[];
      clicks: number[];
      spend: number[];
      reach: number[];
    };
    peak: { metric: "messages"; day: string; value: number } | null;
  };
  top_creatives: CreativeItem[];
  demographics: {
    gender: { female_pct: number; male_pct: number } | null;
    age_ranges: DemographicRow[];
  };
  agency_actions: AgencyAction[];
  generated_at: string;
}
