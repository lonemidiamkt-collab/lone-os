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

/** Anúncio ATIVO do cliente com os números do período — a lista "Ver todos os anúncios ativos".
 *  Enxuto de propósito: vai inteiro no snapshot público (nada de conta, campanha, público ou verba
 *  diária — só o que o cliente já vê do próprio anúncio). Montado em lib/portal/anunciosAtivos.ts. */
export interface ActiveAdItem {
  id: string;
  name: string;
  thumbnail_url: string | null;
  /** Mesmo cache do Storage dos criativos do topo, quando o anúncio também está lá. */
  thumbnail_path: string | null;
  messages: number;
  spend: number;
  /** null = sem conversa no período (não há custo por conversa pra calcular). */
  cpa: number | null;
  clicks: number;
}

export interface ActiveAdsList {
  items: ActiveAdItem[];
  /** Quantos anúncios ativos a conta tem — pode passar de items.length (lista limitada). */
  total: number;
  /** Quantos dos `total` trouxeram ao menos uma conversa no período (conta antes do limite). */
  with_messages: number;
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

/** Confiança do bloco de anúncios deste snapshot. Existe porque "o cliente não gastou nada" e
 *  "a Meta não respondeu" produziam exatamente o mesmo resultado na tela: tudo zero.
 *   - ok           → dados completos, pode cachear e mostrar.
 *   - parcial      → o essencial (verba/mensagens/alcance) veio; algo secundário falhou
 *                    (criativos ou público). Mostra, mas não vira cache bom.
 *   - indisponivel → não deu pra buscar o essencial. NÃO grava, NÃO mostra como se fosse zero.
 *   - sem_conta    → cliente sem conta de anúncio/token: zero aqui é a verdade. */
export type AdsStatus = "ok" | "parcial" | "indisponivel" | "sem_conta";

export interface SnapshotData {
  /** Ausente em snapshots gravados antes desta mudança — tratar como "ok". */
  ads_status?: AdsStatus;
  /** Quando o portal cai de volta num snapshot antigo por falha da Meta, guarda de quando ele é. */
  stale_since?: string | null;
  /** O que `kpis.messages`, `chart.series.messages` e `messages` dos criativos contam (Leva 7A, N4):
   *  conversas, leads ou compras, pelo que a conta trouxe no período. Ausente (snapshot antigo, sem
   *  conta, indisponível) = conversas. */
  result_kind?: "mensagens" | "leads" | "compras";
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
    /** Conversas por dia do período anterior, na mesma posição de `days` (mesmo dia relativo).
     *  Ausente/null = sem comparação (snapshot antigo ou o período anterior falhou). */
    previous_messages?: (number | null)[] | null;
    /** Mesmo alinhamento de `previous_messages`, para as outras abas da evolução diária.
     *  Ausente/null = sem comparação (snapshot antigo ou o período anterior falhou). */
    previous_series?: {
      clicks: (number | null)[];
      spend: (number | null)[];
      reach: (number | null)[];
    } | null;
    peak: { metric: "messages"; day: string; value: number } | null;
  };
  top_creatives: CreativeItem[];
  /** Todos os anúncios ativos (limitado). Ausente = snapshot antigo; null = a Meta não entregou a
   *  lista agora (o resto do snapshot vale). */
  active_ads?: ActiveAdsList | null;
  demographics: {
    gender: { female_pct: number; male_pct: number } | null;
    age_ranges: DemographicRow[];
  };
  agency_actions: AgencyAction[];
  generated_at: string;
}
