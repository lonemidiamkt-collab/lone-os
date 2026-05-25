"use client";

import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell,
} from "recharts";

export interface DailyChartPoint {
  date: string;
  label: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
}

const CHART_COLORS: Record<string, string> = {
  spend: "#0d4af5",
  impressions: "#3b6ff5",
  clicks: "#5a8fff",
  conversions: "#7aacff",
};

const CHART_LABELS: Record<string, string> = {
  spend: "Gasto (R$)",
  impressions: "Impressões",
  clicks: "Cliques",
  conversions: "Conversões",
};

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#0e0e14] border border-[#1e1e2a] rounded-xl p-3.5 shadow-2xl text-xs backdrop-blur-sm">
      <p className="font-semibold text-white mb-2 text-[13px]">{label}</p>
      <div className="space-y-1.5">
        {payload.map((p: any) => (
          <div key={p.dataKey} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full ring-2 ring-white/10" style={{ backgroundColor: p.color }} />
              <span className="text-zinc-400">{CHART_LABELS[p.dataKey] ?? p.dataKey}</span>
            </div>
            <span className="text-white font-bold tabular-nums">
              {p.dataKey === "spend" ? `R$ ${p.value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : p.value.toLocaleString("pt-BR")}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SpendAreaChart({ data, visibleMetrics }: { data: DailyChartPoint[]; visibleMetrics: string[] }) {
  if (!data.length) return null;
  const hasSpend = visibleMetrics.includes("spend");
  const hasVolume = visibleMetrics.some((m) => m !== "spend");

  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <defs>
          {visibleMetrics.map((key) => (
            <linearGradient key={key} id={`grad-${key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART_COLORS[key] ?? "#0d4af5"} stopOpacity={0.35} />
              <stop offset="100%" stopColor={CHART_COLORS[key] ?? "#0d4af5"} stopOpacity={0.02} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2a" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#52525b" }} axisLine={false} tickLine={false} dy={8} />
        {hasSpend && (
          <YAxis
            yAxisId="spend"
            tick={{ fontSize: 10, fill: "#52525b" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `R$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
            width={55}
          />
        )}
        {hasVolume && (
          <YAxis
            yAxisId="volume"
            orientation={hasSpend ? "right" : "left"}
            tick={{ fontSize: 10, fill: "#52525b" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)}
            width={45}
          />
        )}
        <Tooltip content={<CustomTooltip />} cursor={{ stroke: "#0d4af5", strokeWidth: 1, strokeDasharray: "4 4" }} />
        <Legend
          wrapperStyle={{ fontSize: 11, paddingTop: 12 }}
          formatter={(value: string) => <span style={{ color: "#a1a1aa" }}>{CHART_LABELS[value] ?? value}</span>}
        />
        {visibleMetrics.map((key) => (
          <Area
            key={key}
            yAxisId={key === "spend" ? "spend" : "volume"}
            type="monotone"
            dataKey={key}
            stroke={CHART_COLORS[key] ?? "#0d4af5"}
            fill={`url(#grad-${key})`}
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 5, fill: CHART_COLORS[key] ?? "#0d4af5", stroke: "#fff", strokeWidth: 2 }}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function ClientSpendBar({ data }: { data: { name: string; spend: number; conversions: number }[] }) {
  if (!data.length) return null;
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0d4af5" stopOpacity={1} />
            <stop offset="100%" stopColor="#0828b8" stopOpacity={0.8} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2a" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#52525b" }} axisLine={false} tickLine={false} dy={8} />
        <YAxis tick={{ fontSize: 10, fill: "#52525b" }} axisLine={false} tickLine={false} tickFormatter={(v) => `R$${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}`} width={55} />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: "#0d4af5", opacity: 0.05 }} />
        <Bar dataKey="spend" fill="url(#barGrad)" radius={[6, 6, 0, 0]} name="Gasto" maxBarSize={50} />
      </BarChart>
    </ResponsiveContainer>
  );
}

const HEALTH_COLORS = ["#EF4444", "#EF4444", "#EF4444", "#3b6ff5", "#3b6ff5", "#0d4af5", "#0d4af5", "#0d4af5", "#0d4af5", "#0d4af5"];

export function HealthScoreRing({ score, label, size = 120 }: { score: number; label: string; size?: number }) {
  const data = [{ value: score }, { value: 100 - score }];
  const colorIndex = Math.min(Math.floor(score / 10), 9);
  const color = HEALTH_COLORS[colorIndex];

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={size * 0.35}
            outerRadius={size * 0.45}
            startAngle={90}
            endAngle={-270}
            dataKey="value"
            strokeWidth={0}
          >
            <Cell fill={color} />
            <Cell fill="#1e1e2a" />
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-black text-foreground tabular-nums">{score}</span>
        <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">{label}</span>
      </div>
    </div>
  );
}

export default function AdCharts() { return null; }
