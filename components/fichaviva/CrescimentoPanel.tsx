"use client";

// components/fichaviva/CrescimentoPanel.tsx — "Painel de Crescimento" do cockpit Ficha Viva 360.
// Inspirado no relatório navy da Lone: rótulo de valor nas barras, "a leitura que importa"
// (gerada dos dados), Health Score e grid editável. Lê/escreve client_financial_results (mesma
// tabela da aba Resultados) — salva por mês no blur, preservando investimento/ROI já existentes.
//
// NAVEGAÇÃO POR ANO (fix jul/2026): um seletor de ANO governa tudo. O grid mostra os 12 meses do
// ano escolhido (some a janela rolante — dá pra registrar Ago, Set… do ano). Trimestre e Semestre
// são do ANO-CALENDÁRIO escolhido (Q1=Jan–Mar … Q4=Out–Dez; S1=Jan–Jun, S2=Jul–Dez), então Dez/25
// não vaza pro trimestre de 2026 nem o semestre vira 7 meses. Health/insight usam a série contínua
// (trajetória real do cliente), só os gráficos/KPIs são do ano.

import { useState, useEffect, useMemo, useCallback } from "react";
import { TrendingUp, TrendingDown, Minus, Loader2, Check, Link2, ChevronLeft, ChevronRight } from "lucide-react";
import {
  BarChart, Bar, LabelList, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine, Cell,
} from "recharts";
import { supabase } from "@/lib/supabase/client";
import { authedFetch } from "@/lib/supabase/authed-fetch";
import { Target } from "lucide-react";

interface Props {
  clientId: string;
  onGerarLink?: () => void;
}

interface Goal { value: number; month: string } // "bater R$ value até month (YYYY-MM)"

interface Row {
  month: string;              // "YYYY-MM"
  revenue: number;
  vendas: number | null;
  investment: number;
  roi: number | null;
  strategy_note: string;
}

type Period = "mes" | "tri" | "sem";
interface Point { label: string; fat: number; vendas: number; ticket: number; sub?: string }

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const brl = (n: number) => "R$ " + (n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
const brlk = (n: number) => "R$ " + (n / 1000).toFixed(0) + "k";
const intBR = (n: number) => Math.round(n || 0).toLocaleString("pt-BR");
const ticketOf = (r: Row) => (r.vendas && r.vendas > 0 ? r.revenue / r.vendas : null);
const mLabel = (ym: string) => { const [y, m] = ym.split("-"); return `${MESES[+m - 1]}/${y.slice(2)}`; };
const pctFmt = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1).replace(".", ",")}%`;

/** Parse pt-BR de faturamento: aceita "654.177,07", "650000", "R$ 1.200.000". Ponto = milhar,
 *  vírgula = decimal. Sem isso, o input type=number comia a vírgula e corrompia o valor. */
function parseFatBR(str: string): number {
  let clean = (str ?? "").replace(/[^\d.,-]/g, "");
  if (!clean) return 0;
  if (clean.includes(",")) clean = clean.replace(/\./g, "").replace(",", ".");
  else clean = clean.replace(/\./g, ""); // sem vírgula → pontos são milhar
  const n = Number(clean);
  return isNaN(n) ? 0 : n;
}
/** Vendas é inteiro: só dígitos ("14.026" → 14026). "" → null. */
function parseVendasBR(str: string): number | null {
  const s = (str ?? "").replace(/[^\d]/g, "");
  return s === "" ? null : Number(s);
}

/** Rótulo curto de valor pra cima da barra (R$ 1,05M / R$ 58k). */
function brlBar(n: number): string {
  if (n >= 1e6) return "R$ " + (n / 1e6).toFixed(2).replace(".", ",") + "M";
  if (n >= 1000) return "R$ " + Math.round(n / 1000) + "k";
  return brl(n);
}

const emptyRow = (month: string): Row => ({ month, revenue: 0, vendas: null, investment: 0, roi: null, strategy_note: "" });

/** Insight de trimestre a partir de uma série contínua (não presa a um ano). */
function quartersOf(rows: Row[]): Point[] {
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
  const [byMonth, setByMonth] = useState<Map<string, Row>>(new Map());
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>("mes");
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [savingMonth, setSavingMonth] = useState<string | null>(null);
  const [savedMonth, setSavedMonth] = useState<string | null>(null);
  const [goal, setGoal] = useState<Goal | null>(null);
  const [goalOpen, setGoalOpen] = useState(false);
  const [goalVal, setGoalVal] = useState("");
  const [goalMonth, setGoalMonth] = useState("");
  const [goalSaving, setGoalSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from("client_financial_results")
        .select("month, revenue, vendas, investment, roi, strategy_note")
        .eq("client_id", clientId)
        .order("month");
      if (!alive) return;
      const map = new Map<string, Row>();
      (data ?? []).forEach((r) => map.set(r.month as string, {
        month: r.month as string,
        revenue: Number(r.revenue) || 0,
        vendas: r.vendas != null ? Number(r.vendas) : null,
        investment: Number(r.investment) || 0,
        roi: r.roi != null ? Number(r.roi) : null,
        strategy_note: (r.strategy_note as string) || "",
      }));
      setByMonth(map);
      // Abre no ano mais recente com dado (senão no ano atual).
      const yearsWithData = [...map.values()].filter((r) => r.revenue > 0).map((r) => +r.month.slice(0, 4));
      if (yearsWithData.length) setYear(Math.max(...yearsWithData));
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [clientId]);

  // Meta de faturamento do cliente ("bater R$ X até mês Y").
  useEffect(() => {
    let alive = true;
    authedFetch(`/api/clients/${clientId}/growth-goal`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d?.goal) { setGoal(d.goal); setGoalVal(intBR(d.goal.value)); setGoalMonth(d.goal.month); } })
      .catch(() => {});
    return () => { alive = false; };
  }, [clientId]);

  const salvarMeta = async () => {
    setGoalSaving(true);
    const value = parseFatBR(goalVal);
    try {
      const r = await authedFetch(`/api/clients/${clientId}/growth-goal`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: value > 0 ? value : null, month: goalMonth || null }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) { setGoal(d.goal ?? null); setGoalOpen(false); }
    } catch { /* silencioso */ }
    setGoalSaving(false);
  };

  // Anos disponíveis pro seletor (dados + ano atual), crescente.
  const years = useMemo(() => {
    const ys = new Set<number>([new Date().getFullYear()]);
    for (const r of byMonth.values()) if (r.revenue > 0) ys.add(+r.month.slice(0, 4));
    return [...ys].sort((a, b) => a - b);
  }, [byMonth]);

  // Os 12 meses do ANO selecionado (pro grid e pros gráficos).
  const yearRows: Row[] = useMemo(
    () => Array.from({ length: 12 }, (_, i) => {
      const m = `${year}-${String(i + 1).padStart(2, "0")}`;
      return byMonth.get(m) ?? emptyRow(m);
    }),
    [byMonth, year],
  );
  const yearWithData = useMemo(() => yearRows.filter((r) => r.revenue > 0), [yearRows]);

  // Série contínua (todos os meses com dado, todos os anos) — pra health/insight de trajetória.
  const allWithData = useMemo(
    () => [...byMonth.values()].filter((r) => r.revenue > 0).sort((a, b) => a.month.localeCompare(b.month)),
    [byMonth],
  );

  const setField = (month: string, field: "revenue" | "vendas", value: string) => {
    setByMonth((prev) => {
      const next = new Map(prev);
      const cur = next.get(month) ?? emptyRow(month);
      const val = field === "vendas" ? parseVendasBR(value) : parseFatBR(value);
      next.set(month, { ...cur, [field]: field === "vendas" ? (val as number | null) : ((val as number) || 0) });
      return next;
    });
  };

  const saveMonth = useCallback(async (month: string) => {
    const r = byMonth.get(month);
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
  }, [byMonth, clientId]);

  // KPIs = ano selecionado.
  const kpis = useMemo(() => {
    const fat = yearWithData.reduce((s, r) => s + r.revenue, 0);
    const ven = yearWithData.reduce((s, r) => s + (r.vendas || 0), 0);
    return { fat, ven, ticket: ven ? fat / ven : 0, meses: yearWithData.length };
  }, [yearWithData]);

  // Série do gráfico = ano selecionado, por mês / trimestre-do-ano / semestre-do-ano.
  const serie: Point[] = useMemo(() => {
    if (period === "mes") {
      return yearWithData.map((r) => ({ label: mLabel(r.month), fat: r.revenue, vendas: r.vendas || 0, ticket: ticketOf(r) ?? 0 }));
    }
    if (period === "tri") {
      const ord = ["1º Tri", "2º Tri", "3º Tri", "4º Tri"];
      const faixa = ["Jan–Mar", "Abr–Jun", "Jul–Set", "Out–Dez"];
      return [0, 1, 2, 3].map((q) => {
        const ms = yearRows.filter((r) => Math.floor((+r.month.split("-")[1] - 1) / 3) === q);
        const fat = ms.reduce((s, r) => s + r.revenue, 0);
        const vendas = ms.reduce((s, r) => s + (r.vendas || 0), 0);
        return { label: `${ord[q]} ${String(year).slice(2)}`, sub: faixa[q], fat, vendas, ticket: vendas ? fat / vendas : 0 };
      }).filter((p) => p.fat > 0);
    }
    // semestre: S1 Jan–Jun, S2 Jul–Dez
    return [0, 1].map((s) => {
      const ms = yearRows.filter((r) => (+r.month.split("-")[1] <= 6 ? 0 : 1) === s);
      const fat = ms.reduce((acc, r) => acc + r.revenue, 0);
      const vendas = ms.reduce((acc, r) => acc + (r.vendas || 0), 0);
      return { label: `${s === 0 ? "1º sem" : "2º sem"} ${String(year).slice(2)}`, sub: s === 0 ? "Jan–Jun" : "Jul–Dez", fat, vendas, ticket: vendas ? fat / vendas : 0 };
    }).filter((p) => p.fat > 0);
  }, [yearWithData, yearRows, period, year]);

  // Crescimento de cada período vs o anterior (pros chips por trimestre/semestre).
  const serieGrowth = useMemo(() => serie.map((p, i) => {
    const prev = serie[i - 1];
    return { ...p, mom: i > 0 && prev.fat > 0 ? (p.fat / prev.fat - 1) * 100 : null };
  }), [serie]);

  // Crescimento % do último ponto vs o anterior, na visão atual (pro badge "aumento de faturamento").
  const growth = useMemo(() => {
    if (serie.length < 2) return null;
    const a = serie[serie.length - 2], b = serie[serie.length - 1];
    if (!a.fat) return null;
    return (b.fat / a.fat - 1) * 100;
  }, [serie]);

  // "A leitura que importa" — usa a série CONTÍNUA (trajetória real), não só o ano.
  const insight = useMemo(() => {
    const q = quartersOf(allWithData);
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
    if (allWithData.length >= 2) {
      const n = Math.min(3, Math.floor(allWithData.length / 2));
      const recent = allWithData.slice(-n).reduce((s, r) => s + r.revenue, 0) / n;
      const prior = allWithData.slice(-2 * n, -n).reduce((s, r) => s + r.revenue, 0) / n;
      const d = prior ? (recent / prior - 1) * 100 : 0;
      const tone: "up" | "flat" | "down" = d > 5 ? "up" : d < -3 ? "down" : "flat";
      const tk = kpis.ticket;
      return {
        headline: d > 5 ? "Faturamento em alta" : d < -3 ? "Faturamento recuando" : "Faturamento estável",
        detail: `Média recente ${brl(recent)}/mês (${pctFmt(d)} vs. o período anterior). Ticket médio em ${brl(tk)}.`,
        tone,
      };
    }
    return null;
  }, [allWithData, kpis.ticket]);

  const health = useMemo(() => {
    const rev = allWithData.map((r) => r.revenue);
    if (rev.length < 2) return { score: 50, level: "unknown" as const, label: "Sem dados", why: "Registre pelo menos 2 meses de faturamento para medir o crescimento." };
    const n = Math.min(3, Math.floor(rev.length / 2));
    const recent = rev.slice(-n).reduce((s, v) => s + v, 0) / n;
    const prior = rev.slice(-2 * n, -n).reduce((s, v) => s + v, 0) / n;
    const pct = prior > 0 ? (recent - prior) / prior : 0;
    const score = Math.round(Math.min(96, Math.max(28, 66 + pct * 140)));
    if (pct >= 0.05) return { score, level: "up" as const, label: "Pronto p/ upsell", why: "Faturamento acelerando — janela pra propor aumento de contrato." };
    if (pct <= -0.03) return { score, level: "risk" as const, label: "Em risco", why: "Queda recente no faturamento. Vale reunião de retenção." };
    return { score, level: "ok" as const, label: "Saudável", why: "Performance estável. Manter a cadência e buscar a próxima alavanca de ticket." };
  }, [allWithData]);

  const ticketHealth = useMemo(() => {
    const tk = allWithData.map((r) => ticketOf(r)).filter((v): v is number => v != null && v > 0);
    if (tk.length < 2) return null;
    const n = Math.min(3, Math.floor(tk.length / 2));
    const recent = tk.slice(-n).reduce((s, v) => s + v, 0) / n;
    const prior = tk.slice(-2 * n, -n).reduce((s, v) => s + v, 0) / n;
    const pct = prior ? (recent / prior - 1) * 100 : 0;
    const tone: "up" | "flat" | "down" = pct > 2 ? "up" : pct < -2 ? "down" : "flat";
    return { tone, label: pctFmt(pct) };
  }, [allWithData]);

  if (loading) return <div className="flex justify-center py-10"><Loader2 size={20} className="text-primary animate-spin" /></div>;

  const healthColor = health.level === "up" ? "var(--lone-success)" : health.level === "risk" ? "var(--destructive)" : health.level === "ok" ? "var(--primary)" : "var(--muted-foreground)";
  const maxFat = Math.max(...serie.map((s) => s.fat), 1);
  const refFat = goal?.value ?? 1_000_000;
  const refLabel = goal ? "Meta " + brlBar(goal.value) : "R$ 1M";
  const toneColor = insight?.tone === "up" ? "text-lone-success" : insight?.tone === "down" ? "text-destructive" : "text-primary";

  // Progresso da meta: último mês COM dado (série contínua) vs a meta + meses restantes até o prazo.
  const goalProgress = (() => {
    if (!goal) return null;
    const latest = allWithData.length ? allWithData[allWithData.length - 1].revenue : 0;
    const pct = goal.value > 0 ? Math.round((latest / goal.value) * 100) : 0;
    const [gy, gm] = goal.month.split("-").map(Number);
    const now = new Date();
    const monthsLeft = (gy - now.getFullYear()) * 12 + (gm - (now.getMonth() + 1));
    return { latest, pct, monthsLeft, batido: latest >= goal.value };
  })();
  const growthCls = growth == null ? "" : growth > 0 ? "bg-lone-success-bg text-lone-success" : growth < 0 ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary";

  return (
    <div className="space-y-4 animate-fade-in">
      {/* KPIs */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <Kpi label={`Faturamento ${year}`} value={brl(kpis.fat)} foot={kpis.meses ? `Média ${brl(kpis.fat / kpis.meses)}/mês` : "—"} />
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

      {/* Meta de faturamento do cliente */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Target size={15} className="text-primary" />
            <h3 className="text-lone-h2 font-semibold">Meta de faturamento</h3>
          </div>
          <button onClick={() => setGoalOpen((o) => !o)} className="text-xs font-medium text-primary hover:underline">
            {goal ? "Editar meta" : "Definir meta"}
          </button>
        </div>

        {goalOpen ? (
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-[11px] text-muted-foreground mb-1">Faturamento-alvo (mensal)</label>
              <input value={goalVal} onChange={(e) => setGoalVal(e.target.value)} placeholder="1.500.000"
                className="w-40 bg-surface border border-border rounded-md px-2.5 py-1.5 text-xs font-mono text-foreground outline-none focus:border-primary/50" />
            </div>
            <div>
              <label className="block text-[11px] text-muted-foreground mb-1">Até o mês</label>
              <input type="month" value={goalMonth} onChange={(e) => setGoalMonth(e.target.value)}
                className="bg-surface border border-border rounded-md px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-primary/50" />
            </div>
            <button onClick={salvarMeta} disabled={goalSaving} className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-40">{goalSaving ? "Salvando…" : "Salvar"}</button>
            {goal && <button onClick={() => { setGoalVal(""); setGoalMonth(""); salvarMeta(); }} className="rounded-md px-2 py-1.5 text-xs text-destructive hover:underline">Remover</button>}
          </div>
        ) : goal && goalProgress ? (
          <div className="mt-3">
            <div className="flex items-baseline justify-between gap-2 mb-1.5">
              <p className="text-sm text-foreground">
                Bater <span className="font-semibold">{brl(goal.value)}</span>/mês até <span className="font-semibold">{mLabel(goal.month)}</span>
                {goalProgress.monthsLeft > 0 ? <span className="text-muted-foreground"> · faltam {goalProgress.monthsLeft} {goalProgress.monthsLeft === 1 ? "mês" : "meses"}</span>
                 : goalProgress.monthsLeft === 0 ? <span className="text-lone-warning"> · é este mês</span>
                 : <span className="text-destructive"> · prazo passou</span>}
              </p>
              <span className={`text-sm font-bold ${goalProgress.batido ? "text-lone-success" : "text-primary"}`}>{goalProgress.pct}%</span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div className={`h-full rounded-full ${goalProgress.batido ? "bg-lone-success" : "bg-primary"}`} style={{ width: `${Math.min(100, goalProgress.pct)}%` }} />
            </div>
            <p className="text-[11px] text-muted-foreground mt-1.5">
              {goalProgress.batido ? "Meta batida! 🎉 Hora de propor um novo patamar." : `Último mês registrado: ${brl(goalProgress.latest)}.`}
            </p>
          </div>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">Defina o faturamento que o cliente quer bater e até quando — vira a linha de referência do gráfico e o progresso aqui.</p>
        )}
      </div>

      {/* Toolbar: ANO + visão */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-lone-eyebrow text-muted-foreground mr-1">Ano</span>
        <div className="flex items-center gap-1">
          <button onClick={() => setYear((y) => y - 1)} className="grid h-7 w-7 place-items-center rounded-md border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors" aria-label="Ano anterior"><ChevronLeft size={14} /></button>
          <div className="flex bg-surface border border-border rounded-lg p-0.5">
            {years.map((y) => (
              <button key={y} onClick={() => setYear(y)}
                className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${year === y ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}>{y}</button>
            ))}
          </div>
          <button onClick={() => setYear((y) => y + 1)} className="grid h-7 w-7 place-items-center rounded-md border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors" aria-label="Próximo ano"><ChevronRight size={14} /></button>
        </div>
        <span className="text-lone-eyebrow text-muted-foreground ml-2 mr-1">Visão</span>
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
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-lone-h2 font-semibold flex items-center gap-2"><TrendingUp size={15} className="text-primary" /> Faturamento</h3>
            {growth != null && (
              <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${growthCls}`}>
                {growth > 0 ? <TrendingUp size={11} /> : growth < 0 ? <TrendingDown size={11} /> : <Minus size={11} />}
                {pctFmt(growth)} <span className="font-normal opacity-70">vs. anterior</span>
              </span>
            )}
          </div>
          <p className="text-lone-caption text-muted-foreground">{period === "mes" ? `Meses de ${year}` : period === "tri" ? `Trimestres de ${year}` : `Semestres de ${year}`} · referência R$ 1M</p>
          {serie.length === 0 ? (
            <p className="text-xs text-muted-foreground py-10 text-center">Sem faturamento registrado em {year}. Preencha abaixo pra ver a curva.</p>
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
                  {maxFat >= refFat * 0.5 && <ReferenceLine y={refFat} stroke="var(--primary)" strokeDasharray="4 4" strokeOpacity={0.7} label={{ value: refLabel, fill: "var(--primary)", fontSize: 10, position: "insideTopLeft" }} />}
                  <Bar dataKey="fat" radius={[6, 6, 0, 0]} maxBarSize={64}>
                    {serie.map((_, i) => <Cell key={i} fill="url(#fvFat)" />)}
                    <LabelList dataKey="fat" position="top" formatter={(v) => brlBar(Number(v))} fill="var(--foreground)" fontSize={10} fontWeight={700} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          {/* Crescimento por período (trimestre/semestre) — cada bloco vs o anterior */}
          {period !== "mes" && serieGrowth.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {serieGrowth.map((p) => (
                <div key={p.label} className="flex items-center gap-2 rounded-lg border border-border bg-surface px-2.5 py-1.5">
                  <div className="leading-tight">
                    <p className="text-[11px] font-semibold text-foreground">{p.label}{p.sub ? <span className="font-normal text-muted-foreground"> · {p.sub}</span> : null}</p>
                    <p className="text-[11px] font-mono text-foreground">{brl(p.fat)}</p>
                  </div>
                  {p.mom != null && (
                    <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold px-1.5 py-0.5 rounded-full ${p.mom > 0 ? "bg-lone-success-bg text-lone-success" : p.mom < 0 ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}>
                      {p.mom > 0 ? <TrendingUp size={10} /> : p.mom < 0 ? <TrendingDown size={10} /> : <Minus size={10} />}{pctFmt(p.mom)}
                    </span>
                  )}
                </div>
              ))}
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
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lone-h2 font-semibold">Evolução do ticket médio</h3>
            <p className="text-lone-caption text-muted-foreground">Cada venda valendo mais ao longo de {year}</p>
          </div>
          {ticketHealth && (
            <span className={`shrink-0 inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${
              ticketHealth.tone === "up" ? "bg-lone-success-bg text-lone-success" :
              ticketHealth.tone === "down" ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}>
              {ticketHealth.tone === "up" ? <TrendingUp size={12} /> : ticketHealth.tone === "down" ? <TrendingDown size={12} /> : <Minus size={12} />}
              {ticketHealth.label}
            </span>
          )}
        </div>
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

      {/* Grid editável — os 12 meses do ano escolhido */}
      <div className="card space-y-3">
        <div>
          <h3 className="text-lone-h2 font-semibold">Dados de {year}, mês a mês</h3>
          <p className="text-lone-caption text-muted-foreground">Digite faturamento e vendas — o ticket é calculado. Salva ao sair do campo. Use o seletor de ano acima pra outro ano.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-lone-eyebrow text-muted-foreground">
                <th className="text-left font-medium py-2 pr-3">Mês</th>
                <th className="text-right font-medium py-2 px-3">Faturamento (R$)</th>
                <th className="text-right font-medium py-2 px-3">Vendas</th>
                <th className="text-right font-medium py-2 px-3">Cresc.</th>
                <th className="text-right font-medium py-2 pl-3">Ticket médio</th>
              </tr>
            </thead>
            <tbody>
              {yearRows.map((r, idx) => {
                const tk = ticketOf(r);
                // crescimento vs mês anterior COM dado (dentro do ano)
                const prev = [...yearRows.slice(0, idx)].reverse().find((x) => x.revenue > 0);
                const mom = r.revenue > 0 && prev && prev.revenue > 0 ? (r.revenue / prev.revenue - 1) * 100 : null;
                return (
                  <tr key={r.month} className="border-t border-border/50">
                    <td className="py-1.5 pr-3 font-mono text-xs text-muted-foreground whitespace-nowrap">
                      {mLabel(r.month)}
                      {savingMonth === r.month && <Loader2 size={10} className="inline ml-1.5 animate-spin text-primary" />}
                      {savedMonth === r.month && <Check size={10} className="inline ml-1.5 text-lone-success" />}
                    </td>
                    <td className="py-1 px-3 text-right">
                      <input type="text" inputMode="decimal" defaultValue={r.revenue ? intBR(r.revenue) : ""}
                        onChange={(e) => setField(r.month, "revenue", e.target.value)} onBlur={() => saveMonth(r.month)} placeholder="0"
                        className="w-32 text-right bg-surface border border-border rounded-md px-2 py-1.5 text-xs font-mono text-foreground outline-none focus:border-primary/50" />
                    </td>
                    <td className="py-1 px-3 text-right">
                      <input type="text" inputMode="numeric" defaultValue={r.vendas != null ? intBR(r.vendas) : ""}
                        onChange={(e) => setField(r.month, "vendas", e.target.value)} onBlur={() => saveMonth(r.month)} placeholder="0"
                        className="w-24 text-right bg-surface border border-border rounded-md px-2 py-1.5 text-xs font-mono text-foreground outline-none focus:border-primary/50" />
                    </td>
                    <td className="py-1.5 px-3 text-right">
                      {mom == null ? <span className="text-xs text-muted-foreground/50">—</span> : (
                        <span className={`text-xs font-mono font-semibold ${mom > 0 ? "text-lone-success" : mom < 0 ? "text-destructive" : "text-muted-foreground"}`}>{pctFmt(mom)}</span>
                      )}
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
                <td className="py-2.5 pr-3 font-semibold text-xs">Total {year}</td>
                <td className="py-2.5 px-3 text-right font-mono font-semibold text-xs">{brl(kpis.fat)}</td>
                <td className="py-2.5 px-3 text-right font-mono font-semibold text-xs">{intBR(kpis.ven)}</td>
                <td />
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
