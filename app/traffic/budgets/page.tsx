"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import {
  RefreshCw, Settings, MessageCircle, AlertTriangle, CheckCircle,
  Wifi, WifiOff, Filter, X, Loader2, Plus, Search,
} from "lucide-react";
import { authedFetch } from "@/lib/supabase/authed-fetch";
import {
  formatDaysRemaining,
  getBalanceSeverity,
  type BalanceSeverity,
} from "@/lib/meta/account-balance";
import {
  getBalanceDisplay,
  type DisplaySeverity,
  type BalanceDisplay,
} from "@/lib/budgets/display";
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
  billing_type_source: "auto" | "manual" | null;
  spend_cap: number | null;
  last_balance: number | null;
  last_amount_spent: number | null;
  current_month_spend: number | null;
  last_3d_avg_spend: number | null;
  daily_spend_3d: number[] | null;
  last_synced_at: string | null;
  currency: string;
  account_status: number | null;
  sync_error: string | null;
  last_error_message: string | null;
  monthly_budget: number | null;
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
  balanceLabel: string;
  daysRemaining: number | null;
  avgDailySpend: number | null;
  severity: BalanceSeverity;
  warningThreshold: number | null;
  criticalThreshold: number | null;
  display: BalanceDisplay;
}

// ── Helpers ───────────────────────────────────────────────────

function enrichAccount(a: AdAccountRow): EnrichedAccount {
  const clientName = a.clients?.nome_fantasia || a.clients?.name || "—";
  const cur = a.currency || "BRL";

  // Cálculo de saldo disponível:
  // Pós-pago com verba mensal → monthly_budget − current_month_spend (Insights this_month).
  //   NÃO usamos last_amount_spent (amount_spent do endpoint da conta, pode ser vitalício).
  //   Se current_month_spend ainda não foi sincronizado, saldo é null (exibe "—" na tela).
  // Outros → last_balance já calculado no sync (display_string ou spend_cap - amount_spent).
  let available: number | null;
  let balanceLabel: string;

  if (!a.is_prepaid && a.monthly_budget !== null) {
    const spent = a.current_month_spend;
    available = spent !== null ? Math.max(0, a.monthly_budget - spent) : null;
    balanceLabel = spent !== null
      ? `Verba ${formatCurrency(a.monthly_budget, cur)} · gasto ${formatCurrency(spent, cur)}`
      : "Verba mensal · sync pendente";
  } else {
    available = a.last_balance;
    if (a.is_prepaid) {
      balanceLabel = "Saldo em conta";
    } else if (available === null) {
      balanceLabel = "Sem cap definido";
    } else {
      const cap = a.spend_cap;
      const spent = a.last_amount_spent;
      balanceLabel = cap ? `Cap ${formatCurrency(cap, cur)} · gasto ${formatCurrency(spent, cur)}` : "Cap − gasto";
    }
  }

  // Gasto médio: usa last_3d_avg_spend (de Insights API) se disponível,
  // senão tenta daily_spend_3d legado
  let avgDailySpend: number | null = a.last_3d_avg_spend ?? null;
  if (avgDailySpend === null) {
    const legacy = (a.daily_spend_3d ?? []).filter((v) => v > 0);
    avgDailySpend = legacy.length > 0
      ? legacy.reduce((s, v) => s + v, 0) / legacy.length
      : null;
  }

  const daysRemaining = available !== null && available > 0 && avgDailySpend && avgDailySpend > 0
    ? available / avgDailySpend
    : null;

  const warningThreshold = a.budget_alert_rules?.find(
    (r) => r.severity === "warning" && r.is_active,
  )?.threshold_value ?? null;
  const criticalThreshold = a.budget_alert_rules?.find(
    (r) => r.severity === "critical" && r.is_active,
  )?.threshold_value ?? null;

  const severity = getBalanceSeverity(
    available,
    daysRemaining,
    a.account_status ?? 0,
    warningThreshold,
    criticalThreshold,
    a.monthly_budget,
  );

  const enriched = { ...a, clientName, availableBalance: available, balanceLabel, daysRemaining, avgDailySpend, severity, warningThreshold, criticalThreshold, currency: cur };
  const display = getBalanceDisplay(enriched);
  return { ...enriched, display };
}

const DISPLAY_SEVERITY_ORDER: Record<DisplaySeverity, number> = {
  critical: 0,
  warning:  1,
  review:   2,
  ok:       3,
  paused:   4,
};

function sortAccounts(accounts: EnrichedAccount[]): EnrichedAccount[] {
  return [...accounts].sort((a, b) => {
    const so = DISPLAY_SEVERITY_ORDER[a.display.severity] - DISPLAY_SEVERITY_ORDER[b.display.severity];
    if (so !== 0) return so;
    // dentro do grupo crítico/atenção: dias restantes ascendente (vai acabar antes fica no topo)
    const da = a.daysRemaining ?? Infinity;
    const db = b.daysRemaining ?? Infinity;
    if (da !== db) return da - db;
    // mesmo grupo e mesmos dias: alfabético por cliente
    return (a.clientName).localeCompare(b.clientName);
  });
}

function formatCurrency(n: number | null | undefined, currency = "BRL"): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency });
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

function SeverityDot({ severity }: { severity: DisplaySeverity }) {
  const styles: Record<DisplaySeverity, string> = {
    critical: "bg-destructive shadow-[0_0_0_4px_rgba(226,75,74,0.15)]",
    warning:  "bg-lone-warning shadow-[0_0_0_4px_rgba(186,117,23,0.12)]",
    review:   "bg-lone-warning-bg",
    ok:       "bg-lone-success-bg",
    paused:   "bg-muted",
  };
  return <span className={cn("inline-block w-2 h-2 rounded-full shrink-0", styles[severity])} />;
}

function StatusBadge({ display, syncError }: { display: BalanceDisplay; syncError: string | null }) {
  if (syncError) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
        <WifiOff size={9} /> Erro sync
      </span>
    );
  }
  const config: Record<DisplaySeverity, { label: string; cls: string }> = {
    critical: { label: "Crítico",     cls: "bg-[rgba(226,75,74,0.12)] text-destructive border-[rgba(226,75,74,0.25)]"   },
    warning:  { label: "Atenção",     cls: "bg-[rgba(186,117,23,0.10)] text-lone-warning border-[rgba(186,117,23,0.20)]" },
    review:   { label: display.primary, cls: "bg-lone-warning-bg text-lone-warning border-lone-warning-border"                     },
    ok:       { label: "Ativa",       cls: "bg-lone-success-bg text-lone-success border-lone-success-border"                 },
    paused:   { label: display.primary, cls: "bg-muted text-muted-foreground border-border"                              },
  };
  const c = config[display.severity];
  return (
    <span className={cn("text-[10px] px-2 py-0.5 rounded-full border font-medium", c.cls)}>
      {c.label}
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
  const [monthlyBudget, setMonthlyBudget] = useState(account.monthly_budget?.toFixed(2) ?? "");
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
          monthlyBudget: monthlyBudget ? parseFloat(monthlyBudget) : null,
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
    const borderColor = color === "critical" ? "border-destructive/25" : "border-lone-warning/25";
    const bgColor = color === "critical" ? "bg-[rgba(226,75,74,0.04)]" : "bg-[rgba(186,117,23,0.04)]";
    const textColor = color === "critical" ? "text-destructive" : "text-lone-warning";
    const dotColor = color === "critical" ? "bg-destructive" : "bg-lone-warning";

    return (
      <div className={cn("rounded-xl border p-4 space-y-3", borderColor, bgColor)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={cn("w-2 h-2 rounded-full", dotColor)} />
            <p className={cn("text-xs font-semibold", textColor)}>{label}</p>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <span className="text-[10px] text-muted-foreground">Ativo</span>
            <div
              onClick={() => setter((p) => ({ ...p, active: !p.active }))}
              className={cn(
                "w-8 h-4 rounded-full transition-colors cursor-pointer",
                rule.active ? (color === "critical" ? "bg-destructive" : "bg-lone-warning") : "bg-muted",
              )}
            >
              <div className={cn(
                "w-3 h-3 bg-card rounded-full mt-0.5 transition-transform",
                rule.active ? "translate-x-4" : "translate-x-0.5",
              )} />
            </div>
          </label>
        </div>

        {rule.active && (
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Threshold (R$)</p>
              <input
                type="number" min="0" step="10"
                value={rule.threshold}
                onChange={(e) => setter((p) => ({ ...p, threshold: e.target.value }))}
                className="w-full bg-surface border border-border rounded-lg px-2 py-1.5 text-sm text-foreground outline-none focus:border-primary/50"
              />
            </div>
            <div className="space-y-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Intervalo (h)</p>
              <input
                type="number" min="1" max="24"
                value={rule.interval}
                onChange={(e) => setter((p) => ({ ...p, interval: e.target.value }))}
                className="w-full bg-surface border border-border rounded-lg px-2 py-1.5 text-sm text-foreground outline-none focus:border-primary/50"
              />
            </div>
            <div className="space-y-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Máx. avisos</p>
              <input
                type="number" min="1" max="20"
                value={rule.maxNotif}
                onChange={(e) => setter((p) => ({ ...p, maxNotif: e.target.value }))}
                className="w-full bg-surface border border-border rounded-lg px-2 py-1.5 text-sm text-foreground outline-none focus:border-primary/50"
              />
            </div>
          </div>
        )}

        {rule.active && (
          <div className="space-y-1">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Canais</p>
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
                        ? "bg-[rgba(226,75,74,0.15)] border-[rgba(226,75,74,0.4)] text-destructive"
                        : "bg-[rgba(186,117,23,0.15)] border-[rgba(186,117,23,0.4)] text-lone-warning"
                      : "bg-surface border-border text-muted-foreground hover:border-border",
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
      <div className="bg-card border border-border rounded-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="p-5 border-b border-border flex items-start justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">{account.clientName}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5 font-mono">{account.meta_account_id}</p>
            <div className="flex items-center gap-2 mt-1.5">
              <span className={cn(
                "text-[10px] px-2 py-0.5 rounded-full border",
                account.is_prepaid
                  ? "bg-primary/10 border-primary/20 text-primary"
                  : "bg-purple-500/10 border-purple-500/20 text-purple-400",
              )}>
                {account.is_prepaid ? "Pré-pago" : "Pós-pago"}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Tipo de cobrança */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Tipo de cobrança</p>
              <select
                value={isPrepaid ? "prepaid" : "postpaid"}
                onChange={(e) => setIsPrepaid(e.target.value === "prepaid")}
                className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
              >
                <option value="prepaid">Pré-pago (Pix/Boleto)</option>
                <option value="postpaid">Pós-pago (Cartão)</option>
              </select>
            </div>
            {!isPrepaid && (
              <div className="space-y-1">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Spend cap Meta (R$)</p>
                <input
                  type="number" min="0" step="100"
                  value={spendCap}
                  onChange={(e) => setSpendCap(e.target.value)}
                  placeholder="ex: 2000.00"
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
                />
              </div>
            )}
          </div>

          {/* Verba mensal — sempre visível */}
          <div className="space-y-1">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Verba mensal contratada (R$)
            </p>
            <input
              type="number" min="0" step="100"
              value={monthlyBudget}
              onChange={(e) => setMonthlyBudget(e.target.value)}
              placeholder="ex: 1000.00"
              className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
            />
            <p className="text-[10px] text-muted-foreground">
              {isPrepaid
                ? "Pré-pago: deixe em branco para usar o saldo da carteira Meta. Preencha para monitorar por verba contratada."
                : <>Pós-pago: saldo exibido = <span className="text-muted-foreground">verba − gasto do mês (Insights)</span>. Mais preciso que o spend_cap quando esse é teto de segurança.</>}
            </p>
          </div>

          {/* Contexto azul */}
          <div className="rounded-lg bg-primary/[0.06] border border-primary/20 p-3">
            <p className="text-[11px] text-primary leading-relaxed">
              {isPrepaid
                ? "Pré-pago: saldo disponível = carteira na Meta (funding_source_details). Quando zera, campanhas pausam automaticamente."
                : monthlyBudget
                  ? `Pós-pago com verba definida: mostra ${formatCurrency(parseFloat(monthlyBudget) || 0)}/mês − gasto do ciclo. Ideal para clientes onde o spend_cap da Meta é maior que o orçamento real.`
                  : "Pós-pago: saldo = spend_cap − gasto do ciclo. Se o spend_cap for um teto de segurança alto, defina a Verba mensal acima para precisão."}
            </p>
          </div>

          {/* Contato financeiro */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Tel. financeiro (WA)</p>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="5522999999999"
                className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
              />
            </div>
            <div className="space-y-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Chave Pix</p>
              <input
                type="text"
                value={pixKey}
                onChange={(e) => setPixKey(e.target.value)}
                placeholder="CPF, e-mail ou telefone"
                className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
              />
            </div>
          </div>

          {/* Regras */}
          <div className="space-y-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Regras de alerta</p>
            <RuleBlock color="warning"  label="Atenção"  rule={warning}  setter={setWarning}  />
            <RuleBlock color="critical" label="Crítico"  rule={critical} setter={setCritical} />
          </div>

          {validationError && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
              <AlertTriangle size={13} className="text-destructive shrink-0" />
              <p className="text-xs text-destructive">{validationError}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-border flex justify-end gap-3">
          <button onClick={onClose} className="btn-ghost text-xs border border-border px-4">Cancelar</button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary hover:bg-primary text-primary-foreground text-xs font-medium transition-all disabled:opacity-50"
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal: Adicionar Conta de Anúncio ────────────────────────

interface MetaAccountOption {
  id: string;
  name: string;
  account_status: number;
  currency: string;
}

interface ClientOption {
  id: string;
  name: string;
  nome_fantasia: string | null;
}

function AddAccountModal({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  onAdded: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [metaAccounts, setMetaAccounts] = useState<MetaAccountOption[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedMeta, setSelectedMeta] = useState<MetaAccountOption | null>(null);
  const [selectedClient, setSelectedClient] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    authedFetch("/api/traffic/ad-accounts")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) { setError(data.error ?? "Erro ao carregar contas"); return; }
        setMetaAccounts(data.accounts ?? []);
        setClients(data.clients ?? []);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  const filtered = metaAccounts.filter((a) =>
    !search || a.name.toLowerCase().includes(search.toLowerCase()) || a.id.includes(search),
  );

  async function handleAdd() {
    if (!selectedMeta || !selectedClient) return;
    setSaving(true);
    try {
      const res = await authedFetch("/api/traffic/ad-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: selectedClient,
          metaAccountId: selectedMeta.id,
          accountName: selectedMeta.name,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Erro ao adicionar conta");
        return;
      }
      toast.success(`${selectedMeta.name} adicionada — sincronizando...`);
      // Trigger immediate sync for the new account
      await authedFetch("/api/traffic/sync-balances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountIds: [selectedMeta.id] }),
      });
      onAdded();
      onClose();
    } catch (e) {
      toast.error(`Erro de rede: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-card border border-border rounded-2xl shadow-2xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Adicionar Conta de Anúncio</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">Vincule uma conta do Meta Ads a um cliente</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 size={18} className="animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-destructive/10 border border-destructive/20 text-xs text-destructive">
              <AlertTriangle size={13} /> {error}
            </div>
          ) : (
            <>
              {/* Cliente selector */}
              <div>
                <label className="text-[11px] text-muted-foreground font-medium mb-1.5 block">Cliente</label>
                <select
                  value={selectedClient}
                  onChange={(e) => setSelectedClient(e.target.value)}
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:border-primary/50"
                >
                  <option value="">Selecionar cliente...</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome_fantasia || c.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Meta account search + list */}
              <div>
                <label className="text-[11px] text-muted-foreground font-medium mb-1.5 block">
                  Conta Meta Ads
                  <span className="ml-1.5 text-muted-foreground">({filtered.length} disponíveis)</span>
                </label>
                <div className="relative mb-2">
                  <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Buscar por nome ou ID..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full bg-surface border border-border rounded-lg pl-8 pr-3 py-2 text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/50"
                  />
                </div>
                {filtered.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    {metaAccounts.length === 0
                      ? "Nenhuma conta disponível para vincular"
                      : "Nenhuma conta encontrada"}
                  </p>
                ) : (
                  <div className="space-y-1 max-h-[260px] overflow-y-auto pr-0.5">
                    {filtered.map((a) => (
                      <button
                        key={a.id}
                        onClick={() => setSelectedMeta(selectedMeta?.id === a.id ? null : a)}
                        className={cn(
                          "w-full flex items-center justify-between px-3 py-2.5 rounded-lg border text-left transition-all",
                          selectedMeta?.id === a.id
                            ? "border-primary/50 bg-primary/10 text-foreground"
                            : "border-border bg-surface text-muted-foreground hover:border-border",
                        )}
                      >
                        <div>
                          <p className="text-xs font-medium leading-none">{a.name}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">{a.id} · {a.currency}</p>
                        </div>
                        {a.account_status === 1 ? (
                          <span className="text-[10px] text-lone-success font-medium shrink-0 ml-2">Ativa</span>
                        ) : (
                          <span className="text-[10px] text-muted-foreground shrink-0 ml-2">Status {a.account_status}</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-border flex items-center justify-between gap-3">
          <p className="text-[11px] text-muted-foreground">
            {selectedMeta ? `Selecionada: ${selectedMeta.name}` : "Nenhuma conta selecionada"}
          </p>
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-ghost text-xs border border-border px-4">Cancelar</button>
            <button
              onClick={handleAdd}
              disabled={saving || !selectedMeta || !selectedClient}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary hover:bg-primary text-primary-foreground text-xs font-medium transition-all disabled:opacity-50"
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
              Adicionar e Sincronizar
            </button>
          </div>
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
  const [filterSeverity, setFilterSeverity] = useState<DisplaySeverity | "all">("all");
  const [modalAccount, setModalAccount] = useState<EnrichedAccount | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
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
    if (syncing) return;
    setSyncing(true);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60_000);
    try {
      const res = await authedFetch("/api/traffic/sync-balances", {
        method: "POST",
        signal: controller.signal,
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(`Falha na sincronização: ${data.error ?? "Erro desconhecido"}`);
      } else {
        const { synced = 0, errors: errs = 0, total = 0 } = data;
        if (errs > 0) {
          toast.warning(`${synced} de ${total} contas sincronizadas — ${errs} com erro (verifique o token Meta)`);
        } else {
          toast.success(`${synced} contas sincronizadas com sucesso`);
        }
      }
      await load();
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        toast.error("Sincronização demorou mais de 60s. Verifique o token Meta.");
      } else {
        toast.error(`Erro de rede: ${err instanceof Error ? err.message : "desconhecido"}`);
      }
    } finally {
      clearTimeout(timeoutId);
      setSyncing(false);
    }
  }, [load, syncing]);

  const handleToggleBillingType = useCallback(async (account: EnrichedAccount, e: React.MouseEvent) => {
    e.stopPropagation();
    if (togglingId) return;
    setTogglingId(account.id);
    try {
      const newIsPrepaid = !account.is_prepaid;
      const res = await authedFetch("/api/traffic/billing-type", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: account.id, isPrepaid: newIsPrepaid }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(`Erro: ${d.error ?? "desconhecido"}`);
        return;
      }
      toast.success(`${account.clientName} → ${newIsPrepaid ? "Pré-pago (Pix/Boleto)" : "Pós-pago (Cartão)"}`);
      await load();
    } catch {
      toast.error("Falha ao alterar tipo de cobrança");
    } finally {
      setTogglingId(null);
    }
  }, [togglingId, load]);

  useEffect(() => {
    load();
    // Auto-refresh a cada 5 minutos
    intervalRef.current = setInterval(load, 5 * 60_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [load]);

  // ── Dados computados ─────────────────────────────────────
  const filtered = filterSeverity === "all"
    ? accounts
    : accounts.filter((a) => a.display.severity === filterSeverity);

  // Saldo agregado: contas ativas com saldo calculável (pré-pago + pós com cap)
  const computedAccounts = accounts.filter(
    (a) => a.availableBalance !== null && a.account_status === 1,
  );
  const totalBalance = computedAccounts.reduce((s, a) => s + (a.availableBalance ?? 0), 0);

  const criticalCount  = accounts.filter((a) => a.display.severity === "critical").length;
  const warningCount   = accounts.filter((a) => a.display.severity === "warning").length;
  const reviewCount    = accounts.filter((a) => a.display.severity === "review").length;
  // Contas cartão ativas sem monitoramento de saldo
  const activeCardCount = accounts.filter(
    (a) => !a.is_prepaid && a.monthly_budget === null &&
           (a.spend_cap === null || a.spend_cap === 0) &&
           a.account_status === 1,
  ).length;

  // Alerta de sync desatualizado (>30min)
  const syncStale = lastSyncAt
    ? (Date.now() - new Date(lastSyncAt).getTime()) > 30 * 60_000
    : false;

  // ── WhatsApp link ─────────────────────────────────────────
  function buildWaLink(account: EnrichedAccount): string {
    const phone = account.clients?.client_finance_phone;
    if (!phone) return "";
    const clientName = account.clientName;
    const balance = account.display.primary;
    const pix = account.clients?.client_pix_key ?? "—";
    const text = encodeURIComponent(
      `Oi ${clientName}! Sua conta de anúncios está em ${balance}. Pode fazer um Pix pra não pausar as campanhas? Chave: ${pix}`
    );
    return `https://wa.me/${phone.replace(/\D/g, "")}?text=${text}`;
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 size={20} className="animate-spin text-muted-foreground" />
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
                ? <WifiOff size={11} className="text-lone-warning" />
                : <Wifi size={11} className="text-muted-foreground" />}
              <p className={cn("text-[11px]", syncStale ? "text-lone-warning" : "text-muted-foreground")}>
                {syncStale
                  ? `Última sincronização ${timeSince(lastSyncAt)} — verificar conexão Meta`
                  : `Última sincronização Meta API · ${timeSince(lastSyncAt)}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-surface border border-border text-xs text-foreground hover:border-primary/30 hover:text-primary transition-all"
            >
              <Plus size={12} />
              Adicionar Conta
            </button>
            <button
              onClick={handleSync}
              disabled={syncing}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-surface border border-border text-xs text-foreground hover:border-primary/30 hover:text-primary transition-all disabled:opacity-50"
            >
              <RefreshCw size={12} className={syncing ? "animate-spin" : ""} />
              {syncing ? "Sincronizando..." : "Sincronizar"}
            </button>
          </div>
        </div>

        {/* Aviso sync desatualizado */}
        {syncStale && (
          <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-lone-warning-bg/[0.06] border border-lone-warning-border">
            <AlertTriangle size={13} className="text-lone-warning shrink-0" />
            <p className="text-xs text-lone-warning">
              Dados desatualizados há mais de 30 minutos. Clique em "Sincronizar" ou verifique o token Meta.
            </p>
          </div>
        )}

        {/* Cards de resumo */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
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
              value: formatCurrency(totalBalance),
              sub: `${computedAccounts.length} de ${accounts.length} com saldo`,
              onClick: () => setFilterSeverity("ok"),
              active: filterSeverity === "ok",
              color: "text-lone-success",
            },
            {
              label: "Atenção",
              value: warningCount + reviewCount,
              sub: "saldo baixo ou em revisão",
              onClick: () => setFilterSeverity(filterSeverity === "warning" ? "all" : "warning"),
              active: filterSeverity === "warning",
              color: "text-lone-warning",
            },
            {
              label: "Críticos",
              value: criticalCount,
              sub: "ação imediata",
              onClick: () => setFilterSeverity(filterSeverity === "critical" ? "all" : "critical"),
              active: filterSeverity === "critical",
              color: "text-destructive",
            },
            {
              label: "Cartão ativo",
              value: activeCardCount,
              sub: "sem monitor de saldo",
              onClick: () => setFilterSeverity("all"),
              active: false,
              color: "text-muted-foreground",
            },
          ].map((card) => (
            <button
              key={card.label}
              onClick={card.onClick}
              className={cn(
                "text-left p-4 rounded-xl border transition-all",
                card.active
                  ? "bg-primary/5 border-primary/25"
                  : "bg-card border-border hover:border-border",
              )}
            >
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">{card.label}</p>
              <p className={cn("text-2xl font-bold", card.color)}>{card.value}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{card.sub}</p>
            </button>
          ))}
        </div>

        {/* Filtro ativo */}
        {filterSeverity !== "all" && (
          <div className="flex items-center gap-2">
            <Filter size={12} className="text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              Mostrando apenas:
              <span className="ml-1 font-medium text-foreground capitalize">{filterSeverity}</span>
            </span>
            <button onClick={() => setFilterSeverity("all")} className="text-muted-foreground hover:text-muted-foreground transition-colors">
              <X size={12} />
            </button>
          </div>
        )}

        {/* Tabela */}
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <CheckCircle size={24} className="mb-2 text-muted-foreground" />
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
            <div className="grid grid-cols-[24px_1fr_100px_130px_80px_100px_80px] gap-3 px-4 py-2.5 bg-card border-b border-border">
              {["", "Cliente / Conta", "Status", "Saldo disponível", "Dias", "Gasto/dia", "Ações"].map((h) => (
                <p key={h} className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">{h}</p>
              ))}
            </div>

            {/* Linhas */}
            {filtered.map((account) => {
              const isCritical = account.display.severity === "critical";
              const isWarning  = account.display.severity === "warning";
              const isReview   = account.display.severity === "review";
              const isPaused   = account.display.severity === "paused";
              const waLink = buildWaLink(account);

              return (
                <div
                  key={account.id}
                  className={cn(
                    "grid grid-cols-[24px_1fr_100px_130px_80px_100px_80px] gap-3 px-4 py-3 border-b border-border last:border-b-0 items-center transition-colors hover:bg-card/[0.02]",
                    isCritical && "bg-destructive/[0.04] border-l-[3px] border-l-destructive",
                    isWarning  && "bg-lone-warning-bg border-l-[3px] border-l-lone-warning",
                    isReview   && "bg-lone-warning-bg border-l-[3px] border-l-lone-warning",
                    isPaused   && "opacity-50",
                  )}
                >
                  {/* Dot */}
                  <div className="flex items-center justify-center">
                    <SeverityDot severity={account.display.severity} />
                  </div>

                  {/* Cliente / Conta */}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{account.clientName}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-[10px] text-muted-foreground font-mono truncate">{account.meta_account_id}</p>
                      <button
                        onClick={(e) => handleToggleBillingType(account, e)}
                        disabled={togglingId === account.id}
                        title={`${account.is_prepaid ? "Pré-pago" : "Pós-pago"} · definido ${account.billing_type_source === "manual" ? "manualmente" : "automaticamente"} · clique pra trocar`}
                        className={cn(
                          "text-[9px] px-1.5 py-0.5 rounded border transition-all cursor-pointer hover:opacity-70 disabled:opacity-40",
                          account.is_prepaid
                            ? "text-primary border-primary/20 bg-primary/[0.06]"
                            : "text-purple-400 border-purple-500/20 bg-purple-500/[0.06]",
                        )}
                      >
                        {account.is_prepaid ? "pré" : "pós"}
                        {account.billing_type_source === "manual" && " ✓"}
                      </button>
                    </div>
                  </div>

                  {/* Status */}
                  <div>
                    <StatusBadge display={account.display} syncError={account.sync_error} />
                    {account.sync_error && (
                      <p
                        className="text-[9px] text-muted-foreground mt-0.5 truncate cursor-help"
                        title={account.last_error_message ?? account.sync_error}
                        style={{ maxWidth: 96 }}
                      >
                        {account.sync_error}
                      </p>
                    )}
                  </div>

                  {/* Saldo disponível */}
                  <div>
                    <p className={cn(
                      "text-[15px] font-semibold leading-tight",
                      isCritical ? "text-destructive"
                        : isWarning ? "text-lone-warning"
                        : account.display.primary === "Ativa" ? "text-lone-success"
                        : isPaused || isReview ? "text-muted-foreground"
                        : "text-foreground",
                    )}>
                      {account.display.primary}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{account.display.secondary}</p>
                    {/* CTA discreto para contas cartão sem verba definida */}
                    {!account.is_prepaid && account.monthly_budget === null &&
                     (account.spend_cap === null || account.spend_cap === 0) &&
                     account.account_status === 1 && (
                      <button
                        onClick={() => setModalAccount(account)}
                        className="text-[9px] text-muted-foreground hover:text-primary transition-colors mt-0.5"
                      >
                        Definir verba →
                      </button>
                    )}
                  </div>

                  {/* Dias restantes */}
                  <div>
                    <p className={cn(
                      "text-sm font-medium",
                      account.daysRemaining !== null && account.daysRemaining <= 1
                        ? "text-destructive"
                        : "text-foreground",
                    )}>
                      {formatDaysRemaining(account.daysRemaining)}
                    </p>
                  </div>

                  {/* Gasto médio */}
                  <div>
                    <p className="text-sm text-foreground">
                      {account.avgDailySpend !== null ? formatCurrency(account.avgDailySpend) : "—"}
                    </p>
                    {account.avgDailySpend !== null && (
                      <p className="text-[10px] text-muted-foreground">/dia</p>
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
                            ? "text-destructive border-[rgba(226,75,74,0.25)] hover:bg-[rgba(226,75,74,0.10)]"
                            : "text-muted-foreground border-border hover:text-lone-success hover:border-lone-success-border",
                        )}
                      >
                        <MessageCircle size={13} />
                      </a>
                    ) : (
                      <button
                        disabled
                        title="Cadastre o telefone financeiro nas configurações"
                        className="p-1.5 rounded-lg border border-border text-muted-foreground cursor-not-allowed"
                      >
                        <MessageCircle size={13} />
                      </button>
                    )}
                    <button
                      onClick={() => setModalAccount(account)}
                      title="Configurar alertas"
                      className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-border transition-all"
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
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5 text-[10px] text-muted-foreground pt-1">
          {[
            { color: "bg-destructive",  label: "Crítico — saldo abaixo do threshold ou <1d" },
            { color: "bg-lone-warning",  label: "Atenção — saldo baixo ou <3d" },
            { color: "bg-lone-warning-bg",  label: "Em revisão / Pendente — conta Meta suspensa" },
            { color: "bg-lone-success-bg",label: "Ativa — saldo OK ou cartão sem limite" },
            { color: "bg-muted",   label: "Desativada / fora de operação" },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-1.5">
              <span className={cn("w-2 h-2 rounded-full shrink-0", item.color)} />
              {item.label}
            </div>
          ))}
        </div>
      </div>

      {/* Modal alertas */}
      {modalAccount && (
        <AlertModal
          account={modalAccount}
          onClose={() => setModalAccount(null)}
          onSaved={load}
        />
      )}

      {/* Modal adicionar conta */}
      {showAddModal && (
        <AddAccountModal
          onClose={() => setShowAddModal(false)}
          onAdded={load}
        />
      )}
    </div>
  );
}
