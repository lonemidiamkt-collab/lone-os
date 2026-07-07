"use client";

// components/fichaviva/CrescimentoPanel.tsx — "Painel de Crescimento" do cockpit Ficha Viva 360.
// Inspirado no relatório navy da Lone: rótulo de valor nas barras, "a leitura que importa"
// (gerada dos dados), Health Score e grid editável. Lê/escreve client_financial_results (mesma
// tabela da aba Resultados) — salva por mês no blur, preservando investimento/ROI já existentes.
// Trimestre = trimestre de CALENDÁRIO (Jan–Mar, Abr–Jun), não 3 meses corridos.

import { useState, useEffect, useMemo, useCallback } from "react";
import { TrendingUp, TrendingDown, Minus, Loader2, Check, Link2 } from "lucide-react";
import {
  BarChart, Bar, LabelList, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine, Cell,
} from "recharts";
import { supabase } from "@/lib/supabase/client";

interface Props {
  clientId: string;
  onGerarLink?: () => void;
}

interface Row {
  month: string;              // "YYYY-MM"
  revenue: number;
  vendas: number | null;
  investment: number;
  roi: number | null;
  strategy_note: string;
}

type Period = "mes" | "tri" | "sem";
interface Point { label: string; fat: number; vendas: number; ticket: number }

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const brl = (n: number) => "R$ " + (n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
const brlk = (n: number) => "R$ " + (n / 1000).toFixed(0) + "k";
const intBR = (n: number) => Math.round(n || 0).toLocaleString("pt-BR");
const ticketOf = (r: Row) => (r.vendas && r.vendas > 0 ? r.revenue / r.vendas : null);
const mLabel = (ym: string) => { const [y, m] = ym.split("-"); return `${MESES[+m - 1]}/${y.slice(2)}`; };
/** Rótulo curto de valor pra cima da barra (R$ 1,05M / R$ 58k). */
function brlBar(n: number): string {
  if (n >= 1e6) return "R$ " + (n / 1e6).toFixed(2).replace(".", ",") + "M";
  if (n >= 1000) return "R$ " + Math.round(n / 1000) + "k";
  return brl(n);
}

function lastMonths(n: number): string[] {
  const now = new Date();
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

/** Agrupa por TRIMESTRE de calendário. Rótulo = faixa de meses presente (ex: "Jan–Mar 26"). */
function toQuarters(rows: Row[]): Point[] {
  const map = new Map<string, Row[]>();
  rows.forEach((r) => {
    const [y, m] = r.month.split("-").map(Number);
    const key = `${y}-Q${Math.ceil(m / 3)}`;
    (map.get(key) ?? map.set(key, []).get(key)!).push(r);
  });
  return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([, chunk]) => {
    const fat = chunk.reduce((s, r) => s + r.revenue, 0);
    const vendas = chunk.reduce((s, r) => s + (r.vendas || 0), 0);
    const yy = chunk[0].month.slice(2, 4);
    const first = MESES[+chunk[0].month.split("-")[1] - 1];
    const last = MESES[+chunk[chunk.length - 1].month.split("-")[1] - 1];
    return { label: first === last ? `${first} ${yy}` : `${first}–${last} ${yy}`, fat, vendas, ticket: vendas ? fat / vendas : 0 };
  });
}

const TT = {
  contentStyle: { backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12 },
  labelStyle: { color: "var(--muted-foreground)", fontWeight: 600, marginBottom: 2 },
  itemStyle: { color: "var(--foreground)", fontWeight: 600 },
} as const;

export default function CrescimentoPanel({ clientId, onGerarLink }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>("mes");
  const [savingMonth, setSavingMonth] = useState<string | null>(null);
  const [savedMonth, setSavedMonth] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from("client_financial_results")
        .select("month, revenue, vendas, investment, roi, strategy_note")
        .eq("client_id", clientId)
        .order("month");
      if (!alive) return;
      const byMonth = new Map<string, Row>();
      (data ?? []).forEach((r) => byMonth.set(r.month as string, {
        month: r.month as string,
        revenue: Number(r.revenue) || 0,
        vendas: r.vendas != null ? Number(r.vendas) : null,
        investment: Number(r.investment) || 0,
        roi: r.roi != null ? Number(r.roi) : null,
        strategy_note: (r.strategy_note as string) || "",
      }));
      const months = Array.from(new Set([...lastMonths(12), ...byMonth.keys()])).sort();
      setRows(months.map((m) => byMonth.get(m) ?? { month: m, revenue: 0, vendas: null, investment: 0, roi: null, strategy_note: "" }));
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [clientId]);

  const setField = (month: string, field: "revenue" | "vendas", value: string) => {
    const num = value === "" ? (field === "vendas" ? null : 0) : Number(value.replace(/\./g, "").replace(",", "."));
    setRows((rs) => rs.map((r) => r.month === month ? { ...r, [field]: field === "vendas" ? (num as number | null) : (num || 0) } : r));
  };

  const saveMonth = useCallback(async (month: string) => {
    const r = rows.find((x) => x.month === month);
    if (!r) return;
    if (!r.revenue && r.vendas == null) return;
    setSavingMonth(month);
    await supabase.from("client_financial_results").upsert({
      client_id: clientId, month,
      revenue: r.revenue, vendas: r.vendas,
      investment: r.investment, roi: r.roi, strategy_note: r.strategy_note,
    }, { onConflict: "client_id,month" });
    setSavingMonth(null);
    setSavedMonth(month);
    setTimeout(() => setSavedMonth((m) => (m === month ? null : m)), 1500);
  }, [rows, clientId]);

  const withData = useMemo(() => rows.filter((r) => r.revenue > 0), [rows]);

  const kpis = useMemo(() => {
    const fat = withData.reduce((s, r) => s + r.revenue, 0);
    const ven = withData.reduce((s, r) => s + (r.vendas || 0), 0);
    return { fat, ven, ticket: ven ? fat / ven : 0, meses: withData.length };
  }, [withData]);

  const serie: Point[] = useMemo(() => {
    if (period === "mes") return withData.map((r) => ({ label: mLabel(r.month), fat: r.revenue, vendas: r.vendas || 0, ticket: ticketOf(r) ?? 0 }));
    if (period === "tri") return toQuarters(withData);
    const fat = withData.reduce((s, r) => s + r.revenue, 0);
    const ven = withData.reduce((s, r) => s + (r.vendas || 0), 0);
    return withData.length ? [{ label: "Semestre", fat, vendas: ven, ticket: ven ? fat / ven : 0 }] : [];
  }, [withData, period]);

  // "A leitura que importa" — comparação do trimestre atual vs. o anterior (ou tendência).
  const insight = useMemo(() => {
    const q = toQuarters(withData);
    const pctFmt = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1).replace(".", ",")}%`;
    if (q.length >= 2) {
      const a = q[q.length - 2], b = q[q.length - 1];
      const dFat = a.fat ? (b.fat / a.fat - 1) * 100 : 0;
      const dVen = a.vendas ? (b.vendas / a.vendas - 1) * 100 : 0;
      const dTkt = a.ticket ? (b.ticket / a.ticket - 1) * 100 : 0;
      const tone: "up" | "flat" | "down" = dFat > 3 ? "up" : dFat < -3 ? "down" : "flat";
      let headline: string;
      if (dFat >= 1 && dVen < -1) headline = "Faturou mais vendendo menos";
      else if (dFat > 3 && dVen > 1) headline = "Crescendo em faturamento e volume";
      else if (dFat < -3) headline = "Faturamento recuou no período";
      else headline = "Faturamento estável";
      const detail = `Do trimestre anterior (${a.label}) pro atual (${b.label}), o faturamento fez ${pctFmt(dFat)} ` +
        `com ${pctFmt(dVen)} de vendas — e o ticket médio ${dTkt >= 0 ? "subiu" : "caiu"} ${pctFmt(Math.abs(dTkt))}. ` +
        (dVen < 0 && dTkt > 0 ? "Cada venda passou a valer mais, sustentando o faturamento com menos volume." :
         dFat > 0 && dVen > 0 ? "Mais movimento e mais valor por venda ao mesmo tempo." :
         dFat < 0 ? "Vale olhar oferta e ticket pra reverter." : "");
      return { headline, detail, tone };
    }
    if (withData.length >= 2) {
      const n = Math.min(3, Math.floor(withData.length / 2));
      const recent = withData.slice(-n).reduce((s, r) => s + r.revenue, 0) / n;
      const prior = withData.slice(-2 * n, -n).reduce((s, r) => s + r.revenue, 0) / n;
      const d = prior ? (recent / prior - 1) * 100 : 0;
      const tone: "up" | "flat" | "down" = d > 5 ? "up" : d < -3 ? "down" : "flat";
      return {
        headline: d > 5 ? "Faturamento em alta" : d < -3 ? "Faturamento recuando" : "Faturamento estável",
        detail: `Média recente ${brl(recent)}/mês (${pctFmt(d)} vs. o período anterior). Ticket médio em ${brl(kpis.ticket)}.`,
        tone,
      };
    }
    return null;
  }, [withData, kpis.ticket]);

  const health = useMemo(() => {
    const rev = withData.map((r) => r.revenue);
    if (rev.length < 2) return { score: 50, level: "unknown" as const, label: "Sem dados", why: "Registre pelo menos 2 meses de faturamento para medir o crescimento." };
    const n = Math.min(3, Math.floor(rev.length / 2));
    const recent = rev.slice(-n).reduce((s, v) => s + v, 0) / n;
    const prior = rev.slice(-2 * n, -n).reduce((s, v) => s + v, 0) / n;
    const pct = prior > 0 ? (recent - prior) / prior : 0;
    const score = Math.round(Math.min(96, Math.max(28, 66 + pct * 140)));
    if (pct >= 0.05) return { score, level: "up" as const, label: "Pronto p/ upsell", why: "Faturamento acelerando — janela pra propor aumento de contrato." };
    if (pct <= -0.03) return { score, level: "risk" as const, label: "Em risco", why: "Queda recente no faturamento. Vale reunião de retenção." };
    return { score, level: "ok" as const, label: "Saudável", why: "Performance estável. Manter a cadência e buscar a próxima alavanca de ticket." };
  }, [withData]);

  if (loading) return <div className="flex justify-center py-10"><Loader2 size={20} className="text-primary animate-spin" /></div>;

  const healthColor = health.level === "up" ? "var(--lone-success)" : health.level === "risk" ? "var(--destructive)" : health.level === "ok" ? "var(--primary)" : "var(--muted-foreground)";
  const maxFat = Math.max(...serie.map((s) => s.fat), 1);
  const refFat = 1_000_000;
  const toneColor = insight?.tone === "up" ? "text-lone-success" : insight?.tone === "down" ? "text-destructive" : "text-primary";

  return (
    <div className="space-y-4 animate-fade-in">
      {/* KPIs */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <Kpi label="Faturamento registrado" value={brl(kpis.fat)} foot={kpis.meses ? `Média ${brl(kpis.fat / kpis.meses)}/mês` : "—"} />
        <Kpi label="Vendas" value={intBR(kpis.ven)} foot={`${kpis.meses} ${kpis.meses === 1 ? "mês" : "meses"} com dado`} />
        <Kpi label="Ticket médio" value={brl(kpis.ticket)} foot="faturamento ÷ vendas" />
        <Kpi label="Health Score" value={`${health.score}`} foot={health.label} accent={healthColor} />
      </div>

      {/* A leitura que importa */}
      {insight && (
        <div className="rounded-xl border border-primary/15 bg-primary/5 p-4">
          <p className="text-lone-eyebrow text-primary mb-1.5">A leitura que importa</p>
          <p className={`text-lone-h2 font-semibold ${toneColor}`}>{insight.headline}</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-prose">{insight.detail}</p>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-lone-eyebrow text-muted-foreground mr-1">Visão</span>
        <div className="flex bg-surface border border-border rounded-lg p-0.5">
          {([["mes", "Mês"], ["tri", "Trimestre"], ["sem", "Semestre"]] as [Period, string][]).map(([p, l]) => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${period === p ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}>{l}</button>
          ))}
        </div>
        <div className="flex-1" />
        {onGerarLink && (
          <button onClick={onGerarLink} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface border border-border text-xs font-medium text-foreground hover:border-primary/40 transition-colors">
            <Link2 size={12} /> Link do cliente
          </button>
        )}
      </div>

      {/* Faturamento + Health */}
      <div className="grid lg:grid-cols-[1.4fr_1fr] gap-3">
        <div className="card space-y-1">
          <h3 className="text-lone-h2 font-semibold flex items-center gap-2"><TrendingUp size={15} className="text-primary" /> Faturamento</h3>
          <p className="text-lone-caption text-muted-foreground">{period === "mes" ? "Por mês" : period === "tri" ? "Por trimestre (calendário)" : "Total do período"} · referência R$ 1M</p>
          {serie.length === 0 ? (
            <p className="text-xs text-muted-foreground py-10 text-center">Preencha o faturamento abaixo pra ver a curva.</p>
          ) : (
            <div className="h-[248px] pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={serie} margin={{ top: 22, right: 12, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="fvFat" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" stopColor="var(--primary)" stopOpacity={0.95} />
                      <stop offset="1" stopColor="var(--primary)" stopOpacity={0.55} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={{ stroke: "var(--border)" }} tickLine={false} />
                  <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => brlk(Number(v))} width={44} />
                  <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.12 }} {...TT} formatter={(v) => [brl(Number(v)), "Faturamento"]} />
                  {maxFat >= refFat * 0.5 && <ReferenceLine y={refFat} stroke="var(--primary)" strokeDasharray="4 4" strokeOpacity={0.7} label={{ value: "R$ 1M", fill: "var(--primary)", fontSize: 10, position: "insideTopLeft" }} />}
                  <Bar dataKey="fat" radius={[6, 6, 0, 0]} maxBarSize={64}>
                    {serie.map((_, i) => <Cell key={i} fill="url(#fvFat)" />)}
                    <LabelList dataKey="fat" position="top" formatter={(v) => brlBar(Number(v))} fill="var(--foreground)" fontSize={10} fontWeight={700} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="card space-y-3">
          <h3 className="text-lone-h2 font-semibold">Health Score</h3>
          <div className="flex items-center gap-4">
            <Gauge score={health.score} color={healthColor} />
            <div className="min-w-0">
              <div className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${
                health.level === "up" ? "bg-lone-success-bg text-lone-success" :
                health.level === "risk" ? "bg-destructive/10 text-destructive" :
                health.level === "ok" ? "bg-primary/10 text-primary" : "bg-muted/30 text-muted-foreground"}`}>
                {health.level === "up" ? <TrendingUp size={12} /> : health.level === "risk" ? <TrendingDown size={12} /> : <Minus size={12} />}
                {health.label}
              </div>
              <p className="text-xs text-muted-foreground mt-2">{health.why}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Ticket médio */}
      <div className="card space-y-1">
        <h3 className="text-lone-h2 font-semibold">Evolução do ticket médio</h3>
        <p className="text-lone-caption text-muted-foreground">Cada venda valendo mais ao longo do período</p>
        {serie.filter((s) => s.ticket > 0).length < 2 ? (
          <p className="text-xs text-muted-foreground py-6 text-center">Precisa de vendas em 2+ períodos pra traçar o ticket.</p>
        ) : (
          <div className="h-[204px] pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={serie} margin={{ top: 22, right: 20, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={{ stroke: "var(--border)" }} tickLine={false} />
                <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => brl(Number(v))} width={56} />
                <Tooltip {...TT} formatter={(v) => [brl(Number(v)), "Ticket"]} />
                <Line type="monotone" dataKey="ticket" stroke="var(--primary)" strokeWidth={2.5} dot={{ fill: "var(--primary)", r: 3 }} activeDot={{ r: 5 }}>
                  <LabelList dataKey="ticket" position="top" formatter={(v) => brl(Number(v))} fill="var(--foreground)" fontSize={10} fontWeight={700} />
                </Line>
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Grid editável */}
      <div className="card space-y-3">
        <div>
          <h3 className="text-lone-h2 font-semibold">Dados mês a mês</h3>
          <p className="text-lone-caption text-muted-foreground">Digite faturamento e vendas — o ticket é calculado. Salva ao sair do campo.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-lone-eyebrow text-muted-foreground">
                <th className="text-left font-medium py-2 pr-3">Mês</th>
                <th className="text-right font-medium py-2 px-3">Faturamento (R$)</th>
                <th className="text-right font-medium py-2 px-3">Vendas</th>
                <th className="text-right font-medium py-2 pl-3">Ticket médio</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const tk = ticketOf(r);
                return (
                  <tr key={r.month} className="border-t border-border/50">
                    <td className="py-1.5 pr-3 font-mono text-xs text-muted-foreground whitespace-nowrap">
                      {mLabel(r.month)}
                      {savingMonth === r.month && <Loader2 size={10} className="inline ml-1.5 animate-spin text-primary" />}
                      {savedMonth === r.month && <Check size={10} className="inline ml-1.5 text-lone-success" />}
                    </td>
                    <td className="py-1 px-3 text-right">
                      <input type="number" inputMode="decimal" defaultValue={r.revenue || ""}
                        onChange={(e) => setField(r.month, "revenue", e.target.value)} onBlur={() => saveMonth(r.month)} placeholder="0"
                        className="w-28 text-right bg-surface border border-border rounded-md px-2 py-1.5 text-xs font-mono text-foreground outline-none focus:border-primary/50" />
                    </td>
                    <td className="py-1 px-3 text-right">
                      <input type="number" inputMode="numeric" defaultValue={r.vendas ?? ""}
                        onChange={(e) => setField(r.month, "vendas", e.target.value)} onBlur={() => saveMonth(r.month)} placeholder="0"
                        className="w-24 text-right bg-surface border border-border rounded-md px-2 py-1.5 text-xs font-mono text-foreground outline-none focus:border-primary/50" />
                    </td>
                    <td className="py-1.5 pl-3 text-right">
                      <span className="inline-block min-w-24 text-right px-2 py-1.5 rounded-md bg-primary/5 text-primary text-xs font-mono border border-primary/15">
                        {tk ? brl(tk) : "—"}
                      </span>
                    </td>
                  </tr>
                );
              })}
              <tr className="border-t border-border">
                <td className="py-2.5 pr-3 font-semibold text-xs">Total registrado</td>
                <td className="py-2.5 px-3 text-right font-mono font-semibold text-xs">{brl(kpis.fat)}</td>
                <td className="py-2.5 px-3 text-right font-mono font-semibold text-xs">{intBR(kpis.ven)}</td>
                <td className="py-2.5 pl-3 text-right font-mono font-semibold text-xs">{brl(kpis.ticket)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, foot, accent }: { label: string; value: string; foot: string; accent?: string }) {
  return (
    <div className="card border-l-2 border-l-primary/40">
      <p className="text-lone-eyebrow text-muted-foreground mb-1.5">{label}</p>
      <p className="text-lone-hero font-semibold tracking-tight text-foreground" style={accent ? { color: accent } : undefined}>{value}</p>
      <p className="text-lone-caption text-muted-foreground mt-1">{foot}</p>
    </div>
  );
}

function Gauge({ score, color }: { score: number; color: string }) {
  const r = 40, c = 2 * Math.PI * r, off = c * (1 - Math.max(0, Math.min(100, score)) / 100);
  return (
    <svg width="104" height="104" viewBox="0 0 104 104" className="shrink-0">
      <circle cx="52" cy="52" r={r} fill="none" stroke="var(--muted)" strokeOpacity="0.25" strokeWidth="9" />
      <circle cx="52" cy="52" r={r} fill="none" stroke={color} strokeWidth="9" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={off} transform="rotate(-90 52 52)" style={{ transition: "stroke-dashoffset .6s ease" }} />
      <text x="52" y="58" textAnchor="middle" fontSize="24" fontWeight="700" fill="var(--foreground)">{score}</text>
    </svg>
  );
}
