"use client";

// components/fichaviva/CrescimentoTab.tsx — aba "Crescimento" da ficha do cliente: FONTE ÚNICA de
// faturamento (o CrescimentoPanel bom) + o registro de interações/relacionamento (portado da antiga
// aba Resultados, que duplicava o faturamento). Faturamento fica SEPARADO de tráfego (decisão do
// Roberto: tráfego mora na aba Comercial, junto do Raio-X).

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/client";
import type { Client } from "@/lib/types";
import { MessageCircle, Loader2, Check, X, Plus, AlertTriangle } from "lucide-react";
import CrescimentoPanel from "@/components/fichaviva/CrescimentoPanel";

interface Interaction { id: string; type: string; summary: string; loggedBy: string; loggedAt: string }

export default function CrescimentoTab({ client, currentUser }: { client: Client; currentUser: string }) {
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ type: "alinhamento", summary: "" });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    supabase.from("interaction_logs").select("*").eq("client_id", client.id).order("logged_at", { ascending: false }).limit(20)
      .then(({ data }) => { if (alive && data) setInteractions(data.map((r) => ({ id: r.id, type: r.type, summary: r.summary || "", loggedBy: r.logged_by, loggedAt: r.logged_at }))); });
    return () => { alive = false; };
  }, [client.id]);

  async function addInteraction() {
    if (!form.summary.trim()) return;
    setSaving(true); setErr("");
    try {
      const { error } = await supabase.from("interaction_logs").insert({
        client_id: client.id, type: form.type, summary: form.summary.trim(), logged_by: currentUser,
      });
      if (error) throw error;
      await supabase.from("timeline_entries").insert({
        client_id: client.id, type: "meeting", actor: currentUser,
        description: `${form.type === "alinhamento" ? "Reunião de alinhamento" : form.type === "suporte" ? "Suporte" : "Feedback"}: ${form.summary.trim()}`,
        timestamp: new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
      });
      setForm({ type: "alinhamento", summary: "" });
      setShowAdd(false);
      const { data } = await supabase.from("interaction_logs").select("*").eq("client_id", client.id).order("logged_at", { ascending: false }).limit(20);
      if (data) setInteractions(data.map((r) => ({ id: r.id, type: r.type, summary: r.summary || "", loggedBy: r.logged_by, loggedAt: r.logged_at })));
    } catch { setErr("Erro ao registrar interação."); }
    setSaving(false);
  }

  const last = interactions[0];
  const daysSince = last ? Math.ceil((Date.now() - new Date(last.loggedAt).getTime()) / 86400000) : null;

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Faturamento / crescimento — fonte única */}
      <CrescimentoPanel clientId={client.id} />

      {/* Relacionamento */}
      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-lone-h2 font-semibold flex items-center gap-2"><MessageCircle size={15} className="text-primary" /> Relacionamento</h3>
          <div className="flex items-center gap-2">
            {daysSince !== null && (
              <span className={`text-[10px] px-2 py-0.5 rounded border ${
                daysSince <= 7 ? "text-lone-success bg-lone-success-bg border-lone-success-border" :
                daysSince <= 15 ? "text-lone-warning bg-lone-warning-bg border-lone-warning-border" :
                "text-destructive bg-destructive/10 border-destructive/20"}`}>Última: {daysSince}d atrás</span>
            )}
            <button onClick={() => setShowAdd(true)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-surface border border-border text-xs font-medium text-foreground hover:border-primary/40 transition-colors">
              <Plus size={12} /> Registrar
            </button>
          </div>
        </div>
        {daysSince !== null && daysSince > 15 && (
          <div className="rounded-lg border border-destructive/20 bg-destructive/[0.03] p-2.5 flex items-center gap-2">
            <AlertTriangle size={13} className="text-destructive shrink-0" />
            <p className="text-xs text-destructive">Sem interação há <span className="font-bold">{daysSince} dias</span> — risco de churn.</p>
          </div>
        )}
        {interactions.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-3">Nenhuma interação registrada.</p>
        ) : (
          <div className="space-y-1">
            {interactions.slice(0, 8).map((i) => (
              <div key={i.id} className="flex items-start gap-2 py-1.5 text-xs">
                <span className="text-muted-foreground shrink-0 w-20 font-mono">{new Date(i.loggedAt).toLocaleDateString("pt-BR")}</span>
                <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] ${
                  i.type === "alinhamento" ? "bg-primary/10 text-primary" : i.type === "suporte" ? "bg-lone-warning-bg text-lone-warning" : "bg-muted text-muted-foreground"}`}>{i.type}</span>
                <span className="text-foreground">{i.summary}</span>
                <span className="text-muted-foreground ml-auto shrink-0">{i.loggedBy}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal registrar interação */}
      {showAdd && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setShowAdd(false)}>
          <div className="bg-card border border-border rounded-xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-border flex items-center justify-between">
              <h3 className="font-semibold text-foreground text-sm">Registrar interação</h3>
              <button onClick={() => setShowAdd(false)} className="text-muted-foreground hover:text-foreground"><X size={16} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex gap-2">
                {[{ v: "alinhamento", l: "Alinhamento" }, { v: "suporte", l: "Suporte" }, { v: "feedback", l: "Feedback" }].map((o) => (
                  <button key={o.v} onClick={() => setForm((p) => ({ ...p, type: o.v }))}
                    className={`flex-1 py-2 rounded-lg border text-xs transition-all ${form.type === o.v ? "border-primary/50 bg-primary/10 text-foreground" : "border-border text-muted-foreground"}`}>{o.l}</button>
                ))}
              </div>
              <textarea value={form.summary} onChange={(e) => setForm((p) => ({ ...p, summary: e.target.value }))}
                rows={3} placeholder="O que foi discutido ou resolvido..."
                className="w-full bg-surface border border-border rounded-lg px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary/50 resize-none" />
              {err && <p className="text-xs text-destructive">{err}</p>}
            </div>
            <div className="p-5 border-t border-border flex gap-2">
              <button onClick={() => setShowAdd(false)} className="btn-ghost flex-1 text-sm border border-border">Cancelar</button>
              <button onClick={addInteraction} disabled={saving || !form.summary.trim()}
                className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium disabled:opacity-50">
                {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Registrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
