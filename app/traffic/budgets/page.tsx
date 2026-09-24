"use client";

// Tráfego › Contas & Verba (/traffic/budgets). Leva 4: saldo, limite e ritmo do mês de cada conta
// numa tela só — antes eram "Saldos, Verba & Alertas" aqui e a aba "Investimento" no /traffic, que
// editava a verba num SEGUNDO lugar e guardava o próximo aporte só no navegador.
//
// Leva 7A (pedido do CEO): a tela foi modernizada. O ritmo do mês virou uma barra que se lê de
// relance (gasto × verba, o marcador de "hoje", a projeção do fim do mês e um status com cor e ícone
// — components/trafego/contas/CelulaRitmo.tsx); a tabela ganhou hierarquia (cliente em destaque, id
// da conta quieto), chips de status e de forma de pagamento, números alinhados, cabeçalho fixo, e
// vira cartões no celular. Os quatro cards do topo filtram a lista.
//
// Verba, forma de pagamento, próximo aporte e limite de saldo se editam num lugar só: o modal
// "Verba e alertas" (POST /api/traffic/budget-rules). Alertas por cliente (liga/desliga, destino,
// grupo) seguem em Tráfego › Grupos dos Clientes — o link está no cabeçalho.

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  RefreshCw, Settings2, MessageCircle, AlertTriangle, CheckCircle, CheckCircle2,
  Wifi, WifiOff, Filter, X, Loader2, Plus, Search, EyeOff, Eye, BellRing, CalendarClock,
  Wallet, OctagonAlert, Gauge, CircleAlert, CirclePause, QrCode, Barcode, CreditCard,
  type LucideIcon,
} from "lucide-react";
import { chamar } from "@/lib/api/chamar";
import {
  getBalanceSeverity,
  type BalanceSeverity,
} from "@/lib/meta/account-balance";
import {
  getBalanceDisplay,
  type DisplaySeverity,
  type BalanceDisplay,
} from "@/lib/budgets/display";
import { metaAccountStatus } from "@/lib/budgets/account-status";
import { cn, todaySP } from "@/lib/utils";
import {
  ritmoDoMes, lerRitmo, foraDoRitmo, avisoAporte, aportesParaMigrar, syncAtrasado, CHAVE_LOCAL_INVESTIMENTO,
  type RitmoMes, type LeituraRitmo, type AvisoAporte,
} from "@/lib/trafego/contas-verba";
import type { EstadoConexao } from "@/lib/trafego/anuncios";
import CelulaRitmo, { BarraRitmo } from "@/components/trafego/contas/CelulaRitmo";
import AvisoConexaoMeta from "@/components/trafego/AvisoConexaoMeta";
import CalendarioRecargas from "@/components/trafego/contas/CalendarioRecargas";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";

// ── Tipos ────────────────────────────────────────────────────

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
    daily_budget: number | null;
    payment_method: string | null;
    /** Migração 20260924160000; ausente antes dela. */
    next_payment_date?: string | null;
  };
  /** client_alert_config.verba_minima — o limite que o alerta do servidor usa. */
  verba_minima: number | null;
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
  ritmo: RitmoMes;
  leitura: LeituraRitmo;
  aporte: AvisoAporte;
}

type Filtro = DisplaySeverity | "all" | "ritmo";

// ── Helpers ───────────────────────────────────────────────────

function enrichAccount(a: AdAccountRow, hoje: string): EnrichedAccount {
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

  // Mesma regra do servidor (sync-core): só limite positivo vale; senão herda o % da verba.
  const warningThreshold = a.verba_minima != null && a.verba_minima > 0 ? a.verba_minima : null;
  const criticalThreshold = null;

  const severity = getBalanceSeverity(
    available,
    daysRemaining,
    a.account_status ?? 0,
    warningThreshold,
    criticalThreshold,
    a.monthly_budget,
  );

  const enriched = { ...a, clientName, availableBalance: available, balanceLabel, daysRemaining, avgDailySpend, severity, warningThreshold, criticalThreshold, currency: cur, payment_method: a.clients?.payment_method ?? null };
  const display = getBalanceDisplay(enriched);
  // Ritmo do mês: a MESMA verba que o alerta usa (ad_accounts.monthly_budget) contra o gasto sincronizado.
  const ritmo = ritmoDoMes({ verba: a.monthly_budget, gasto: a.current_month_spend, hoje });
  // Projeção pelo ritmo dos últimos 3 dias (Insights, gravado no sync). O legado (daily_spend_3d sem
  // os zeros) não serve aqui: esconderia justamente a conta que parou de gastar.
  const leitura = lerRitmo(ritmo, a.last_3d_avg_spend);
  const aporte = avisoAporte({ forma: a.clients?.payment_method, proximo: a.clients?.next_payment_date, hoje, pctGasto: ritmo.pctGasto });
  return { ...enriched, display, ritmo, leitura, aporte };
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

const brl0 = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/** "3,2 dias", "~6h", "> 1 ano" — vírgula de decimal, como o resto da tela. */
function formatarDias(dias: number | null): string {
  if (dias === null) return "—";
  if (dias < 0) return "Negativo";
  if (dias > 365) return "> 1 ano";
  if (dias < 1) return `~${Math.max(1, Math.round(dias * 24))}h`;
  return `${dias.toLocaleString("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: dias < 10 ? 1 : 0 })} dias`;
}

function timeSince(iso: string | null): string {
  if (!iso) return "nunca";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "agora";
  if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `há ${Math.floor(diff / 3600)} h`;
  return `há ${Math.floor(diff / 86400)} d`;
}

// Colunas da tabela (a partir de md). No xl cabem todas; entre md e xl o status desce para baixo do
// nome e "dias · gasto/dia" para baixo do saldo — sem rolagem lateral. Abaixo de md viram cartões.
const COLUNAS = cn(
  "grid-cols-[minmax(0,1.2fr)_minmax(150px,0.8fr)_minmax(210px,1.25fr)_112px]",
  "xl:grid-cols-[minmax(0,1.35fr)_128px_minmax(150px,0.9fr)_84px_100px_minmax(240px,1.35fr)_112px]",
);

// ── Peças de célula ───────────────────────────────────────────

const STATUS_CONTA: Record<DisplaySeverity, { rotulo: string | null; cls: string; icone: LucideIcon; faixa: string | null }> = {
  critical: { rotulo: "Crítico", cls: "bg-lone-danger-bg text-lone-danger border-lone-danger-border",    icone: OctagonAlert,  faixa: "bg-destructive" },
  warning:  { rotulo: "Atenção", cls: "bg-lone-warning-bg text-lone-warning border-lone-warning-border", icone: AlertTriangle, faixa: "bg-lone-warning" },
  // Em análise / pendência: o rótulo vem do status da Meta (display.primary).
  review:   { rotulo: null,      cls: "bg-lone-warning-bg text-lone-warning border-lone-warning-border", icone: CircleAlert,   faixa: "bg-lone-warning-border" },
  ok:       { rotulo: "Ativa",   cls: "bg-lone-success-bg text-lone-success border-lone-success-border", icone: CheckCircle2,  faixa: null },
  paused:   { rotulo: null,      cls: "bg-muted text-muted-foreground border-border",                    icone: CirclePause,   faixa: null },
};

function ChipStatus({ account }: { account: EnrichedAccount }) {
  if (account.sync_error) {
    return (
      <span
        className="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
        title={account.last_error_message ?? account.sync_error}
      >
        <WifiOff size={12} className="shrink-0" aria-hidden="true" />
        <span className="truncate">Leitura falhou</span>
      </span>
    );
  }
  const c = STATUS_CONTA[account.display.severity];
  const Icone = c.icone;
  return (
    <span className={cn("inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium", c.cls)}>
      <Icone size={12} className="shrink-0" aria-hidden="true" />
      <span className="truncate">{c.rotulo ?? account.display.primary}</span>
    </span>
  );
}

/** Pix / Boleto / Cartão — a forma de pagamento decide se existe saldo que acaba. */
function formaDePagamento(a: EnrichedAccount): { rotulo: string; icone: LucideIcon; cartao: boolean } {
  const f = a.clients?.payment_method;
  if (f === "pix") return { rotulo: "Pix", icone: QrCode, cartao: false };
  if (f === "boleto") return { rotulo: "Boleto", icone: Barcode, cartao: false };
  if (f === "cartao") return { rotulo: "Cartão", icone: CreditCard, cartao: true };
  return a.is_prepaid
    ? { rotulo: "Pré-pago", icone: Wallet, cartao: false }
    : { rotulo: "Cartão", icone: CreditCard, cartao: true };
}

function CelulaSaldo({ account, comDias = false }: { account: EnrichedAccount; comDias?: boolean }) {
  const forma = formaDePagamento(account);
  const Icone = forma.icone;
  const sev = account.display.severity;
  const soCartao = account.display.primary === "Cartão";
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
        <Icone size={12} className="shrink-0" aria-hidden="true" />
        {forma.rotulo}
      </p>
      {soCartao ? (
        <p className="mt-0.5 text-sm font-medium text-muted-foreground">Cobrado no cartão</p>
      ) : (
        <p className={cn(
          "mt-0.5 text-base font-semibold leading-tight tabular-nums",
          sev === "critical" ? "text-lone-danger"
            : sev === "warning" ? "text-lone-warning"
            : sev === "paused" || sev === "review" ? "text-muted-foreground"
            : "text-foreground",
        )}>
          {account.display.primary}
        </p>
      )}
      <p className="mt-0.5 truncate text-[11px] text-muted-foreground" title={account.display.secondary}>{account.display.secondary}</p>
      {account.warningThreshold != null && (
        <p className="text-[11px] text-muted-foreground" title="Limite do aviso de saldo baixo (Verba e alertas)">
          Avisa abaixo de {formatCurrency(account.warningThreshold)}
        </p>
      )}
      {comDias && (account.daysRemaining !== null || account.avgDailySpend !== null) && (
        <p className="mt-1 text-[11px] tabular-nums text-muted-foreground">
          {account.daysRemaining !== null && (
            <span className={cn(account.daysRemaining <= 1 ? "font-medium text-lone-danger" : account.daysRemaining <= 3 ? "font-medium text-lone-warning" : "text-foreground")}>
              {formatarDias(account.daysRemaining)}
            </span>
          )}
          {account.daysRemaining !== null && account.avgDailySpend !== null && " · "}
          {account.avgDailySpend !== null && <>{brl0(account.avgDailySpend)}/dia</>}
        </p>
      )}
    </div>
  );
}

function CelulaDias({ dias }: { dias: number | null }) {
  return (
    <p className={cn(
      "text-right text-sm tabular-nums",
      dias === null ? "text-muted-foreground"
        : dias <= 1 ? "font-semibold text-lone-danger"
        : dias <= 3 ? "font-semibold text-lone-warning"
        : "font-medium text-foreground",
    )}>
      {formatarDias(dias)}
    </p>
  );
}

function CelulaGastoDia({ valor }: { valor: number | null }) {
  return (
    <div className="text-right">
      <p className={cn("text-sm tabular-nums", valor === null ? "text-muted-foreground" : "text-foreground")}>
        {valor !== null ? brl0(valor) : "—"}
      </p>
      {valor !== null && <p className="text-[11px] text-muted-foreground">média 3 dias</p>}
    </div>
  );
}

// ── Modal "Verba e alertas" — o ÚNICO lugar que edita verba ────

interface AlertModalProps {
  account: EnrichedAccount;
  aporteDisponivel: boolean;
  onClose: () => void;
  onSaved: () => void;
}

function AlertModal({ account, aporteDisponivel, onClose, onSaved }: AlertModalProps) {
  const [isPrepaid, setIsPrepaid] = useState(account.is_prepaid);
  const [spendCap, setSpendCap] = useState(account.spend_cap?.toFixed(2) ?? "");
  const [monthlyBudget, setMonthlyBudget] = useState(account.monthly_budget?.toFixed(2) ?? "");
  const [phone, setPhone] = useState(account.clients?.client_finance_phone ?? "");
  const [pixKey, setPixKey] = useState(account.clients?.client_pix_key ?? "");
  const [dailyBudget, setDailyBudget] = useState(account.clients?.daily_budget?.toFixed(2) ?? "");
  const [paymentMethod, setPaymentMethod] = useState(account.clients?.payment_method ?? "pix");
  const [nextPayment, setNextPayment] = useState(account.clients?.next_payment_date ?? "");

  const [verbaMinima, setVerbaMinima] = useState(account.verba_minima?.toFixed(2) ?? "");

  const [saving, setSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const precisaAporte = paymentMethod === "pix" || paymentMethod === "boleto";
  const hoje = todaySP();
  const diasNoMes = ritmoDoMes({ verba: null, gasto: null, hoje }).diasNoMes;

  async function handleSave() {
    setValidationError(null);
    const limite = verbaMinima.trim() ? parseFloat(verbaMinima) : null;
    if (limite !== null && (!Number.isFinite(limite) || limite < 0)) {
      setValidationError("Limite de saldo inválido");
      return;
    }

    setSaving(true);
    try {
      const res = await chamar<{ ok: boolean; avisos?: string[] }>("/api/traffic/budget-rules", {
          adAccountId: account.id,
          isPrepaid,
          spendCap: spendCap ? parseFloat(spendCap) : null,
          monthlyBudget: monthlyBudget ? parseFloat(monthlyBudget) : null,
          dailyBudget: dailyBudget ? parseFloat(dailyBudget) : null,
          paymentMethod: paymentMethod || null,
          // Cartão não tem aporte: limpa a data para ela não virar aviso fantasma depois.
          ...(aporteDisponivel ? { nextPaymentDate: precisaAporte && nextPayment ? nextPayment : null } : {}),
          verbaMinima: limite,
          phone: phone || null,
          pixKey: pixKey || null,
      });
      if (!res.ok) { setValidationError(res.erro ?? "Erro ao salvar"); return; }
      toast.success(`${account.clientName}: verba e alertas salvos`);
      res.data?.avisos?.forEach((a) => toast.warning(a));
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const campo = "w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay backdrop-blur-sm p-4">
      <div role="dialog" aria-modal="true" aria-label={`Verba e alertas — ${account.clientName}`} className="bg-card border border-border rounded-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto shadow-sm">
        {/* Header */}
        <div className="p-5 border-b border-border flex items-start justify-between">
          <div>
            <p className="text-lone-eyebrow uppercase text-muted-foreground">Verba e alertas</p>
            <p className="text-sm font-semibold text-foreground mt-0.5">{account.clientName}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5 font-mono">{account.meta_account_id}</p>
          </div>
          <button onClick={onClose} aria-label="Fechar" className="text-muted-foreground hover:text-foreground transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Verba */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor="verba-mensal" className="text-[10px] text-muted-foreground uppercase tracking-wider">Verba mensal (R$)</label>
              <input
                id="verba-mensal" type="number" min="0" step="100"
                value={monthlyBudget}
                onChange={(e) => setMonthlyBudget(e.target.value)}
                placeholder="ex: 3000.00"
                className={campo}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="verba-diaria" className="text-[10px] text-muted-foreground uppercase tracking-wider">Verba diária (R$)</label>
              <input
                id="verba-diaria" type="number" min="0" step="10"
                value={dailyBudget}
                onChange={(e) => setDailyBudget(e.target.value)}
                placeholder={monthlyBudget && parseFloat(monthlyBudget) > 0 ? `≈ ${(parseFloat(monthlyBudget) / diasNoMes).toFixed(2)}` : "ex: 100.00"}
                className={campo}
              />
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground -mt-2">
            A verba mensal é a que o ritmo do mês e o alerta de saldo usam.
            {isPrepaid
              ? " Pré-pago: em branco, o alerta olha só o saldo da carteira na Meta."
              : " Pós-pago: o saldo mostrado vira verba − gasto do mês."}
          </p>

          {/* Pagamento */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor="forma-pagamento" className="text-[10px] text-muted-foreground uppercase tracking-wider">Forma de pagamento</label>
              <select id="forma-pagamento" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className={campo}>
                <option value="pix">Pix</option>
                <option value="boleto">Boleto</option>
                <option value="cartao">Cartão</option>
              </select>
            </div>
            {precisaAporte ? (
              <div className="space-y-1">
                <label htmlFor="proximo-aporte" className="text-[10px] text-muted-foreground uppercase tracking-wider">Próximo aporte</label>
                <input
                  id="proximo-aporte" type="date"
                  value={nextPayment}
                  onChange={(e) => setNextPayment(e.target.value)}
                  disabled={!aporteDisponivel}
                  className={cn(campo, "disabled:opacity-50")}
                />
                {!aporteDisponivel && <p className="text-[10px] text-lone-warning">Disponível depois da migração do banco.</p>}
              </div>
            ) : (
              <div className="flex items-end pb-2">
                <p className="text-[11px] text-muted-foreground">Cartão: a Meta cobra direto, sem aporte.</p>
              </div>
            )}
          </div>

          {/* Tipo de cobrança */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor="tipo-cobranca" className="text-[10px] text-muted-foreground uppercase tracking-wider">Tipo de cobrança</label>
              <select
                id="tipo-cobranca"
                value={isPrepaid ? "prepaid" : "postpaid"}
                onChange={(e) => setIsPrepaid(e.target.value === "prepaid")}
                className={campo}
              >
                <option value="prepaid">Pré-pago (Pix/Boleto)</option>
                <option value="postpaid">Pós-pago (Cartão)</option>
              </select>
            </div>
            {!isPrepaid && (
              <div className="space-y-1">
                <label htmlFor="spend-cap" className="text-[10px] text-muted-foreground uppercase tracking-wider">Spend cap Meta (R$)</label>
                <input
                  id="spend-cap" type="number" min="0" step="100"
                  value={spendCap}
                  onChange={(e) => setSpendCap(e.target.value)}
                  placeholder="ex: 2000.00"
                  className={campo}
                />
              </div>
            )}
          </div>

          {/* Contexto */}
          <div className="rounded-lg bg-primary/[0.06] border border-primary/20 p-3">
            <p className="text-[11px] text-primary leading-relaxed">
              {isPrepaid
                ? "Pré-pago: saldo disponível = carteira na Meta (funding_source_details). Quando zera, campanhas pausam automaticamente."
                : monthlyBudget
                  ? `Pós-pago com verba definida: mostra ${formatCurrency(parseFloat(monthlyBudget) || 0)}/mês − gasto do ciclo. Ideal para clientes onde o spend_cap da Meta é maior que o orçamento real.`
                  : "Pós-pago: saldo = spend_cap − gasto do ciclo. Se o spend_cap for um teto de segurança alto, defina a verba mensal acima para precisão."}
            </p>
          </div>

          {/* Limite de saldo baixo — client_alert_config.verba_minima, lido pelo alerta do servidor */}
          <div className="space-y-1">
            <label htmlFor="verba-minima" className="text-[10px] text-muted-foreground uppercase tracking-wider">Avisar quando o saldo ficar abaixo de (R$)</label>
            <input
              id="verba-minima" type="number" min="0" step="10"
              value={verbaMinima}
              onChange={(e) => setVerbaMinima(e.target.value)}
              placeholder="em branco = % da verba mensal"
              className={campo}
            />
            <p className="text-[10px] text-muted-foreground">
              Vale para o aviso de saldo baixo no grupo do tráfego. Em branco, o aviso usa o percentual da verba configurado na agência.
            </p>
          </div>

          {/* Contato financeiro */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor="tel-financeiro" className="text-[10px] text-muted-foreground uppercase tracking-wider">Tel. financeiro (WA)</label>
              <input id="tel-financeiro" type="text" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="5522999999999" className={campo} />
            </div>
            <div className="space-y-1">
              <label htmlFor="chave-pix" className="text-[10px] text-muted-foreground uppercase tracking-wider">Chave Pix</label>
              <input id="chave-pix" type="text" value={pixKey} onChange={(e) => setPixKey(e.target.value)} placeholder="CPF, e-mail ou telefone" className={campo} />
            </div>
          </div>

          {validationError && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
              <AlertTriangle size={13} className="text-destructive shrink-0" />
              <p className="text-xs text-destructive">{validationError}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-border flex items-center justify-between gap-3">
          <Link href="/settings/grupos" className="text-[11px] text-muted-foreground hover:text-primary transition-colors">
            Tipos de alerta e grupo →
          </Link>
          <div className="flex gap-3">
            <button onClick={onClose} className="btn-ghost text-xs border border-border px-4">Cancelar</button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium transition-all hover:opacity-90 disabled:opacity-50"
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
              Salvar
            </button>
          </div>
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
    chamar<{ accounts?: MetaAccountOption[]; clients?: ClientOption[] }>("/api/traffic/ad-accounts")
      .then((res) => {
        if (!res.ok) { setError(res.erro ?? "Erro ao carregar contas"); return; }
        setMetaAccounts(res.data?.accounts ?? []);
        setClients(res.data?.clients ?? []);
      })
      .finally(() => setLoading(false));
  }, []);

  const filtered = metaAccounts.filter((a) =>
    !search || a.name.toLowerCase().includes(search.toLowerCase()) || a.id.includes(search),
  );

  async function handleAdd() {
    if (!selectedMeta || !selectedClient) return;
    setSaving(true);
    try {
      const res = await chamar("/api/traffic/ad-accounts", {
        clientId: selectedClient,
        metaAccountId: selectedMeta.id,
        accountName: selectedMeta.name,
      });
      if (!res.ok) {
        toast.error(res.erro ?? "Erro ao adicionar conta");
        return;
      }
      toast.success(`${selectedMeta.name} adicionada — sincronizando...`);
      const sync = await chamar("/api/traffic/sync-balances", { accountIds: [selectedMeta.id] });
      if (!sync.ok) toast.error(`Conta adicionada, mas a sincronização falhou: ${sync.erro}`);
      onAdded();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-card border border-border rounded-2xl shadow-sm flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Adicionar Conta de Anúncio</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">Vincule uma conta do Meta Ads a um cliente</p>
          </div>
          <button onClick={onClose} aria-label="Fechar" className="text-muted-foreground hover:text-foreground transition-colors">
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
                          <span className="text-[10px] text-muted-foreground shrink-0 ml-2">{metaAccountStatus(a.account_status).label}</span>
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
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium transition-all hover:opacity-90 disabled:opacity-50"
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

export default function ContasVerbaPage() {
  const [accounts, setAccounts] = useState<EnrichedAccount[]>([]);
  // Sem isso, uma falha de rede mostrava "nenhuma conta" em vez de "não consegui carregar".
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [aporteDisponivel, setAporteDisponivel] = useState(true);
  const [filtro, setFiltro] = useState<Filtro>("all");
  const [clientSearch, setClientSearch] = useState("");
  const [modalAccount, setModalAccount] = useState<EnrichedAccount | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  // Contas ocultas (agency_settings.hidden_ad_accounts): somem do Início, do Hoje e dos Anúncios.
  const [ocultas, setOcultas] = useState<Set<string>>(new Set());
  const [verOcultas, setVerOcultas] = useState(false);
  const [conexao, setConexao] = useState<EstadoConexao>("ok");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const migrouRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const res = await chamar<{ accounts?: AdAccountRow[]; aporteDisponivel?: boolean }>("/api/traffic/sync-balances");
      if (!res.ok) { setLoadError(res.erro); return; }
      setLoadError(null);
      setAporteDisponivel(res.data?.aporteDisponivel !== false);
      const hoje = todaySP();
      const raw: AdAccountRow[] = res.data?.accounts ?? [];
      const enriched = sortAccounts(raw.map((a) => enrichAccount(a, hoje)));
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

  const loadOcultas = useCallback(async () => {
    const r = await chamar<{ ids?: string[] }>("/api/traffic/hidden-accounts");
    if (r.ok && Array.isArray(r.data?.ids)) setOcultas(new Set(r.data!.ids));
  }, []);

  // Token da Meta: sem ele o "Sincronizar" não faz nada — melhor dizer do que girar em vão.
  useEffect(() => {
    chamar<{ estado: EstadoConexao }>("/api/trafego/conexao-meta").then((r) => {
      if (r.ok && r.data) setConexao(r.data.estado);
    });
  }, []);

  const handleSync = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60_000);
    try {
      const res = await chamar<{ synced?: number; errors?: number; total?: number }>(
        "/api/traffic/sync-balances", {}, { signal: controller.signal },
      );
      if (!res.ok) {
        toast.error(controller.signal.aborted
          ? "Sincronização demorou mais de 60s. Verifique a Conexão Meta."
          : `Falha na sincronização: ${res.erro}`);
      } else {
        const { synced = 0, errors: errs = 0, total = 0 } = res.data ?? {};
        if (errs > 0) {
          toast.warning(`${synced} de ${total} contas sincronizadas — ${errs} com erro (verifique a Conexão Meta)`);
        } else {
          toast.success(`${synced} contas sincronizadas com sucesso`);
        }
      }
      await load();
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
      const res = await chamar("/api/traffic/billing-type", { accountId: account.id, isPrepaid: newIsPrepaid });
      if (!res.ok) {
        toast.error(`Falha ao alterar tipo de cobrança: ${res.erro}`);
        return;
      }
      toast.success(`${account.clientName} → ${newIsPrepaid ? "Pré-pago (Pix/Boleto)" : "Pós-pago (Cartão)"}`);
      await load();
    } finally {
      setTogglingId(null);
    }
  }, [togglingId, load]);

  const alternarOculta = useCallback(async (account: EnrichedAccount) => {
    const next = new Set(ocultas);
    const ocultar = !next.has(account.meta_account_id);
    if (ocultar) next.add(account.meta_account_id); else next.delete(account.meta_account_id);
    setOcultas(next);
    const r = await chamar("/api/traffic/hidden-accounts", { ids: [...next] });
    if (!r.ok) {
      toast.error(`Não consegui ${ocultar ? "ocultar" : "mostrar"} a conta: ${r.erro}`);
      loadOcultas();
      return;
    }
    toast.success(ocultar
      ? `${account.clientName} oculta — sai do Início, do Hoje e dos Anúncios.`
      : `${account.clientName} de volta às telas do tráfego.`);
  }, [ocultas, loadOcultas]);

  useEffect(() => {
    load();
    loadOcultas();
    // Auto-refresh a cada 5 minutos
    intervalRef.current = setInterval(load, 5 * 60_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [load, loadOcultas]);

  // Migração única: "Data do próximo aporte" que ficou só no localStorage do antigo Controle de
  // Investimento vai para o servidor (só datas que ainda valem e que o servidor não tem).
  useEffect(() => {
    if (migrouRef.current || loading || !aporteDisponivel || accounts.length === 0) return;
    migrouRef.current = true;
    let bruto: string | null = null;
    try { bruto = localStorage.getItem(CHAVE_LOCAL_INVESTIMENTO); } catch { return; }
    if (!bruto) return;
    const pendentes = aportesParaMigrar(
      bruto,
      accounts.map((a) => ({ id: a.id, clientId: a.clients?.id, proximoAporte: a.clients?.next_payment_date ?? null })),
      todaySP(),
    );
    (async () => {
      let tudoCerto = true;
      for (const p of pendentes) {
        const r = await chamar<{ avisos?: string[] }>("/api/traffic/budget-rules", { adAccountId: p.adAccountId, nextPaymentDate: p.data });
        if (!r.ok || (r.data?.avisos?.length ?? 0) > 0) tudoCerto = false;
      }
      if (!tudoCerto) return; // tenta de novo na próxima visita
      try { localStorage.removeItem(CHAVE_LOCAL_INVESTIMENTO); } catch { /* sem storage, sem problema */ }
      if (pendentes.length > 0) {
        toast.message(`${pendentes.length} data(s) de próximo aporte que estavam só neste navegador foram salvas no servidor.`);
        load();
      }
    })();
  }, [loading, aporteDisponivel, accounts, load]);

  // ── Dados computados ─────────────────────────────────────
  const visiveis = useMemo(() => accounts.filter((a) => !ocultas.has(a.meta_account_id)), [accounts, ocultas]);
  const escondidas = useMemo(() => accounts.filter((a) => ocultas.has(a.meta_account_id)), [accounts, ocultas]);

  const porFiltro = filtro === "all"
    ? visiveis
    : filtro === "ritmo"
      ? visiveis.filter((a) => foraDoRitmo(a.leitura))
      // O card "Atenção" conta saldo baixo E pendência na conta (review): o filtro mostra os dois.
      : filtro === "warning"
        ? visiveis.filter((a) => a.display.severity === "warning" || a.display.severity === "review")
        : visiveis.filter((a) => a.display.severity === filtro);
  const q = clientSearch.trim().toLowerCase();
  const filtered = q
    ? porFiltro.filter((a) => a.clientName.toLowerCase().includes(q) || a.meta_account_id.toLowerCase().includes(q))
    : porFiltro;

  const criticalCount  = visiveis.filter((a) => a.display.severity === "critical").length;
  const warningCount   = visiveis.filter((a) => a.display.severity === "warning").length;
  const reviewCount    = visiveis.filter((a) => a.display.severity === "review").length;
  const comVerba       = visiveis.filter((a) => a.ritmo.status !== "sem_verba").length;
  const foraRitmoCount = visiveis.filter((a) => foraDoRitmo(a.leitura)).length;

  // Sync atrasado: o servidor sincroniza de 2 em 2 horas das 8h às 20h (sync-saldos). O antigo
  // "mais de 30 min" acendia o dia inteiro e ninguém mais olhava.
  const syncStale = syncAtrasado(lastSyncAt, Date.now());

  // ── WhatsApp link ─────────────────────────────────────────
  function buildWaLink(account: EnrichedAccount): string {
    const phone = account.clients?.client_finance_phone;
    if (!phone) return "";
    const clientName = account.clientName;
    const balance = account.display.primary;
    // Quem paga no cartão não recarrega por Pix: a mensagem pede para conferir o cartão.
    const pagaNoCartao = !account.is_prepaid || account.clients?.payment_method === "cartao";
    const pix = account.clients?.client_pix_key;
    const text = encodeURIComponent(
      pagaNoCartao
        ? `Oi ${clientName}! Sua conta de anúncios está em ${balance}. Pode conferir o cartão cadastrado na Meta pra não pausar as campanhas?`
        : `Oi ${clientName}! Sua conta de anúncios está em ${balance}. Pode fazer um Pix pra não pausar as campanhas?${pix ? ` Chave: ${pix}` : ""}`
    );
    return `https://wa.me/${phone.replace(/\D/g, "")}?text=${text}`;
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center py-24" role="status" aria-label="Carregando contas">
        <Loader2 size={20} className="animate-spin text-muted-foreground" />
      </div>
    );
  }


  // ── Ações da conta (linha e cartão) ───────────────────────
  const acoes = (account: EnrichedAccount, oculta: boolean, comRotulo = false) => {
    const waLink = buildWaLink(account);
    const critico = account.display.severity === "critical" && !oculta;
    const botao = cn(
      "inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-border text-muted-foreground transition-colors",
      "hover:border-primary/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      comRotulo ? "px-2.5 text-xs" : "w-8",
    );
    return (
      <div className={cn("flex items-center gap-1.5", comRotulo ? "flex-wrap" : "justify-end")}>
        {waLink ? (
          <a
            href={waLink}
            target="_blank"
            rel="noopener noreferrer"
            title={`WhatsApp financeiro — ${account.clientName}`}
            aria-label={`WhatsApp financeiro — ${account.clientName}`}
            className={cn(
              botao,
              critico
                ? "border-lone-danger-border text-lone-danger hover:bg-lone-danger-bg hover:text-lone-danger"
                : "hover:border-lone-success-border hover:text-lone-success",
            )}
          >
            <MessageCircle size={14} aria-hidden="true" />
            {comRotulo && "WhatsApp"}
          </a>
        ) : (
          <button
            type="button"
            disabled
            title="Cadastre o telefone financeiro em Verba e alertas"
            aria-label="WhatsApp financeiro indisponível: falta o telefone"
            className={cn(botao, "cursor-not-allowed opacity-50 hover:border-border hover:text-muted-foreground")}
          >
            <MessageCircle size={14} aria-hidden="true" />
            {comRotulo && "WhatsApp"}
          </button>
        )}
        <button
          type="button"
          onClick={() => setModalAccount(account)}
          title="Verba e alertas"
          aria-label={`Verba e alertas — ${account.clientName}`}
          className={botao}
        >
          <Settings2 size={14} aria-hidden="true" />
          {comRotulo && "Verba e alertas"}
        </button>
        <button
          type="button"
          onClick={() => alternarOculta(account)}
          title={oculta ? "Mostrar de novo nas telas do tráfego" : "Ocultar das telas do tráfego (Início, Hoje, Anúncios)"}
          aria-label={oculta ? `Mostrar ${account.clientName}` : `Ocultar ${account.clientName}`}
          className={botao}
        >
          {oculta ? <Eye size={14} aria-hidden="true" /> : <EyeOff size={14} aria-hidden="true" />}
          {comRotulo && (oculta ? "Mostrar" : "Ocultar")}
        </button>
      </div>
    );
  };

  // Id da conta (quieto) + pré/pós, que troca no clique.
  const metaConta = (account: EnrichedAccount) => (
    <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
      <span className="truncate font-mono">{account.meta_account_id}</span>
      <span aria-hidden="true">·</span>
      <button
        type="button"
        onClick={(e) => handleToggleBillingType(account, e)}
        disabled={togglingId === account.id}
        title={`${account.is_prepaid ? "Pré-pago" : "Pós-pago"} · definido ${account.billing_type_source === "manual" ? "manualmente" : "automaticamente"} · clique pra trocar`}
        className="shrink-0 whitespace-nowrap rounded underline-offset-2 transition-colors hover:text-primary hover:underline disabled:opacity-40"
      >
        {account.is_prepaid ? "pré-pago" : "pós-pago"}
        {account.billing_type_source === "manual" && " (manual)"}
      </button>
    </div>
  );

  const avisos = (account: EnrichedAccount) => (
    <>
      {account.aporte && (
        <p className={cn(
          "mt-1.5 flex items-center gap-1 text-[11px] font-medium",
          account.aporte.tipo === "vencido" ? "text-lone-danger" : "text-lone-warning",
        )}>
          <CalendarClock size={12} className="shrink-0" aria-hidden="true" /> {account.aporte.texto}
        </p>
      )}
      {account.sync_error && (
        <p className="mt-1 truncate text-[11px] text-muted-foreground" title={account.last_error_message ?? account.sync_error}>
          {account.sync_error}
        </p>
      )}
    </>
  );

  // Faixa colorida à esquerda (sem deslocar o conteúdo): crítico e atenção se acham de relance.
  const faixa = (account: EnrichedAccount, oculta: boolean) => {
    const f = oculta ? null : STATUS_CONTA[account.display.severity].faixa;
    return f ? <span className={cn("absolute inset-y-0 left-0 w-[3px]", f)} aria-hidden="true" /> : null;
  };

  const linha = (account: EnrichedAccount, oculta = false) => {
    const apagada = oculta || account.display.severity === "paused";
    return (
      <div
        key={account.id}
        role="row"
        className={cn(
          "relative grid items-center gap-4 border-b border-border px-4 py-3.5 transition-colors last:border-b-0 hover:bg-muted/40",
          COLUNAS,
          !oculta && account.display.severity === "critical" && "bg-lone-danger-bg",
          apagada && "opacity-60",
        )}
      >
        {faixa(account, oculta)}

        {/* Cliente / conta */}
        <div role="cell" className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground" title={account.clientName}>{account.clientName}</p>
          {metaConta(account)}
          <div className="mt-1.5 xl:hidden"><ChipStatus account={account} /></div>
          {avisos(account)}
        </div>

        {/* Status (xl) */}
        <div role="cell" className="hidden min-w-0 xl:block"><ChipStatus account={account} /></div>

        {/* Saldo (com dias · gasto/dia embaixo antes do xl) */}
        <div role="cell" className="min-w-0">
          <div className="xl:hidden"><CelulaSaldo account={account} comDias /></div>
          <div className="hidden xl:block"><CelulaSaldo account={account} /></div>
        </div>

        <div role="cell" className="hidden xl:block"><CelulaDias dias={account.daysRemaining} /></div>
        <div role="cell" className="hidden xl:block"><CelulaGastoDia valor={account.avgDailySpend} /></div>

        {/* Ritmo do mês */}
        <div role="cell" className="min-w-0">
          <CelulaRitmo ritmo={account.ritmo} leitura={account.leitura} onDefinirVerba={() => setModalAccount(account)} />
        </div>

        <div role="cell">{acoes(account, oculta)}</div>
      </div>
    );
  };

  // Celular: um cartão por conta, na mesma ordem de leitura da linha.
  const cartao = (account: EnrichedAccount, oculta = false) => (
    <article
      key={account.id}
      aria-label={account.clientName}
      className={cn(
        "relative overflow-hidden rounded-xl border border-border bg-card p-4",
        !oculta && account.display.severity === "critical" && "border-lone-danger-border",
        (oculta || account.display.severity === "paused") && "opacity-60",
      )}
    >
      {faixa(account, oculta)}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{account.clientName}</p>
          {metaConta(account)}
        </div>
        <div className="shrink-0"><ChipStatus account={account} /></div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <CelulaSaldo account={account} />
        <div className="space-y-2 text-right">
          <div>
            <p className="text-[11px] font-medium text-muted-foreground">Dura</p>
            <CelulaDias dias={account.daysRemaining} />
          </div>
          <div>
            <p className="text-[11px] font-medium text-muted-foreground">Gasto/dia</p>
            <p className="text-sm tabular-nums text-foreground">{account.avgDailySpend !== null ? brl0(account.avgDailySpend) : "—"}</p>
          </div>
        </div>
      </div>
      <div className="mt-3 border-t border-border pt-3">
        <p className="mb-1 text-[11px] font-medium text-muted-foreground">Ritmo do mês</p>
        <CelulaRitmo ritmo={account.ritmo} leitura={account.leitura} onDefinirVerba={() => setModalAccount(account)} />
      </div>
      {avisos(account)}
      <div className="mt-3">{acoes(account, oculta, true)}</div>
    </article>
  );

  const cabecalhoTabela = (
    <div role="row" className={cn("sticky top-0 z-10 grid gap-4 border-b border-border bg-card px-4 py-2.5", COLUNAS)}>
      {([
        ["Cliente / conta", ""],
        ["Status", "hidden xl:block"],
        ["Saldo", ""],
        ["Dura", "hidden xl:block text-right"],
        ["Gasto/dia", "hidden xl:block text-right"],
        ["Ritmo do mês", ""],
        ["Ações", "text-right"],
      ] as const).map(([h, cls]) => (
        <p key={h} role="columnheader" className={cn("text-lone-eyebrow uppercase text-muted-foreground", cls)}>{h}</p>
      ))}
    </div>
  );

  const lista = (contas: EnrichedAccount[], oculta = false) => (
    <>
      {/* Tabela (md+): rola por dentro, com o cabeçalho preso no topo. */}
      <div
        role="table"
        aria-label={oculta ? "Contas ocultas" : "Contas de anúncio"}
        className={cn("hidden md:block", !oculta && "max-h-[calc(100dvh-8rem)] overflow-y-auto")}
      >
        {cabecalhoTabela}
        <div role="rowgroup">{contas.map((a) => linha(a, oculta))}</div>
      </div>
      {/* Cartões (celular) */}
      <div className={cn("space-y-3 md:hidden", oculta && "p-3")}>{contas.map((a) => cartao(a, oculta))}</div>
    </>
  );

  const cards: { chave: Filtro; label: string; value: number; sub: string; color: string; icone: LucideIcon }[] = [
    { chave: "all", label: "Contas", value: visiveis.length, sub: "monitoradas", color: "text-foreground", icone: Wallet },
    { chave: "warning", label: "Atenção", value: warningCount + reviewCount, sub: "saldo baixo ou pendência na conta", color: warningCount + reviewCount > 0 ? "text-lone-warning" : "text-foreground", icone: AlertTriangle },
    { chave: "critical", label: "Críticos", value: criticalCount, sub: "ação imediata", color: criticalCount > 0 ? "text-lone-danger" : "text-foreground", icone: OctagonAlert },
    { chave: "ritmo", label: "Fora do ritmo", value: foraRitmoCount, sub: `acima, abaixo ou travadas · ${comVerba} com verba`, color: foraRitmoCount > 0 ? "text-lone-warning" : "text-foreground", icone: Gauge },
  ];
  const filtroAtivo = cards.find((c) => c.chave === filtro);

  return (
    <TooltipProvider delayDuration={150}>
    <div className="flex flex-1 flex-col bg-background">
      <div className="mx-auto w-full max-w-[1400px] space-y-5 px-4 py-6 sm:px-6">
        {loadError && (
          <div role="alert" className="rounded-lg border border-lone-danger-border bg-lone-danger-bg px-3 py-2 text-xs text-lone-danger">
            {loadError}
          </div>
        )}

        {conexao !== "ok" && (
          <AvisoConexaoMeta
            estado={conexao}
            detalhe="Saldos e gasto do mês param de sincronizar até reconectar. Os valores abaixo são da última sincronização."
          />
        )}

        {/* Cabeçalho */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-lone-h1 tracking-tight text-foreground">Contas &amp; Verba</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">Saldo, limite e ritmo do mês de cada conta de anúncio.</p>
            <p className={cn("mt-1.5 flex items-center gap-1.5 text-xs", syncStale ? "text-lone-warning" : "text-muted-foreground")}>
              {syncStale ? <WifiOff size={12} className="shrink-0" aria-hidden="true" /> : <Wifi size={12} className="shrink-0" aria-hidden="true" />}
              {syncStale
                ? `Última sincronização ${timeSince(lastSyncAt)} — o servidor sincroniza de 2 em 2 horas (8h–20h); confira a Conexão Meta ou clique em Sincronizar`
                : `Última sincronização com a Meta ${timeSince(lastSyncAt)}`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="secondary" size="sm">
              <Link href="/settings/grupos"><BellRing size={14} aria-hidden="true" /> Alertas por cliente</Link>
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setShowAddModal(true)}>
              <Plus size={14} aria-hidden="true" /> Adicionar conta
            </Button>
            <Button size="sm" onClick={handleSync} disabled={syncing}>
              <RefreshCw size={14} className={syncing ? "animate-spin" : ""} aria-hidden="true" />
              {syncing ? "Sincronizando…" : "Sincronizar"}
            </Button>
          </div>
        </div>

        {/* Cards de resumo — cada um filtra a lista (clicar de novo limpa). */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {cards.map((card) => {
            const ativo = filtro === card.chave;
            const Icone = card.icone;
            return (
              <button
                key={card.label}
                type="button"
                aria-pressed={ativo}
                onClick={() => setFiltro(ativo && card.chave !== "all" ? "all" : card.chave)}
                className={cn(
                  "group rounded-xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  ativo ? "border-primary/40 bg-primary/5" : "border-border bg-card hover:border-primary/25",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-lone-eyebrow uppercase text-muted-foreground">{card.label}</p>
                  <Icone size={16} className={cn("shrink-0", ativo ? "text-primary" : "text-muted-foreground")} aria-hidden="true" />
                </div>
                <p className={cn("mt-2 text-lone-hero tabular-nums tracking-tight", card.color)}>{card.value}</p>
                <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{card.sub}</p>
              </button>
            );
          })}
        </div>

        {/* Leva 7A (N3): quem precisa recarregar Pix/boleto e até quando, com rascunho do lembrete. */}
        <CalendarioRecargas
          hoje={todaySP()}
          contas={visiveis.map((a) => ({
            id: a.id, clientName: a.clientName, forma: a.clients?.payment_method ?? null, isPrepaid: a.is_prepaid,
            saldo: a.is_prepaid ? a.availableBalance : null, ritmoDia: a.last_3d_avg_spend ?? a.avgDailySpend,
            proximoAporte: a.clients?.next_payment_date ?? null, pixKey: a.clients?.client_pix_key ?? null,
            telefone: a.clients?.client_finance_phone ?? null,
          }))}
        />

        {/* Busca + filtro ativo */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input
              type="search"
              value={clientSearch}
              onChange={(e) => setClientSearch(e.target.value)}
              placeholder="Buscar cliente por nome ou ID da conta…"
              aria-label="Buscar cliente por nome ou ID da conta"
              className="h-9 w-full rounded-lg border border-input bg-card pl-9 pr-9 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
            />
            {clientSearch && (
              <button
                type="button"
                onClick={() => setClientSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Limpar busca"
              >
                <X size={14} />
              </button>
            )}
          </div>
          {filtro !== "all" && (
            <span className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 text-xs text-foreground">
              <Filter size={12} className="text-primary" aria-hidden="true" />
              Só {filtroAtivo?.label.toLowerCase() ?? filtro}
              <span className="tabular-nums text-muted-foreground">({filtered.length})</span>
              <button type="button" onClick={() => setFiltro("all")} aria-label="Limpar filtro" className="text-muted-foreground hover:text-foreground">
                <X size={12} />
              </button>
            </span>
          )}
        </div>

        {/* Lista */}
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center text-muted-foreground">
            <CheckCircle size={22} className="mb-2" aria-hidden="true" />
            <p className="text-sm text-foreground">
              {accounts.length === 0
                ? "Nenhuma conta Meta cadastrada ainda"
                : q
                ? `Nenhum cliente encontrado para "${clientSearch}"`
                : "Nenhuma conta nessa categoria"}
            </p>
            {accounts.length === 0 && (
              <p className="mt-1 text-xs">Clique em Adicionar conta para vincular uma conta do Meta Ads a um cliente.</p>
            )}
          </div>
        ) : (
          <div className="md:overflow-hidden md:rounded-xl md:border md:border-border md:bg-card">
            {lista(filtered)}
          </div>
        )}

        {/* Contas ocultas */}
        {escondidas.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <button
              type="button"
              aria-expanded={verOcultas}
              onClick={() => setVerOcultas((v) => !v)}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <span className="flex items-center gap-1.5"><EyeOff size={13} aria-hidden="true" /> {escondidas.length} conta(s) oculta(s) — não aparecem no Início, no Hoje nem nos Anúncios</span>
              <span className="shrink-0 font-medium">{verOcultas ? "Esconder" : "Ver"}</span>
            </button>
            {verOcultas && <div className="border-t border-border">{lista(escondidas, true)}</div>}
          </div>
        )}

        {/* Legenda */}
        <div className="grid gap-4 rounded-xl border border-border bg-card p-4 text-[11px] text-muted-foreground md:grid-cols-2">
          <div>
            <p className="mb-2 text-lone-eyebrow uppercase">Ritmo do mês</p>
            <BarraRitmo leitura={{ tom: "no_ritmo", pctGasto: 42, pctProjetado: 88, pctHoje: 50 }} className="max-w-[260px]" />
            <ul className="mt-2.5 space-y-1">
              <li className="flex items-center gap-2"><span className="h-2 w-5 rounded-full bg-lone-success" aria-hidden="true" /> Barra cheia: o que já saiu da verba do mês</li>
              <li className="flex items-center gap-2"><span className="h-2 w-5 rounded-full" style={{ background: "color-mix(in srgb, var(--lone-success) 30%, transparent)" }} aria-hidden="true" /> Parte clara: onde o mês fecha no ritmo dos últimos 3 dias</li>
              <li className="flex items-center gap-2"><span className="ml-2 mr-2 h-3.5 w-[3px] rounded-full bg-foreground" aria-hidden="true" /> Traço: onde o gasto deveria estar hoje</li>
            </ul>
            <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
              <span className="text-lone-success">No ritmo</span>
              <span className="text-lone-warning">Acima (estoura antes do fim)</span>
              <span className="text-lone-info">Abaixo</span>
              <span className="text-lone-danger">Travada</span>
            </p>
          </div>
          <div>
            <p className="mb-2 text-lone-eyebrow uppercase">Status da conta</p>
            <ul className="space-y-1">
              <li className="flex items-center gap-2"><OctagonAlert size={12} className="shrink-0 text-lone-danger" aria-hidden="true" /> Crítico — saldo abaixo do limite, menos de 1 dia ou pagamento falhou</li>
              <li className="flex items-center gap-2"><AlertTriangle size={12} className="shrink-0 text-lone-warning" aria-hidden="true" /> Atenção — saldo baixo ou menos de 3 dias</li>
              <li className="flex items-center gap-2"><CircleAlert size={12} className="shrink-0 text-lone-warning" aria-hidden="true" /> Em análise — pendência na conta Meta</li>
              <li className="flex items-center gap-2"><CheckCircle2 size={12} className="shrink-0 text-lone-success" aria-hidden="true" /> Ativa — saldo OK ou cartão sem limite</li>
              <li className="flex items-center gap-2"><CirclePause size={12} className="shrink-0" aria-hidden="true" /> Desativada / fora de operação</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Modal verba e alertas */}
      {modalAccount && (
        <AlertModal
          account={modalAccount}
          aporteDisponivel={aporteDisponivel}
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
    </TooltipProvider>
  );
}
