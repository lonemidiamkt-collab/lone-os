"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, BarChart, Bar, Cell,
} from "recharts";
import { ImageIcon } from "lucide-react";
import type { SnapshotData, PeriodKind } from "@/lib/portal/types";
import HelpButton from "./HelpButton";
import MobileFAB from "./MobileFAB";

const WA_NUMBER = "5522981530700";

const PERIODS: { value: PeriodKind; label: string }[] = [
  { value: "last_week",    label: "7 dias"      },
  { value: "last_2_weeks", label: "14 dias"     },
  { value: "this_month",   label: "Este mês"    },
  { value: "last_month",   label: "Mês passado" },
];

const METRICS = [
  { key: "messages", label: "Mensagens", color: "#2B3CFF" },
  { key: "clicks",   label: "Cliques",   color: "#8B5CF6" },
  { key: "spend",    label: "Investido", color: "#F59E0B" },
  { key: "reach",    label: "Alcance",   color: "#22C55E" },
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

function DeltaBadge({ delta, inverse = false }: { delta: number | null; inverse?: boolean }) {
  if (delta === null) return null;
  const positive = inverse ? delta < 0 : delta > 0;
  const neutral  = Math.abs(delta) <= 1;
  const color    = neutral ? "#6B7280" : positive ? "#22C55E" : "#EF4444";
  const sign     = delta > 0 ? "+" : "";
  return (
    <span className="text-xs font-medium" style={{ color }}>
      {sign}{delta.toFixed(1)}%
    </span>
  );
}

// Thumbnail with graceful fallback for broken Meta images
function Thumbnail({ url, name }: { url: string | null; name: string }) {
  const [broken, setBroken] = useState(false);

  if (!url || broken) {
    return (
      <div
        className="w-16 h-16 rounded-lg shrink-0 flex flex-col items-center justify-center gap-0.5"
        style={{ background: "#2a2a2a", border: "1px solid #1A1F33" }}
      >
        <ImageIcon size={16} color="#6B7280" />
        <span className="text-[9px]" style={{ color: "#6B7280" }}>Sem imagem</span>
      </div>
    );
  }

  return (
    <img
      src={url}
      alt={name}
      loading="lazy"
      onError={() => setBroken(true)}
      className="w-16 h-16 rounded-lg object-cover shrink-0"
      style={{ border: "1px solid #1A1F33" }}
    />
  );
}

// Scroll pills shared by period tabs and metric tabs
const scrollRowCls =
  "flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

function SectionHeader({
  title, phone, context, section,
}: {
  title: string; phone: string; context: string; section: string;
}) {
  return (
    <div className="flex items-center justify-between mb-3 sm:mb-4">
      <h2
        className="text-[11px] sm:text-xs font-semibold uppercase tracking-widest"
        style={{ color: "#8b91a1" }}
      >
        {title}
      </h2>
      <HelpButton phone={phone} context={context} section={section} />
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

export default function PortalDashboard({
  token, clientName, whatsappPhone, welcomeMessage, initialData,
}: Props) {
  const [period, setPeriod]       = useState<PeriodKind>("last_week");
  const [data, setData]           = useState<SnapshotData | null>(initialData);
  const [loading, setLoading]     = useState(false);
  const [metric, setMetric]       = useState<MetricKey>("messages");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Responsive chart config — read on client to avoid SSR mismatch
  const [chartHeight, setChartHeight]   = useState(260);
  const [hideGrid, setHideGrid]         = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  const phone = whatsappPhone || WA_NUMBER;

  useEffect(() => {
    function update() {
      const w = window.innerWidth;
      setChartHeight(w < 640 ? 200 : w < 1024 ? 220 : 260);
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

  return (
    <div className="min-h-screen" style={{ background: "#060814", color: "#FFFFFF" }}>

      {/* FAB — só em mobile/tablet (lg:hidden) */}
      <MobileFAB phone={phone} clientName={clientName} />

      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8">

        {/* ── Header ───────────────────────────────────────────────────── */}
        <div className="space-y-3 sm:space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] sm:text-xs font-medium mb-1" style={{ color: "#6B7280" }}>
                Painel de Resultados
              </p>
              <h1
                className="font-bold tracking-tight break-words"
                style={{ fontSize: "clamp(22px, 5.5vw, 38px)", lineHeight: 1.15 }}
              >
                {clientName}
              </h1>
              {genAt && (
                <p className="text-[11px] sm:text-xs mt-1" style={{ color: "#6B7280" }}>
                  Atualizado em {genAt}
                </p>
              )}
            </div>

            {/* Desktop only — mobile usa FAB */}
            <a
              href={`https://wa.me/${phone}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden lg:inline-flex shrink-0 items-center text-xs px-4 py-2 rounded-full font-semibold"
              style={{ background: "#25D366", color: "#fff" }}
            >
              Falar com a equipe
            </a>
          </div>

          {welcomeMessage && (
            <div
              className="rounded-xl px-3 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm leading-relaxed"
              style={{ background: "#0B0E1E", border: "1px solid #1A1F33", color: "#8b91a1" }}
            >
              {welcomeMessage}
            </div>
          )}

          {/* Tabs de período — scroll horizontal sem wrap */}
          <div className={scrollRowCls}>
            {PERIODS.map((p) => (
              <button
                key={p.value}
                onClick={() => handlePeriod(p.value)}
                disabled={loading}
                className="shrink-0 rounded-full text-xs font-semibold transition-all disabled:opacity-50 min-h-[44px] px-4 py-2"
                style={period === p.value
                  ? { background: "#2B3CFF", color: "#fff" }
                  : { background: "#0B0E1E", color: "#8b91a1", border: "1px solid #1A1F33" }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── KPIs ─────────────────────────────────────────────────────── */}
        <div>
          <SectionHeader
            title="Resultados do período"
            phone={phone}
            context={`Olá! Tenho uma dúvida sobre os KPIs do período no portal de resultados da ${clientName}.`}
            section="resultados do período"
          />
          {/* Mobile: 1 col com valor + delta lado a lado / Tablet: 2 cols / Desktop: 4 cols */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
            {([
              { key: "messages", label: "Mensagens", val: kpis?.messages, format: (v: number) => fmt(v)                  },
              { key: "spend",    label: "Investido", val: kpis?.spend,    format: (v: number) => fmtBrl(v), inverse: false },
              { key: "cpa",      label: "Custo/msg", val: kpis?.cpa,      format: (v: number) => fmtBrl(v), inverse: true  },
              { key: "reach",    label: "Alcance",   val: kpis?.reach,    format: (v: number) => fmt(v)                  },
            ] as Array<{ key: string; label: string; val: typeof kpis?.messages; format: (v: number) => string; inverse?: boolean }>)
            .map(({ key, label, val, format, inverse }) => (
              <div
                key={key}
                className="rounded-xl p-3 sm:p-4 flex sm:block items-center justify-between"
                style={{ background: "#0B0E1E", border: "1px solid #1A1F33" }}
              >
                <p className="text-[11px] sm:text-xs sm:mb-2" style={{ color: "#6B7280" }}>
                  {label}
                </p>
                {loading ? (
                  <div className={`h-7 w-20 rounded ${pulse}`} style={{ background: "#1A1F33" }} />
                ) : (
                  <div className="flex sm:block items-center gap-2">
                    <p className="text-2xl sm:text-xl lg:text-2xl font-bold leading-none">
                      {val ? format(val.value) : "—"}
                    </p>
                    {val && <DeltaBadge delta={val.delta_pct} inverse={inverse} />}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ── Gráfico ──────────────────────────────────────────────────── */}
        <div>
          <SectionHeader
            title="Evolução diária"
            phone={phone}
            context={`Olá! Tenho uma dúvida sobre o gráfico de evolução no portal de ${clientName}.`}
            section="evolução diária"
          />
          <div className="rounded-xl p-3 sm:p-5" style={{ background: "#0B0E1E", border: "1px solid #1A1F33" }}>

            {/* Tabs de métrica — scroll horizontal */}
            <div className={`${scrollRowCls} mb-4 sm:mb-5`}>
              {METRICS.map((m) => (
                <button
                  key={m.key}
                  onClick={() => setMetric(m.key)}
                  className="shrink-0 rounded-full text-xs font-medium transition-all min-h-[44px] px-3 sm:px-4 py-2"
                  style={metric === m.key
                    ? { background: m.color, color: "#fff" }
                    : { background: "#060814", color: "#8b91a1", border: "1px solid #1A1F33" }}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {loading || chartData.length === 0 ? (
              <div
                className="flex items-center justify-center"
                style={{ height: chartHeight, color: "#6B7280" }}
              >
                {loading ? "Carregando…" : "Sem dados para o período"}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={chartHeight}>
                <LineChart
                  data={chartData}
                  margin={{
                    top: 8,
                    right: 8,
                    left: 0,
                    bottom: chartHeight <= 200 ? 20 : 0,
                  }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#1A1F33"
                    opacity={hideGrid ? 0 : 1}
                  />
                  <XAxis
                    dataKey="day"
                    tick={{ fill: "#6B7280", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    interval="preserveStartEnd"
                    angle={chartHeight <= 200 ? -30 : 0}
                    textAnchor={chartHeight <= 200 ? "end" : "middle"}
                  />
                  <YAxis
                    tick={{ fill: "#6B7280", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    width={38}
                    tickFormatter={fmt}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#0B0E1E",
                      border: "1px solid #1A1F33",
                      borderRadius: 8,
                      color: "#fff",
                    }}
                    labelStyle={{ color: "#8b91a1" }}
                  />
                  <Line
                    type="monotone"
                    dataKey={metric}
                    stroke={activeMetric.color}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, fill: activeMetric.color }}
                    isAnimationActive={!reducedMotion}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* ── Top Criativos ────────────────────────────────────────────── */}
        {(loading || top.length > 0) && (
          <div>
            <SectionHeader
              title="Top criativos"
              phone={phone}
              context={`Olá! Tenho uma dúvida sobre os criativos no portal de resultados da ${clientName}.`}
              section="criativos"
            />
            <div className="space-y-2">
              {loading
                ? Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className={`h-20 rounded-xl ${pulse}`} style={{ background: "#0B0E1E" }} />
                  ))
                : top.map((c) => (
                    <div key={c.id}>
                      <button
                        className="w-full rounded-xl p-3 sm:p-4 text-left transition-colors"
                        style={{
                          background: "#0B0E1E",
                          border: `1px solid ${expandedId === c.id ? "#2B3CFF" : "#1A1F33"}`,
                          minHeight: 72,
                        }}
                        onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}
                      >
                        <div className="flex items-center gap-3">
                          <Thumbnail url={c.thumbnail_url} name={c.name} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start gap-2 flex-wrap">
                              <p className="text-sm font-semibold leading-snug break-words">
                                {c.name}
                              </p>
                              {c.is_winner && (
                                <span
                                  className="text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0 whitespace-nowrap"
                                  style={{
                                    background: "#2B3CFF22",
                                    color: "#2B3CFF",
                                    border: "1px solid #2B3CFF44",
                                  }}
                                >
                                  ⭐ Melhor resultado
                                </span>
                              )}
                            </div>
                            <div
                              className="flex items-center flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs"
                              style={{ color: "#8b91a1" }}
                            >
                              <span>
                                <strong className="text-white">{fmt(c.messages)}</strong> msgs
                              </span>
                              <span>
                                <strong className="text-white">{fmtBrl(c.spend)}</strong>
                              </span>
                              {c.cpa && (
                                <span>
                                  CPA <strong className="text-white">{fmtBrl(c.cpa)}</strong>
                                </span>
                              )}
                            </div>
                          </div>
                          <svg
                            className="shrink-0"
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="#6B7280"
                            strokeWidth="2"
                          >
                            <path d={expandedId === c.id ? "M18 15l-6-6-6 6" : "M6 9l6 6 6-6"} />
                          </svg>
                        </div>
                      </button>

                      {expandedId === c.id && (
                        <div
                          className="rounded-b-xl px-4 py-3 -mt-px"
                          style={{
                            background: "#0D1120",
                            border: "1px solid #2B3CFF",
                            borderTop: "none",
                          }}
                        >
                          {/* 2 cols em mobile, 3 em sm+ */}
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                            <div>
                              <p style={{ color: "#6B7280" }}>CTR</p>
                              <p className="font-semibold mt-0.5">{c.ctr.toFixed(2)}%</p>
                            </div>
                            <div>
                              <p style={{ color: "#6B7280" }}>Frequência</p>
                              <p className="font-semibold mt-0.5">{c.frequency.toFixed(1)}x</p>
                            </div>
                            <div>
                              <p style={{ color: "#6B7280" }}>Custo/msg</p>
                              <p className="font-semibold mt-0.5">
                                {c.cpa ? fmtBrl(c.cpa) : "—"}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
            </div>
          </div>
        )}

        {/* ── Demografia ───────────────────────────────────────────────── */}
        {(loading || demo?.gender || (demo?.age_ranges?.length ?? 0) > 0) && (
          <div>
            <SectionHeader
              title="Quem está vendo seus anúncios"
              phone={phone}
              context={`Olá! Tenho uma dúvida sobre a demografia no portal de ${clientName}.`}
              section="demografia"
            />
            <div className="rounded-xl p-4 sm:p-5" style={{ background: "#FFFFFF", color: "#0B0E1E" }}>
              {loading ? (
                <div className={`h-32 rounded-lg ${pulse}`} style={{ background: "#F3F4F6" }} />
              ) : (
                <div className="space-y-4 sm:space-y-5">
                  {demo?.gender && (
                    <div>
                      <p className="text-xs font-semibold mb-3" style={{ color: "#374151" }}>
                        Gênero
                      </p>
                      <div className="flex gap-3">
                        {[
                          { label: "Mulheres", pct: demo.gender.female_pct, color: "#E879F9" },
                          { label: "Homens",   pct: demo.gender.male_pct,   color: "#2B3CFF" },
                        ].map((g) => (
                          <div
                            key={g.label}
                            className="flex-1 rounded-xl p-3 text-center"
                            style={{ background: "#F9FAFB" }}
                          >
                            <p
                              className="text-xl sm:text-2xl font-bold"
                              style={{ color: g.color }}
                            >
                              {g.pct}%
                            </p>
                            <p className="text-xs mt-1" style={{ color: "#6B7280" }}>
                              {g.label}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {demo?.age_ranges && demo.age_ranges.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold mb-3" style={{ color: "#374151" }}>
                        Faixa etária
                      </p>
                      <ResponsiveContainer width="100%" height={110}>
                        <BarChart
                          data={demo.age_ranges}
                          margin={{ top: 0, right: 4, left: -20, bottom: 0 }}
                        >
                          <XAxis
                            dataKey="label"
                            tick={{ fill: "#6B7280", fontSize: 10 }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <YAxis
                            tick={{ fill: "#6B7280", fontSize: 10 }}
                            axisLine={false}
                            tickLine={false}
                            unit="%"
                            width={28}
                          />
                          <Tooltip
                            contentStyle={{
                              background: "#fff",
                              border: "1px solid #E5E7EB",
                              borderRadius: 8,
                              color: "#111",
                            }}
                            formatter={(v) => [`${v}%`, "Alcance"]}
                          />
                          <Bar dataKey="pct" radius={[4, 4, 0, 0]} maxBarSize={40}>
                            {demo.age_ranges.map((_, i) => (
                              <Cell key={i} fill={i === 0 ? "#2B3CFF" : "#93C5FD"} />
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

        {/* ── Timeline da agência ──────────────────────────────────────── */}
        {(loading || actions.length > 0) && (
          <div>
            <SectionHeader
              title="O que fizemos no período"
              phone={phone}
              context={`Olá! Tenho uma dúvida sobre uma das ações realizadas no portal de ${clientName}.`}
              section="ações da equipe"
            />
            <div className="space-y-2 sm:space-y-3">
              {loading
                ? Array.from({ length: 2 }).map((_, i) => (
                    <div key={i} className={`h-16 rounded-xl ${pulse}`} style={{ background: "#0B0E1E" }} />
                  ))
                : actions.map((a) => (
                    <div
                      key={a.id}
                      className="rounded-xl p-3 sm:p-4"
                      style={{ background: "#0B0E1E", border: "1px solid #1A1F33" }}
                    >
                      <div className="flex items-start gap-3">
                        <span className="text-lg sm:text-xl shrink-0 mt-0.5">
                          {ICON_MAP[a.icon ?? ""] ?? "📌"}
                        </span>
                        <div className="min-w-0">
                          <p className="text-[11px] sm:text-xs mb-0.5" style={{ color: "#6B7280" }}>
                            {fmtDate(a.action_date)}
                          </p>
                          <p className="text-sm font-medium">{a.title}</p>
                          {a.description && (
                            <p className="text-xs mt-1" style={{ color: "#8b91a1" }}>
                              {a.description}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
            </div>
          </div>
        )}

        {/* ── Footer ───────────────────────────────────────────────────── */}
        {/* pb-20 em mobile pra não ficar atrás do FAB */}
        <div className="text-center pt-4 pb-20 lg:pb-8 space-y-1">
          <p className="text-xs font-semibold" style={{ color: "#6B7280" }}>
            Lone Mídia
          </p>
          <p className="text-[11px]" style={{ color: "#6B7280" }}>
            Relatório exclusivo ·{" "}
            {new Date().toLocaleDateString("pt-BR", { month: "2-digit", year: "numeric" })}
          </p>
          <p className="text-[10px]" style={{ color: "#4B5563" }}>
            Atribuição: 7 dias clique + 1 dia visualização
          </p>
        </div>
      </div>
    </div>
  );
}
