"use client";

import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase/client";
import type { Client } from "@/lib/types";
import {
  TrendingUp, TrendingDown, Minus, Plus, Loader2, Check, X, DollarSign,
  Calendar, MessageCircle, Zap, AlertTriangle, ArrowUp, ArrowDown,
  PenLine, Star, ShoppingBag,
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, ReferenceLine } from "recharts";

interface Props {
  client: Client;
  currentUser: string;
  role: string;
}

interface FinancialRecord {
  id: string; month: string; investment: number; revenue: number; roi: number | null;
  vendas: number | null; ticket: number | null;
  strategyNote: string; recordedBy: string;
}

interface InteractionLog {
  id: string; type: string; summary: string; loggedBy: string; loggedAt: string;
}

interface Annotation {
  id: string; month: string; annotation: string; type: string; createdBy: string;
}

function formatCurrency(v: number): string {
  return `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 0 })}`;
}

function calcROI(revenue: number, investment: number): number | null {
  if (investment <= 0) return null;
  return Math.round(((revenue - investment) / investment) * 100);
}

/** Mapeia a linha crua de client_financial_results pro shape da UI (inclui vendas/ticket). */
function mapFinancialRow(r: Record<string, unknown>): FinancialRecord {
  const vendas = r.vendas != null ? Number(r.vendas) : null;
  const revenue = Number(r.revenue);
  // ticket é coluna gerada no banco; se vier null (linha antiga sem vendas) derivamos em JS.
  const ticket = r.ticket != null ? Number(r.ticket) : vendas && vendas > 0 ? revenue / vendas : null;
  return {
    id: r.id as string, month: r.month as string,
    investment: Number(r.investment), revenue,
    roi: r.roi != null ? Number(r.roi) : null,
    vendas, ticket,
    strategyNote: (r.strategy_note as string) || "", recordedBy: r.recorded_by as string,
  };
}

type GrowthLevel = "up" | "flat" | "down" | "unknown";
interface GrowthHealth { level: GrowthLevel; label: string; pct: number | null; reading: string; }

/**
 * Saúde de crescimento a partir da tendência de FATURAMENTO (não do ROI de anúncio).
 * Compara a média dos meses recentes com a dos meses anteriores (janela até 3+3).
 * Robusto com poucos dados: < 2 meses de faturamento = "sem dados".
 */
function computeGrowthHealth(records: FinancialRecord[]): GrowthHealth {
  const rev = records.filter((r) => r.revenue > 0); // records já vêm ordenados por mês (asc)
  if (rev.length < 2) {
    return { level: "unknown", label: "Sem dados", pct: null,
      reading: "Registre pelo menos 2 meses de faturamento pra medir o crescimento." };
  }
  const n = Math.min(3, Math.floor(rev.length / 2));
  const recent = rev.slice(-n);
  const prior = rev.slice(-2 * n, -n);
  const avg = (arr: FinancialRecord[]) => arr.reduce((s, r) => s + r.revenue, 0) / arr.length;
  const pAvg = avg(prior);
  if (pAvg <= 0) {
    return { level: "unknown", label: "Sem base", pct: null,
      reading: "Sem faturamento no período anterior pra comparar." };
  }
  const pct = Math.round(((avg(recent) - pAvg) / pAvg) * 100);
  const janela = n > 1 ? `nos últimos ${n} meses vs. os ${n} anteriores` : "vs. o mês anterior";
  if (pct >= 10) return { level: "up", label: "Crescendo", pct, reading: `Faturamento subiu ${pct}% ${janela}.` };
  if (pct <= -8) return { level: "down", label: "Em queda", pct, reading: `Faturamento caiu ${Math.abs(pct)}% ${janela} — hora de agir.` };
  return { level: "flat", label: "Estável", pct, reading: `Faturamento estável (${pct >= 0 ? "+" : ""}${pct}%) ${janela}.` };
}

export default function ResultsTab({ client, currentUser, role }: Props) {
  const isAdmin = role === "admin" || role === "manager";
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<FinancialRecord[]>([]);
  const [interactions, setInteractions] = useState<InteractionLog[]>([]);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [showAddRecord, setShowAddRecord] = useState(false);
  const [showAddInteraction, setShowAddInteraction] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ahaSaving, setAhaSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  // Form state
  const [form, setForm] = useState({ month: new Date().toISOString().slice(0, 7), investment: "", revenue: "", vendas: "", strategyNote: "" });
  const [interactionForm, setInteractionForm] = useState({ type: "alinhamento", summary: "" });
  const [annotationForm, setAnnotationForm] = useState({ month: "", annotation: "", type: "neutral" });

  const ttvDays = useMemo(() => {
    if (!client.firstValueDeliveredAt || !client.activatedAt) {
      if (!client.firstValueDeliveredAt && client.joinDate) {
        return null; // Not delivered yet
      }
      return null;
    }
    return Math.ceil((new Date(client.firstValueDeliveredAt).getTime() - new Date(client.activatedAt || client.joinDate).getTime()) / 86400000);
  }, [client.firstValueDeliveredAt, client.activatedAt, client.joinDate]);

  const waitingTTV = !client.firstValueDeliveredAt;
  const daysSinceJoin = Math.ceil((Date.now() - new Date(client.joinDate).getTime()) / 86400000);

  useEffect(() => {
    let mounted = true;
    Promise.all([
      supabase.from("client_financial_results").select("*").eq("client_id", client.id).order("month"),
      supabase.from("interaction_logs").select("*").eq("client_id", client.id).order("logged_at", { ascending: false }).limit(20),
      supabase.from("strategy_annotations").select("*").eq("client_id", client.id).order("month"),
    ]).then(([fin, inter, ann]) => {
      if (!mounted) return;
      setRecords((fin.data || []).map(mapFinancialRow));
      setInteractions((inter.data || []).map((r) => ({
        id: r.id, type: r.type, summary: r.summary || "", loggedBy: r.logged_by, loggedAt: r.logged_at,
      })));
      setAnnotations((ann.data || []).map((r) => ({
        id: r.id, month: r.month, annotation: r.annotation, type: r.type || "neutral", createdBy: r.created_by,
      })));
      setLoading(false);
    });
    return () => { mounted = false; };
  }, [client.id]);

  const handleAddRecord = async () => {
    if (!form.month || !form.investment) return;
    setSaving(true);
    setSaveError("");
    const inv = Number(form.investment);
    const rev = Number(form.revenue) || 0;
    const vendas = form.vendas ? Number(form.vendas) : null; // ticket é gerado no banco (revenue/vendas)
    const roi = calcROI(rev, inv);

    try {
      const { error } = await supabase.from("client_financial_results").upsert({
        client_id: client.id, month: form.month,
        investment: inv, revenue: rev, roi, vendas,
        strategy_note: form.strategyNote, recorded_by: currentUser,
      }, { onConflict: "client_id,month" });

      if (error) throw error;

      if (form.strategyNote) {
        await supabase.from("strategy_annotations").insert({
          client_id: client.id, month: form.month,
          annotation: form.strategyNote, type: roi !== null && roi > 0 ? "positive" : "neutral",
          created_by: currentUser,
        });
      }
    } catch (err) {
      setSaveError("Erro ao salvar. Tente novamente.");
      setSaving(false);
      return;
    }

    setForm({ month: new Date().toISOString().slice(0, 7), investment: "", revenue: "", vendas: "", strategyNote: "" });
    setShowAddRecord(false);
    setSaving(false);
    // Reload
    const { data } = await supabase.from("client_financial_results").select("*").eq("client_id", client.id).order("month");
    if (data) setRecords(data.map(mapFinancialRow));
  };

  const handleAddInteraction = async () => {
    if (!interactionForm.summary.trim()) return;
    setSaving(true);
    setSaveError("");
    try {
      const { error } = await supabase.from("interaction_logs").insert({
        client_id: client.id, type: interactionForm.type,
        summary: interactionForm.summary.trim(), logged_by: currentUser,
      });
      if (error) throw error;
      await supabase.from("timeline_entries").insert({
        client_id: client.id, type: "meeting", actor: currentUser,
        description: `${interactionForm.type === "alinhamento" ? "Reuniao de alinhamento" : interactionForm.type === "suporte" ? "Suporte" : "Feedback"}: ${interactionForm.summary.trim()}`,
        timestamp: new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
      });
      setInteractionForm({ type: "alinhamento", summary: "" });
      setShowAddInteraction(false);
      const { data } = await supabase.from("interaction_logs").select("*").eq("client_id", client.id).order("logged_at", { ascending: false }).limit(20);
      if (data) setInteractions(data.map((r) => ({ id: r.id, type: r.type, summary: r.summary || "", loggedBy: r.logged_by, loggedAt: r.logged_at })));
    } catch {
      setSaveError("Erro ao registrar interacao.");
    }
    setSaving(false);
  };

  const handleAhaMoment = async () => {
    setAhaSaving(true);
    setSaveError("");
    try {
      const now = new Date().toISOString();
      const { error } = await supabase.from("clients").update({
        first_value_delivered_at: now,
        activated_at: client.activatedAt || client.joinDate,
        ttv_days: Math.ceil((Date.now() - new Date(client.activatedAt || client.joinDate).getTime()) / 86400000),
      }).eq("id", client.id);
      if (error) throw error;
      await supabase.from("timeline_entries").insert({
        client_id: client.id, type: "manual", actor: currentUser,
        description: `Primeiro resultado tangivel entregue! TTV: ${daysSinceJoin} dias`,
        timestamp: new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
      });
      window.location.reload();
    } catch {
      setSaveError("Erro ao registrar Aha! Moment.");
      setAhaSaving(false);
    }
  };

  // Chart data
  const chartData = records.map((r) => ({
    month: r.month?.slice(5) ?? "N/A",
    Investimento: r.investment,
    Faturamento: r.revenue,
    ROI: r.roi ?? 0,
  }));

  const totalInvestment = records.reduce((s, r) => s + r.investment, 0);
  const totalRevenue = records.reduce((s, r) => s + r.revenue, 0);
  const avgROI = totalInvestment > 0 ? Math.round(((totalRevenue - totalInvestment) / totalInvestment) * 100) : 0;

  // Crescimento do negócio (Ficha Viva — Fase 1)
  const growth = computeGrowthHealth(records);
  const lastRecord = records.length ? records[records.length - 1] : null; // records vêm ordenados por mês asc
  const ticketChartData = records.filter((r) => r.ticket != null).map((r) => ({ month: r.month?.slice(5) ?? "N/A", Ticket: r.ticket }));

  const lastInteraction = interactions[0];
  const daysSinceInteraction = lastInteraction ? Math.ceil((Date.now() - new Date(lastInteraction.loggedAt).getTime()) / 86400000) : null;

  if (loading) return <div className="flex justify-center py-10"><Loader2 size={20} className="text-primary animate-spin" /></div>;

  return (
    <div className="space-y-5 animate-fade-in">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {/* TTV */}
        <div className={`card flex items-center gap-3 ${waitingTTV ? "border-lone-warning-border" : "border-border"}`}>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${waitingTTV ? "bg-lone-warning-bg" : "bg-lone-success-bg"}`}>
            {waitingTTV ? <Zap size={18} className="text-lone-warning" /> : <Check size={18} className="text-lone-success" />}
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">Time to Value</p>
            {waitingTTV ? (
              <p className="text-lg font-bold text-lone-warning">{daysSinceJoin}d</p>
            ) : (
              <p className="text-lg font-bold text-lone-success">{ttvDays}d</p>
            )}
          </div>
        </div>

        {/* Total Investment */}
        <div className="card flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <DollarSign size={18} className="text-primary" />
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">Investimento Total</p>
            <p className="text-lg font-bold text-foreground">{formatCurrency(totalInvestment)}</p>
          </div>
        </div>

        {/* Total Revenue */}
        <div className="card flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-lone-success-bg flex items-center justify-center">
            <TrendingUp size={18} className="text-lone-success" />
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">Faturamento Total</p>
            <p className="text-lg font-bold text-foreground">{formatCurrency(totalRevenue)}</p>
          </div>
        </div>

        {/* ROI */}
        <div className={`card flex items-center gap-3 ${avgROI < 0 ? "border-destructive/20" : ""}`}>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${avgROI >= 100 ? "bg-lone-success-bg" : avgROI >= 0 ? "bg-primary/10" : "bg-destructive/10"}`}>
            {avgROI >= 0 ? <ArrowUp size={18} className="text-lone-success" /> : <ArrowDown size={18} className="text-destructive" />}
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">ROI Medio</p>
            <p className={`text-lg font-bold ${avgROI >= 100 ? "text-lone-success" : avgROI >= 0 ? "text-foreground" : "text-destructive"}`}>{avgROI}%</p>
          </div>
        </div>
      </div>

      {/* Crescimento do negócio — Health de crescimento (tendência de faturamento) + ticket */}
      {records.length > 0 && (
        <div className="card space-y-4">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <TrendingUp size={14} className="text-primary" /> Crescimento do Negócio
          </h3>
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            {/* Selo de saúde de crescimento */}
            <div className={`shrink-0 rounded-xl border px-4 py-3 flex items-center gap-3 ${
              growth.level === "up" ? "bg-lone-success-bg border-lone-success-border" :
              growth.level === "down" ? "bg-destructive/10 border-destructive/20" :
              growth.level === "flat" ? "bg-lone-warning-bg border-lone-warning-border" :
              "bg-muted/30 border-border"
            }`}>
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                growth.level === "up" ? "bg-lone-success/15" :
                growth.level === "down" ? "bg-destructive/15" :
                growth.level === "flat" ? "bg-lone-warning/15" : "bg-muted"
              }`}>
                {growth.level === "up" ? <TrendingUp size={18} className="text-lone-success" /> :
                 growth.level === "down" ? <TrendingDown size={18} className="text-destructive" /> :
                 growth.level === "flat" ? <Minus size={18} className="text-lone-warning" /> :
                 <AlertTriangle size={16} className="text-muted-foreground" />}
              </div>
              <div>
                <p className={`text-sm font-bold ${
                  growth.level === "up" ? "text-lone-success" :
                  growth.level === "down" ? "text-destructive" :
                  growth.level === "flat" ? "text-lone-warning" : "text-muted-foreground"
                }`}>{growth.label}{growth.pct !== null ? ` · ${growth.pct >= 0 ? "+" : ""}${growth.pct}%` : ""}</p>
                <p className="text-[10px] text-muted-foreground">Saúde de crescimento</p>
              </div>
            </div>
            {/* Leitura + último mês */}
            <div className="flex-1 min-w-0">
              <p className="text-xs text-foreground">{growth.reading}</p>
              {lastRecord && (
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px]">
                  <span className="text-muted-foreground">Último mês <span className="font-mono text-foreground">{lastRecord.month}</span></span>
                  <span className="text-lone-success">Fat: {formatCurrency(lastRecord.revenue)}</span>
                  {lastRecord.vendas != null && <span className="text-primary">Vendas: {lastRecord.vendas}</span>}
                  {lastRecord.ticket != null && <span className="text-foreground">Ticket: {formatCurrency(lastRecord.ticket)}</span>}
                </div>
              )}
            </div>
          </div>
          {/* Tendência de ticket médio */}
          {ticketChartData.length >= 2 && (
            <div className="pt-3 border-t border-border">
              <p className="text-[10px] text-muted-foreground mb-1 flex items-center gap-1"><ShoppingBag size={10} /> Ticket médio por mês</p>
              <div className="h-[160px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={ticketChartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="month" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={{ stroke: "var(--border)" }} />
                    <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={{ stroke: "var(--border)" }} tickFormatter={(v) => `${(v / 1000).toFixed(1)}k`} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "var(--border)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12 }}
                      labelStyle={{ color: "var(--muted-foreground)" }}
                      formatter={(v) => [formatCurrency(Number(v)), "Ticket"]}
                    />
                    <Line type="monotone" dataKey="Ticket" stroke="var(--primary)" strokeWidth={2} dot={{ fill: "var(--primary)", r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Aha! Moment button */}
      {waitingTTV && isAdmin && (
        <button onClick={handleAhaMoment} disabled={ahaSaving}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-primary to-primary text-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 shadow-lg">
          {ahaSaving ? <Loader2 size={16} className="animate-spin" /> : <Star size={16} />}
          {ahaSaving ? "Registrando..." : `Aha! Momento — Marcar Primeiro Resultado (${daysSinceJoin} dias)`}
        </button>
      )}

      {/* Frequency alert */}
      {daysSinceInteraction !== null && daysSinceInteraction > 15 && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/[0.03] p-3 flex items-center gap-2">
          <AlertTriangle size={14} className="text-destructive shrink-0" />
          <p className="text-xs text-destructive">Cliente sem interacao ha <span className="font-bold">{daysSinceInteraction} dias</span> — Risco de churn</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button onClick={() => setShowAddRecord(true)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 border border-primary/20 transition-colors">
          <DollarSign size={12} /> Inserir Faturamento
        </button>
        <button onClick={() => setShowAddInteraction(true)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-surface text-foreground text-xs font-medium hover:bg-muted/30 border border-border transition-colors">
          <MessageCircle size={12} /> Registrar Interacao
        </button>
      </div>

      {/* Error feedback */}
      {saveError && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/[0.03] p-3 flex items-center gap-2">
          <AlertTriangle size={14} className="text-destructive shrink-0" />
          <p className="text-xs text-destructive">{saveError}</p>
          <button onClick={() => setSaveError("")} className="ml-auto text-destructive/50 hover:text-destructive"><X size={12} /></button>
        </div>
      )}

      {/* Chart */}
      {records.length > 0 && (
        <div className="card space-y-3">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <TrendingUp size={14} className="text-primary" /> Investimento vs Faturamento
          </h3>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="month" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={{ stroke: "var(--border)" }} />
                <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={{ stroke: "var(--border)" }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{ backgroundColor: "var(--border)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12 }}
                  labelStyle={{ color: "var(--muted-foreground)" }}
                  formatter={(v, name) => [formatCurrency(Number(v)), String(name)]}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <ReferenceLine y={0} stroke="var(--border)" />
                <Line type="monotone" dataKey="Investimento" stroke="var(--primary)" strokeWidth={2} dot={{ fill: "var(--primary)", r: 4 }} />
                <Line type="monotone" dataKey="Faturamento" stroke="var(--lone-success)" strokeWidth={2} dot={{ fill: "var(--lone-success)", r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Financial history table */}
      {records.length > 0 && (
        <div className="card space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Historico Mensal</h3>
          <div className="space-y-1">
            {records.map((r) => {
              const ann = annotations.find((a) => a.month === r.month);
              return (
                <div key={r.id} className="flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-muted/30 transition-colors">
                  <span className="text-xs text-muted-foreground w-16 shrink-0 font-mono">{r.month}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                      <span className="text-primary">Inv: {formatCurrency(r.investment)}</span>
                      <span className="text-lone-success">Fat: {formatCurrency(r.revenue)}</span>
                      {r.vendas != null && <span className="text-muted-foreground">Vendas: {r.vendas}</span>}
                      {r.ticket != null && <span className="text-foreground">Ticket: {formatCurrency(r.ticket)}</span>}
                      <span className={`font-medium ${r.roi !== null && r.roi >= 0 ? "text-lone-success" : "text-destructive"}`}>
                        ROI: {r.roi !== null ? `${r.roi}%` : "—"}
                      </span>
                    </div>
                    {(r.strategyNote || ann) && (
                      <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
                        <PenLine size={8} /> {r.strategyNote || ann?.annotation}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Interaction history */}
      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <MessageCircle size={14} className="text-primary" /> Historico de Interacoes
          </h3>
          {daysSinceInteraction !== null && (
            <span className={`text-[10px] px-2 py-0.5 rounded border ${
              daysSinceInteraction <= 7 ? "text-lone-success bg-lone-success-bg border-lone-success-border" :
              daysSinceInteraction <= 15 ? "text-lone-warning bg-lone-warning-bg border-lone-warning-border" :
              "text-destructive bg-destructive/10 border-destructive/20"
            }`}>Ultima: {daysSinceInteraction}d atras</span>
          )}
        </div>
        {interactions.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">Nenhuma interacao registrada</p>
        ) : (
          <div className="space-y-1">
            {interactions.slice(0, 8).map((i) => (
              <div key={i.id} className="flex items-start gap-2 py-1.5 text-xs">
                <span className="text-muted-foreground shrink-0 w-20 font-mono">{new Date(i.loggedAt).toLocaleDateString("pt-BR")}</span>
                <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] ${
                  i.type === "alinhamento" ? "bg-primary/10 text-primary" : i.type === "suporte" ? "bg-lone-warning-bg text-lone-warning" : "bg-muted text-muted-foreground"
                }`}>{i.type}</span>
                <span className="text-foreground">{i.summary}</span>
                <span className="text-muted-foreground ml-auto shrink-0">{i.loggedBy}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Record Modal */}
      {showAddRecord && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setShowAddRecord(false)}>
          <div className="bg-card border border-border rounded-xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-border flex items-center justify-between">
              <h3 className="font-semibold text-foreground text-sm">Inserir Faturamento Mensal</h3>
              <button onClick={() => setShowAddRecord(false)} className="text-muted-foreground hover:text-foreground"><X size={16} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">Mes</label>
                <input type="month" value={form.month} onChange={(e) => setForm((p) => ({ ...p, month: e.target.value }))}
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary/50" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">Investimento (R$)</label>
                  <input type="number" value={form.investment} onChange={(e) => setForm((p) => ({ ...p, investment: e.target.value }))}
                    placeholder="0.00" className="w-full bg-surface border border-border rounded-lg px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary/50" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">Faturamento (R$)</label>
                  <input type="number" value={form.revenue} onChange={(e) => setForm((p) => ({ ...p, revenue: e.target.value }))}
                    placeholder="0.00" className="w-full bg-surface border border-border rounded-lg px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary/50" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">Vendas (nº)</label>
                  <input type="number" value={form.vendas} onChange={(e) => setForm((p) => ({ ...p, vendas: e.target.value }))}
                    placeholder="0" className="w-full bg-surface border border-border rounded-lg px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary/50" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">Ticket médio</label>
                  <div className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2.5 text-sm text-muted-foreground">
                    {form.revenue && form.vendas && Number(form.vendas) > 0 ? formatCurrency(Number(form.revenue) / Number(form.vendas)) : "—"}
                  </div>
                </div>
              </div>
              {form.investment && form.revenue && Number(form.investment) > 0 && (
                <div className={`rounded-lg p-3 text-center ${calcROI(Number(form.revenue), Number(form.investment))! >= 0 ? "bg-lone-success-bg border border-lone-success-border" : "bg-destructive/10 border border-destructive/20"}`}>
                  <p className={`text-lg font-bold ${calcROI(Number(form.revenue), Number(form.investment))! >= 0 ? "text-lone-success" : "text-destructive"}`}>
                    ROI: {calcROI(Number(form.revenue), Number(form.investment))}%
                  </p>
                </div>
              )}
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">Estrategia / Observacao</label>
                <textarea value={form.strategyNote} onChange={(e) => setForm((p) => ({ ...p, strategyNote: e.target.value }))}
                  rows={2} placeholder="Ex: Campanha de Black Friday gerou pico de vendas..."
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary/50 resize-none" />
              </div>
            </div>
            <div className="p-5 border-t border-border flex gap-2">
              <button onClick={() => setShowAddRecord(false)} className="btn-ghost flex-1 text-sm border border-border">Cancelar</button>
              <button onClick={handleAddRecord} disabled={saving || !form.investment}
                className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg bg-primary hover:bg-primary/80 text-primary-foreground text-sm font-medium disabled:opacity-50">
                {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Interaction Modal */}
      {showAddInteraction && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setShowAddInteraction(false)}>
          <div className="bg-card border border-border rounded-xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-border flex items-center justify-between">
              <h3 className="font-semibold text-foreground text-sm">Registrar Interacao</h3>
              <button onClick={() => setShowAddInteraction(false)} className="text-muted-foreground hover:text-foreground"><X size={16} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">Tipo</label>
                <div className="flex gap-2">
                  {[{ v: "alinhamento", l: "Alinhamento" }, { v: "suporte", l: "Suporte" }, { v: "feedback", l: "Feedback" }].map((o) => (
                    <button key={o.v} onClick={() => setInteractionForm((p) => ({ ...p, type: o.v }))}
                      className={`flex-1 py-2 rounded-lg border text-xs transition-all ${
                        interactionForm.type === o.v ? "border-primary/50 bg-primary/10 text-foreground" : "border-border text-muted-foreground"
                      }`}>{o.l}</button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">Resumo</label>
                <textarea value={interactionForm.summary} onChange={(e) => setInteractionForm((p) => ({ ...p, summary: e.target.value }))}
                  rows={3} placeholder="O que foi discutido ou resolvido..."
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary/50 resize-none" />
              </div>
            </div>
            <div className="p-5 border-t border-border flex gap-2">
              <button onClick={() => setShowAddInteraction(false)} className="btn-ghost flex-1 text-sm border border-border">Cancelar</button>
              <button onClick={handleAddInteraction} disabled={saving || !interactionForm.summary.trim()}
                className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg bg-primary hover:bg-primary/80 text-primary-foreground text-sm font-medium disabled:opacity-50">
                {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Registrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
