"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/client";
import type { Client } from "@/lib/types";
import { Check, Loader2, ClipboardCheck, AlertTriangle } from "lucide-react";

interface Props {
  clients: Client[];
  currentUser: string;
}

interface ChecklistItem {
  clientId: string;
  clientName: string;
  checkedCampaigns: boolean;
  checkedBudget: boolean;
  checkedNegatives: boolean;
  checkedResults: boolean;
}

export default function TrafficChecklist({ clients, currentUser }: Props) {
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [today] = useState(() => new Date().toISOString().slice(0, 10));

  useEffect(() => {
    loadChecklist();
  }, [clients.length]);

  const loadChecklist = async () => {
    const { data } = await supabase
      .from("daily_checklists")
      .select("*")
      .eq("date", today)
      .in("client_id", clients.map((c) => c.id));

    const map = new Map((data || []).map((d) => [d.client_id, d]));

    setItems(clients.map((c) => ({
      clientId: c.id,
      clientName: c.nomeFantasia || c.name,
      checkedCampaigns: map.get(c.id)?.checked_campaigns || false,
      checkedBudget: map.get(c.id)?.checked_budget || false,
      checkedNegatives: map.get(c.id)?.checked_negatives || false,
      checkedResults: map.get(c.id)?.checked_results || false,
    })));
    setLoading(false);
  };

  const toggleCheck = async (clientId: string, field: string) => {
    setItems((prev) => prev.map((i) => i.clientId === clientId ? { ...i, [field]: !i[field as keyof ChecklistItem] } : i));

    const item = items.find((i) => i.clientId === clientId);
    if (!item) return;

    const newVal = !item[field as keyof ChecklistItem];
    await supabase.from("daily_checklists").upsert({
      client_id: clientId,
      date: today,
      [field === "checkedCampaigns" ? "checked_campaigns" : field === "checkedBudget" ? "checked_budget" : field === "checkedNegatives" ? "checked_negatives" : "checked_results"]: newVal,
      completed_by: currentUser,
      completed_at: new Date().toISOString(),
    }, { onConflict: "client_id,date" });
  };

  if (loading) return <div className="flex justify-center py-4"><Loader2 size={16} className="text-primary animate-spin" /></div>;

  const checks = ["checkedCampaigns", "checkedBudget", "checkedNegatives", "checkedResults"];
  const labels = ["Campanhas", "Orcamento", "Negativacao", "Resultados"];
  const totalChecks = items.length * 4;
  const doneChecks = items.reduce((sum, i) => sum + checks.filter((c) => i[c as keyof ChecklistItem]).length, 0);

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-foreground text-sm flex items-center gap-2">
          <ClipboardCheck size={14} className="text-primary" /> Checklist Diario
        </h3>
        <span className="text-[10px] text-muted-foreground">{doneChecks}/{totalChecks} — {today}</span>
      </div>

      {doneChecks === totalChecks && totalChecks > 0 && (
        <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 text-xs text-emerald-400 flex items-center gap-1.5">
          <Check size={12} /> Todos os clientes verificados hoje
        </div>
      )}

      <div className="space-y-1">
        {items.map((item) => {
          const done = checks.filter((c) => item[c as keyof ChecklistItem]).length;
          return (
            <div key={item.clientId} className="flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-muted/30 transition-colors">
              <p className="text-xs text-foreground font-medium flex-1 truncate">{item.clientName}</p>
              <div className="flex gap-1">
                {checks.map((c, i) => (
                  <button key={c} onClick={() => toggleCheck(item.clientId, c)} title={labels[i]}
                    className={`w-6 h-6 rounded-md border flex items-center justify-center transition-all text-[10px] ${
                      item[c as keyof ChecklistItem] ? "bg-primary/20 border-primary/30 text-primary" : "border-border text-zinc-600 hover:border-zinc-500"
                    }`}>
                    {item[c as keyof ChecklistItem] ? <Check size={10} /> : labels[i][0]}
                  </button>
                ))}
              </div>
              {done < 4 && <AlertTriangle size={10} className="text-amber-400 shrink-0" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
