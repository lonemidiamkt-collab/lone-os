"use client";

// Feedback do cliente sobre RESULTADOS (vendas/leads). A IA classifica o sentimento e isso puxa o
// nível de atenção / risco de churn do cliente ("vendas caíram" → atenção alta). Diário/semanal.

import { useState, useEffect } from "react";
import { authedFetch } from "@/lib/supabase/authed-fetch";
import { MessageSquareText, TrendingUp, TrendingDown, Minus, Loader2, Send } from "lucide-react";

interface Fb { id: string; mood: string; note: string; recorded_by: string; created_at: string }

const NEG = new Set(["angry", "frustrated", "sad", "anxious", "disappointed"]);
const POS = new Set(["happy", "excited", "grateful"]);
function tone(mood: string): "pos" | "neg" | "neutro" {
  const m = (mood || "").toLowerCase();
  if (NEG.has(m)) return "neg";
  if (POS.has(m)) return "pos";
  return "neutro";
}
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

export default function FeedbackCliente({ clientId }: { clientId: string }) {
  const [list, setList] = useState<Fb[]>([]);
  const [texto, setTexto] = useState("");
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<{ sentimento: string; resumo: string } | null>(null);

  const load = () => {
    authedFetch(`/api/clients/${clientId}/feedback`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.feedbacks) setList(d.feedbacks); })
      .catch(() => {});
  };
  useEffect(load, [clientId]);

  const enviar = async () => {
    if (!texto.trim() || saving) return;
    setSaving(true); setFlash(null);
    try {
      const r = await authedFetch(`/api/clients/${clientId}/feedback`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto: texto.trim() }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) { setFlash({ sentimento: d.sentimento, resumo: d.resumo }); setTexto(""); load(); }
      else setFlash({ sentimento: "erro", resumo: d.error || "Falha ao classificar." });
    } catch { setFlash({ sentimento: "erro", resumo: "Falha de conexão." }); }
    setSaving(false);
  };

  const badge = (t: "pos" | "neg" | "neutro") =>
    t === "pos" ? { cls: "bg-lone-success-bg text-lone-success", Icon: TrendingUp, label: "Positivo" }
    : t === "neg" ? { cls: "bg-destructive/10 text-destructive", Icon: TrendingDown, label: "Negativo" }
    : { cls: "bg-muted text-muted-foreground", Icon: Minus, label: "Neutro" };

  return (
    <div className="card space-y-3">
      <div className="flex items-center gap-2">
        <MessageSquareText size={16} className="text-primary" />
        <h3 className="font-semibold text-foreground">Feedback do cliente (resultados)</h3>
      </div>
      <p className="text-xs text-muted-foreground">
        Registre o que o cliente falou dos resultados (vendas/leads). A IA classifica o sentimento e isso ajusta o
        nível de atenção e o risco de churn dele.
      </p>

      <div className="flex gap-2">
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && enviar()}
          placeholder='Ex: "as vendas caíram esse mês" / "tá vendendo muito, muito satisfeito"'
          className="flex-1 bg-muted rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary"
        />
        <button onClick={enviar} disabled={saving || !texto.trim()} className="btn-primary px-3 flex items-center gap-1.5 disabled:opacity-40">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
        </button>
      </div>

      {flash && flash.sentimento !== "erro" && (() => {
        const t = flash.sentimento === "positivo" ? "pos" : flash.sentimento === "negativo" ? "neg" : "neutro";
        const b = badge(t as "pos" | "neg" | "neutro");
        return (
          <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${b.cls}`}>
            <b.Icon size={13} /> <strong>{b.label}</strong> — {flash.resumo}
            {t === "neg" && <span className="ml-auto opacity-80">→ atenção elevada</span>}
            {t === "pos" && <span className="ml-auto opacity-80">→ atenção baixa</span>}
          </div>
        );
      })()}
      {flash && flash.sentimento === "erro" && <p className="text-xs text-destructive">{flash.resumo}</p>}

      {list.length > 0 && (
        <div className="space-y-1.5 pt-1">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60">Últimos feedbacks</p>
          {list.slice(0, 8).map((f) => {
            const b = badge(tone(f.mood));
            return (
              <div key={f.id} className="flex items-center gap-2 text-xs border-t border-border/50 py-1.5">
                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] shrink-0 ${b.cls}`}><b.Icon size={10} /></span>
                <span className="flex-1 text-foreground truncate">{f.note}</span>
                <span className="text-muted-foreground/50 shrink-0">{fmtDate(f.created_at)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
