"use client";

// components/fichaviva/CrescimentoPanel.tsx — o "Painel de Crescimento" do cockpit Ficha Viva 360
// (equivalente à aba 01 do protótipo). Grid EDITÁVEL mês a mês (faturamento + vendas; ticket é
// calculado, como a coluna gerada no banco), com KPIs, gráficos que recalculam na hora
// (faturamento em barras + ticket em linha) e o Health Score num medidor. Lê/escreve o
// client_financial_results (mesma tabela da aba Resultados) — salva por mês no blur, preservando
// investimento/ROI que já existirem na linha.

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  TrendingUp, TrendingDown, Minus, Loader2, Check, Link2, FileText,
} from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine, Cell,
} from "recharts";
import { supabase } from "@/lib/supabase/client";

interface Props {
  clientId: string;
  onGerarLink?: () => void;   // leva pra sub-aba Raio-X (onde mora a gestão do link)
}

interface Row {
  month: string;              // "YYYY-MM"
  revenue: number;
  vendas: number | null;
  investment: number;         // preservado (não editado aqui)
  roi: number | null;
  strategy_note: string;
}

type Period = "mes" | "tri" | "sem";

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const brl = (n: number) => "R$ " + (n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
const brlk = (n: number) => "R$ " + (n / 1000).toFixed(0) + "k";
const intBR = (n: number) => Math.round(n || 0).toLocaleString("pt-BR");
const ticketOf = (r: Row) => (r.vendas && r.vendas > 0 ? r.revenue / r.vendas : null);
const mLabel = (ym: string) => { const [y, m] = ym.split("-"); return `${MESES[+m - 1]}/${y.slice(2)}`; };

/** Últimos n meses (YYYY-MM), do mais antigo pro atual. */
function lastMonths(n: number): string[] {
  const now = new Date();
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

export default function CrescimentoPanel({ clientId, onGerarLink }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>("mes");
  const [savingMonth, setSavingMonth] = useState<string | null>(null);
  const [savedMonth, setSavedMonth] = useState<string | null>(null);

  // Carrega + monta timeline contínua (últimos 12 meses ∪ meses com dado)
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
    if (!r.revenue && r.vendas == null) return; // linha vazia — não grava
    setSavingMonth(month);
    // Preserva investment/roi/strategy_note; ticket é gerado no banco.
    await supabase.from("client_financial_results").upsert({
      client_id: clientId, month,
      revenue: r.revenue, vendas: r.vendas,
      investment: r.investment, roi: r.roi, strategy_note: r.strategy_note,
    }, { onConflict: "client_id,month" });
    setSavingMonth(null);
    setSavedMonth(month);
    setTimeout(() => setSavedMonth((m) => (m === month ? null : m)), 1500);
  }, [rows, clientId]);

  // ---- dados com faturamento (base de KPIs/gráficos) ----
  const withData = useMemo(() => rows.filter((r) => r.revenue > 0), [rows]);

  const kpis = useMemo(() => {
    const fat = withData.reduce((s, r) => s + r.revenue, 0);
    const ven = withData.reduce((s, r) => s + (r.vendas || 0), 0);
    return { fat, ven, ticket: ven ? fat / ven : 0, meses: withData.length };
  }, [withData]);

  // ---- séries por período ----
  const serie = useMemo(() => {
    if (period === "mes") {
      return withData.map((r) => ({ label: mLabel(r.month), fat: r.revenue, ticket: ticketOf(r) ?? 0 }));
    }
    const grupos: { label: string; fat: number; ven: number }[] = [];
    const size = period === "tri" ? 3 : 6;
    for (let i = 0; i < withData.length; i += size) {
      const chunk = withData.slice(i, i + size);
      const fat = chunk.reduce((s, r) => s + r.revenue, 0);
      const ven = chunk.reduce((s, r) => s + (r.vendas || 0), 0);
      const label = period === "tri" ? `${chunk[0] ? mLabel(chunk[0].month) : ""}–${chunk[chunk.length - 1] ? mLabel(chunk[chunk.length - 1].month) : ""}` : "Semestre";
      grupos.push({ label, fat, ven });
    }
    return grupos.map((g) => ({ label: g.label, fat: g.fat, ticket: g.ven ? g.fat / g.ven : 0 }));
  }, [withData, period]);

  // ---- health de crescimento (tendência de faturamento) ----
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
  const refFat = 1_000_000; // linha de referência R$ 1M (como o protótipo)

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <Kpi label="Faturamento (registrado)" value={brl(kpis.fat)} foot={kpis.meses ? `Média ${brl(kpis.fat / kpis.meses)}/mês` : "—"} />
        <Kpi label="Vendas" value={intBR(kpis.ven)} foot={`${kpis.meses} ${kpis.meses === 1 ? "mês" : "meses"} com dado`} />
        <Kpi label="Ticket médio" value={brl(kpis.ticket)} foot="faturamento ÷ vendas" />
        <Kpi label="Health Score" value={`${health.score}`} foot={health.label} accent={healthColor} />
      </div>

      {/* Toolbar: período + ações */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mr-1">Visão</span>
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

      {/* Faturamento (barras) + Health (medidor) */}
      <div className="grid lg:grid-cols-[1.4fr_1fr] gap-3">
        <div className="card space-y-2">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><TrendingUp size={14} className="text-primary" /> Faturamento</h3>
          {serie.length === 0 ? (
            <p className="text-xs text-muted-foreground py-8 text-center">Preencha o faturamento abaixo pra ver a curva.</p>
          ) : (
            <div className="h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={serie} margin={{ top: 16, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={{ stroke: "var(--border)" }} tickLine={false} />
                  <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => brlk(Number(v))} />
                  <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.15 }}
                    contentStyle={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12 }}
                    labelStyle={{ color: "var(--muted-foreground)" }} formatter={(v) => [brl(Number(v)), "Faturamento"]} />
                  {maxFat >= refFat * 0.5 && <ReferenceLine y={refFat} stroke="var(--primary)" strokeDasharray="4 4" label={{ value: "R$ 1M", fill: "var(--primary)", fontSize: 10, position: "insideTopLeft" }} />}
                  <Bar dataKey="fat" radius={[6, 6, 0, 0]} maxBarSize={56}>
                    {serie.map((_, i) => <Cell key={i} fill="var(--primary)" />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="card space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Health Score</h3>
          <div className="flex items-center gap-4">
            <Gauge score={health.score} color={healthColor} />
            <div className="min-w-0">
              <div className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full ${
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

      {/* Ticket médio (linha) */}
      <div className="card space-y-2">
        <h3 className="text-sm font-semibold text-foreground">Evolução do ticket médio</h3>
        {serie.filter((s) => s.ticket > 0).length < 2 ? (
          <p className="text-xs text-muted-foreground py-6 text-center">Precisa de vendas em 2+ meses pra traçar o ticket.</p>
        ) : (
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={serie} margin={{ top: 16, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={{ stroke: "var(--border)" }} tickLine={false} />
                <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => brl(Number(v))} />
                <Tooltip contentStyle={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12 }}
                  labelStyle={{ color: "var(--muted-foreground)" }} formatter={(v) => [brl(Number(v)), "Ticket"]} />
                <Line type="monotone" dataKey="ticket" stroke="var(--primary)" strokeWidth={2.5} dot={{ fill: "var(--primary)", r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Grid editável */}
      <div className="card space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Dados mês a mês</h3>
          <p className="text-[11px] text-muted-foreground">Digite faturamento e vendas — o ticket é calculado. Salva ao sair do campo.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-wide text-muted-foreground">
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
                        onChange={(e) => setField(r.month, "revenue", e.target.value)}
                        onBlur={() => saveMonth(r.month)}
                        placeholder="0"
                        className="w-28 text-right bg-surface border border-border rounded-md px-2 py-1.5 text-xs font-mono text-foreground outline-none focus:border-primary/50" />
                    </td>
                    <td className="py-1 px-3 text-right">
                      <input type="number" inputMode="numeric" defaultValue={r.vendas ?? ""}
                        onChange={(e) => setField(r.month, "vendas", e.target.value)}
                        onBlur={() => saveMonth(r.month)}
                        placeholder="0"
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
                <td className="py-2.5 pr-3 font-semibold text-xs">Total (registrado)</td>
                <td className="py-2.5 px-3 text-right font-mono font-semibold text-xs">{brl(kpis.fat)}</td>
                <td className="py-2.5 px-3 text-right font-mono font-semibold text-xs">{intBR(kpis.ven)}</td>
                <td className="py-2.5 pl-3 text-right font-mono font-semibold text-xs">{brl(kpis.ticket)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
          <FileText size={11} /> Os mesmos números aparecem na aba Resultados e alimentam o link do cliente e a Carteira.
        </p>
      </div>
    </div>
  );
}

function Kpi({ label, value, foot, accent }: { label: string; value: string; foot: string; accent?: string }) {
  return (
    <div className="card">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-1.5">{label}</p>
      <p className="text-xl font-bold text-foreground" style={accent ? { color: accent } : undefined}>{value}</p>
      <p className="text-[11px] text-muted-foreground mt-1">{foot}</p>
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
