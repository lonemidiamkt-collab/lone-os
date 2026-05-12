"use client";

import { useState, useCallback } from "react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, BarChart, Bar, Cell,
} from "recharts";
import type { SnapshotData, PeriodKind } from "@/lib/portal/types";

const WA_NUMBER = "5522981530700";

const PERIODS: { value: PeriodKind; label: string }[] = [
  { value: "last_week",    label: "7 dias"     },
  { value: "last_2_weeks", label: "14 dias"    },
  { value: "this_month",   label: "Este mês"   },
  { value: "last_month",   label: "Mês passado"},
];

const METRICS = [
  { key: "messages", label: "Mensagens", color: "#2B3CFF" },
  { key: "clicks",   label: "Cliques",   color: "#8B5CF6" },
  { key: "spend",    label: "Investido",  color: "#F59E0B" },
  { key: "reach",    label: "Alcance",   color: "#22C55E" },
] as const;
type MetricKey = typeof METRICS[number]["key"];

const ICON_MAP: Record<string, string> = {
  new_creative:   "🎨",
  budget_change:  "💰",
  pause:          "⏸️",
  optimization:   "⚡",
};

function fmt(n: number, prefix = ""): string {
  if (n >= 1_000_000) return `${prefix}${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${prefix}${(n / 1_000).toFixed(1)}k`;
  return `${prefix}${n.toLocaleString("pt-BR")}`;
}

function fmtBrl(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDate(d: string): string {
  return new Date(d + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
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

function WaButton({ phone, context }: { phone: string; context: string }) {
  const url = `https://wa.me/${phone}?text=${encodeURIComponent(context)}`;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-opacity hover:opacity-80"
      style={{ background: "#25D36622", color: "#25D366", border: "1px solid #25D36633" }}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/>
      </svg>
      Tenho dúvida
    </a>
  );
}

function SectionHeader({ title, phone, context }: { title: string; phone: string; context: string }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-sm font-semibold" style={{ color: "#8b91a1", letterSpacing: "0.08em", textTransform: "uppercase" }}>
        {title}
      </h2>
      <WaButton phone={phone} context={context} />
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
  const phone = whatsappPhone || WA_NUMBER;

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

  const kpis = data?.kpis;
  const chart = data?.chart;
  const top   = data?.top_creatives ?? [];
  const demo  = data?.demographics;
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
    ? new Date(data.generated_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div className="min-h-screen" style={{ background: "#060814", color: "#FFFFFF" }}>
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium mb-1" style={{ color: "#6B7280" }}>
                Painel de Resultados
              </p>
              <h1 className="text-2xl font-bold tracking-tight">{clientName}</h1>
              {genAt && (
                <p className="text-xs mt-1" style={{ color: "#6B7280" }}>
                  Atualizado em {genAt}
                </p>
              )}
            </div>
            <a
              href={`https://wa.me/${phone}`}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 text-xs px-4 py-2 rounded-full font-semibold"
              style={{ background: "#25D366", color: "#fff" }}
            >
              Falar com a equipe
            </a>
          </div>

          {welcomeMessage && (
            <div className="rounded-xl px-4 py-3 text-sm" style={{ background: "#0B0E1E", border: "1px solid #1A1F33", color: "#8b91a1" }}>
              {welcomeMessage}
            </div>
          )}

          {/* Period selector */}
          <div className="flex gap-2 flex-wrap">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                onClick={() => handlePeriod(p.value)}
                disabled={loading}
                className="px-4 py-1.5 rounded-full text-xs font-semibold transition-all disabled:opacity-50"
                style={period === p.value
                  ? { background: "#2B3CFF", color: "#fff" }
                  : { background: "#0B0E1E", color: "#8b91a1", border: "1px solid #1A1F33" }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── KPIs ───────────────────────────────────────────────────────── */}
        <div>
          <SectionHeader
            title="Resultados do período"
            phone={phone}
            context={`Olá! Tenho uma dúvida sobre os KPIs do período no portal de resultados da ${clientName}.`}
          />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { key: "messages", label: "Mensagens",   val: kpis?.messages, format: (v: number) => fmt(v) },
              { key: "spend",    label: "Investido",   val: kpis?.spend,    format: fmtBrl, inverse: false },
              { key: "cpa",      label: "Custo/msg",   val: kpis?.cpa,      format: fmtBrl, inverse: true },
              { key: "reach",    label: "Alcance",     val: kpis?.reach,    format: (v: number) => fmt(v) },
            ].map(({ key, label, val, format, inverse }) => (
              <div key={key} className="rounded-xl p-4" style={{ background: "#0B0E1E", border: "1px solid #1A1F33" }}>
                <p className="text-xs mb-2" style={{ color: "#6B7280" }}>{label}</p>
                {loading ? (
                  <div className="h-7 w-16 rounded animate-pulse" style={{ background: "#1A1F33" }} />
                ) : (
                  <>
                    <p className="text-xl font-bold">{val ? format(val.value) : "—"}</p>
                    {val && <DeltaBadge delta={val.delta_pct} inverse={inverse} />}
                  </>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ── Gráfico ────────────────────────────────────────────────────── */}
        <div>
          <SectionHeader
            title="Evolução diária"
            phone={phone}
            context={`Olá! Tenho uma dúvida sobre o gráfico de evolução no portal de ${clientName}.`}
          />
          <div className="rounded-xl p-5" style={{ background: "#0B0E1E", border: "1px solid #1A1F33" }}>
            {/* Metric toggles */}
            <div className="flex gap-2 flex-wrap mb-5">
              {METRICS.map((m) => (
                <button
                  key={m.key}
                  onClick={() => setMetric(m.key)}
                  className="px-3 py-1 rounded-full text-xs font-medium transition-all"
                  style={metric === m.key
                    ? { background: m.color, color: "#fff" }
                    : { background: "#060814", color: "#8b91a1", border: "1px solid #1A1F33" }}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {loading || chartData.length === 0 ? (
              <div className="h-48 flex items-center justify-center" style={{ color: "#6B7280" }}>
                {loading ? "Carregando…" : "Sem dados para o período"}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1A1F33" />
                  <XAxis dataKey="day" tick={{ fill: "#6B7280", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#6B7280", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ background: "#0B0E1E", border: "1px solid #1A1F33", borderRadius: 8, color: "#fff" }}
                    labelStyle={{ color: "#8b91a1" }}
                  />
                  <Line
                    type="monotone"
                    dataKey={metric}
                    stroke={activeMetric.color}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, fill: activeMetric.color }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* ── Top criativos ──────────────────────────────────────────────── */}
        {(loading || top.length > 0) && (
          <div>
            <SectionHeader
              title="Top criativos"
              phone={phone}
              context={`Olá! Tenho uma dúvida sobre os criativos no portal de resultados da ${clientName}.`}
            />
            <div className="space-y-2">
              {loading
                ? Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="h-16 rounded-xl animate-pulse" style={{ background: "#0B0E1E" }} />
                  ))
                : top.map((c) => (
                    <div key={c.id}>
                      <button
                        className="w-full rounded-xl p-4 text-left transition-colors"
                        style={{ background: "#0B0E1E", border: `1px solid ${expandedId === c.id ? "#2B3CFF" : "#1A1F33"}` }}
                        onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}
                      >
                        <div className="flex items-center gap-3">
                          {c.thumbnail_url ? (
                            <img
                              src={c.thumbnail_url}
                              alt=""
                              className="w-12 h-12 rounded-lg object-cover shrink-0"
                              style={{ border: "1px solid #1A1F33" }}
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-lg shrink-0 flex items-center justify-center text-xl" style={{ background: "#1A1F33" }}>
                              🖼️
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-medium truncate">{c.name}</p>
                              {c.is_winner && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0" style={{ background: "#2B3CFF22", color: "#2B3CFF", border: "1px solid #2B3CFF44" }}>
                                  ⭐ Melhor resultado
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 mt-1 text-xs" style={{ color: "#8b91a1" }}>
                              <span><strong className="text-white">{fmt(c.messages)}</strong> msgs</span>
                              <span><strong className="text-white">{fmtBrl(c.spend)}</strong></span>
                              {c.cpa && <span>CPA <strong className="text-white">{fmtBrl(c.cpa)}</strong></span>}
                            </div>
                          </div>
                          <svg className="shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2">
                            <path d={expandedId === c.id ? "M18 15l-6-6-6 6" : "M6 9l6 6 6-6"} />
                          </svg>
                        </div>
                      </button>
                      {expandedId === c.id && (
                        <div className="rounded-b-xl px-4 py-3 -mt-px" style={{ background: "#0D1120", border: "1px solid #2B3CFF", borderTop: "none" }}>
                          <div className="grid grid-cols-3 gap-4 text-xs">
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

        {/* ── Demografia ─────────────────────────────────────────────────── */}
        {(loading || demo?.gender || (demo?.age_ranges?.length ?? 0) > 0) && (
          <div>
            <SectionHeader
              title="Quem está vendo seus anúncios"
              phone={phone}
              context={`Olá! Tenho uma dúvida sobre a demografia no portal de ${clientName}.`}
            />
            <div className="rounded-xl p-5" style={{ background: "#FFFFFF", color: "#0B0E1E" }}>
              {loading ? (
                <div className="h-32 animate-pulse rounded-lg" style={{ background: "#F3F4F6" }} />
              ) : (
                <div className="space-y-5">
                  {demo?.gender && (
                    <div>
                      <p className="text-xs font-semibold mb-3" style={{ color: "#374151" }}>Gênero</p>
                      <div className="flex gap-3">
                        {[
                          { label: "Mulheres", pct: demo.gender.female_pct, color: "#E879F9" },
                          { label: "Homens",   pct: demo.gender.male_pct,   color: "#2B3CFF" },
                        ].map((g) => (
                          <div key={g.label} className="flex-1 rounded-xl p-3 text-center" style={{ background: "#F9FAFB" }}>
                            <p className="text-2xl font-bold" style={{ color: g.color }}>{g.pct}%</p>
                            <p className="text-xs mt-1" style={{ color: "#6B7280" }}>{g.label}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {demo?.age_ranges && demo.age_ranges.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold mb-3" style={{ color: "#374151" }}>Faixa etária</p>
                      <ResponsiveContainer width="100%" height={120}>
                        <BarChart data={demo.age_ranges} margin={{ top: 0, right: 0, left: -30, bottom: 0 }}>
                          <XAxis dataKey="label" tick={{ fill: "#6B7280", fontSize: 10 }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fill: "#6B7280", fontSize: 10 }} axisLine={false} tickLine={false} unit="%" />
                          <Tooltip
                            contentStyle={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 8, color: "#111" }}
                            formatter={(v) => [`${v}%`, "Alcance"]}
                          />
                          <Bar dataKey="pct" radius={[4, 4, 0, 0]}>
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

        {/* ── Timeline da agência ─────────────────────────────────────────── */}
        {(loading || actions.length > 0) && (
          <div>
            <SectionHeader
              title="O que fizemos no período"
              phone={phone}
              context={`Olá! Tenho uma dúvida sobre uma das ações realizadas no portal de ${clientName}.`}
            />
            <div className="space-y-3">
              {loading
                ? Array.from({ length: 2 }).map((_, i) => (
                    <div key={i} className="h-16 rounded-xl animate-pulse" style={{ background: "#0B0E1E" }} />
                  ))
                : actions.map((a) => (
                    <div key={a.id} className="rounded-xl p-4" style={{ background: "#0B0E1E", border: "1px solid #1A1F33" }}>
                      <div className="flex items-start gap-3">
                        <span className="text-xl shrink-0">{ICON_MAP[a.icon ?? ""] ?? "📌"}</span>
                        <div>
                          <p className="text-sm font-medium">{a.title}</p>
                          {a.description && (
                            <p className="text-xs mt-1" style={{ color: "#8b91a1" }}>{a.description}</p>
                          )}
                          <p className="text-[11px] mt-2" style={{ color: "#6B7280" }}>{fmtDate(a.action_date)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
            </div>
          </div>
        )}

        {/* ── Footer ─────────────────────────────────────────────────────── */}
        <div className="text-center pt-4 pb-8">
          <p className="text-xs" style={{ color: "#6B7280" }}>
            Relatório exclusivo · Lone Mídia
          </p>
        </div>
      </div>
    </div>
  );
}
