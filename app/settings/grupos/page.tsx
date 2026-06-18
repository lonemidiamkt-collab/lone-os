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
  monthlyBudget: number | null;
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
  high: "bg-lone-success-bg text-lone-success border-lone-success-border",
  medium: "bg-lone-warning-bg text-lone-warning border-lone-warning-border",
  low: "bg-lone-warning-bg text-lone-warning border-lone-warning-border",
  none: "bg-destructive/10 text-destructive border-destructive/20",
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
  const [warnPct, setWarnPct] = useState(18); // % global da verba p/ alerta de saldo baixo (sincronizado)
  const [critPct, setCritPct] = useState(10); // % crítico (segundo nível)

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authedFetch("/api/clients/group-mapping");
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Erro ao carregar"); return; }
      setGroups(data.groups ?? []);
      setRows(data.clients ?? []);
      if (typeof data.warningPct === "number") setWarnPct(data.warningPct);
      if (typeof data.criticalPct === "number") setCritPct(data.criticalPct);
      if (data.groupsError) {
        toast.warning("Lista de grupos da Evolution indisponível agora — os clientes aparecem, mas o seletor de grupo pode estar limitado. Tente Recarregar.");
      }
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
          <p className="text-[11px] text-muted-foreground mt-1">
            💡 A coluna <b className="text-foreground">Verba mín</b> vem <b className="text-foreground">sincronizada</b> do Controle de Investimento. Alerta em 2 níveis: <b className="text-foreground">{warnPct}%</b> (baixa) e <b className="text-foreground">{critPct}%</b> (crítica) da verba mensal. Só preencha pra exceções.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={load} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-surface border border-border text-xs hover:border-primary/30">
            <RefreshCw size={12} /> Recarregar
          </button>
          <button onClick={save} disabled={saving} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary hover:bg-primary text-primary-foreground text-xs font-medium disabled:opacity-50">
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Salvar
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        <div className="grid grid-cols-[1.1fr_1.3fr_100px_95px_210px_70px] gap-3 px-4 py-2.5 bg-card border-b border-border">
          {["Cliente", "Grupo WhatsApp", "Verba mín (R$)", "Destino", "Alertas", "Confiança"].map((h) => (
            <p key={h} className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">{h}</p>
          ))}
        </div>
        {rows.map((r) => {
          const conf = r.suggestion.confidence;
          const needsReview = !sel[r.clientId] || conf === "low" || conf === "none";
          return (
            <div key={r.clientId} className={`grid grid-cols-[1.1fr_1.3fr_100px_95px_210px_70px] gap-3 px-4 py-2.5 border-b border-border last:border-0 items-center ${needsReview ? "bg-lone-warning-bg/[0.03]" : ""}`}>
              <p className="text-sm text-foreground truncate" title={r.metaAccountId}>{r.clientName}</p>
              <select
                value={sel[r.clientId] ?? ""}
                onChange={(e) => setSel((s) => ({ ...s, [r.clientId]: e.target.value }))}
                className="w-full bg-surface border border-border rounded-lg px-2 py-1.5 text-xs text-foreground outline-none focus:border-primary/50"
              >
                <option value="">— selecionar grupo —</option>
                {sel[r.clientId] && !groups.some((g) => g.id === sel[r.clientId]) && (
                  <option value={sel[r.clientId]}>{r.currentName ?? sel[r.clientId]}</option>
                )}
                {groups.map((g) => <option key={g.id} value={g.id}>{g.subject}</option>)}
              </select>
              <input
                type="text" inputMode="decimal"
                placeholder={r.monthlyBudget != null ? `sync R$ ${Math.round((r.monthlyBudget * warnPct) / 100)}` : `${warnPct}% global`}
                value={verba[r.clientId] ?? ""}
                onChange={(e) => setVerba((s) => ({ ...s, [r.clientId]: e.target.value }))}
                title={r.monthlyBudget != null
                  ? `Sincronizado (verba R$ ${r.monthlyBudget}): baixa ${warnPct}% = R$ ${Math.round((r.monthlyBudget * warnPct) / 100)} · crítica ${critPct}% = R$ ${Math.round((r.monthlyBudget * critPct) / 100)}. Preencha só pra um limite diferente deste cliente.`
                  : `Verba mínima (R$). Vazio = ${warnPct}% (baixa) / ${critPct}% (crítica) da verba mensal do Controle de Investimento.`}
                className="w-full bg-surface border border-border rounded-lg px-2 py-1.5 text-xs text-foreground outline-none focus:border-primary/50"
              />
              <select
                value={dest[r.clientId] ?? "interno"}
                onChange={(e) => setDest((s) => ({ ...s, [r.clientId]: e.target.value }))}
                title="Para qual grupo os alertas operacionais deste cliente vão."
                className="w-full bg-surface border border-border rounded-lg px-2 py-1.5 text-xs text-foreground outline-none focus:border-primary/50"
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
                      className={`text-[9px] px-1.5 py-0.5 rounded border transition-colors ${on ? "bg-lone-success-bg text-lone-success border-lone-success-border" : "bg-surface text-muted-foreground border-border"}`}
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
