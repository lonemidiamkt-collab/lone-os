"use client";

import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase/client";
import type { Client } from "@/lib/types";
import {
  TrendingUp, Plus, Loader2, Check, X, DollarSign,
  Calendar, MessageCircle, Zap, AlertTriangle, ArrowUp, ArrowDown,
  PenLine, Star,
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, ReferenceLine } from "recharts";

interface Props {
  client: Client;
  currentUser: string;
  role: string;
}

interface FinancialRecord {
  id: string; month: string; investment: number; revenue: number; roi: number | null;
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
  const [form, setForm] = useState({ month: new Date().toISOString().slice(0, 7), investment: "", revenue: "", strategyNote: "" });
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
      setRecords((fin.data || []).map((r) => ({
        id: r.id, month: r.month, investment: Number(r.investment), revenue: Number(r.revenue),
        roi: r.roi !== null ? Number(r.roi) : null, strategyNote: r.strategy_note || "", recordedBy: r.recorded_by,
      })));
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
    const roi = calcROI(rev, inv);

    try {
      const { error } = await supabase.from("client_financial_results").upsert({
        client_id: client.id, month: form.month,
        investment: inv, revenue: rev, roi,
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

    setForm({ month: new Date().toISOString().slice(0, 7), investment: "", revenue: "", strategyNote: "" });
    setShowAddRecord(false);
    setSaving(false);
    // Reload
    const { data } = await supabase.from("client_financial_results").select("*").eq("client_id", client.id).order("month");
    if (data) setRecords(data.map((r) => ({
      id: r.id, month: r.month, investment: Number(r.investment), revenue: Number(r.revenue),
      roi: r.roi !== null ? Number(r.roi) : null, strategyNote: r.strategy_note || "", recordedBy: r.recorded_by,
    })));
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
  const lastInteraction = interactions[0];
  const daysSinceInteraction = lastInteraction ? Math.ceil((Date.now() - new Date(lastInteraction.loggedAt).getTime()) / 86400000) : null;

  if (loading) return <div className="flex justify-center py-10"><Loader2 size={20} className="text-primary animate-spin" /></div>;

  return (
    <div className="space-y-5 animate-fade-in">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {/* TTV */}
        <div className={`card flex items-center gap-3 ${waitingTTV ? "border-amber-500/20" : "border-border"}`}>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${waitingTTV ? "bg-amber-500/10" : "bg-emerald-500/15"}`}>
            {waitingTTV ? <Zap size={18} className="text-amber-400" /> : <Check size={18} className="text-emerald-500" />}
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">Time to Value</p>
            {waitingTTV ? (
              <p className="text-lg font-bold text-amber-400">{daysSinceJoin}d</p>
            ) : (
              <p className="text-lg font-bold text-emerald-400">{ttvDays}d</p>
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
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center">
            <TrendingUp size={18} className="text-emerald-500" />
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">Faturamento Total</p>
            <p className="text-lg font-bold text-foreground">{formatCurrency(totalRevenue)}</p>
          </div>
        </div>

        {/* ROI */}
        <div className={`card flex items-center gap-3 ${avgROI < 0 ? "border-red-500/20" : ""}`}>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${avgROI >= 100 ? "bg-emerald-500/15" : avgROI >= 0 ? "bg-primary/10" : "bg-red-500/10"}`}>
            {avgROI >= 0 ? <ArrowUp size={18} className="text-emerald-500" /> : <ArrowDown size={18} className="text-red-500" />}
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">ROI Medio</p>
            <p className={`text-lg font-bold ${avgROI >= 100 ? "text-emerald-400" : avgROI >= 0 ? "text-foreground" : "text-red-400"}`}>{avgROI}%</p>
          </div>
        </div>
      </div>

      {/* Aha! Moment button */}
      {waitingTTV && isAdmin && (
        <button onClick={handleAhaMoment} disabled={ahaSaving}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-[#0d4af5] to-[#3b6ff5] text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 shadow-[0_4px_20px_rgba(10,52,245,0.3)]">
          {ahaSaving ? <Loader2 size={16} className="animate-spin" /> : <Star size={16} />}
          {ahaSaving ? "Registrando..." : `Aha! Momento — Marcar Primeiro Resultado (${daysSinceJoin} dias)`}
        </button>
      )}

      {/* Frequency alert */}
      {daysSinceInteraction !== null && daysSinceInteraction > 15 && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/[0.03] p-3 flex items-center gap-2">
          <AlertTriangle size={14} className="text-red-400 shrink-0" />
          <p className="text-xs text-red-400">Cliente sem interacao ha <span className="font-bold">{daysSinceInteraction} dias</span> — Risco de churn</p>
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
        <div className="rounded-xl border border-red-500/20 bg-red-500/[0.03] p-3 flex items-center gap-2">
          <AlertTriangle size={14} className="text-red-400 shrink-0" />
          <p className="text-xs text-red-400">{saveError}</p>
          <button onClick={() => setSaveError("")} className="ml-auto text-red-400/50 hover:text-red-400"><X size={12} /></button>
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
                <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2a" />
                <XAxis dataKey="month" tick={{ fill: "#71717a", fontSize: 11 }} axisLine={{ stroke: "#1e1e2a" }} />
                <YAxis tick={{ fill: "#71717a", fontSize: 11 }} axisLine={{ stroke: "#1e1e2a" }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#1a1a24", border: "1px solid #1e1e2a", borderRadius: 12, fontSize: 12 }}
                  labelStyle={{ color: "#71717a" }}
                  formatter={(v, name) => [formatCurrency(Number(v)), String(name)]}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <ReferenceLine y={0} stroke="#1e1e2a" />
                <Line type="monotone" dataKey="Investimento" stroke="#0d4af5" strokeWidth={2} dot={{ fill: "#0d4af5", r: 4 }} />
                <Line type="monotone" dataKey="Faturamento" stroke="#10b981" strokeWidth={2} dot={{ fill: "#10b981", r: 4 }} />
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
                  <span className="text-xs text-zinc-500 w-16 shrink-0 font-mono">{r.month}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-4 text-xs">
                      <span className="text-primary">Inv: {formatCurrency(r.investment)}</span>
                      <span className="text-emerald-400">Fat: {formatCurrency(r.revenue)}</span>
                      <span className={`font-medium ${r.roi !== null && r.roi >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        ROI: {r.roi !== null ? `${r.roi}%` : "—"}
                      </span>
                    </div>
                    {(r.strategyNote || ann) && (
                      <p className="text-[10px] text-zinc-500 mt-0.5 flex items-center gap-1">
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
              daysSinceInteraction <= 7 ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" :
              daysSinceInteraction <= 15 ? "text-amber-400 bg-amber-500/10 border-amber-500/20" :
              "text-red-400 bg-red-500/10 border-red-500/20"
            }`}>Ultima: {daysSinceInteraction}d atras</span>
          )}
        </div>
        {interactions.length === 0 ? (
          <p className="text-xs text-zinc-600 text-center py-4">Nenhuma interacao registrada</p>
        ) : (
          <div className="space-y-1">
            {interactions.slice(0, 8).map((i) => (
              <div key={i.id} className="flex items-start gap-2 py-1.5 text-xs">
                <span className="text-zinc-600 shrink-0 w-20 font-mono">{new Date(i.loggedAt).toLocaleDateString("pt-BR")}</span>
                <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] ${
                  i.type === "alinhamento" ? "bg-primary/10 text-primary" : i.type === "suporte" ? "bg-amber-500/10 text-amber-400" : "bg-zinc-500/10 text-zinc-400"
                }`}>{i.type}</span>
                <span className="text-foreground">{i.summary}</span>
                <span className="text-zinc-600 ml-auto shrink-0">{i.loggedBy}</span>
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
              <button onClick={() => setShowAddRecord(false)} className="text-zinc-500 hover:text-white"><X size={16} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs text-zinc-400">Mes</label>
                <input type="month" value={form.month} onChange={(e) => setForm((p) => ({ ...p, month: e.target.value }))}
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary/50" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs text-zinc-400">Investimento (R$)</label>
                  <input type="number" value={form.investment} onChange={(e) => setForm((p) => ({ ...p, investment: e.target.value }))}
                    placeholder="0.00" className="w-full bg-surface border border-border rounded-lg px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary/50" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-zinc-400">Faturamento (R$)</label>
                  <input type="number" value={form.revenue} onChange={(e) => setForm((p) => ({ ...p, revenue: e.target.value }))}
                    placeholder="0.00" className="w-full bg-surface border border-border rounded-lg px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary/50" />
                </div>
              </div>
              {form.investment && form.revenue && Number(form.investment) > 0 && (
                <div className={`rounded-lg p-3 text-center ${calcROI(Number(form.revenue), Number(form.investment))! >= 0 ? "bg-emerald-500/10 border border-emerald-500/20" : "bg-red-500/10 border border-red-500/20"}`}>
                  <p className={`text-lg font-bold ${calcROI(Number(form.revenue), Number(form.investment))! >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    ROI: {calcROI(Number(form.revenue), Number(form.investment))}%
                  </p>
                </div>
              )}
              <div className="space-y-1.5">
                <label className="text-xs text-zinc-400">Estrategia / Observacao</label>
                <textarea value={form.strategyNote} onChange={(e) => setForm((p) => ({ ...p, strategyNote: e.target.value }))}
                  rows={2} placeholder="Ex: Campanha de Black Friday gerou pico de vendas..."
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary/50 resize-none" />
              </div>
            </div>
            <div className="p-5 border-t border-border flex gap-2">
              <button onClick={() => setShowAddRecord(false)} className="btn-ghost flex-1 text-sm border border-border">Cancelar</button>
              <button onClick={handleAddRecord} disabled={saving || !form.investment}
                className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg bg-primary hover:bg-primary/80 text-white text-sm font-medium disabled:opacity-50">
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
              <button onClick={() => setShowAddInteraction(false)} className="text-zinc-500 hover:text-white"><X size={16} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs text-zinc-400">Tipo</label>
                <div className="flex gap-2">
                  {[{ v: "alinhamento", l: "Alinhamento" }, { v: "suporte", l: "Suporte" }, { v: "feedback", l: "Feedback" }].map((o) => (
                    <button key={o.v} onClick={() => setInteractionForm((p) => ({ ...p, type: o.v }))}
                      className={`flex-1 py-2 rounded-lg border text-xs transition-all ${
                        interactionForm.type === o.v ? "border-primary/50 bg-primary/10 text-white" : "border-border text-zinc-500"
                      }`}>{o.l}</button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-zinc-400">Resumo</label>
                <textarea value={interactionForm.summary} onChange={(e) => setInteractionForm((p) => ({ ...p, summary: e.target.value }))}
                  rows={3} placeholder="O que foi discutido ou resolvido..."
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary/50 resize-none" />
              </div>
            </div>
            <div className="p-5 border-t border-border flex gap-2">
              <button onClick={() => setShowAddInteraction(false)} className="btn-ghost flex-1 text-sm border border-border">Cancelar</button>
              <button onClick={handleAddInteraction} disabled={saving || !interactionForm.summary.trim()}
                className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg bg-primary hover:bg-primary/80 text-white text-sm font-medium disabled:opacity-50">
                {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Registrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
