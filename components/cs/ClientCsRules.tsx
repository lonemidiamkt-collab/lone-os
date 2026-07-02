"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, X, Bot, Hand, Loader2, ScrollText } from "lucide-react";
import { authedFetch } from "@/lib/supabase/authed-fetch";
import type { CsClientRule, CsRuleEscopo } from "@/lib/types";

const ESCOPOS: { value: CsRuleEscopo; label: string }[] = [
  { value: "sempre", label: "Sempre" },
  { value: "promocao", label: "Promoção" },
  { value: "arte", label: "Arte" },
  { value: "social", label: "Social" },
  { value: "trafego", label: "Tráfego" },
];

const ESCOPO_LABEL: Record<CsRuleEscopo, string> = {
  sempre: "Sempre", promocao: "Promoção", arte: "Arte", social: "Social", trafego: "Tráfego", roteiro: "Roteiro",
};

/**
 * Do's & don'ts estruturados do Agente CS para um cliente.
 * O agente injeta essas regras no briefing (A3) e aprende novas sozinho (origem "aprendido").
 */
export default function ClientCsRules({ clientId }: { clientId: string }) {
  const [rules, setRules] = useState<CsClientRule[] | null>(null);
  const [texto, setTexto] = useState("");
  const [escopo, setEscopo] = useState<CsRuleEscopo>("sempre");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await authedFetch(`/api/cs/client-rules?clientId=${clientId}`);
      const data = await res.json().catch(() => ({ rules: [] }));
      setRules(res.ok ? (data.rules ?? []) : []);
    } catch {
      setRules([]);
    }
  }, [clientId]);

  useEffect(() => { load(); }, [load]);

  const add = async () => {
    const t = texto.trim();
    if (!t || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await authedFetch("/api/cs/client-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, texto: t, escopo }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || "Falha ao salvar a regra");
        return;
      }
      setTexto("");
      setEscopo("sempre");
      await load();
    } catch {
      setError("Falha de conexão");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    setRules((prev) => prev?.filter((r) => r.id !== id) ?? null); // otimista
    try {
      const res = await authedFetch(`/api/cs/client-rules?id=${id}`, { method: "DELETE" });
      if (!res.ok) await load(); // reverte se falhou
    } catch {
      await load();
    }
  };

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <ScrollText size={15} className="text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Regras do Agente CS</h3>
        <span className="text-[10px] text-muted-foreground">(do&apos;s &amp; don&apos;ts que o agente segue e aprende)</span>
      </div>

      {/* Lista */}
      {rules === null ? (
        <div className="flex items-center gap-2 text-muted-foreground text-xs py-3">
          <Loader2 size={13} className="animate-spin" /> Carregando…
        </div>
      ) : rules.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">
          Nenhuma regra ainda. Adicione do&apos;s &amp; don&apos;ts (ex.: &quot;Entrega 8h–17h&quot;, &quot;Logo sempre no canto direito&quot;) — o agente também aprende sozinho conversando no grupo.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {rules.map((r) => (
            <li key={r.id} className="flex items-center gap-2 group bg-muted/40 border border-border rounded-lg px-2.5 py-1.5">
              <span
                title={r.origem === "aprendido" ? "Aprendido pelo agente" : "Cadastrado manualmente"}
                className={r.origem === "aprendido" ? "text-primary shrink-0" : "text-muted-foreground shrink-0"}
              >
                {r.origem === "aprendido" ? <Bot size={13} /> : <Hand size={13} />}
              </span>
              <span className="flex-1 text-xs text-foreground leading-tight">{r.texto}</span>
              <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20 shrink-0">
                {ESCOPO_LABEL[r.escopo]}
              </span>
              <button
                onClick={() => remove(r.id)}
                title="Remover regra"
                className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
              >
                <X size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Adicionar */}
      <div className="flex items-center gap-2 pt-1">
        <input
          value={texto}
          onChange={(e) => { setTexto(e.target.value); setError(null); }}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="Nova regra (ex.: nunca usar a cor vermelha)"
          className="flex-1 bg-muted border border-border rounded-lg px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary"
        />
        <select
          value={escopo}
          onChange={(e) => setEscopo(e.target.value as CsRuleEscopo)}
          className="bg-muted border border-border rounded-lg px-2 py-1.5 text-xs text-foreground outline-none focus:border-primary"
        >
          {ESCOPOS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <button
          onClick={add}
          disabled={!texto.trim() || saving}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/80 transition-colors disabled:opacity-40"
        >
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Add
        </button>
      </div>
      {error && <p className="text-[10px] text-destructive">{error}</p>}
    </div>
  );
}
