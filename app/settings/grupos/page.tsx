"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Loader2, Save, RefreshCw, CheckCircle, AlertTriangle } from "lucide-react";
import { authedFetch } from "@/lib/supabase/authed-fetch";

interface GroupOption { id: string; subject: string }
interface Suggestion { groupId: string | null; groupName: string | null; score: number; confidence: "high" | "medium" | "low" | "none" }
interface RowAlerts {
  verbaBaixa: boolean; verbaZerada: boolean; erroConta: boolean;
  semGasto: boolean; campanhaParada: boolean; metaErro: boolean;
}
interface Row {
  clientId: string;
  clientName: string;
  metaAccountId: string;
  currentJid: string | null;
  currentName: string | null;
  suggestion: Suggestion;
  verbaMinima: number | null;
  destino: string;
  alerts: RowAlerts;
}

const ALERT_CHIPS: { key: keyof RowAlerts; label: string }[] = [
  { key: "verbaBaixa", label: "Baixa" },
  { key: "verbaZerada", label: "Zerada" },
  { key: "erroConta", label: "Conta" },
  { key: "semGasto", label: "S/gasto" },
  { key: "campanhaParada", label: "Parada" },
  { key: "metaErro", label: "Meta" },
];

const CONF_STYLE: Record<string, string> = {
  high: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  medium: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  low: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  none: "bg-red-500/10 text-red-400 border-red-500/20",
};
const CONF_LABEL: Record<string, string> = { high: "alta", medium: "média", low: "baixa", none: "sem match" };

export default function GruposPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [sel, setSel] = useState<Record<string, string>>({}); // clientId -> groupJid
  const [verba, setVerba] = useState<Record<string, string>>({}); // clientId -> verba mínima (R$)
  const [dest, setDest] = useState<Record<string, string>>({});   // clientId -> 'interno' | 'cliente'
  const [tog, setTog] = useState<Record<string, RowAlerts>>({});  // clientId -> toggles

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authedFetch("/api/clients/group-mapping");
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Erro ao carregar"); return; }
      setGroups(data.groups ?? []);
      setRows(data.clients ?? []);
      // pré-seleção: já salvo > sugestão (só se confiança >= média)
      const initial: Record<string, string> = {};
      for (const r of data.clients as Row[]) {
        if (r.currentJid) initial[r.clientId] = r.currentJid;
        else if (r.suggestion.groupId && (r.suggestion.confidence === "high" || r.suggestion.confidence === "medium")) {
          initial[r.clientId] = r.suggestion.groupId;
        } else initial[r.clientId] = "";
      }
      setSel(initial);
      const v: Record<string, string> = {}, dd: Record<string, string> = {}, tg: Record<string, RowAlerts> = {};
      for (const r of data.clients as Row[]) {
        v[r.clientId] = r.verbaMinima != null ? String(r.verbaMinima) : "";
        dd[r.clientId] = r.destino || "interno";
        tg[r.clientId] = r.alerts;
      }
      setVerba(v); setDest(dd); setTog(tg);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function save() {
    setSaving(true);
    try {
      const mappings = rows.map((r) => {
        const jid = sel[r.clientId] || null;
        const g = groups.find((x) => x.id === jid);
        const vraw = (verba[r.clientId] ?? "").replace(",", ".").trim();
        const vnum = vraw === "" ? null : Number(vraw);
        return {
          clientId: r.clientId, groupJid: jid, groupName: g?.subject ?? null,
          verbaMinima: vnum != null && Number.isFinite(vnum) ? vnum : null,
          destino: dest[r.clientId] || "interno",
          alerts: tog[r.clientId] ?? r.alerts,
        };
      });
      const res = await authedFetch("/api/clients/group-mapping", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mappings }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Erro ao salvar"); return; }
      toast.success(`${data.updated} cliente(s) salvos`);
      await load();
    } finally { setSaving(false); }
  }

  const mappedCount = Object.values(sel).filter(Boolean).length;

  if (loading) {
    return <div className="flex-1 flex items-center justify-center py-20"><Loader2 className="animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="max-w-[1100px] mx-auto px-6 py-6 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Grupos dos Clientes (WhatsApp)</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Vincule cada cliente ao seu grupo. ⚠️ Confira os de confiança baixa/sem match — o relatório vai
            pro grupo escolhido aqui. {mappedCount}/{rows.length} vinculados.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={load} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-surface border border-border text-xs hover:border-primary/30">
            <RefreshCw size={12} /> Recarregar
          </button>
          <button onClick={save} disabled={saving} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0d4af5] hover:bg-[#1a56ff] text-white text-xs font-medium disabled:opacity-50">
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Salvar
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        <div className="grid grid-cols-[1.1fr_1.3fr_100px_95px_210px_70px] gap-3 px-4 py-2.5 bg-[#0c0c0f] border-b border-border">
          {["Cliente", "Grupo WhatsApp", "Verba mín (R$)", "Destino", "Alertas", "Confiança"].map((h) => (
            <p key={h} className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">{h}</p>
          ))}
        </div>
        {rows.map((r) => {
          const conf = r.suggestion.confidence;
          const needsReview = !sel[r.clientId] || conf === "low" || conf === "none";
          return (
            <div key={r.clientId} className={`grid grid-cols-[1.1fr_1.3fr_100px_95px_210px_70px] gap-3 px-4 py-2.5 border-b border-border last:border-0 items-center ${needsReview ? "bg-amber-500/[0.03]" : ""}`}>
              <p className="text-sm text-foreground truncate" title={r.metaAccountId}>{r.clientName}</p>
              <select
                value={sel[r.clientId] ?? ""}
                onChange={(e) => setSel((s) => ({ ...s, [r.clientId]: e.target.value }))}
                className="w-full bg-surface border border-border rounded-lg px-2 py-1.5 text-xs text-foreground outline-none focus:border-[#0d4af5]/50"
              >
                <option value="">— selecionar grupo —</option>
                {groups.map((g) => <option key={g.id} value={g.id}>{g.subject}</option>)}
              </select>
              <input
                type="text" inputMode="decimal" placeholder="% global"
                value={verba[r.clientId] ?? ""}
                onChange={(e) => setVerba((s) => ({ ...s, [r.clientId]: e.target.value }))}
                title="Verba mínima em R$ para alerta de saldo baixo. Vazio = usa o % global."
                className="w-full bg-surface border border-border rounded-lg px-2 py-1.5 text-xs text-foreground outline-none focus:border-[#0d4af5]/50"
              />
              <select
                value={dest[r.clientId] ?? "interno"}
                onChange={(e) => setDest((s) => ({ ...s, [r.clientId]: e.target.value }))}
                title="Para qual grupo os alertas operacionais deste cliente vão."
                className="w-full bg-surface border border-border rounded-lg px-2 py-1.5 text-xs text-foreground outline-none focus:border-[#0d4af5]/50"
              >
                <option value="interno">Interno</option>
                <option value="cliente">Cliente</option>
              </select>
              <div className="flex flex-wrap gap-1">
                {ALERT_CHIPS.map(({ key, label }) => {
                  const on = tog[r.clientId]?.[key] ?? r.alerts[key];
                  return (
                    <button
                      key={key}
                      type="button"
                      title={`${label} — clique pra ligar/desligar`}
                      onClick={() => setTog((s) => ({ ...s, [r.clientId]: { ...(s[r.clientId] ?? r.alerts), [key]: !on } }))}
                      className={`text-[9px] px-1.5 py-0.5 rounded border transition-colors ${on ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" : "bg-surface text-muted-foreground border-border"}`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded-full border text-center ${CONF_STYLE[conf]}`}>
                {needsReview && conf !== "high" ? <AlertTriangle size={9} className="inline mr-0.5" /> : <CheckCircle size={9} className="inline mr-0.5" />}
                {CONF_LABEL[conf]}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
