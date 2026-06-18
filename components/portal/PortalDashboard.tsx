"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, BarChart, Bar, Cell,
} from "recharts";
import { ImageIcon } from "lucide-react";
import type { SnapshotData, PeriodKind } from "@/lib/portal/types";
import MobileFAB from "./MobileFAB";

const WA_NUMBER = "5522981530700";

const PERIODS: { value: PeriodKind; label: string }[] = [
  { value: "last_week",    label: "7 dias"      },
  { value: "last_2_weeks", label: "14 dias"     },
  { value: "this_month",   label: "Este mês"    },
  { value: "last_month",   label: "Mês passado" },
];

const METRICS = [
  { key: "messages", label: "Mensagens", color: "var(--primary)" },
  { key: "clicks",   label: "Cliques",   color: "var(--chart-4)" },
  { key: "spend",    label: "Investido", color: "var(--lone-warning)" },
  { key: "reach",    label: "Alcance",   color: "var(--lone-success)" },
] as const;
type MetricKey = typeof METRICS[number]["key"];

const ICON_MAP: Record<string, string> = {
  new_creative:  "🎨",
  budget_change: "💰",
  pause:         "⏸️",
  optimization:  "⚡",
};

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString("pt-BR");
}
function fmtBrl(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtDate(d: string): string {
  return new Date(d + "T00:00:00").toLocaleDateString("pt-BR", {
    day: "2-digit", month: "short",
  });
}


function Thumbnail({ url, path, name }: { url: string | null; path: string | null; name: string }) {
  const [broken, setBroken] = useState(false);

  // Prefere imagem cacheada no nosso Storage (não expira) sobre URL direta da Meta CDN
  const src = (() => {
    if (path) {
      return `/supabase/storage/v1/object/public/meta-thumbnails/${path}`;
    }
    return url;
  })();

  if (!src || broken) {
    const isVideo = name.toLowerCase().includes("video") || name.toLowerCase().includes("vídeo") || name.toLowerCase().includes("reel");
    return (
      <div
        className="w-14 h-14 rounded-lg shrink-0 flex flex-col items-center justify-center gap-0.5"
        style={{ background: "var(--card)", border: "1px solid var(--card)" }}
      >
        <span style={{ fontSize: 18 }}>{isVideo ? "🎬" : "🖼️"}</span>
        <span className="text-[8px] text-center px-1" style={{ color: "var(--muted-foreground)", lineHeight: 1.2 }}>
          {isVideo ? "Vídeo" : "Arte"}
        </span>
      </div>
    );
  }
  return (
    <img
      src={src} alt={name} loading="lazy"
      onError={() => setBroken(true)}
      className="w-14 h-14 rounded-lg object-cover shrink-0"
      style={{ border: "1px solid var(--card)" }}
    />
  );
}

const scrollRow = "flex flex-nowrap gap-2 overflow-x-auto pb-1 no-scrollbar";

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="mb-3">
      <h2 className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--muted-foreground)" }}>
        {title}
      </h2>
    </div>
  );
}

// Card container reutilizável
function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl ${className}`} style={{ background: "var(--background)", border: "1px solid var(--card)" }}>
      {children}
    </div>
  );
}

interface Props {
  token: string;
  clientName: string;
  whatsappPhone: string;
  welcomeMessage: string | null;
  initialData: SnapshotData | null;
}

export default function PortalDashboard({ token, clientName, whatsappPhone, welcomeMessage, initialData }: Props) {
  const [period, setPeriod]         = useState<PeriodKind>("last_week");
  const [data, setData]             = useState<SnapshotData | null>(initialData);
  const [loading, setLoading]       = useState(false);
  const [metric, setMetric]         = useState<MetricKey>("messages");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [chartHeight, setChartHeight]     = useState(240);
  const [hideGrid, setHideGrid]           = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  const phone = whatsappPhone || WA_NUMBER;

  useEffect(() => {
    function update() {
      const w = window.innerWidth;
      setChartHeight(w < 640 ? 180 : w < 1024 ? 220 : 280);
      setHideGrid(w < 480);
    }
    setReducedMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const fetchPeriod = useCallback(async (p: PeriodKind) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/portal/${token}/snapshot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period_kind: p }),
      });
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [token]);

  function handlePeriod(p: PeriodKind) {
    setPeriod(p);
    fetchPeriod(p);
  }

  const kpis    = data?.kpis;
  const chart   = data?.chart;
  const top     = data?.top_creatives ?? [];
  const demo    = data?.demographics;
  const actions = data?.agency_actions ?? [];

  const chartData = (chart?.days ?? []).map((day, i) => ({
    day: fmtDate(day),
    messages: chart?.series.messages[i] ?? 0,
    clicks:   chart?.series.clicks[i]   ?? 0,
    spend:    chart?.series.spend[i]    ?? 0,
    reach:    chart?.series.reach[i]    ?? 0,
  }));

  const activeMetric = METRICS.find((m) => m.key === metric)!;

  const genAt = data?.generated_at
    ? new Date(data.generated_at).toLocaleString("pt-BR", {
        day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
      })
    : null;

  const pulse = reducedMotion ? "" : "animate-pulse";

  const kpiItems: Array<{
    key: string; label: string;
    val: { value: number | null; delta_pct: number | null; direction: string } | undefined;
    format: (v: number) => string;
  }> = [
    { key: "messages", label: "Mensagens", val: kpis?.messages, format: (v) => fmt(v) },
    { key: "spend",    label: "Investido", val: kpis?.spend,    format: (v) => fmtBrl(v) },
    { key: "cpa",      label: "Custo/msg", val: kpis?.cpa,      format: (v) => fmtBrl(v) },
    { key: "reach",    label: "Alcance",   val: kpis?.reach,    format: (v) => fmt(v) },
  ];

  return (
    <div className="min-h-screen" style={{ background: "var(--background)", color: "var(--card)" }}>
      <MobileFAB phone={phone} clientName={clientName} />

      {/* ── Container principal — mais largo no desktop ─────────────── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-6 lg:py-10">

        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4 mb-4 lg:mb-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <img src="/logo.png" alt="Lone Mídia" className="h-4 w-auto opacity-60" />
              <p className="text-[11px] font-medium" style={{ color: "var(--muted-foreground)" }}>Painel de Resultados</p>
            </div>
            <h1
              className="font-bold tracking-tight break-words"
              style={{ fontSize: "clamp(20px, 4vw, 36px)", lineHeight: 1.15 }}
            >
              {clientName}
            </h1>
            {genAt && (
              <p className="text-[11px] mt-1" style={{ color: "var(--muted-foreground)" }}>Atualizado em {genAt}</p>
            )}
          </div>
          {/* Desktop: botão no header / Mobile: FAB */}
          <a
            href={`https://wa.me/${phone}`}
            target="_blank" rel="noopener noreferrer"
            className="hidden lg:inline-flex shrink-0 items-center gap-2 text-sm px-5 py-2.5 rounded-full font-semibold"
            style={{ background: "#25D366", color: "#fff" }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="white" aria-hidden>
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z" />
            </svg>
            Falar com a equipe
          </a>
        </div>

        {welcomeMessage && (
          <div className="rounded-xl px-4 py-3 mb-4 lg:mb-6 text-sm" style={{ background: "var(--background)", border: "1px solid var(--card)", color: "var(--muted-foreground)" }}>
            {welcomeMessage}
          </div>
        )}

        {/* Tabs de período */}
        <div className={`${scrollRow} mb-5 lg:mb-7`}>
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => handlePeriod(p.value)}
              disabled={loading}
              className="shrink-0 rounded-full text-xs font-semibold transition-all disabled:opacity-50 min-h-[44px] px-4 py-2"
              style={period === p.value
                ? { background: "var(--primary)", color: "#fff" }
                : { background: "var(--background)", color: "var(--muted-foreground)", border: "1px solid var(--card)" }}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* ── KPIs — sempre 4 colunas no desktop, 2 no tablet, 1 no mobile */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6 lg:mb-7">
          {kpiItems.map(({ key, label, val, format }) => (
            <Card key={key} className="p-4">
              <p className="text-xs mb-3" style={{ color: "var(--muted-foreground)" }}>{label}</p>
              {loading ? (
                <div className={`h-8 w-24 rounded ${pulse}`} style={{ background: "var(--card)" }} />
              ) : (
                <p className="text-3xl font-bold leading-none">
                  {val?.value != null ? format(val.value) : "—"}
                </p>
              )}
            </Card>
          ))}
        </div>

        {/* ══════════════════════════════════════════════════════════════
            DESKTOP: 2 colunas lado a lado
            Coluna esquerda (3/5): Gráfico + Demografia
            Coluna direita  (2/5): Top Criativos + Timeline
            MOBILE/TABLET: empilhado normalmente
        ══════════════════════════════════════════════════════════════ */}
        <div className="lg:grid lg:grid-cols-5 lg:gap-6 space-y-6 lg:space-y-0">

          {/* ── COLUNA ESQUERDA ───────────────────────────────────────── */}
          <div className="lg:col-span-3 space-y-5">

            {/* Gráfico */}
            <Card className="p-4 lg:p-5">
              <SectionHeader title="Evolução diária" />

              {/* Metric tabs */}
              <div className={`${scrollRow} mb-4`}>
                {METRICS.map((m) => (
                  <button
                    key={m.key}
                    onClick={() => setMetric(m.key)}
                    className="shrink-0 rounded-full text-xs font-medium transition-all min-h-[44px] px-3 py-2"
                    style={metric === m.key
                      ? { background: m.color, color: "#fff" }
                      : { background: "var(--background)", color: "var(--muted-foreground)", border: "1px solid var(--card)" }}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              {loading || chartData.length === 0 ? (
                <div className="flex items-center justify-center" style={{ height: chartHeight, color: "var(--muted-foreground)" }}>
                  {loading ? "Carregando…" : "Sem dados para o período"}
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={chartHeight}>
                  <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: chartHeight <= 180 ? 20 : 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--card)" opacity={hideGrid ? 0 : 1} />
                    <XAxis
                      dataKey="day"
                      tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                      axisLine={false} tickLine={false}
                      interval="preserveStartEnd"
                      angle={chartHeight <= 180 ? -30 : 0}
                      textAnchor={chartHeight <= 180 ? "end" : "middle"}
                    />
                    <YAxis
                      tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                      axisLine={false} tickLine={false}
                      width={38} tickFormatter={fmt}
                    />
                    <Tooltip
                      contentStyle={{ background: "var(--background)", border: "1px solid var(--card)", borderRadius: 8, color: "#fff" }}
                      labelStyle={{ color: "var(--muted-foreground)" }}
                    />
                    <Line
                      type="monotone" dataKey={metric}
                      stroke={activeMetric.color} strokeWidth={2}
                      dot={false} activeDot={{ r: 4, fill: activeMetric.color }}
                      isAnimationActive={!reducedMotion}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </Card>

            {/* Demografia */}
            {(loading || demo?.gender || (demo?.age_ranges?.length ?? 0) > 0) && (
              <div>
                <SectionHeader title="Quem está vendo seus anúncios" />
                <div className="rounded-xl p-4 lg:p-5" style={{ background: "var(--card)", color: "var(--background)" }}>
                  {loading ? (
                    <div className={`h-28 rounded-lg ${pulse}`} style={{ background: "var(--muted)" }} />
                  ) : (
                    <div className="space-y-4">
                      {demo?.gender && (
                        <div>
                          <p className="text-xs font-semibold mb-3" style={{ color: "var(--muted-foreground)" }}>Gênero</p>
                          <div className="flex gap-3">
                            {[
                              { label: "Mulheres", pct: demo.gender.female_pct, color: "#E879F9" },
                              { label: "Homens",   pct: demo.gender.male_pct,   color: "var(--primary)" },
                            ].map((g) => (
                              <div key={g.label} className="flex-1 rounded-xl p-3 text-center" style={{ background: "var(--muted)" }}>
                                <p className="text-2xl font-bold" style={{ color: g.color }}>{g.pct}%</p>
                                <p className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>{g.label}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {demo?.age_ranges && demo.age_ranges.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold mb-3" style={{ color: "var(--muted-foreground)" }}>Faixa etária</p>
                          <ResponsiveContainer width="100%" height={110}>
                            <BarChart data={demo.age_ranges} margin={{ top: 0, right: 4, left: -20, bottom: 0 }}>
                              <XAxis dataKey="label" tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} axisLine={false} tickLine={false} />
                              <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} axisLine={false} tickLine={false} unit="%" width={28} />
                              <Tooltip
                                contentStyle={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 8, color: "#111" }}
                                formatter={(v) => [`${v}%`, "Alcance"]}
                              />
                              <Bar dataKey="pct" radius={[4, 4, 0, 0]} maxBarSize={40}>
                                {demo.age_ranges.map((_, i) => (
                                  <Cell key={i} fill={i === 0 ? "var(--primary)" : "var(--primary)"} />
                                ))}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ── COLUNA DIREITA ────────────────────────────────────────── */}
          <div className="lg:col-span-2 space-y-5">

            {/* Top Criativos */}
            {(loading || top.length > 0) && (
              <div>
                <SectionHeader title="Top criativos" />
                <div className="space-y-2">
                  {loading
                    ? Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className={`h-20 rounded-xl ${pulse}`} style={{ background: "var(--background)" }} />
                      ))
                    : top.map((c) => (
                        <div key={c.id}>
                          <button
                            className="w-full rounded-xl p-3 text-left transition-colors"
                            style={{ background: "var(--background)", border: `1px solid ${expandedId === c.id ? "var(--primary)" : "var(--card)"}`, minHeight: 68 }}
                            onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}
                          >
                            <div className="flex items-center gap-3">
                              <Thumbnail url={c.thumbnail_url} path={c.thumbnail_path ?? null} name={c.name} />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-start gap-1.5 flex-wrap">
                                  <p className="text-sm font-semibold leading-snug break-words">{c.name}</p>
                                  {c.is_winner && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold shrink-0 whitespace-nowrap"
                                      style={{ background: "var(--primary)22", color: "var(--primary)", border: "1px solid var(--primary)44" }}>
                                      ⭐ Top
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>
                                  <span><strong className="text-foreground">{fmt(c.messages)}</strong> msgs</span>
                                  <span><strong className="text-foreground">{fmtBrl(c.spend)}</strong></span>
                                  {c.cpa && <span>CPA <strong className="text-foreground">{fmtBrl(c.cpa)}</strong></span>}
                                </div>
                              </div>
                              <svg className="shrink-0" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--muted-foreground)" strokeWidth="2">
                                <path d={expandedId === c.id ? "M18 15l-6-6-6 6" : "M6 9l6 6 6-6"} />
                              </svg>
                            </div>
                          </button>
                          {expandedId === c.id && (
                            <div className="rounded-b-xl px-3 py-2.5 -mt-px"
                              style={{ background: "var(--background)", border: "1px solid var(--primary)", borderTop: "none" }}>
                              <div className="grid grid-cols-3 gap-2 text-xs">
                                <div>
                                  <p style={{ color: "var(--muted-foreground)" }}>CTR</p>
                                  <p className="font-semibold mt-0.5">{c.ctr.toFixed(2)}%</p>
                                </div>
                                <div>
                                  <p style={{ color: "var(--muted-foreground)" }}>Frequência</p>
                                  <p className="font-semibold mt-0.5">{c.frequency.toFixed(1)}x</p>
                                </div>
                                <div>
                                  <p style={{ color: "var(--muted-foreground)" }}>Custo/msg</p>
                                  <p className="font-semibold mt-0.5">{c.cpa ? fmtBrl(c.cpa) : "—"}</p>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                </div>
              </div>
            )}

            {/* Timeline */}
            {(loading || actions.length > 0) && (
              <div>
                <SectionHeader title="O que fizemos" />
                <div className="space-y-2">
                  {loading
                    ? Array.from({ length: 2 }).map((_, i) => (
                        <div key={i} className={`h-14 rounded-xl ${pulse}`} style={{ background: "var(--background)" }} />
                      ))
                    : actions.map((a) => (
                        <Card key={a.id} className="p-3">
                          <div className="flex items-start gap-2.5">
                            <span className="text-lg shrink-0">{ICON_MAP[a.icon ?? ""] ?? "📌"}</span>
                            <div className="min-w-0">
                              <p className="text-[11px] mb-0.5" style={{ color: "var(--muted-foreground)" }}>{fmtDate(a.action_date)}</p>
                              <p className="text-sm font-medium">{a.title}</p>
                              {a.description && (
                                <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>{a.description}</p>
                              )}
                            </div>
                          </div>
                        </Card>
                      ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Footer ───────────────────────────────────────────────────── */}
        <div className="text-center mt-10 pb-20 lg:pb-10 space-y-2">
          <img src="/logo.png" alt="Lone Mídia" className="h-6 w-auto mx-auto opacity-50" />
          <p className="text-[11px]" style={{ color: "var(--muted-foreground)" }}>
            Relatório exclusivo ·{" "}
            {new Date().toLocaleDateString("pt-BR", { month: "2-digit", year: "numeric" })}
          </p>
          <p className="text-[10px]" style={{ color: "var(--muted-foreground)" }}>
            Atribuição: 7 dias de clique + 1 dia de visualização · Valores podem divergir em até 5% do Gerenciador por atribuição diferida
          </p>
        </div>
      </div>
    </div>
  );
}
