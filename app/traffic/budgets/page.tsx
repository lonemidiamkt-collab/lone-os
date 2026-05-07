"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  RefreshCw, Settings, MessageCircle, AlertTriangle, CheckCircle,
  Clock, Wifi, WifiOff, ChevronUp, ChevronDown, ChevronsUpDown,
  Filter, X, Loader2,
} from "lucide-react";
import { authedFetch } from "@/lib/supabase/authed-fetch";
import {
  formatDaysRemaining,
  getBalanceSeverity,
  getAccountStatusLabel,
  type BalanceSeverity,
} from "@/lib/meta/account-balance";
import { cn } from "@/lib/utils";

// ── Tipos ────────────────────────────────────────────────────

interface AlertRule {
  id: string;
  severity: "warning" | "critical";
  threshold_value: number;
  is_active: boolean;
}

interface AdAccountRow {
  id: string;
  meta_account_id: string;
  account_name: string | null;
  is_prepaid: boolean;
  spend_cap: number | null;
  last_balance: number | null;
  last_amount_spent: number | null;
  daily_spend_3d: number[] | null;
  last_synced_at: string | null;
  currency: string;
  account_status: number | null;
  sync_error: string | null;
  clients: {
    id: string;
    name: string;
    nome_fantasia: string | null;
    client_finance_phone: string | null;
    client_pix_key: string | null;
  };
  budget_alert_rules: AlertRule[];
}

interface EnrichedAccount extends AdAccountRow {
  clientName: string;
  availableBalance: number | null;
  daysRemaining: number | null;
  avgDailySpend: number | null;
  severity: BalanceSeverity;
  warningThreshold: number | null;
  criticalThreshold: number | null;
}

// ── Helpers ───────────────────────────────────────────────────

function enrichAccount(a: AdAccountRow): EnrichedAccount {
  const clientName = a.clients?.nome_fantasia || a.clients?.name || "—";

  const available = a.last_balance;
  const daily = a.daily_spend_3d ?? [];
  const validDaily = daily.filter((v) => v > 0);
  const avgDailySpend = validDaily.length > 0
    ? validDaily.reduce((s, v) => s + v, 0) / validDaily.length
    : null;
  const daysRemaining = available !== null && avgDailySpend
    ? available / avgDailySpend
    : null;

  const warningThreshold = a.budget_alert_rules?.find(
    (r) => r.severity === "warning" && r.is_active,
  )?.threshold_value ?? null;
  const criticalThreshold = a.budget_alert_rules?.find(
    (r) => r.severity === "critical" && r.is_active,
  )?.threshold_value ?? null;

  const severity = getBalanceSeverity(
    available ?? 0,
    daysRemaining,
    a.account_status ?? 0,
    warningThreshold,
    criticalThreshold,
  );

  return { ...a, clientName, availableBalance: available, daysRemaining, avgDailySpend, severity, warningThreshold, criticalThreshold };
}

const SEVERITY_ORDER: Record<BalanceSeverity, number> = {
  critical: 0,
  warning: 1,
  ok: 2,
  disabled: 3,
  error: 4,
};

function sortAccounts(accounts: EnrichedAccount[]): EnrichedAccount[] {
  return [...accounts].sort((a, b) => {
    const so = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (so !== 0) return so;
    // dentro do grupo: dias restantes ascendente (quem vai acabar antes fica no topo)
    const da = a.daysRemaining ?? Infinity;
    const db = b.daysRemaining ?? Infinity;
    return da - db;
  });
}

function formatBRL(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function timeSince(iso: string | null): string {
  if (!iso) return "nunca";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "agora";
  if (diff < 3600) return `há ${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `há ${Math.floor(diff / 3600)}h`;
  return `há ${Math.floor(diff / 86400)}d`;
}

// ── Componentes de célula ─────────────────────────────────────

function SeverityDot({ severity }: { severity: BalanceSeverity }) {
  const styles: Record<BalanceSeverity, string> = {
    critical: "bg-[#E24B4A] shadow-[0_0_0_4px_rgba(226,75,74,0.15)]",
    warning:  "bg-[#BA7517] shadow-[0_0_0_4px_rgba(186,117,23,0.12)]",
    ok:       "bg-emerald-500",
    disabled: "bg-zinc-600",
    error:    "bg-zinc-500",
  };
  return <span className={cn("inline-block w-2 h-2 rounded-full shrink-0", styles[severity])} />;
}

function StatusBadge({ status, syncError, severity }: { status: number | null; syncError: string | null; severity: BalanceSeverity }) {
  if (syncError) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700">
        <WifiOff size={9} /> Erro sync
      </span>
    );
  }
  if (severity === "critical") {
    const label = (status !== null && status !== 1) ? getAccountStatusLabel(status) : "Crítico";
    return (
      <span className="text-[10px] px-2 py-0.5 rounded-full bg-[rgba(226,75,74,0.12)] text-[#E24B4A] border border-[rgba(226,75,74,0.25)] font-medium">
        {label}
      </span>
    );
  }
  if (severity === "warning") {
    return (
      <span className="text-[10px] px-2 py-0.5 rounded-full bg-[rgba(186,117,23,0.10)] text-[#BA7517] border border-[rgba(186,117,23,0.20)] font-medium">
        Atenção
      </span>
    );
  }
  if (severity === "disabled") {
    return (
      <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-500 border border-zinc-700">
        {getAccountStatusLabel(status)}
      </span>
    );
  }
  return (
    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
      Ativa
    </span>
  );
}

// ── Modal de configuração de alertas ─────────────────────────

interface AlertModalProps {
  account: EnrichedAccount;
  onClose: () => void;
  onSaved: () => void;
}

function AlertModal({ account, onClose, onSaved }: AlertModalProps) {
  const [isPrepaid, setIsPrepaid] = useState(account.is_prepaid);
  const [spendCap, setSpendCap] = useState(account.spend_cap?.toFixed(2) ?? "");
  const [phone, setPhone] = useState(account.clients?.client_finance_phone ?? "");
  const [pixKey, setPixKey] = useState(account.clients?.client_pix_key ?? "");

  const warningDefault = account.warningThreshold ?? 200;
  const criticalDefault = account.criticalThreshold ?? 80;

  const [warning, setWarning] = useState({
    threshold: warningDefault.toFixed(2),
    interval: "6",
    maxNotif: "3",
    channels: ["whatsapp"] as string[],
    active: !!account.budget_alert_rules?.find((r) => r.severity === "warning"),
  });
  const [critical, setCritical] = useState({
    threshold: criticalDefault.toFixed(2),
    interval: "4",
    maxNotif: "5",
    channels: ["whatsapp"] as string[],
    active: !!account.budget_alert_rules?.find((r) => r.severity === "critical"),
  });

  const [saving, setSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const CHANNEL_OPTIONS = ["whatsapp", "slack", "email"];

  function toggleChannel(setter: typeof setWarning, ch: string) {
    setter((prev) => ({
      ...prev,
      channels: prev.channels.includes(ch)
        ? prev.channels.filter((c) => c !== ch)
        : [...prev.channels, ch],
    }));
  }

  async function handleSave() {
    setValidationError(null);
    const wt = parseFloat(warning.threshold);
    const ct = parseFloat(critical.threshold);

    if (warning.active && critical.active && ct >= wt) {
      setValidationError("Threshold crítico deve ser menor que o de atenção");
      return;
    }
    if ((warning.active && warning.channels.length === 0) ||
        (critical.active && critical.channels.length === 0)) {
      setValidationError("Selecione ao menos 1 canal de notificação");
      return;
    }

    const rules = [];
    if (warning.active) {
      rules.push({
        severity: "warning" as const,
        threshold_value: wt,
        repeat_interval_hours: parseInt(warning.interval),
        max_notifications: parseInt(warning.maxNotif),
        channels: warning.channels,
        is_active: true,
      });
    }
    if (critical.active) {
      rules.push({
        severity: "critical" as const,
        threshold_value: ct,
        repeat_interval_hours: parseInt(critical.interval),
        max_notifications: parseInt(critical.maxNotif),
        channels: critical.channels,
        is_active: true,
      });
    }

    setSaving(true);
    try {
      const res = await authedFetch("/api/traffic/budget-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adAccountId: account.id,
          isPrepaid,
          spendCap: spendCap ? parseFloat(spendCap) : null,
          rules,
          phone: phone || null,
          pixKey: pixKey || null,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        setValidationError(d.error ?? "Erro ao salvar");
        return;
      }
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const RuleBlock = ({
    color,
    label,
    rule,
    setter,
  }: {
    color: "warning" | "critical";
    label: string;
    rule: typeof warning;
    setter: typeof setWarning;
  }) => {
    const borderColor = color === "critical" ? "border-[#E24B4A]/25" : "border-[#BA7517]/25";
    const bgColor = color === "critical" ? "bg-[rgba(226,75,74,0.04)]" : "bg-[rgba(186,117,23,0.04)]";
    const textColor = color === "critical" ? "text-[#E24B4A]" : "text-[#BA7517]";
    const dotColor = color === "critical" ? "bg-[#E24B4A]" : "bg-[#BA7517]";

    return (
      <div className={cn("rounded-xl border p-4 space-y-3", borderColor, bgColor)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={cn("w-2 h-2 rounded-full", dotColor)} />
            <p className={cn("text-xs font-semibold", textColor)}>{label}</p>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <span className="text-[10px] text-zinc-500">Ativo</span>
            <div
              onClick={() => setter((p) => ({ ...p, active: !p.active }))}
              className={cn(
                "w-8 h-4 rounded-full transition-colors cursor-pointer",
                rule.active ? (color === "critical" ? "bg-[#E24B4A]" : "bg-[#BA7517]") : "bg-zinc-700",
              )}
            >
              <div className={cn(
                "w-3 h-3 bg-white rounded-full mt-0.5 transition-transform",
                rule.active ? "translate-x-4" : "translate-x-0.5",
              )} />
            </div>
          </label>
        </div>

        {rule.active && (
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Threshold (R$)</p>
              <input
                type="number" min="0" step="10"
                value={rule.threshold}
                onChange={(e) => setter((p) => ({ ...p, threshold: e.target.value }))}
                className="w-full bg-surface border border-border rounded-lg px-2 py-1.5 text-sm text-foreground outline-none focus:border-[#0d4af5]/50"
              />
            </div>
            <div className="space-y-1">
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Intervalo (h)</p>
              <input
                type="number" min="1" max="24"
                value={rule.interval}
                onChange={(e) => setter((p) => ({ ...p, interval: e.target.value }))}
                className="w-full bg-surface border border-border rounded-lg px-2 py-1.5 text-sm text-foreground outline-none focus:border-[#0d4af5]/50"
              />
            </div>
            <div className="space-y-1">
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Máx. avisos</p>
              <input
                type="number" min="1" max="20"
                value={rule.maxNotif}
                onChange={(e) => setter((p) => ({ ...p, maxNotif: e.target.value }))}
                className="w-full bg-surface border border-border rounded-lg px-2 py-1.5 text-sm text-foreground outline-none focus:border-[#0d4af5]/50"
              />
            </div>
          </div>
        )}

        {rule.active && (
          <div className="space-y-1">
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Canais</p>
            <div className="flex gap-2 flex-wrap">
              {CHANNEL_OPTIONS.map((ch) => (
                <button
                  key={ch}
                  type="button"
                  onClick={() => toggleChannel(setter, ch)}
                  className={cn(
                    "text-[10px] px-2.5 py-1 rounded-full border transition-all capitalize",
                    rule.channels.includes(ch)
                      ? color === "critical"
                        ? "bg-[rgba(226,75,74,0.15)] border-[rgba(226,75,74,0.4)] text-[#E24B4A]"
                        : "bg-[rgba(186,117,23,0.15)] border-[rgba(186,117,23,0.4)] text-[#BA7517]"
                      : "bg-surface border-border text-zinc-500 hover:border-zinc-500",
                  )}
                >
                  {ch}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[#111114] border border-zinc-800 rounded-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="p-5 border-b border-zinc-800 flex items-start justify-between">
          <div>
            <p className="text-sm font-semibold text-white">{account.clientName}</p>
            <p className="text-[11px] text-zinc-500 mt-0.5 font-mono">{account.meta_account_id}</p>
            <div className="flex items-center gap-2 mt-1.5">
              <span className={cn(
                "text-[10px] px-2 py-0.5 rounded-full border",
                account.is_prepaid
                  ? "bg-blue-500/10 border-blue-500/20 text-blue-400"
                  : "bg-purple-500/10 border-purple-500/20 text-purple-400",
              )}>
                {account.is_prepaid ? "Pré-pago" : "Pós-pago"}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Tipo de cobrança */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Tipo de cobrança</p>
              <select
                value={isPrepaid ? "prepaid" : "postpaid"}
                onChange={(e) => setIsPrepaid(e.target.value === "prepaid")}
                className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-[#0d4af5]/50"
              >
                <option value="prepaid">Pré-pago</option>
                <option value="postpaid">Pós-pago</option>
              </select>
            </div>
            {!isPrepaid && (
              <div className="space-y-1">
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Spend cap (R$)</p>
                <input
                  type="number" min="0" step="100"
                  value={spendCap}
                  onChange={(e) => setSpendCap(e.target.value)}
                  placeholder="ex: 2000.00"
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-[#0d4af5]/50"
                />
              </div>
            )}
          </div>

          {/* Contexto azul */}
          <div className="rounded-lg bg-[#0d4af5]/[0.06] border border-[#0d4af5]/20 p-3">
            <p className="text-[11px] text-[#6b9af5] leading-relaxed">
              {isPrepaid
                ? "Pré-pago: saldo disponível = valor em conta (Meta retorna em centavos). Quando zera, campanhas pausam automaticamente."
                : "Pós-pago: saldo disponível = spend_cap − amount_spent no ciclo atual. Sem spend_cap, a conta não tem limite definido."}
            </p>
          </div>

          {/* Contato financeiro */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Tel. financeiro (WA)</p>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="5522999999999"
                className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-[#0d4af5]/50"
              />
            </div>
            <div className="space-y-1">
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Chave Pix</p>
              <input
                type="text"
                value={pixKey}
                onChange={(e) => setPixKey(e.target.value)}
                placeholder="CPF, e-mail ou telefone"
                className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-[#0d4af5]/50"
              />
            </div>
          </div>

          {/* Regras */}
          <div className="space-y-3">
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Regras de alerta</p>
            <RuleBlock color="warning"  label="Atenção"  rule={warning}  setter={setWarning}  />
            <RuleBlock color="critical" label="Crítico"  rule={critical} setter={setCritical} />
          </div>

          {validationError && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
              <AlertTriangle size={13} className="text-red-400 shrink-0" />
              <p className="text-xs text-red-400">{validationError}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-zinc-800 flex justify-end gap-3">
          <button onClick={onClose} className="btn-ghost text-xs border border-border px-4">Cancelar</button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0d4af5] hover:bg-[#1a56ff] text-white text-xs font-medium transition-all disabled:opacity-50"
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────

export default function BudgetsPage() {
  const [accounts, setAccounts] = useState<EnrichedAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [filterSeverity, setFilterSeverity] = useState<BalanceSeverity | "all">("all");
  const [modalAccount, setModalAccount] = useState<EnrichedAccount | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await authedFetch("/api/traffic/sync-balances");
      if (!res.ok) return;
      const data = await res.json();
      const raw: AdAccountRow[] = data.accounts ?? [];
      const enriched = sortAccounts(raw.map(enrichAccount));
      setAccounts(enriched);
      // Última sync = o valor mais recente entre todas as contas
      const latest = enriched
        .map((a) => a.last_synced_at)
        .filter(Boolean)
        .sort()
        .at(-1) ?? null;
      setLastSyncAt(latest);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    try {
      await authedFetch("/api/traffic/sync-balances", { method: "POST" });
      await load();
    } finally {
      setSyncing(false);
    }
  }, [load]);

  useEffect(() => {
    load();
    // Auto-refresh a cada 5 minutos
    intervalRef.current = setInterval(load, 5 * 60_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [load]);

  // ── Dados computados ─────────────────────────────────────
  const filtered = filterSeverity === "all"
    ? accounts
    : accounts.filter((a) => a.severity === filterSeverity);

  const totalBalance = accounts
    .filter((a) => a.availableBalance !== null && a.availableBalance !== Infinity && a.account_status === 1)
    .reduce((s, a) => s + (a.availableBalance ?? 0), 0);

  const criticalCount = accounts.filter((a) => a.severity === "critical").length;
  const warningCount  = accounts.filter((a) => a.severity === "warning").length;

  // Alerta de sync desatualizado (>30min)
  const syncStale = lastSyncAt
    ? (Date.now() - new Date(lastSyncAt).getTime()) > 30 * 60_000
    : false;

  // ── WhatsApp link ─────────────────────────────────────────
  function buildWaLink(account: EnrichedAccount): string {
    const phone = account.clients?.client_finance_phone;
    if (!phone) return "";
    const clientName = account.clientName;
    const balance = formatBRL(account.availableBalance);
    const pix = account.clients?.client_pix_key ?? "—";
    const text = encodeURIComponent(
      `Oi ${clientName}! Sua conta de anúncios está em ${balance}. Pode fazer um Pix pra não pausar as campanhas? Chave: ${pix}`
    );
    return `https://wa.me/${phone.replace(/\D/g, "")}?text=${text}`;
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 size={20} className="animate-spin text-zinc-500" />
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 overflow-auto bg-background">
      <div className="max-w-[1400px] w-full mx-auto px-6 py-6 space-y-5">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold text-foreground">Monitoramento de Saldos</h1>
            <div className="flex items-center gap-1.5 mt-1">
              {syncStale
                ? <WifiOff size={11} className="text-amber-400" />
                : <Wifi size={11} className="text-zinc-500" />}
              <p className={cn("text-[11px]", syncStale ? "text-amber-400" : "text-zinc-500")}>
                {syncStale
                  ? `Última sincronização ${timeSince(lastSyncAt)} — verificar conexão Meta`
                  : `Última sincronização Meta API · ${timeSince(lastSyncAt)}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleSync}
              disabled={syncing}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-surface border border-border text-xs text-foreground hover:border-[#0d4af5]/30 hover:text-[#0d4af5] transition-all disabled:opacity-50"
            >
              <RefreshCw size={12} className={syncing ? "animate-spin" : ""} />
              {syncing ? "Sincronizando..." : "Sincronizar"}
            </button>
          </div>
        </div>

        {/* Aviso sync desatualizado */}
        {syncStale && (
          <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-amber-500/[0.06] border border-amber-500/20">
            <AlertTriangle size={13} className="text-amber-400 shrink-0" />
            <p className="text-xs text-amber-300">
              Dados desatualizados há mais de 30 minutos. Clique em "Sincronizar" ou verifique o token Meta.
            </p>
          </div>
        )}

        {/* Cards de resumo */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            {
              label: "Total de contas",
              value: accounts.length,
              sub: "cadastradas",
              onClick: () => setFilterSeverity("all"),
              active: filterSeverity === "all",
              color: "text-foreground",
            },
            {
              label: "Saldo agregado",
              value: formatBRL(totalBalance),
              sub: "contas ativas",
              onClick: () => setFilterSeverity("ok"),
              active: filterSeverity === "ok",
              color: "text-emerald-400",
            },
            {
              label: "Atenção",
              value: warningCount,
              sub: "contas amarelas",
              onClick: () => setFilterSeverity(filterSeverity === "warning" ? "all" : "warning"),
              active: filterSeverity === "warning",
              color: "text-[#BA7517]",
            },
            {
              label: "Críticos",
              value: criticalCount,
              sub: "ação imediata",
              onClick: () => setFilterSeverity(filterSeverity === "critical" ? "all" : "critical"),
              active: filterSeverity === "critical",
              color: "text-[#E24B4A]",
            },
          ].map((card) => (
            <button
              key={card.label}
              onClick={card.onClick}
              className={cn(
                "text-left p-4 rounded-xl border transition-all",
                card.active
                  ? "bg-primary/5 border-primary/25"
                  : "bg-card border-border hover:border-zinc-700",
              )}
            >
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1.5">{card.label}</p>
              <p className={cn("text-2xl font-bold", card.color)}>{card.value}</p>
              <p className="text-[10px] text-zinc-600 mt-0.5">{card.sub}</p>
            </button>
          ))}
        </div>

        {/* Filtro ativo */}
        {filterSeverity !== "all" && (
          <div className="flex items-center gap-2">
            <Filter size={12} className="text-zinc-500" />
            <span className="text-xs text-zinc-400">
              Mostrando apenas:
              <span className="ml-1 font-medium text-foreground capitalize">{filterSeverity}</span>
            </span>
            <button onClick={() => setFilterSeverity("all")} className="text-zinc-600 hover:text-zinc-300 transition-colors">
              <X size={12} />
            </button>
          </div>
        )}

        {/* Tabela */}
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-zinc-600">
            <CheckCircle size={24} className="mb-2 text-zinc-700" />
            <p className="text-sm">
              {accounts.length === 0
                ? "Nenhuma conta Meta cadastrada ainda"
                : "Nenhuma conta nessa categoria"}
            </p>
            {accounts.length === 0 && (
              <p className="text-xs mt-1">Adicione o ID da conta Meta em cada cliente para começar o monitoramento</p>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-border overflow-hidden">
            {/* Cabeçalho */}
            <div className="grid grid-cols-[24px_1fr_100px_130px_80px_100px_80px] gap-3 px-4 py-2.5 bg-[#0c0c0f] border-b border-border">
              {["", "Cliente / Conta", "Status", "Saldo disponível", "Dias", "Gasto/dia", "Ações"].map((h) => (
                <p key={h} className="text-[10px] text-zinc-600 uppercase tracking-wider font-medium">{h}</p>
              ))}
            </div>

            {/* Linhas */}
            {filtered.map((account) => {
              const isCritical = account.severity === "critical";
              const isWarning  = account.severity === "warning";
              const isDisabled = account.severity === "disabled";
              const waLink = buildWaLink(account);

              return (
                <div
                  key={account.id}
                  className={cn(
                    "grid grid-cols-[24px_1fr_100px_130px_80px_100px_80px] gap-3 px-4 py-3 border-b border-border last:border-b-0 items-center transition-colors hover:bg-white/[0.02]",
                    isCritical && "bg-[rgba(226,75,74,0.04)] border-l-[3px] border-l-[#E24B4A]",
                    isWarning  && "bg-[rgba(186,117,23,0.03)] border-l-[3px] border-l-[#BA7517]",
                    isDisabled && "opacity-50",
                  )}
                >
                  {/* Dot */}
                  <div className="flex items-center justify-center">
                    <SeverityDot severity={account.severity} />
                  </div>

                  {/* Cliente / Conta */}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{account.clientName}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-[10px] text-zinc-600 font-mono truncate">{account.meta_account_id}</p>
                      <span className={cn(
                        "text-[9px] px-1.5 py-0.5 rounded border",
                        account.is_prepaid
                          ? "text-blue-400 border-blue-500/20 bg-blue-500/[0.06]"
                          : "text-purple-400 border-purple-500/20 bg-purple-500/[0.06]",
                      )}>
                        {account.is_prepaid ? "pré" : "pós"}
                      </span>
                    </div>
                  </div>

                  {/* Status */}
                  <div>
                    <StatusBadge
                      status={account.account_status}
                      syncError={account.sync_error}
                      severity={account.severity}
                    />
                    {account.sync_error && (
                      <p className="text-[9px] text-zinc-600 mt-0.5 truncate" title={account.sync_error}>
                        {account.sync_error.slice(0, 30)}
                      </p>
                    )}
                  </div>

                  {/* Saldo disponível */}
                  <div>
                    <p className={cn(
                      "text-[15px] font-semibold leading-tight",
                      isCritical ? "text-[#E24B4A]" : isWarning ? "text-[#BA7517]" : "text-foreground",
                    )}>
                      {account.availableBalance !== null && account.availableBalance !== Infinity
                        ? formatBRL(account.availableBalance)
                        : account.availableBalance === Infinity ? "Sem cap" : "—"}
                    </p>
                    <p className="text-[10px] text-zinc-600 mt-0.5">
                      {account.is_prepaid
                        ? account.spend_cap ? `Limite ${formatBRL(account.spend_cap)}` : "Saldo em conta"
                        : account.spend_cap
                          ? `Cap ${formatBRL(account.spend_cap)} · gasto ${formatBRL(account.last_amount_spent)}`
                          : "Sem cap definido"}
                    </p>
                  </div>

                  {/* Dias restantes */}
                  <div>
                    <p className={cn(
                      "text-sm font-medium",
                      account.daysRemaining !== null && account.daysRemaining <= 1
                        ? "text-[#E24B4A]"
                        : "text-foreground",
                    )}>
                      {formatDaysRemaining(account.daysRemaining)}
                    </p>
                  </div>

                  {/* Gasto médio */}
                  <div>
                    <p className="text-sm text-foreground">
                      {account.avgDailySpend !== null ? formatBRL(account.avgDailySpend) : "—"}
                    </p>
                    {account.avgDailySpend !== null && (
                      <p className="text-[10px] text-zinc-600">/dia</p>
                    )}
                  </div>

                  {/* Ações */}
                  <div className="flex items-center gap-1.5">
                    {waLink ? (
                      <a
                        href={waLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={`WhatsApp financeiro — ${account.clientName}`}
                        className={cn(
                          "p-1.5 rounded-lg border transition-all",
                          isCritical
                            ? "text-[#E24B4A] border-[rgba(226,75,74,0.25)] hover:bg-[rgba(226,75,74,0.10)]"
                            : "text-zinc-500 border-border hover:text-emerald-400 hover:border-emerald-500/30",
                        )}
                      >
                        <MessageCircle size={13} />
                      </a>
                    ) : (
                      <button
                        disabled
                        title="Cadastre o telefone financeiro nas configurações"
                        className="p-1.5 rounded-lg border border-border text-zinc-700 cursor-not-allowed"
                      >
                        <MessageCircle size={13} />
                      </button>
                    )}
                    <button
                      onClick={() => setModalAccount(account)}
                      title="Configurar alertas"
                      className="p-1.5 rounded-lg border border-border text-zinc-500 hover:text-foreground hover:border-zinc-500 transition-all"
                    >
                      <Settings size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Legenda */}
        <div className="flex items-center gap-6 text-[10px] text-zinc-600 pt-1">
          {[
            { color: "bg-[#E24B4A]", label: "Crítico (saldo ≤ threshold ou ≤1d)" },
            { color: "bg-[#BA7517]", label: "Atenção (saldo ≤ threshold ou ≤3d)" },
            { color: "bg-emerald-500", label: "Ativa (OK)" },
            { color: "bg-zinc-600", label: "Desativada / fora de operação" },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-1.5">
              <span className={cn("w-2 h-2 rounded-full", item.color)} />
              {item.label}
            </div>
          ))}
        </div>
      </div>

      {/* Modal */}
      {modalAccount && (
        <AlertModal
          account={modalAccount}
          onClose={() => setModalAccount(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}
