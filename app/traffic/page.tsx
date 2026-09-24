"use client";

import { metaAccountStatus } from "@/lib/budgets/account-status";
import { toast } from "sonner";
import Header from "@/components/Header";
import DefesaAlertBanner from "@/components/DefesaAlertBanner";
import SystemAlertBanner from "@/components/SystemAlertBanner";
import MetricCard from "@/components/MetricCard";
import KanbanBoard from "@/components/KanbanBoard";
import AdsInsightCard from "@/components/AdsInsightCard";
import { useClientsStore } from "@/stores/useClientsStore";
import { useContentStore } from "@/stores/useContentStore";
import { useOperationalStore } from "@/stores/useOperationalStore";
import { useTrafficStore } from "@/stores/useTrafficStore";
import { useNotificationsStore } from "@/stores/useNotificationsStore";
import { useRole } from "@/lib/context/RoleContext";
import { useNav } from "@/lib/context/NavContext";
import {
  TrendingUp, AlertTriangle, CheckCircle, Users,
  Calendar, Save,
  Plus, X, Filter, Search,
  ClipboardCheck, BarChart2,
  MessageCircle, FileText, Star, ArrowUpRight, ArrowDownRight, Minus,
  Check, Megaphone, Eye, MousePointerClick, DollarSign, Target,
  Pause, AlertCircle, Download, ChevronDown, ChevronUp,
  Settings2, Zap, Activity, TrendingDown,
  Brain, ShieldAlert, Sparkles, CircleDot, Bell, FolderDown, Loader2, Facebook, Send,
  Wallet, CreditCard, Banknote, AlertOctagon, Info, Palette,
} from "lucide-react";
import { getAttentionColor, getAttentionLabel, todaySP } from "@/lib/utils";
import { emOperacao } from "@/lib/clients/operacao";
import type { Client, Task, AdCampaign, AdAccount, ClientInvestmentData, InvestmentPaymentMethod } from "@/lib/types";
import { fetchClientGroupMessageLog, type ClientGroupMessageLogRow } from "@/lib/supabase/queries";
import { useMetaConnection, fetchAdAccounts, fetchCampaignInsights, fetchAccountDemographics, TokenExpiredError } from "@/lib/meta/useMetaAds";
import { authedFetch } from "@/lib/supabase/authed-fetch";
import AtalhoCriativos from "@/components/traffic/AtalhoCriativos";
import { parseBRL, statusPacing, PACING_UI, diasEntre, diaDaSemana, segundaDaSemana, diasAntes } from "@/components/traffic/investimento";
import { chamar } from "@/lib/api/chamar";
import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { exportTrafficReportPdf, exportClientReportPdf, buildTrafficReportData, exportAllTrafficReportsZip } from "@/lib/exportTrafficPdf";
import { analyzeCampaigns, generateAccountReport, generateDailyRoutineAlerts } from "@/lib/ai/campaignAnalyzer";
import type { PortfolioSummary } from "@/lib/ai/campaignAnalyzer";

const STATUS_COLUMNS = [
  { id: "onboarding", title: "Onboarding", color: "bg-muted" },
  { id: "good", title: "Bons Resultados", color: "bg-primary" },
  { id: "average", title: "Resultados Médios", color: "bg-muted" },
  { id: "at_risk", title: "Em Risco", color: "bg-destructive" },
];

type TabType = "rotina" | "status" | "anuncios" | "investimento";

function getTodayStr() {
  return todaySP();
}

function getDayOfWeek(): number {
  return diaDaSemana(todaySP()); // 0=dom … 5=sex, em São Paulo
}

function formatNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return Math.round(n).toString();
}

function formatCurrency(n: number): string {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function pctChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

/** Campanha cujo insight a Meta não devolveu — mostrar "sem dados", nunca R$0. */
function insightFalhou(c: AdCampaign): boolean {
  return !!c.insightsFailed;
}

// Map Meta API objectives (v21.0 uses OUTCOME_* format) to our AdObjective type
function mapMetaObjective(objective?: string): import("@/lib/types").AdObjective {
  if (!objective) return "engagement";
  const obj = objective.toUpperCase();
  // v21.0 OUTCOME_* format
  if (obj.includes("OUTCOME_TRAFFIC")) return "traffic";
  if (obj.includes("OUTCOME_LEADS")) return "leads";
  if (obj.includes("OUTCOME_SALES") || obj.includes("OUTCOME_CONVERSIONS")) return "conversions";
  if (obj.includes("OUTCOME_AWARENESS") || obj.includes("OUTCOME_REACH")) return "reach";
  if (obj.includes("OUTCOME_ENGAGEMENT")) return "engagement";
  if (obj.includes("OUTCOME_APP_PROMOTION")) return "traffic";
  // Legacy objective format
  const lower = objective.toLowerCase();
  if (lower.includes("message")) return "messages";
  if (lower.includes("traffic") || lower.includes("link_click")) return "traffic";
  if (lower.includes("conversion") || lower.includes("product_catalog_sales")) return "conversions";
  if (lower.includes("reach") || lower.includes("brand_awareness")) return "reach";
  if (lower.includes("lead")) return "leads";
  if (lower.includes("engagement") || lower.includes("post_engagement") || lower.includes("video_views")) return "engagement";
  return "engagement";
}

export default function TrafficPage() {
  const router = useRouter();
  // ── Zustand stores ────────────────────────────────────────────────────────
  const clients = useClientsStore((s) => s.clients);
  const updateClientStatus = useClientsStore((s) => s.updateClientStatus);
  const initClients = useClientsStore((s) => s.init);
  const subClients = useClientsStore((s) => s.subscribeRealtime);

  const addDesignRequest = useContentStore((s) => s.addDesignRequest);
  const initContent = useContentStore((s) => s.init);
  const subContent = useContentStore((s) => s.subscribeRealtime);

  const tasks = useOperationalStore((s) => s.tasks);
  const initOps = useOperationalStore((s) => s.init);
  const subOps = useOperationalStore((s) => s.subscribeRealtime);

  const trafficRoutineChecks = useTrafficStore((s) => s.trafficRoutineChecks);
  const investmentData = useTrafficStore((s) => s.investmentData);
  const addTrafficRoutineCheck = useTrafficStore((s) => s.addTrafficRoutineCheck);
  const updateInvestmentData = useTrafficStore((s) => s.updateInvestmentData);
  const initTraffic = useTrafficStore((s) => s.init);
  const trafficLoadError = useTrafficStore((s) => s.loadError);

  const pushNotification = useNotificationsStore((s) => s.push);

  const criarDemanda = async (req: Omit<import("@/lib/types").DesignRequest, "id">): Promise<boolean> => {
    try {
      await addDesignRequest(req);
      return true;
    } catch (err) {
      toast.error(`Não consegui criar a demanda${err instanceof Error && err.message ? ` (${err.message})` : ""}. O pedido continua aberto — tente de novo.`);
      return false;
    }
  };

  useEffect(() => {
    initClients();
    initContent();
    initOps();
    initTraffic();
    const u1 = subClients();
    const u2 = subContent();
    const u3 = subOps();
    return () => { u1(); u2(); u3(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Status REAL da automação de mensagens (suporte/relatório) nos grupos.
  // Lido do client_group_message_log p/ não precisar marcar à mão o que já foi enviado.
  const [messageLog, setMessageLog] = useState<ClientGroupMessageLogRow[]>([]);
  useEffect(() => {
    // segunda desta semana em SP (domingo NÃO pula p/ a próxima)
    fetchClientGroupMessageLog(segundaDaSemana(todaySP())).then(setMessageLog);
  }, []);

  // Creative request modal state
  const [creativeModal, setCreativeModal] = useState<{
    campaign: import("@/lib/types").AdCampaign;
    client: import("@/lib/types").Client;
  } | null>(null);
  const [showDesignModal, setShowDesignModal] = useState(false);
  const { currentUser, role } = useRole();
  const isAdmin = role === "admin" || role === "manager";
  const { pendingTab, setPendingTab, setCurrentTab } = useNav();
  const [activeTab, setActiveTab] = useState<TabType>("rotina");

  // Consume pendingTab from secondary sidebar navigation
  useEffect(() => {
    if (!pendingTab) return;
    const VALID: TabType[] = ["rotina","status","anuncios","investimento"];
    if (VALID.includes(pendingTab as TabType)) {
      setActiveTab(pendingTab as TabType);
    }
    setPendingTab("");
  }, [pendingTab, setPendingTab]);

  // Keep NavContext in sync so sidebar can highlight active item
  useEffect(() => {
    setCurrentTab(activeTab);
  }, [activeTab, setCurrentTab]);

  // Shared real campaigns state — AdAnalyticsTab writes, RoutineTab reads
  const [sharedRealCampaigns, setSharedRealCampaigns] = useState<AdCampaign[]>([]);
  const [sharedIsUsingRealData, setSharedIsUsingRealData] = useState(false);

  // Gasto do mês por cliente (servidor, sincronizado em BRT via sync-balances) — fonte real
  // do pacing no Controle de Investimento, independente do preset de datas da aba Anúncios.
  const [monthSpendByClient, setMonthSpendByClient] = useState<Map<string, number>>(new Map());
  // Falha aqui NÃO é "gasto zero": o pacing mostra "sem dados" em vez de "no ritmo".
  const [monthSpendFalhou, setMonthSpendFalhou] = useState(false);
  useEffect(() => {
    let alive = true;
    chamar<{ accounts?: Array<{ current_month_spend: number | null; clients?: { id?: string } }> }>("/api/traffic/sync-balances")
      .then((r) => {
        if (!alive) return;
        const contas = r.data?.accounts;
        if (!r.ok || !Array.isArray(contas)) { setMonthSpendFalhou(true); return; }
        const m = new Map<string, number>();
        for (const a of contas) {
          const cid = a.clients?.id;
          if (cid && a.current_month_spend != null) {
            m.set(cid, (m.get(cid) ?? 0) + a.current_month_spend);
          }
        }
        setMonthSpendFalhou(false);
        setMonthSpendByClient(m);
      });
    return () => { alive = false; };
  }, []);

  // Workspace filter
  const trafficManagers = [...new Set(clients.map((c) => c.assignedTraffic))];
  const [workspaceFilter, setWorkspaceFilter] = useState("all");
  const effectiveFilter = role === "traffic" && workspaceFilter === "all" ? currentUser : workspaceFilter;
  const filteredClients = effectiveFilter === "all" ? clients : clients.filter((c) => c.assignedTraffic === effectiveFilter);

  // Metrics
  const atRiskCount = filteredClients.filter((c) => c.status === "at_risk").length;
  const goodCount = filteredClients.filter((c) => c.status === "good").length;

  // Kanban data
  const statusKanbanCols = STATUS_COLUMNS.map((col) => ({
    ...col,
    items: filteredClients.filter((c) => c.status === col.id),
  }));

  const trafficTasks = effectiveFilter === "all"
    ? tasks.filter((t) => t.role === "traffic")
    : tasks.filter((t) => t.role === "traffic" && t.assignedTo === effectiveFilter);

  const tabs: { key: TabType; label: string; icon?: React.ReactNode }[] = [
    { key: "rotina", label: "Rotina Diária", icon: <ClipboardCheck size={14} /> },
    { key: "status", label: "Status Clientes" },
    { key: "anuncios", label: "Anúncios", icon: <Megaphone size={14} /> },
    { key: "investimento", label: "Investimento", icon: <Wallet size={14} /> },
  ];

  return (
    <div className="flex flex-col flex-1 overflow-auto">
      <Header title="Tráfego Pago" subtitle="Gestão de performance e campanhas" />

      <div className="p-6 space-y-6 animate-fade-in">
        <DefesaAlertBanner />
        {isAdmin && <SystemAlertBanner />}
        {trafficLoadError && (
          <div className="flex items-center gap-3 rounded-xl border border-lone-danger-border bg-lone-danger-bg px-4 py-3 text-xs text-lone-danger">
            <AlertTriangle size={14} className="shrink-0" />
            <span className="flex-1">Não consegui carregar a rotina e as contas de tráfego ({trafficLoadError}). O que aparece abaixo pode estar incompleto.</span>
            <button onClick={() => initTraffic()} className="font-medium underline hover:no-underline">Tentar de novo</button>
          </div>
        )}
        {/* Workspace Filter */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Filter size={14} className="text-muted-foreground" />
            <span className="text-xs text-muted-foreground font-medium">Workspace:</span>
          </div>
          <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
            <button
              onClick={() => setWorkspaceFilter("all")}
              className={`text-xs px-3 py-1.5 rounded-md transition-colors ${
                (effectiveFilter === "all" || (role !== "traffic" && workspaceFilter === "all"))
                  ? "bg-card text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Todos
            </button>
            {trafficManagers.map((name) => (
              <button
                key={name}
                onClick={() => setWorkspaceFilter(name)}
                className={`text-xs px-3 py-1.5 rounded-md transition-colors ${
                  effectiveFilter === name
                    ? "bg-card text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {name}
              </button>
            ))}
          </div>
          <span className="text-xs text-muted-foreground">
            {filteredClients.length} cliente(s)
          </span>
          <button
            onClick={() => setShowDesignModal(true)}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/30 text-primary text-xs font-medium hover:bg-primary/20 transition-colors"
          >
            <Palette size={13} /> Solicitar Arte ao Designer
          </button>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <MetricCard icon={Users} label="Clientes" value={filteredClients.length} sub="na carteira" iconColor="text-primary" iconBg="bg-primary/15" onClick={() => setActiveTab("status")} />
          <MetricCard icon={CheckCircle} label="Bons Resultados" value={goodCount} sub="clientes" iconColor="text-primary" iconBg="bg-primary/15" />
          <MetricCard icon={AlertTriangle} label="Em Risco" value={atRiskCount} sub="clientes" iconColor="text-destructive" iconBg="bg-destructive/10" />
          <MetricCard icon={TrendingUp} label="Tarefas Abertas" value={trafficTasks.filter(t => t.status !== "done").length} sub="pendentes" iconColor="text-primary" iconBg="bg-primary/15" />
        </div>

        {/* Inteligência Criativa — resumo do dia + atalho (a ação fica em /traffic/criativos) */}
        <AtalhoCriativos />

        {/* Tabs */}
        <div>
          <div className="flex gap-1 mb-5 border-b border-border overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap ${
                  activeTab === tab.key
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.icon}
                {tab.label}
                {tab.key === "rotina" && (() => {
                  const today = getTodayStr();
                  const todayChecks = trafficRoutineChecks.filter((c) => c.date === today && (effectiveFilter === "all" || c.completedBy === effectiveFilter));
                  const activeClients = filteredClients.filter(emOperacao);
                  const pending = activeClients.length - todayChecks.filter((c) => c.type === "support").length;
                  return pending > 0 ? (
                    <span className="ml-1 text-xs bg-destructive/20 text-destructive px-1.5 py-0.5 rounded-full">{pending}</span>
                  ) : null;
                })()}
              </button>
            ))}
          </div>

          {/* Rotina Diária */}
          {activeTab === "rotina" && (
            <RoutineTab
              clients={filteredClients}
              routineChecks={trafficRoutineChecks}
              onCheck={addTrafficRoutineCheck}
              currentUser={currentUser}
              effectiveFilter={effectiveFilter}
              tasks={trafficTasks}
              adCampaigns={sharedIsUsingRealData ? sharedRealCampaigns : []}
              isUsingRealData={sharedIsUsingRealData}
              messageLog={messageLog}
            />
          )}

          {/* Status Kanban */}
          {activeTab === "status" && (
            <div className="animate-fade-in">
              <div className="flex items-center gap-3 mb-4">
                <p className="text-muted-foreground text-sm">Arraste os clientes entre colunas para atualizar o status de performance.</p>
                <div className="flex items-center gap-2 ml-auto">
                  {statusKanbanCols.map((col) => (
                    <span key={col.id} className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-md">
                      {col.title}: <span className="text-foreground font-medium">{col.items.length}</span>
                    </span>
                  ))}
                </div>
              </div>
              <KanbanBoard<Client>
                columns={statusKanbanCols}
                onMove={(clientId, _from, toStatus) => {
                  updateClientStatus(clientId, toStatus as Client["status"], currentUser);
                }}
                renderCard={(client) => (
                  <div
                    onClick={() => router.push(`/clients/${client.id}`)}
                    className={`bg-card border rounded-lg p-3 transition-colors cursor-pointer ${
                    client.status === "at_risk"
                      ? "border-destructive/30 hover:border-destructive/50"
                      : "border-border hover:border-primary/30"
                  }`}>
                    <div className="flex items-center gap-2 mb-2">
                      <div className={`w-7 h-7 rounded-md flex items-center justify-center text-xs font-bold ${
                        client.status === "at_risk" ? "bg-destructive/20 text-destructive" : "bg-primary/20 text-primary"
                      }`}>
                        {client.name[0]}
                      </div>
                      <span className="font-medium text-foreground text-sm">{client.name}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mb-2">{client.assignedTraffic}</p>
                    {/* O PORQUÊ do status. Sem isso o kanban era só uma coluna — ninguém sabia se
                        "em risco" era CPL, conta parada ou alguém que arrastou. */}
                    {client.statusMotivo && (
                      <p className={`text-[11px] mb-2 leading-snug ${client.status === "at_risk" ? "text-lone-danger" : client.status === "average" ? "text-lone-warning" : "text-muted-foreground"}`}>
                        {client.statusMotivo}
                        {client.statusOrigem === "manual" && <span className="opacity-70"> · manual</span>}
                      </p>
                    )}
                    <div className="flex items-center justify-between">
                      <span className={`badge border text-xs ${getAttentionColor(client.attentionLevel)}`}>
                        {getAttentionLabel(client.attentionLevel)}
                      </span>
                    </div>
                  </div>
                )}
              />
            </div>
          )}

          {/* Anuncios Tab */}
          {activeTab === "anuncios" && (
            <AdAnalyticsTab
              clients={filteredClients}
              accounts={[]}
              campaigns={[]}
              currentUser={currentUser}
              onRealDataChange={(campaigns, isReal) => {
                setSharedRealCampaigns(campaigns);
                setSharedIsUsingRealData(isReal);
              }}
              onRequestCreative={(camp, cl) => setCreativeModal({ campaign: camp, client: cl })}
            />
          )}

          {/* Controle de Investimento Tab */}
          {activeTab === "investimento" && (
            <InvestmentControlTab
              clients={filteredClients}
              adCampaigns={sharedIsUsingRealData ? sharedRealCampaigns : []}
              investmentData={investmentData}
              monthSpendByClient={monthSpendByClient}
              monthSpendFalhou={monthSpendFalhou}
              onSave={updateInvestmentData}
              isUsingRealData={sharedIsUsingRealData}
              currentUser={currentUser}
            />
          )}
        </div>
      </div>

      {/* Pedido de arte direto (sem campanha) */}
      {showDesignModal && (
        <TrafficDesignRequestModal
          clients={filteredClients}
          currentUser={currentUser}
          onClose={() => setShowDesignModal(false)}
          onSubmit={async (req) => {
            // Som, aviso e fechar só depois que o servidor confirmou — antes o modal fechava e a falha sumia.
            if (!(await criarDemanda(req))) return false;
            pushNotification("content", "Arte solicitada ao Designer", `Pedido de arte para "${req.clientName}" enviado para a fila do Designer.`, req.clientId);
            import("@/lib/audio").then((m) => m.playNotificationSound()).catch(() => {});
            toast.success("Pedido enviado para a fila do Designer.");
            setShowDesignModal(false);
            return true;
          }}
        />
      )}

      {/* Creative Request Modal */}
      {creativeModal && (
        <CreativeRequestModal
          campaign={creativeModal.campaign}
          client={creativeModal.client}
          currentUser={currentUser}
          onClose={() => setCreativeModal(null)}
          onSubmit={async (req) => {
            if (!(await criarDemanda(req))) return false;
            pushNotification("content", "Criativo solicitado ao Design", `Pedido de criativo para campanha "${creativeModal.campaign.name}" enviado para a fila do Designer com prioridade ${req.priority === "critical" ? "crítica" : "alta"}.`, creativeModal.client.id);
            import("@/lib/audio").then((m) => m.playNotificationSound()).catch(() => {});
            toast.success("Pedido de criativo enviado para a fila do Designer.");
            setCreativeModal(null);
            return true;
          }}
        />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// TRAFFIC DESIGN REQUEST MODAL (pedido direto sem campanha)
// ══════════════════════════════════════════════════════════════

const AD_FORMATS = [
  "Video Selfie (9:16)", "Video Demonstracao (9:16)", "Reel Bastidores (9:16)",
  "Post Feed (1:1)", "Post Feed (4:5)", "Carrossel (1:1)", "Story (9:16)",
  "Banner Display", "Antes/Depois", "Outro",
];

function TrafficDesignRequestModal({
  clients, currentUser, onClose, onSubmit,
}: {
  clients: import("@/lib/types").Client[];
  currentUser: string;
  onClose: () => void;
  onSubmit: (req: Omit<import("@/lib/types").DesignRequest, "id">) => Promise<boolean>;
}) {
  const [enviando, setEnviando] = useState(false);
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [format, setFormat] = useState("Post Feed (1:1)");
  const [briefing, setBriefing] = useState("");
  const [priority, setPriority] = useState<"low" | "medium" | "high" | "critical">("medium");
  const [deadline, setDeadline] = useState("");

  const selectedClient = clients.find((c) => c.id === clientId);

  const handleSubmit = async () => {
    if (!selectedClient || !briefing.trim() || enviando) return;
    setEnviando(true);
    await onSubmit({
      title: `Arte Tráfego — ${selectedClient.name}`,
      clientId: selectedClient.id,
      clientName: selectedClient.name,
      requestedBy: currentUser,
      priority,
      status: "queued",
      format,
      briefing: briefing.trim(),
      deadline: deadline || undefined,
    });
    setEnviando(false);
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-overlay backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-card border border-border rounded-2xl shadow-2xl p-6 space-y-4 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold flex items-center gap-2">
              <Palette size={16} className="text-primary" /> Solicitar Arte ao Designer
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">Pedido direto do Tráfego → fila do Designer</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        {/* Cliente */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">Cliente</label>
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
          >
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* Formato */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">Formato</label>
          <div className="flex flex-wrap gap-1.5">
            {AD_FORMATS.map((f) => (
              <button
                key={f}
                onClick={() => setFormat(f)}
                className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                  format === f
                    ? "bg-primary/20 text-primary border-primary/30"
                    : "bg-muted text-muted-foreground border-border hover:text-foreground"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Briefing */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">Briefing / Objetivo do anúncio</label>
          <textarea
            value={briefing}
            onChange={(e) => setBriefing(e.target.value)}
            rows={3}
            placeholder="Ex: Anuncio para campanha de mensagens. Produto: Camisetas. CTA: Chame no WhatsApp. Tom: descontraido..."
            className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary resize-none"
          />
        </div>

        {/* Prioridade + Prazo */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Prioridade</label>
            <div className="flex gap-1.5">
              {(["low","medium","high","critical"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPriority(p)}
                  className={`flex-1 text-xs py-1.5 rounded-lg border transition-colors ${
                    priority === p
                      ? p === "critical" ? "bg-destructive/20 text-destructive border-destructive/30"
                      : p === "high" ? "bg-lone-warning-bg text-lone-warning border-lone-warning-border"
                      : p === "medium" ? "bg-primary/20 text-primary border-primary/30"
                      : "bg-muted text-muted-foreground border-border"
                      : "bg-muted text-muted-foreground border-border hover:text-foreground"
                  }`}
                >
                  {p === "critical" ? "Urgente" : p === "high" ? "Alta" : p === "medium" ? "Média" : "Baixa"}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Prazo (opcional)</label>
            <input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
            />
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 py-2 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground transition-colors">
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={!briefing.trim() || !clientId || enviando}
            className="flex-1 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {enviando ? <Loader2 size={14} className="animate-spin" /> : <Palette size={14} />} {enviando ? "Enviando…" : "Enviar para o Designer"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// CREATIVE REQUEST MODAL (Traffic → Design bridge)
// ══════════════════════════════════════════════════════════════

const OBJECTIVE_LABELS: Record<string, string> = {
  messages: "Mensagens (WhatsApp/DM)",
  traffic: "Visitas ao Perfil/Site",
  conversions: "Conversoes",
  reach: "Alcance/Visibilidade",
  engagement: "Engajamento",
  leads: "Geracao de Leads",
};

const SMART_SUGGESTIONS: Record<string, { format: string; description: string }[]> = {
  messages: [
    { format: "Video Selfie (9:16)", description: "Dono do negocio falando direto com a camera, CTA forte para WhatsApp" },
    { format: "Carrossel Prova Social", description: "4-5 slides com depoimentos reais + botao de mensagem no final" },
    { format: "Story Interativo", description: "Enquete/Quiz nos stories com link de contato no swipe up" },
  ],
  traffic: [
    { format: "Post Estatico Premium", description: "Imagem de alto valor visual com curiosidade/gancho irresistivel" },
    { format: "Reel Bastidores (9:16)", description: "Video mostrando o dia-a-dia, autenticidade gera cliques" },
    { format: "Carrossel Educativo", description: "5 dicas rapidas com CTA de 'saiba mais no perfil'" },
  ],
  conversions: [
    { format: "Video Demonstracao", description: "Produto/servico em acao com oferta limitada e CTA urgente" },
    { format: "Antes/Depois", description: "Transformacao visual do resultado com prova social" },
    { format: "Reel Oferta Flash", description: "Contagem regressiva + beneficio claro + link de compra" },
  ],
  reach: [
    { format: "Reel Viral (9:16)", description: "Conteudo de entretenimento/educacao com gancho nos 3 primeiros segundos" },
    { format: "Post Carrossel Valor", description: "Informacao gratuita de alto valor que as pessoas compartilham" },
    { format: "Meme Contextual", description: "Humor relacionado ao nicho com branding sutil" },
  ],
  engagement: [
    { format: "Post Pergunta", description: "Imagem provocativa com pergunta que gera debate nos comentarios" },
    { format: "Reel Tutorial Rapido", description: "Dica pratica em 15 segundos que gera saves e shares" },
    { format: "Carrossel Controverso", description: "Opiniao forte do nicho que polariza e gera engajamento" },
  ],
  leads: [
    { format: "Video Isca Digital", description: "Preview de material gratuito (PDF, aula) com CTA para cadastro" },
    { format: "Carrossel Case Study", description: "Resultado de um cliente com formulario de 'quero igual'" },
    { format: "Story Urgencia", description: "Vagas limitadas + timer + swipe para formulario" },
  ],
};

function CreativeRequestModal({
  campaign, client, currentUser, onClose, onSubmit,
}: {
  campaign: import("@/lib/types").AdCampaign;
  client: import("@/lib/types").Client;
  currentUser: string;
  onClose: () => void;
  onSubmit: (req: Omit<import("@/lib/types").DesignRequest, "id">) => Promise<boolean>;
}) {
  const [enviando, setEnviando] = useState(false);
  const [selectedSuggestion, setSelectedSuggestion] = useState<number | null>(null);
  const [customFormat, setCustomFormat] = useState("Post Feed (1:1)");
  const [observations, setObservations] = useState("");
  const [priority, setPriority] = useState<"high" | "critical">(
    campaign.ctr < 1 || campaign.cpc > 5 ? "critical" : "high"
  );

  const suggestions = SMART_SUGGESTIONS[campaign.objective] ?? SMART_SUGGESTIONS.engagement;
  const objectiveLabel = OBJECTIVE_LABELS[campaign.objective] ?? campaign.objective;

  const handleSubmit = async () => {
    if (enviando) return;
    const suggestion = selectedSuggestion !== null ? suggestions[selectedSuggestion] : null;
    const format = suggestion ? suggestion.format : customFormat;
    const briefingParts = [
      `[SOLICITACAO DE TRAFEGO]`,
      ``,
      `Origem: Modulo de Trafego`,
      `Campanha: ${campaign.name}`,
      `Objetivo: ${objectiveLabel}`,
      ``,
      `Metricas atuais:`,
      `  CTR: ${campaign.ctr.toFixed(2)}%  |  CPC: R$${campaign.cpc.toFixed(2)}  |  CPM: R$${campaign.cpm.toFixed(2)}`,
      campaign.costPerResult ? `  Custo/Resultado: R$${campaign.costPerResult.toFixed(2)}` : null,
      campaign.spend > 0 ? `  Investimento: R$${campaign.spend.toFixed(2)}` : null,
      ``,
      suggestion ? `Sugestao IA: ${suggestion.format} — ${suggestion.description}` : null,
      observations ? `\nObservacoes do Gestor:\n${observations}` : null,
    ].filter(Boolean).join("\n");

    setEnviando(true);
    await onSubmit({
      title: `[TRAFEGO] Criativo — ${campaign.name}`,
      clientId: client.id,
      clientName: client.name,
      requestedBy: currentUser,
      priority,
      status: "queued",
      format,
      briefing: briefingParts,
    });
    setEnviando(false);
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      <div className="absolute inset-0 bg-overlay backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-xl mx-4 bg-card border border-border rounded-2xl shadow-lg animate-fade-in overflow-hidden max-h-[90vh] flex flex-col">
        <div className="h-px w-full bg-gradient-to-r from-transparent via-primary/30 to-transparent shrink-0" />

        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                <Sparkles size={18} className="text-primary" />
                Solicitar Reforço Criativo
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                O pedido irá direto para a fila do Designer com tag [TRAFEGO]
              </p>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-card/5">
              <X size={16} />
            </button>
          </div>

          {/* Campaign context */}
          <div className="p-4 rounded-xl bg-primary/[0.03] border border-primary/10 space-y-2">
            <p className="text-[10px] text-primary uppercase tracking-wider font-semibold">Contexto da Campanha</p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Campanha", value: campaign.name },
                { label: "Cliente", value: client.name },
                { label: "Objetivo", value: objectiveLabel },
                { label: "Performance", value: `CTR ${campaign.ctr.toFixed(2)}% · CPC R$${campaign.cpc.toFixed(2)}` },
              ].map((item) => (
                <div key={item.label}>
                  <p className="text-[10px] text-muted-foreground">{item.label}</p>
                  <p className="text-xs font-medium text-foreground">{item.value}</p>
                </div>
              ))}
            </div>
            {(campaign.ctr < 1 || campaign.cpc > 5) && (
              <div className="flex items-center gap-1.5 mt-1 text-[10px] text-destructive">
                <AlertTriangle size={10} />
                Performance abaixo do esperado — criativo urgente
              </div>
            )}
          </div>

          {/* Smart Suggestions */}
          <div className="space-y-2">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold flex items-center gap-1.5">
              <Brain size={10} className="text-primary" />
              Sugestões do Sistema — {objectiveLabel}
            </p>
            <div className="space-y-1.5">
              {suggestions.map((s, i) => {
                const active = selectedSuggestion === i;
                return (
                  <button key={i} onClick={() => setSelectedSuggestion(active ? null : i)}
                    className={`w-full text-left p-3 rounded-xl border transition-all ${
                      active ? "border-primary/40 bg-primary/[0.05]" : "border-border hover:border-border"
                    }`}>
                    <div className="flex items-center gap-2">
                      <span className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold shrink-0 ${
                        active ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"
                      }`}>{i + 1}</span>
                      <div>
                        <p className={`text-xs font-medium ${active ? "text-foreground" : "text-muted-foreground"}`}>{s.format}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{s.description}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {selectedSuggestion === null && (
            <div className="space-y-1.5">
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Formato Manual</label>
              <select value={customFormat} onChange={(e) => setCustomFormat(e.target.value)}
                className="w-full bg-card border border-border rounded-xl px-3 py-2.5 text-xs text-foreground focus:border-primary/50 outline-none">
                {["Post Feed (1:1)", "Reel (9:16)", "Story (9:16)", "Carrossel", "Video", "Banner"].map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Prioridade</label>
            <div className="flex gap-2">
              {([
                { value: "high" as const, label: "Alta", color: "text-lone-warning border-lone-warning-border bg-lone-warning-bg" },
                { value: "critical" as const, label: "Crítica (Verba Rodando)", color: "text-destructive border-destructive/20 bg-destructive/5" },
              ]).map((p) => (
                <button key={p.value} onClick={() => setPriority(p.value)}
                  className={`flex-1 py-2 rounded-xl border text-xs font-medium transition-all ${
                    priority === p.value ? p.color : "border-border text-muted-foreground"
                  }`}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Observações (opcional)</label>
            <textarea value={observations} onChange={(e) => setObservations(e.target.value)}
              placeholder="Ex: CPA alto, precisamos de video mais agressivo com CTA direto..."
              rows={3}
              className="w-full bg-card border border-border rounded-xl px-4 py-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary/50 outline-none resize-none" />
          </div>

          {/* Preview */}
          <div className="p-3 rounded-xl bg-card border border-border">
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1">Preview no board do Designer</p>
            <div className="flex items-center gap-2">
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-destructive/15 text-destructive border border-destructive/20 font-bold">TRAFEGO</span>
              <span className="text-xs text-foreground font-medium">Criativo — {campaign.name}</span>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              {client.name} · {selectedSuggestion !== null ? suggestions[selectedSuggestion].format : customFormat} · {priority === "critical" ? "Crítica" : "Alta"}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border shrink-0">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-xs text-muted-foreground hover:text-foreground hover:bg-card/5 transition-all">
            Cancelar
          </button>
          <button onClick={handleSubmit} disabled={enviando}
            className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary transition-all disabled:opacity-50">
            {enviando ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} {enviando ? "Enviando…" : "Enviar para Produção"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// ROTINA DIARIA TAB
// ══════════════════════════════════════════════════════════════

function RoutineTab({
  clients,
  routineChecks,
  onCheck,
  currentUser,
  effectiveFilter,
  tasks,
  adCampaigns,
  isUsingRealData = false,
  messageLog = [],
}: {
  clients: Client[];
  routineChecks: typeof import("@/lib/mockData").mockTrafficRoutineChecks;
  onCheck: (check: { clientId: string; clientName: string; date: string; type: "support" | "report" | "feedback" | "analysis"; completedBy: string; note?: string }) => void | Promise<void>;
  currentUser: string;
  effectiveFilter: string;
  tasks: Task[];
  adCampaigns: AdCampaign[];
  isUsingRealData?: boolean;
  messageLog?: { clientId: string; dateKey: string; kind: "report" | "support"; status: string }[];
}) {
  const today = getTodayStr();
  const dayOfWeek = getDayOfWeek();
  const activeClients = clients.filter(emOperacao);

  const todayChecks = routineChecks.filter(
    (c) => c.date === today && (effectiveFilter === "all" || c.completedBy === effectiveFilter)
  );

  // Automação: "sent" no log conta como feito; "failed" vira alerta de ação manual.
  const supportSentAuto = (messageLog ?? []).filter((l) => l.kind === "support" && l.status === "sent" && l.dateKey === today).map((l) => l.clientId);
  const supportFailedIds = (messageLog ?? []).filter((l) => l.kind === "support" && l.status === "failed" && l.dateKey === today).map((l) => l.clientId);
  const supportDone = new Set<string>([...todayChecks.filter((c) => c.type === "support").map((c) => c.clientId), ...supportSentAuto]);
  const supportPending = activeClients.filter((c) => !supportDone.has(c.id));
  const supportCompleted = activeClients.filter((c) => supportDone.has(c.id));
  const supportFailed = activeClients.filter((c) => supportFailedIds.includes(c.id) && !supportDone.has(c.id));

  // Weekly checks
  const weekStartStr = segundaDaSemana(today);
  const weekChecks = routineChecks.filter(
    (c) => c.date >= weekStartStr && (effectiveFilter === "all" || c.completedBy === effectiveFilter)
  );

  const isMonday = dayOfWeek === 1;
  const isWednesday = dayOfWeek === 3;
  const isFriday = dayOfWeek === 5;

  const reportSentAuto = (messageLog ?? []).filter((l) => l.kind === "report" && l.status === "sent" && l.dateKey >= weekStartStr).map((l) => l.clientId);
  const reportsDone = new Set<string>([...weekChecks.filter((c) => c.type === "report").map((c) => c.clientId), ...reportSentAuto]);
  const feedbackDone = new Set(weekChecks.filter((c) => c.type === "feedback").map((c) => c.clientId));
  const analysisDone = new Set(weekChecks.filter((c) => c.type === "analysis").map((c) => c.clientId));

  const [feedbackNote, setFeedbackNote] = useState<Record<string, string>>({});
  const [analysisNote, setAnalysisNote] = useState<Record<string, string>>({});

  const handleSupport = (client: Client) => {
    onCheck({ clientId: client.id, clientName: client.name, date: today, type: "support", completedBy: currentUser });
  };

  const handleReport = (client: Client) => {
    onCheck({ clientId: client.id, clientName: client.name, date: today, type: "report", completedBy: currentUser });
  };

  const handleAnalysis = (client: Client) => {
    onCheck({ clientId: client.id, clientName: client.name, date: today, type: "analysis", completedBy: currentUser, note: analysisNote[client.id] || undefined });
    setAnalysisNote((prev) => ({ ...prev, [client.id]: "" }));
  };

  const handleFeedback = (client: Client) => {
    onCheck({ clientId: client.id, clientName: client.name, date: today, type: "feedback", completedBy: currentUser, note: feedbackNote[client.id] || undefined });
    setFeedbackNote((prev) => ({ ...prev, [client.id]: "" }));
  };

  const supportPct = activeClients.length > 0 ? Math.round((supportCompleted.length / activeClients.length) * 100) : 100;

  // AI Daily Routine Alerts (max 5)
  const dailyAIAlerts = useMemo(() => {
    const clientMap = new Map<string, { clientId: string; clientName: string; campaigns: AdCampaign[] }>();
    adCampaigns.forEach((c) => {
      const entry = clientMap.get(c.clientId) ?? { clientId: c.clientId, clientName: c.clientName, campaigns: [] };
      entry.campaigns.push(c);
      clientMap.set(c.clientId, entry);
    });
    return generateDailyRoutineAlerts([...clientMap.values()], 5);
  }, [adCampaigns]);

  // Task alerts
  const openTasks = tasks.filter((t) => t.status !== "done");
  // Prazo é data de calendário em SP: compara "YYYY-MM-DD", sem fuso do navegador no meio.
  const overdueTasks = openTasks.filter((t) => !!t.dueDate && t.dueDate < today);
  const dueSoonTasks = openTasks.filter((t) => {
    const d = t.dueDate ? diasEntre(today, t.dueDate) : null;
    return d !== null && d >= 0 && d <= 1;
  });

  return (
    <div className="animate-fade-in space-y-6">
      {/* AI Daily Briefing */}
      {dailyAIAlerts.length > 0 && (
        <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 via-surface to-surface overflow-hidden">
          <div className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Brain size={16} className="text-primary" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-foreground">Briefing Diário da AI</h3>
                <p className="text-[10px] text-muted-foreground">Contas que precisam de atenção hoje — máx. 5 por dia</p>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 font-semibold ml-1">AI</span>
              {isUsingRealData && (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 font-bold uppercase tracking-wider ml-auto">Dados reais</span>
              )}
            </div>
            <div className="space-y-2.5">
              {dailyAIAlerts.map((alert, i) => (
                <div
                  key={alert.clientId}
                  className={`flex items-start gap-3 p-3.5 rounded-xl border ${
                    alert.urgency === "critical"
                      ? "border-destructive/20 bg-destructive/5"
                      : "border-primary/15 bg-primary/5"
                  }`}
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-xs font-black ${
                    alert.urgency === "critical"
                      ? "bg-destructive/10 text-destructive"
                      : "bg-primary/10 text-primary"
                  }`}>
                    {alert.healthScore}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-sm font-bold text-foreground">{alert.clientName}</p>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                        alert.urgency === "critical"
                          ? "bg-destructive/10 text-destructive border border-destructive/20"
                          : "bg-primary/10 text-primary border border-primary/15"
                      }`}>
                        {alert.urgency === "critical" ? "URGENTE" : "ATENÇÃO"}
                      </span>
                      <span className="text-[10px] text-muted-foreground">{alert.summary}</span>
                    </div>
                    <div className="flex items-start gap-1.5 mt-1">
                      <Sparkles size={11} className="text-primary mt-0.5 shrink-0" />
                      <p className="text-xs text-muted-foreground leading-relaxed">{alert.topIssue}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Task Alerts */}
      {(overdueTasks.length > 0 || dueSoonTasks.length > 0) && (
        <div className="space-y-2">
          {overdueTasks.length > 0 && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle size={16} className="text-destructive" />
                <h3 className="text-sm font-semibold text-destructive">
                  {overdueTasks.length} tarefa(s) atrasada(s)
                </h3>
              </div>
              <div className="space-y-1.5">
                {overdueTasks.map((t) => (
                  <div key={t.id} className="flex items-center gap-2 text-xs">
                    <span className="text-destructive font-medium">{t.title}</span>
                    <span className="text-destructive/60">· {t.clientName}</span>
                    <span className="text-destructive/60 ml-auto">Venceu: {t.dueDate}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {dueSoonTasks.length > 0 && (
            <div className="bg-primary/10 border border-primary/15 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Calendar size={16} className="text-primary" />
                <h3 className="text-sm font-semibold text-primary">
                  {dueSoonTasks.length} tarefa(s) vencem em até 48h
                </h3>
              </div>
              <div className="space-y-1.5">
                {dueSoonTasks.map((t) => (
                  <div key={t.id} className="flex items-center gap-2 text-xs">
                    <span className="text-primary font-medium">{t.title}</span>
                    <span className="text-primary/60">· {t.clientName}</span>
                    <span className="text-primary/60 ml-auto">Vence: {t.dueDate}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Daily Progress */}
      <div className="card border border-border">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <ClipboardCheck size={16} className="text-primary" />
              Suporte Diário nos Grupos
            </h3>
            <p className="text-xs text-muted-foreground mt-1">A automação envia e marca sozinha; aja só nos que falharam.</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-2xl font-bold text-foreground">{supportCompleted.length}/{activeClients.length}</p>
              <p className="text-xs text-muted-foreground">clientes atendidos</p>
            </div>
            <div className="w-14 h-14 rounded-full border-4 border-muted flex items-center justify-center relative">
              <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" className="text-muted" strokeWidth="3" />
                <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" className="text-primary" strokeWidth="3" strokeDasharray={`${supportPct} ${100 - supportPct}`} strokeLinecap="round" />
              </svg>
              <span className="text-xs font-bold text-primary">{supportPct}%</span>
            </div>
          </div>
        </div>

        {/* Painel de status da automação — sem marcar os 35 à mão; ação SÓ nas falhas */}
        {supportFailed.length > 0 ? (
          <div className="space-y-2 mb-4">
            <p className="text-xs font-medium text-destructive flex items-center gap-1.5">
              <AlertTriangle size={13} /> Falharam na automação ({supportFailed.length}) — envie manualmente e marque:
            </p>
            {supportFailed.map((client) => (
              <div key={client.id} className="flex items-center gap-3 bg-card border border-destructive/30 rounded-lg px-3 py-2.5">
                <div className="w-7 h-7 rounded-md flex items-center justify-center text-xs font-bold bg-lone-danger-bg text-destructive">
                  {client.name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{client.name}</p>
                  <p className="text-xs text-muted-foreground">{client.assignedTraffic}</p>
                </div>
                <button onClick={() => handleSupport(client)} className="btn-primary text-xs py-1.5 flex items-center gap-1.5">
                  <MessageCircle size={12} /> Marcar enviado
                </button>
              </div>
            ))}
          </div>
        ) : supportPending.length === 0 && activeClients.length > 0 ? (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-lone-success-border bg-lone-success-bg px-3 py-3 text-xs text-lone-success">
            <Check size={14} /> Automação concluída — {activeClients.length}/{activeClients.length} grupos atendidos hoje. Sem ação manual.
          </div>
        ) : (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-3 text-xs text-muted-foreground">
            <ClipboardCheck size={14} />
            A automação envia o suporte seg/qua/sex às 08:00 e marca sozinha.{supportCompleted.length > 0 ? ` ${supportCompleted.length}/${activeClients.length} já enviados hoje.` : ""} Sem ação manual pendente.
          </div>
        )}

        {/* Atendidos — recolhivel, so leitura (sem botoes) */}
        {supportCompleted.length > 0 && (
          <details className="mt-1">
            <summary className="text-xs font-medium text-primary cursor-pointer select-none">Ver {supportCompleted.length} atendidos pela automação</summary>
            <div className="space-y-1.5 mt-2">
              {supportCompleted.map((client) => (
                <div key={client.id} className="flex items-center gap-3 bg-lone-brand-bg-soft border border-border rounded-lg px-3 py-2">
                  <Check size={14} className="text-primary shrink-0" />
                  <span className="text-sm text-muted-foreground">{client.name}</span>
                  <span className="text-xs text-muted-foreground ml-auto">
                    {todayChecks.find((c) => c.clientId === client.id && c.type === "support")?.completedBy}
                  </span>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>

      {/* Weekly: Monday Reports */}
      <div className="card border border-border">
        <div className="flex items-center gap-2 mb-3">
          <FileText size={16} className={isMonday ? "text-primary" : "text-muted-foreground"} />
          <h3 className="font-semibold text-foreground">Relatórios Semanais</h3>
          <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">Toda segunda-feira</span>
          {isMonday && <span className="text-xs bg-lone-brand-bg-soft text-primary px-2 py-0.5 rounded-full font-medium">HOJE</span>}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {activeClients.map((client) => {
            const done = reportsDone.has(client.id);
            return (
              <div key={client.id} className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 border ${
                done ? "bg-lone-brand-bg-soft border-border" : "bg-card border-border"
              }`}>
                {done ? <Check size={14} className="text-primary shrink-0" /> : <button onClick={() => handleReport(client)} className="w-5 h-5 rounded border border-border shrink-0 hover:border-primary transition-all flex items-center justify-center" />}
                <span className={`text-sm flex-1 ${done ? "text-muted-foreground" : "text-foreground"}`}>{client.name}</span>
                {!done && (
                  <button onClick={() => handleReport(client)} className="text-xs text-primary hover:underline">Entregar</button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Weekly: Wednesday Quick Check-in */}
      <div className="card border border-border">
        <div className="flex items-center gap-2 mb-2">
          <BarChart2 size={16} className={isWednesday ? "text-primary" : "text-muted-foreground"} />
          <h3 className="font-semibold text-foreground">Check-in de Meio de Semana</h3>
          <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">Toda quarta-feira</span>
          {isWednesday && <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full font-medium">HOJE</span>}
        </div>
        <p className="text-xs text-muted-foreground mb-3">Análise rápida: como está a performance dos anúncios até agora? Algum ajuste necessário?</p>
        <div className="space-y-2">
          {activeClients.map((client) => {
            const done = analysisDone.has(client.id);
            return (
              <div key={client.id} className={`rounded-lg px-3 py-2.5 border ${
                done ? "bg-primary/5 border-primary/10" : "bg-card border-border"
              }`}>
                <div className="flex items-center gap-2.5">
                  {done ? <Check size={14} className="text-primary shrink-0" /> : <button onClick={() => handleAnalysis(client)} className="w-5 h-5 rounded border border-border shrink-0 hover:border-primary transition-all flex items-center justify-center" />}
                  <span className={`text-sm flex-1 ${done ? "text-muted-foreground" : "text-foreground"}`}>{client.name}</span>
                  {done && (
                    <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                      {weekChecks.find((c) => c.clientId === client.id && c.type === "analysis")?.note || "Sem nota"}
                    </span>
                  )}
                </div>
                {!done && (
                  <div className="flex items-center gap-2 mt-2 ml-6">
                    <input
                      value={analysisNote[client.id] || ""}
                      onChange={(e) => setAnalysisNote((p) => ({ ...p, [client.id]: e.target.value }))}
                      placeholder="Ex: CPC subiu 10%, ajustei segmentacao..."
                      className="flex-1 bg-muted rounded-lg px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none"
                    />
                    <button onClick={() => handleAnalysis(client)} className="text-xs text-primary hover:underline whitespace-nowrap">Registrar</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Weekly: Friday Deep Feedback */}
      <div className="card border border-border">
        <div className="flex items-center gap-2 mb-2">
          <Star size={16} className={isFriday ? "text-primary" : "text-muted-foreground"} />
          <h3 className="font-semibold text-foreground">Feedback Semanal Profundo</h3>
          <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">Toda sexta-feira</span>
          {isFriday && <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full font-medium">HOJE</span>}
        </div>
        <p className="text-xs text-muted-foreground mb-3">Feedback completo da semana: resultados, problemas encontrados, acoes tomadas e planejamento para proxima semana.</p>
        <div className="space-y-2">
          {activeClients.map((client) => {
            const done = feedbackDone.has(client.id);
            return (
              <div key={client.id} className={`rounded-lg px-3 py-2.5 border ${
                done ? "bg-primary/5 border-primary/10" : "bg-card border-border"
              }`}>
                <div className="flex items-center gap-2.5">
                  {done ? <Check size={14} className="text-primary shrink-0" /> : <button onClick={() => handleFeedback(client)} className="w-5 h-5 rounded border border-border shrink-0 hover:border-primary transition-all flex items-center justify-center" />}
                  <span className={`text-sm flex-1 ${done ? "text-muted-foreground" : "text-foreground"}`}>{client.name}</span>
                  {done && (
                    <span className="text-xs text-muted-foreground truncate max-w-[250px]">
                      {weekChecks.find((c) => c.clientId === client.id && c.type === "feedback")?.note || "Sem nota"}
                    </span>
                  )}
                </div>
                {!done && (
                  <div className="mt-2 ml-6 space-y-2">
                    <textarea
                      value={feedbackNote[client.id] || ""}
                      onChange={(e) => setFeedbackNote((p) => ({ ...p, [client.id]: e.target.value }))}
                      placeholder="Descreva: resultados da semana, problemas, acoes tomadas, plano para proxima semana..."
                      rows={3}
                      className="w-full bg-muted rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground outline-none resize-none"
                    />
                    <button onClick={() => handleFeedback(client)} className="text-xs btn-primary py-1.5 px-3">Registrar Feedback</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// AD ANALYTICS TAB
// ══════════════════════════════════════════════════════════════

import { SpendAreaChart, ClientSpendBar, HealthScoreRing } from "@/components/AdCharts";
import type { DailyChartPoint } from "@/components/AdCharts";

type MetricKey = "spend" | "impressions" | "reach" | "clicks" | "conversions" | "leads" | "messages" | "ctr" | "cpc" | "cpm" | "costPerConv" | "costPerLead" | "costPerMessage" | "costPerResult";

/** Format metric — shows "N/A" for zero-cost metrics when there's no data */
function fmtMetric(v: number, prefix?: string): string {
  if (v === 0 && prefix === "R$") return "N/A";
  return prefix ? `${prefix} ${formatCurrency(v)}` : formatNumber(v);
}

const ALL_METRICS: { key: MetricKey; label: string; icon: typeof DollarSign; color: string; format: (v: number) => string }[] = [
  { key: "spend", label: "Gasto Total", icon: DollarSign, color: "text-primary", format: (v) => `R$ ${formatCurrency(v)}` },
  { key: "impressions", label: "Impressões", icon: Eye, color: "text-primary", format: (v) => formatNumber(v) },
  { key: "reach", label: "Alcance", icon: Users, color: "text-primary", format: (v) => formatNumber(v) },
  { key: "clicks", label: "Cliques", icon: MousePointerClick, color: "text-primary", format: (v) => formatNumber(v) },
  { key: "conversions", label: "Conversões", icon: Target, color: "text-primary", format: (v) => Math.round(v).toString() },
  { key: "leads", label: "Leads", icon: Target, color: "text-primary", format: (v) => v > 0 ? Math.round(v).toString() : "N/A" },
  { key: "messages", label: "Mensagens", icon: MessageCircle, color: "text-primary", format: (v) => v > 0 ? formatNumber(v) : "N/A" },
  { key: "ctr", label: "CTR Médio", icon: TrendingUp, color: "text-primary", format: (v) => `${v.toFixed(2)}%` },
  { key: "cpc", label: "CPC Médio", icon: MousePointerClick, color: "text-primary", format: (v) => fmtMetric(v, "R$") },
  { key: "cpm", label: "CPM Médio", icon: Eye, color: "text-primary", format: (v) => fmtMetric(v, "R$") },
  { key: "costPerConv", label: "Custo/Conversão", icon: Target, color: "text-primary", format: (v) => fmtMetric(v, "R$") },
  { key: "costPerLead", label: "Custo/Lead (CPL)", icon: Target, color: "text-primary", format: (v) => fmtMetric(v, "R$") },
  { key: "costPerMessage", label: "CPA (Melhor Conjunto)", icon: MessageCircle, color: "text-primary", format: (v) => v > 0 ? fmtMetric(v, "R$") : "—" },
  { key: "costPerResult", label: "Custo/Resultado", icon: Zap, color: "text-primary", format: (v) => fmtMetric(v, "R$") },
];

const DEFAULT_VISIBLE_METRICS: MetricKey[] = ["spend", "impressions", "clicks", "leads", "messages", "costPerLead", "costPerMessage", "ctr"];

function AdAnalyticsTab({
  clients,
  accounts,
  campaigns,
  currentUser,
  onRealDataChange,
  onRequestCreative,
}: {
  clients: Client[];
  accounts: AdAccount[];
  campaigns: AdCampaign[];
  currentUser: string;
  onRealDataChange?: (campaigns: AdCampaign[], isReal: boolean) => void;
  onRequestCreative?: (campaign: AdCampaign, client: Client) => void;
}) {
  const { role } = useRole();
  const isAdmin = role === "admin" || role === "manager";
  const OBJECTIVE_LABELS: Record<string, string> = {
    messages: "Mensagens", traffic: "Tráfego", conversions: "Conversões",
    reach: "Alcance", engagement: "Engajamento", leads: "Leads",
  };

  const STATUS_LABELS: Record<string, { label: string; cls: string; icon: typeof CheckCircle }> = {
    active: { label: "Ativa", cls: "text-primary bg-primary/10 border-primary/20", icon: CheckCircle },
    paused: { label: "Pausada", cls: "text-primary bg-primary/10 border-primary/15", icon: Pause },
    completed: { label: "Finalizada", cls: "text-muted-foreground bg-muted border-border", icon: Check },
    error: { label: "Erro", cls: "text-destructive bg-destructive/10 border-destructive/20", icon: AlertCircle },
  };

  const [selectedClient, setSelectedClient] = useState<string>("all");
  const [clientSearch, setClientSearch] = useState<string>("");
  const [expandedCampaign, setExpandedCampaign] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [visibleMetrics, setVisibleMetrics] = useState<MetricKey[]>(DEFAULT_VISIBLE_METRICS);
  const [showMetricConfig, setShowMetricConfig] = useState(false);
  const [chartMetrics, setChartMetrics] = useState<string[]>(["spend", "conversions"]);
  const meta = useMetaConnection();

  // Real Meta data state
  const [metaAccounts, setMetaAccounts] = useState<any[]>([]);
  const [selectedMetaAccount, setSelectedMetaAccount] = useState<string | null>(null);
  const [metaCampaigns, setMetaCampaigns] = useState<AdCampaign[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);
  const [metaError, setMetaError] = useState<string | null>(null);
  // Contas ocultas — agora compartilhadas pelo time (banco), não mais por navegador (localStorage).
  const [hiddenAccounts, setHiddenAccounts] = useState<Set<string>>(new Set());
  useEffect(() => {
    let alive = true;
    authedFetch("/api/traffic/hidden-accounts")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && Array.isArray(d?.ids)) setHiddenAccounts(new Set(d.ids)); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const persistHidden = (next: Set<string>) => {
    authedFetch("/api/traffic/hidden-accounts", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [...next] }),
    }).catch(() => {});
  };
  const [dateRange, setDateRange] = useState<number>(7);
  const [customDateFrom, setCustomDateFrom] = useState("");
  const [customDateTo, setCustomDateTo] = useState("");
  const [showCustomRange, setShowCustomRange] = useState(false);
  const [pendingFrom, setPendingFrom] = useState("");
  const [pendingTo, setPendingTo] = useState("");

  // Refresh All state
  const [refreshingAll, setRefreshingAll] = useState(false);

  const hideAccount = (accId: string) => {
    setHiddenAccounts((prev) => {
      const next = new Set(prev);
      next.add(accId);
      persistHidden(next);
      return next;
    });
  };

  const unhideAccount = (accId: string) => {
    setHiddenAccounts((prev) => {
      const next = new Set(prev);
      next.delete(accId);
      persistHidden(next);
      return next;
    });
  };

  // Only show ad accounts linked to clients in our portfolio.
  // "Hidden" accounts (user-dismissed) are still hidden on top of that.
  const portfolioAccountIds = new Set(
    clients.map((c) => c.metaAdAccountId).filter((v): v is string => !!v)
  );
  const visibleAccounts = metaAccounts.filter((a) =>
    !hiddenAccounts.has(a.id) && portfolioAccountIds.has(a.id)
  );

  // Fetch real ad accounts when connected
  useEffect(() => {
    if (!meta.connected || !meta.token) {
      setMetaAccounts([]);
      setSelectedMetaAccount(null);
      setMetaCampaigns([]);
      return;
    }
    setLoadingAccounts(true);
    setMetaError(null);
    fetchAdAccounts(meta.token)
      .then((accs) => {
        setMetaAccounts(accs);
        setLoadingAccounts(false);
      })
      .catch((err) => {
        setLoadingAccounts(false);
        if (err instanceof TokenExpiredError) {
          meta.handleTokenError();
          setMetaError("Token inválido ou sem permissão. Reconecte o Meta Ads.");
        } else {
          setMetaError("Erro ao buscar contas: " + err.message);
        }
      });
  }, [meta.connected, meta.token]);

  // Só a resposta do último pedido vale: trocar rápido de conta mostrava campanhas de um cliente sob outro.
  const selectReqRef = useRef(0);
  const handleSelectAccount = useCallback(async (accountId: string) => {
    if (!meta.token) return;
    const reqId = ++selectReqRef.current;
    setSelectedMetaAccount(accountId);
    setLoadingCampaigns(true);
    setMetaError(null);
    try {
      const camps = await fetchCampaignInsights(
        meta.token,
        accountId,
        dateRange,
        customDateFrom || undefined,
        customDateTo || undefined,
      );
      if (reqId !== selectReqRef.current) return;
      // Resolve o cliente REAL (UUID) dono desta conta, senão o Investimento/pacing filtra por clientId e nunca casa (gasto R$0).
      const ownerClient = clients.find((cl) => cl.metaAdAccountId === accountId);
      // Campanha cujo insight falhou fica na lista marcada "sem dados" — sumir com ela ou mostrar R$0 mentia.
      const mapped: AdCampaign[] = camps
        .map((c: any) => ({
          id: c.id,
          accountId,
          clientId: ownerClient?.id ?? accountId,
          clientName: ownerClient?.name ?? metaAccounts.find((a) => a.id === accountId)?.name ?? accountId,
          name: c.name,
          objective: mapMetaObjective(c.objective),
          status: (c.status === "active" || c.status === "paused" || c.status === "completed") ? c.status : "active" as any,
          dailyBudget: c.dailyBudget ?? 0,
          totalBudget: c.totalBudget ?? 0,
          startDate: c.startDate ?? "",
          endDate: c.endDate,
          spend: c.spend ?? 0,
          impressions: c.impressions ?? 0,
          reach: c.reach ?? 0,
          clicks: c.clicks ?? 0,
          ctr: c.ctr ?? 0,
          cpc: c.cpc ?? 0,
          cpm: c.cpm ?? 0,
          conversions: c.conversions ?? 0,
          costPerConversion: c.costPerConversion ?? 0,
          messages: c.messages ?? 0,
          costPerMessage: c.costPerMessage ?? 0,
          cheapestAdSetCostPerMessage: c.cheapestAdSetCostPerMessage ?? 0,
          cheapestAdSetName: c.cheapestAdSetName ?? "",
          leads: c.leads ?? 0,
          costPerLead: c.costPerLead ?? 0,
          results: c.results ?? 0,
          costPerResult: c.costPerResult ?? 0,
          frequency: c.frequency ?? 0,
          dailyMetrics: c.dailyMetrics ?? [],
          hasData: c.hasData ?? false,
          insightsFailed: !!c.insightsFailed,
          lastSyncAt: c.lastSyncAt,
        }));
      setMetaCampaigns(mapped);
    } catch (err: any) {
      if (reqId !== selectReqRef.current) return;
      if (err instanceof TokenExpiredError) {
        meta.handleTokenError();
        setMetaError("Token expirado. Reconecte sua conta Meta Ads.");
      } else {
        setMetaError("Erro ao buscar campanhas: " + err.message);
      }
    }
    if (reqId === selectReqRef.current) setLoadingCampaigns(false);
  }, [meta.token, meta.handleTokenError, metaAccounts, clients, dateRange, customDateFrom, customDateTo]);

  // Refresh data when date range or custom dates change (if account already selected)
  useEffect(() => {
    if (selectedMetaAccount && meta.token) {
      handleSelectAccount(selectedMetaAccount);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange, customDateFrom, customDateTo]);

  // ── Portfolio summary: aggregate across all linked clients ──────────────
  const linkedClients = clients.filter((c) => c.metaAdAccountId);
  const [portfolioCampaigns, setPortfolioCampaigns] = useState<Map<string, AdCampaign[]>>(new Map());
  const [loadingPortfolio, setLoadingPortfolio] = useState(false);

  const portfolioAgg = useMemo(() => {
    let spend = 0, results = 0, leads = 0, messages = 0, clicks = 0, impressions = 0;
    portfolioCampaigns.forEach((camps) => {
      camps.forEach((c) => {
        spend += c.spend;
        results += c.results ?? 0;
        leads += c.leads ?? 0;
        messages += c.messages ?? 0;
        clicks += c.clicks;
        impressions += c.impressions;
      });
    });
    return { spend, results, leads, messages, clicks, impressions };
  }, [portfolioCampaigns]);

  const handleRefreshAll = useCallback(async () => {
    if (!meta.token || linkedClients.length === 0) return;
    setRefreshingAll(true);
    const newMap = new Map<string, AdCampaign[]>();
    const falharam: string[] = [];
    await Promise.all(
      linkedClients.map(async (client) => {
        if (!client.metaAdAccountId || !meta.token) return;
        try {
          const camps = await fetchCampaignInsights(meta.token, client.metaAdAccountId, dateRange);
          const mapped: AdCampaign[] = camps.map((c: any) => ({
            id: c.id, accountId: client.metaAdAccountId!, clientId: client.id,
            clientName: client.name, name: c.name, objective: mapMetaObjective(c.objective),
            status: (c.status === "active" || c.status === "paused") ? c.status : "active" as any,
            dailyBudget: c.dailyBudget ?? 0, totalBudget: c.totalBudget ?? 0,
            startDate: c.startDate ?? "", endDate: c.endDate,
            spend: c.spend ?? 0, impressions: c.impressions ?? 0, reach: c.reach ?? 0,
            clicks: c.clicks ?? 0, ctr: c.ctr ?? 0, cpc: c.cpc ?? 0, cpm: c.cpm ?? 0,
            conversions: c.conversions ?? 0, costPerConversion: c.costPerConversion ?? 0,
            messages: c.messages ?? 0, costPerMessage: c.costPerMessage ?? 0,
            cheapestAdSetCostPerMessage: c.cheapestAdSetCostPerMessage ?? 0,
            cheapestAdSetName: c.cheapestAdSetName ?? "",
            leads: c.leads ?? 0, costPerLead: c.costPerLead ?? 0,
            results: c.results ?? 0, costPerResult: c.costPerResult ?? 0,
            frequency: c.frequency ?? 0, dailyMetrics: c.dailyMetrics ?? [],
            hasData: c.hasData ?? false, insightsFailed: !!c.insightsFailed, lastSyncAt: c.lastSyncAt,
          }));
          newMap.set(client.id, mapped);
        } catch (err: any) {
          if (err instanceof TokenExpiredError) meta.handleTokenError();
          falharam.push(client.name);
        }
      })
    );
    setPortfolioCampaigns(newMap);
    if (falharam.length > 0) {
      toast.error(`Não consegui carregar ${falharam.length} cliente(s) da Meta: ${falharam.slice(0, 3).join(", ")}${falharam.length > 3 ? "…" : ""}. O resumo está incompleto.`);
    }
    if (selectedMetaAccount) handleSelectAccount(selectedMetaAccount);
    setRefreshingAll(false);
  }, [meta.token, meta.handleTokenError, linkedClients, dateRange, selectedMetaAccount, handleSelectAccount]);

  // Auto deep-link: when client with linked account is selected, auto-fetch
  useEffect(() => {
    if (!meta.token || !meta.connected) return;
    if (selectedClient === "all") return;
    const client = clients.find((c) => c.id === selectedClient);
    if (client?.metaAdAccountId && client.metaAdAccountId !== selectedMetaAccount) {
      handleSelectAccount(client.metaAdAccountId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClient, meta.connected]);

  // Use real data when connected + account selected, otherwise mock
  const isUsingRealData = meta.connected && selectedMetaAccount !== null;
  const activeCampaigns = isUsingRealData ? metaCampaigns : campaigns;
  const activeAccounts = isUsingRealData
    ? [{ id: selectedMetaAccount!, clientId: selectedMetaAccount!, clientName: metaAccounts.find((a) => a.id === selectedMetaAccount)?.name ?? "", platform: "meta" as const, accountId: selectedMetaAccount!, accountName: "", currency: "BRL" as const }]
    : accounts;

  // Notify parent when real data state changes (so RoutineTab can use it)
  useEffect(() => {
    onRealDataChange?.(metaCampaigns, isUsingRealData);
  }, [isUsingRealData, metaCampaigns, onRealDataChange]);

  const toggleMetric = (key: MetricKey) => {
    setVisibleMetrics((prev) =>
      prev.includes(key) ? prev.filter((m) => m !== key) : [...prev, key]
    );
  };

  const toggleChartMetric = (key: string) => {
    setChartMetrics((prev) =>
      prev.includes(key) ? prev.filter((m) => m !== key) : [...prev, key]
    );
  };

  const clientAccounts = isUsingRealData
    ? activeAccounts
    : selectedClient === "all"
      ? accounts.filter((a) => clients.some((c) => c.id === a.clientId))
      : accounts.filter((a) => a.clientId === selectedClient);

  const accountIds = new Set(clientAccounts.map((a) => a.id));

  const filteredCampaigns = activeCampaigns.filter((c) => {
    if (!isUsingRealData && !accountIds.has(c.accountId)) return false;
    if (statusFilter !== "all" && c.status !== statusFilter) return false;
    return true;
  });

  // Date range boundaries for dailyMetrics filtering.
  // IMPORTANT: never convert custom date strings through new Date() — "YYYY-MM-DD" parses
  // as UTC midnight, causing a 1-day shift for timezones behind UTC (e.g. BRT = UTC-3).
  // Use the string directly when set; compute local date strings otherwise.
  const rangeEndStr = customDateTo || todaySP();
  const rangeStartStr = customDateFrom || diasAntes(todaySP(), dateRange);
  // Quando o usuário usa datas customizadas, periodDays é o intervalo real (não o preset numérico).
  // Usar T12:00:00 para evitar shift de timezone ao parsear strings YYYY-MM-DD.
  const actualPeriodDays = customDateFrom && customDateTo
    ? Math.round((new Date(customDateTo + "T12:00:00").getTime() - new Date(customDateFrom + "T12:00:00").getTime()) / 86400000) + 1
    : dateRange;

  // Aggregate metrics from dailyMetrics within date range (accurate)
  // For real Meta data, the API already filters by date — use campaign totals
  // For mock data, sum dailyMetrics within the selected range
  const agg = filteredCampaigns.reduce((acc, c) => {
    if (isUsingRealData) {
      // Real data: API already filtered — use campaign-level totals
      acc.spend += c.spend;
      acc.impressions += c.impressions;
      acc.reach += c.reach;
      acc.clicks += c.clicks;
      acc.conversions += c.conversions;
      acc.messages += c.messages ?? 0;
      acc.leads += c.leads ?? 0;
      acc.results += c.results ?? 0;
    } else {
      // Mock data: filter dailyMetrics by date range for accurate totals
      const daysInRange = c.dailyMetrics.filter((d) => d.date >= rangeStartStr && d.date <= rangeEndStr);
      if (daysInRange.length > 0) {
        daysInRange.forEach((d) => {
          acc.spend += d.spend;
          acc.impressions += d.impressions;
          acc.clicks += d.clicks;
          acc.conversions += d.conversions;
          acc.messages += d.messages ?? 0;
          acc.leads += d.leads ?? 0;
        });
        // Reach can't be summed daily (unique users), estimate proportionally
        const ratio = daysInRange.length / Math.max(c.dailyMetrics.length, 1);
        acc.reach += Math.round(c.reach * ratio);
        // Results: use objective-based mapping
        acc.results += c.results ? Math.round(c.results * ratio) : 0;
      }
    }
    return acc;
  }, { spend: 0, impressions: 0, reach: 0, clicks: 0, conversions: 0, messages: 0, leads: 0, results: 0 });

  const totalSpend = agg.spend;
  const totalImpressions = agg.impressions;
  const totalClicks = agg.clicks;
  const totalConversions = agg.conversions;
  const totalReach = agg.reach;
  const totalMessages = agg.messages;
  const totalLeads = agg.leads;
  const totalResults = agg.results;
  // Usa média ponderada dos ctr/cpc da Meta por campanha (mais preciso que recalcular de totalClicks,
  // que inclui reações, comentários e outros eventos — não só cliques em links).
  const avgCtr = totalImpressions > 0
    ? filteredCampaigns.reduce((s, c) => s + c.ctr * c.impressions, 0) / totalImpressions
    : 0;
  const avgCpc = totalClicks > 0
    ? filteredCampaigns.reduce((s, c) => s + c.cpc * c.clicks, 0) / totalClicks
    : 0;
  const avgCpm = totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : 0;
  const avgCostPerConv = totalConversions > 0 ? totalSpend / totalConversions : 0;
  const avgCostPerLead = totalLeads > 0 ? totalSpend / totalLeads : 0;
  const avgCostPerResult = totalResults > 0 ? totalSpend / totalResults : 0;

  // Champion CPA: cheapest ad set across all filtered campaigns (not portfolio average)
  const championAdSet = (() => {
    const withChampion = filteredCampaigns.filter(c => c.cheapestAdSetCostPerMessage && c.cheapestAdSetCostPerMessage > 0);
    if (withChampion.length === 0) return null;
    return withChampion.reduce((best, c) =>
      c.cheapestAdSetCostPerMessage! < best.cheapestAdSetCostPerMessage! ? c : best
    );
  })();
  const championCpa = championAdSet?.cheapestAdSetCostPerMessage ?? 0;
  const championAdSetName = championAdSet?.cheapestAdSetName ?? null;

  // Data freshness — most recent sync timestamp across all campaigns
  const lastSyncTimestamp = filteredCampaigns.reduce((latest, c) => {
    if (c.lastSyncAt && (!latest || c.lastSyncAt > latest)) return c.lastSyncAt;
    return latest;
  }, "" as string);

  const metricValues: Record<MetricKey, number> = {
    spend: totalSpend, impressions: totalImpressions, reach: totalReach,
    clicks: totalClicks, conversions: totalConversions, messages: totalMessages,
    leads: totalLeads, ctr: avgCtr, cpc: avgCpc, cpm: avgCpm,
    costPerConv: avgCostPerConv, costPerMessage: championCpa,
    costPerLead: avgCostPerLead, costPerResult: avgCostPerResult,
  };

  // Per-client breakdown
  const clientBreakdown = useMemo(() => {
    const map = new Map<string, { name: string; spend: number; impressions: number; clicks: number; conversions: number; campaigns: number }>();
    filteredCampaigns.forEach((c) => {
      const entry = map.get(c.clientId) ?? { name: c.clientName, spend: 0, impressions: 0, clicks: 0, conversions: 0, campaigns: 0 };
      entry.spend += c.spend;
      entry.impressions += c.impressions;
      entry.clicks += c.clicks;
      entry.conversions += c.conversions;
      entry.campaigns += 1;
      map.set(c.clientId, entry);
    });
    return [...map.entries()].sort((a, b) => b[1].spend - a[1].spend);
  }, [filteredCampaigns]);

  // Daily chart data — filtered by date range
  const dailyChartData = useMemo((): DailyChartPoint[] => {
    const map = new Map<string, { spend: number; impressions: number; clicks: number; conversions: number }>();
    filteredCampaigns.forEach((c) => {
      c.dailyMetrics
        .filter((dm) => dm.date >= rangeStartStr && dm.date <= rangeEndStr)
        .forEach((dm) => {
          const entry = map.get(dm.date) ?? { spend: 0, impressions: 0, clicks: 0, conversions: 0 };
          entry.spend += dm.spend;
          entry.impressions += dm.impressions;
          entry.clicks += dm.clicks;
          entry.conversions += dm.conversions;
          map.set(dm.date, entry);
        });
    });
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, data]) => ({
        date,
        label: `${date.slice(8)}/${date.slice(5, 7)}`,
        spend: Math.round(data.spend * 100) / 100,
        impressions: data.impressions,
        clicks: data.clicks,
        conversions: data.conversions,
      }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredCampaigns, rangeStartStr, rangeEndStr]);

  const clientBarData = useMemo(() => {
    return clientBreakdown.map(([, data]) => ({
      name: data.name.split(" ").slice(0, 2).join(" "),
      spend: Math.round(data.spend * 100) / 100,
      conversions: data.conversions,
    }));
  }, [clientBreakdown]);

  // AI Analysis
  const aiAnalysis = useMemo<PortfolioSummary | null>(() => {
    if (filteredCampaigns.length === 0) return null;
    return analyzeCampaigns(filteredCampaigns, dateRange);
  }, [filteredCampaigns, dateRange]);

  const [dismissedInsights, setDismissedInsights] = useState<Set<string>>(new Set());
  const [showAllInsights, setShowAllInsights] = useState(false);

  const activeInsights = aiAnalysis?.insights.filter((i) => !dismissedInsights.has(i.id)) ?? [];
  const criticalInsights = activeInsights.filter((i) => i.severity === "critical");
  const warningInsights = activeInsights.filter((i) => i.severity === "warning");
  const infoInsights = activeInsights.filter((i) => i.severity === "info");
  const successInsights = activeInsights.filter((i) => i.severity === "success");

  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingAll, setExportingAll] = useState(false);
  const [exportAllProgress, setExportAllProgress] = useState("");
  const [exportAllError, setExportAllError] = useState<string | null>(null);

  const handleExportAllPdf = async () => {
    setExportAllError(null);
    setExportingAll(true);
    try {
      const periodLabel = customDateFrom && customDateTo
        ? `${new Date(customDateFrom + "T12:00:00").toLocaleDateString("pt-BR")} – ${new Date(customDateTo + "T12:00:00").toLocaleDateString("pt-BR")}`
        : (() => { const now = new Date(); const since = new Date(now); since.setDate(since.getDate() - dateRange); return `${since.toLocaleDateString("pt-BR")} – ${now.toLocaleDateString("pt-BR")}`; })();

      const demoByClient = new Map<string, import("@/lib/exportTrafficPdf").TrafficReportData["demographics"]>();
      let dataByClient = new Map<string, AdCampaign[]>();
      const fetchErrors: string[] = [];

      if (meta.token && linkedClients.length > 0) {
        const useCache = portfolioCampaigns.size > 0 && !customDateFrom && !customDateTo;
        if (!useCache) {
          // Sequencial com retry — evita burst de rate-limit do Meta (3 chamadas por campanha × N clientes)
          const mapCamps = (client: typeof linkedClients[0], camps: Record<string, unknown>[]): AdCampaign[] =>
            camps.filter((c: { error?: unknown }) => !c.error).map((c: Record<string, unknown>) => ({
              id: c.id as string, accountId: client.metaAdAccountId!, clientId: client.id,
              clientName: client.name, name: c.name as string, objective: mapMetaObjective(c.objective as string),
              status: (c.status === "active" || c.status === "paused" || c.status === "completed") ? c.status as AdCampaign["status"] : "active",
              dailyBudget: (c.dailyBudget as number) ?? 0, totalBudget: (c.totalBudget as number) ?? 0,
              startDate: (c.startDate as string) ?? "", endDate: c.endDate as string | undefined,
              spend: (c.spend as number) ?? 0, impressions: (c.impressions as number) ?? 0, reach: (c.reach as number) ?? 0,
              clicks: (c.clicks as number) ?? 0, ctr: (c.ctr as number) ?? 0, cpc: (c.cpc as number) ?? 0, cpm: (c.cpm as number) ?? 0,
              conversions: (c.conversions as number) ?? 0, costPerConversion: (c.costPerConversion as number) ?? 0,
              messages: (c.messages as number) ?? 0, costPerMessage: (c.costPerMessage as number) ?? 0,
              cheapestAdSetCostPerMessage: (c.cheapestAdSetCostPerMessage as number) ?? 0,
              cheapestAdSetName: (c.cheapestAdSetName as string) ?? "",
              leads: (c.leads as number) ?? 0, costPerLead: (c.costPerLead as number) ?? 0,
              results: (c.results as number) ?? 0, costPerResult: (c.costPerResult as number) ?? 0,
              frequency: (c.frequency as number) ?? 0, dailyMetrics: (c.dailyMetrics as AdCampaign["dailyMetrics"]) ?? [],
              hasData: (c.hasData as boolean) ?? false, insightsFailed: !!c.insightsFailed, lastSyncAt: c.lastSyncAt as string | undefined,
            }));

          for (const client of linkedClients) {
            if (!client.metaAdAccountId || !meta.token) continue;
            let attempts = 0;
            let success = false;
            while (attempts < 2 && !success) {
              try {
                if (attempts > 0) await new Promise(r => setTimeout(r, 3000)); // backoff no retry
                const camps = await fetchCampaignInsights(
                  meta.token, client.metaAdAccountId, dateRange,
                  customDateFrom || undefined, customDateTo || undefined,
                );
                const mapped = mapCamps(client, camps as Record<string, unknown>[]);
                dataByClient.set(client.id, mapped);
                const demos = await fetchAccountDemographics(
                  meta.token!, client.metaAdAccountId!, dateRange,
                  customDateFrom || undefined, customDateTo || undefined,
                );
                if (demos) demoByClient.set(client.id, demos);
                success = true;
              } catch (err) {
                if (err instanceof TokenExpiredError) { meta.handleTokenError(); break; }
                attempts++;
                if (attempts >= 2) {
                  const msg = err instanceof Error ? err.message : String(err);
                  fetchErrors.push(`${client.name}: ${msg}`);
                  console.error(`[ZIP] ${client.name} falhou após ${attempts} tentativas:`, err);
                }
              }
            }
          }
          if (!customDateFrom && !customDateTo) setPortfolioCampaigns(dataByClient);
        } else {
          dataByClient = portfolioCampaigns;
        }
      } else {
        for (const client of clients) {
          const clientAccountIds = new Set(accounts.filter((a) => a.clientId === client.id).map((a) => a.id));
          const clientCampaigns = campaigns.filter((c) => clientAccountIds.has(c.accountId));
          if (clientCampaigns.length > 0) dataByClient.set(client.id, clientCampaigns);
        }
      }

      // Relatório com campanha faltando mente pro cliente: quem teve falha na Meta fica fora do ZIP e é avisado.
      for (const [cid, camps] of dataByClient) {
        const falhas = camps.filter(insightFalhou).length;
        if (falhas > 0) {
          fetchErrors.push(`${clients.find((c) => c.id === cid)?.name ?? cid}: ${falhas} campanha(s) sem dados da Meta — ficou fora do ZIP`);
          dataByClient.delete(cid);
        }
      }

      const reports: { clientName: string; data: import("@/lib/exportTrafficPdf").TrafficReportData }[] = [];

      for (const [clientId, clientCampaigns] of dataByClient) {
        const client = clients.find((c) => c.id === clientId);
        if (!client || clientCampaigns.length === 0) continue;

        try {
          const reportData = buildTrafficReportData(
            client.name,
            clientCampaigns,
            periodLabel,
            undefined,
            demoByClient.get(client.id),
            { startStr: rangeStartStr, endStr: rangeEndStr },
            actualPeriodDays,
          );
          reports.push({ clientName: client.name, data: reportData });
        } catch (err) {
          console.error(`[ZIP] Erro ao gerar report de ${client.name}:`, err);
          fetchErrors.push(`${client.name}: erro ao gerar report`);
        }
      }


      if (reports.length === 0) {
        const detail = fetchErrors.length > 0 ? ` Erros: ${fetchErrors.join("; ")}` : "";
        if (!meta.token || linkedClients.length === 0) {
          setExportAllError("Nenhuma conta Meta conectada. Vá em Integrações e vincule a conta da agência para gerar relatórios.");
        } else {
          setExportAllError(`Nenhum cliente com campanhas no período selecionado.${detail}`);
        }
        return;
      }


      setExportAllProgress(`Gerando PDFs... 0/${reports.length}`);
      await exportAllTrafficReportsZip(reports, (current, total, clientName) => {
        setExportAllProgress(`Gerando PDF ${current}/${total} — ${clientName}`);
      });
      setExportAllProgress("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[ZIP] Erro inesperado ao gerar relatórios:", err);
      setExportAllError(`Erro ao gerar relatórios: ${msg}`);
      setExportAllProgress("");
    } finally {
      setExportingAll(false);
    }
  };

  const buildPeriodLabel = () => customDateFrom && customDateTo
    ? `${new Date(customDateFrom + "T12:00:00").toLocaleDateString("pt-BR")} – ${new Date(customDateTo + "T12:00:00").toLocaleDateString("pt-BR")}`
    : (() => { const now = new Date(); const since = new Date(now); since.setDate(since.getDate() - dateRange); return `${since.toLocaleDateString("pt-BR")} – ${now.toLocaleDateString("pt-BR")}`; })();

  const buildClientName = () => selectedClient !== "all"
    ? (clients.find((c) => c.id === selectedClient)?.name ?? "Todas as Contas")
    : isUsingRealData
      ? (metaAccounts.find((a) => a.id === selectedMetaAccount)?.name ?? "Conta Meta Ads")
      : "Todas as Contas";

  const handleExportPdf = async () => {
    if (exportingPdf) return;
    if (filteredCampaigns.some(insightFalhou)) {
      toast.error("Há campanha sem dados da Meta — o PDF sairia com número faltando. Clique em Atualizar Dados e tente de novo.");
      return;
    }
    setExportingPdf(true);
    try {
      const accountId = selectedClient !== "all"
        ? (clients.find((c) => c.id === selectedClient)?.metaAdAccountId ?? selectedMetaAccount)
        : selectedMetaAccount;
      const demographics = meta.token && accountId
        ? await fetchAccountDemographics(meta.token, accountId, dateRange, customDateFrom || undefined, customDateTo || undefined) ?? undefined
        : undefined;
      const reportData = buildTrafficReportData(
        buildClientName(),
        filteredCampaigns,
        buildPeriodLabel(),
        undefined,
        demographics,
        !isUsingRealData ? { startStr: rangeStartStr, endStr: rangeEndStr } : undefined,
        actualPeriodDays,
      );
      await exportTrafficReportPdf(reportData);
    } finally {
      setExportingPdf(false);
    }
  };

  const handleExportClientPdf = async () => {
    if (exportingPdf) return;
    if (filteredCampaigns.some(insightFalhou)) {
      toast.error("Há campanha sem dados da Meta — o PDF sairia com número faltando. Clique em Atualizar Dados e tente de novo.");
      return;
    }
    setExportingPdf(true);
    try {
      const accountId = selectedClient !== "all"
        ? (clients.find((c) => c.id === selectedClient)?.metaAdAccountId ?? selectedMetaAccount)
        : selectedMetaAccount;
      const demographics = meta.token && accountId
        ? await fetchAccountDemographics(meta.token, accountId, dateRange, customDateFrom || undefined, customDateTo || undefined) ?? undefined
        : undefined;
      const reportData = buildTrafficReportData(
        buildClientName(),
        filteredCampaigns,
        buildPeriodLabel(),
        undefined,
        demographics,
        !isUsingRealData ? { startStr: rangeStartStr, endStr: rangeEndStr } : undefined,
        actualPeriodDays,
      );
      await exportClientReportPdf(reportData);
    } finally {
      setExportingPdf(false);
    }
  };

  const SEVERITY_CONFIG: Record<string, { color: string; bg: string; border: string; icon: typeof AlertCircle }> = {
    critical: { color: "text-destructive", bg: "bg-destructive/5", border: "border-destructive/20", icon: AlertCircle },
    warning: { color: "text-primary", bg: "bg-primary/5", border: "border-primary/20", icon: AlertTriangle },
    info: { color: "text-primary", bg: "bg-primary/5", border: "border-primary/15", icon: CircleDot },
    success: { color: "text-primary", bg: "bg-primary/5", border: "border-primary/15", icon: Sparkles },
  };

  // Token expiry display
  const tokenExpiresAt = meta.tokenExpiresAt;
  const tokenDaysLeft = tokenExpiresAt ? Math.max(0, Math.round((tokenExpiresAt - Date.now()) / 86400000)) : null;
  const tokenHoursLeft = tokenExpiresAt && tokenDaysLeft === 0 ? Math.max(0, Math.round((tokenExpiresAt - Date.now()) / 3600000)) : null;
  const isTokenShort = meta.tokenType === "short";

  return (
    <div className="animate-fade-in space-y-6">
      {/* ── Meta Connection Status Bar ─────────────────────────────────────── */}
      {meta.connected ? (
        <div className="space-y-3">
          {/* Status bar */}
          <div className="bg-card border border-primary/20 rounded-xl p-4 flex items-center gap-4">
            {/* Status indicator */}
            <div className="relative shrink-0">
              <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                <Facebook size={18} className="text-primary" />
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-lone-success-bg border-2 border-card rounded-full flex items-center justify-center">
                <span className="w-1.5 h-1.5 bg-card rounded-full" />
              </span>
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-semibold text-foreground">Meta Ads Conectado</h3>
                {/* Token type badge */}
                {meta.tokenType && (
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${
                    isTokenShort
                      ? "bg-lone-warning-bg border-lone-warning-border text-lone-warning"
                      : "bg-lone-success-bg border-lone-success-border text-lone-success"
                  }`}>
                    {isTokenShort ? "Token 2h" : "Token 60d"}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {tokenDaysLeft !== null
                  ? tokenDaysLeft > 0
                    ? `Expira em ${tokenDaysLeft} dia${tokenDaysLeft !== 1 ? "s" : ""} · ${selectedMetaAccount ? `Conta: ${metaAccounts.find((a) => a.id === selectedMetaAccount)?.name ?? selectedMetaAccount}` : "Selecione uma conta abaixo"}`
                    : tokenHoursLeft !== null
                      ? `Expira em ${tokenHoursLeft}h — reconecte em breve`
                      : "Token expirando"
                  : selectedMetaAccount
                    ? `Conta: ${metaAccounts.find((a) => a.id === selectedMetaAccount)?.name ?? selectedMetaAccount}`
                    : "Selecione uma conta abaixo"
                }
              </p>
              {meta.exchangeFailed && (
                <p className="text-[10px] text-destructive mt-0.5 font-medium">
                  ⚠️ Upgrade para token longo falhou — token expira em ~85min. Verifique META_APP_SECRET ou reconecte.
                </p>
              )}
              {isTokenShort && !meta.exchangeFailed && (
                <p className="text-[10px] text-lone-warning mt-0.5">
                  Token de curta duração — upgrade automático em andamento...
                </p>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
              {/* Refresh All button */}
              {linkedClients.length > 0 && (
                <button
                  onClick={handleRefreshAll}
                  disabled={refreshingAll}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border bg-muted/50 text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all disabled:opacity-50"
                >
                  {refreshingAll ? <Loader2 size={12} className="animate-spin" /> : <Activity size={12} />}
                  Atualizar Dados
                </button>
              )}
              {selectedMetaAccount && (
                <button
                  onClick={() => { setSelectedMetaAccount(null); setMetaCampaigns([]); }}
                  className="btn-ghost text-xs border border-border text-muted-foreground hover:text-foreground"
                >
                  Trocar Conta
                </button>
              )}
              {/* Reconectar concedendo NOVOS escopos (ex.: Instagram orgânico) — sem esperar o token expirar */}
              <button onClick={meta.connect} className="btn-ghost text-xs border border-primary/30 text-primary hover:bg-primary/10" title="Refaz o login da Meta pedindo as permissões atualizadas (Instagram, etc.)">
                Reconectar (novas permissões)
              </button>
              <button
                onClick={() => {
                  if (window.confirm("Desconectar a Meta da agência inteira? Sincronização de saldos, portal dos clientes e conferência do Instagram param até alguém reconectar.")) meta.disconnect();
                }}
                className="btn-ghost text-xs border border-destructive/30 text-destructive hover:bg-destructive/10"
              >
                Desconectar
              </button>
            </div>
          </div>

          {/* ── Portfolio Summary ──────────────────────────────────────────── */}
          {portfolioCampaigns.size > 0 && (
            <div className="card border border-primary/15">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                    <BarChart2 size={14} className="text-primary" />
                  </div>
                  <h3 className="text-sm font-semibold text-foreground">Resumo da Carteira</h3>
                  <span className="text-[10px] bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
                    {portfolioCampaigns.size} cliente(s) · últimos {dateRange}d
                  </span>
                </div>
                <span className="text-[10px] text-muted-foreground">Dados em tempo real via Meta API</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {[
                  { label: "Gasto Total", value: `R$ ${formatCurrency(portfolioAgg.spend)}`, color: "text-primary" },
                  { label: "Resultados", value: formatNumber(portfolioAgg.results), color: "text-lone-success" },
                  { label: "Leads", value: formatNumber(portfolioAgg.leads), color: "text-lone-success" },
                  { label: "Mensagens", value: formatNumber(portfolioAgg.messages), color: "text-primary" },
                  { label: "Cliques", value: formatNumber(portfolioAgg.clicks), color: "text-foreground" },
                  { label: "Impressões", value: formatNumber(portfolioAgg.impressions), color: "text-muted-foreground" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="bg-muted/40 rounded-lg p-3 text-center border border-border/50">
                    <p className={`text-lg font-bold ${color}`}>{value}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{label}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Prompt to run Refresh when linked clients exist but portfolio is empty */}
          {portfolioCampaigns.size === 0 && linkedClients.length > 0 && !loadingPortfolio && (
            <div className="flex items-center gap-3 px-4 py-3 bg-muted/30 border border-dashed border-border rounded-xl">
              <Activity size={14} className="text-muted-foreground shrink-0" />
              <p className="text-xs text-muted-foreground flex-1">
                {linkedClients.length} cliente(s) com conta Meta vinculada. Clique em <strong className="text-foreground">Atualizar Dados</strong> para carregar o resumo da carteira.
              </p>
              <button
                onClick={handleRefreshAll}
                disabled={refreshingAll}
                className="text-xs px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20 text-primary hover:bg-primary/15 transition-all flex items-center gap-1.5"
              >
                {refreshingAll ? <Loader2 size={11} className="animate-spin" /> : <Activity size={11} />}
                Carregar
              </button>
            </div>
          )}

          {/* Account selector — shows when no account is selected */}
          {!selectedMetaAccount && (
            <div className="card border border-primary/20 animate-fade-in">
              <div className="flex items-center gap-2 mb-4">
                <Users size={16} className="text-primary" />
                <h3 className="text-sm font-semibold text-foreground">Selecione uma Conta de Anúncios</h3>
                {loadingAccounts && <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />}
              </div>

              {metaError && (
                <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 mb-3 text-xs text-destructive">
                  {metaError}
                </div>
              )}

              {loadingAccounts ? (
                <div className="space-y-3 py-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="p-4 rounded-xl border border-border bg-muted/30 space-y-2">
                        <div className="h-4 w-32 bg-card/[0.06] rounded animate-pulse" />
                        <div className="h-3 w-24 bg-card/[0.06] rounded animate-pulse" />
                        <div className="h-3 w-16 bg-card/[0.06] rounded animate-pulse" />
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    <span className="text-xs text-muted-foreground">Buscando contas de anúncio...</span>
                  </div>
                </div>
              ) : visibleAccounts.length === 0 && metaAccounts.length === 0 ? (
                <div className="text-center py-8">
                  <Megaphone size={32} className="mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">Nenhuma conta de anúncios encontrada.</p>
                  <p className="text-xs text-muted-foreground mt-1">Verifique se sua conta tem acesso a contas de anúncio no Meta Business.</p>
                </div>
              ) : (
                <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {visibleAccounts.map((acc) => (
                    <div key={acc.id} className="relative flex items-start gap-3 p-4 rounded-xl border border-border bg-muted/30 hover:bg-muted/60 hover:border-primary/30 transition-all text-left group">
                      <button
                        onClick={(e) => { e.stopPropagation(); hideAccount(acc.id); }}
                        className="absolute top-2 right-2 w-6 h-6 rounded-md bg-destructive/10 text-destructive hover:bg-destructive/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
                        title="Ocultar esta conta"
                      >
                        <X size={12} />
                      </button>
                      <button
                        onClick={() => handleSelectAccount(acc.id)}
                        className="flex items-start gap-3 flex-1 text-left"
                      >
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/10 transition-colors">
                          <Megaphone size={18} className="text-primary group-hover:text-primary transition-colors" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{acc.name || `Conta ${acc.account_id}`}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">ID: {acc.account_id}</p>
                          {acc.business_name && (
                            <p className="text-xs text-muted-foreground">Business: {acc.business_name}</p>
                          )}
                          <div className="flex items-center gap-2 mt-1.5">
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                              {acc.currency ?? "BRL"}
                            </span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                              ({
                                ok: "bg-primary/10 text-primary border-primary/20",
                                critical: "bg-lone-danger-bg text-lone-danger border-lone-danger-border",
                                review: "bg-lone-warning-bg text-lone-warning border-lone-warning-border",
                                paused: "bg-muted text-muted-foreground border-border",
                              } as const)[metaAccountStatus(acc.account_status).gravidade]
                            }`}>
                              {metaAccountStatus(acc.account_status).label}
                            </span>
                          </div>
                        </div>
                        <ArrowUpRight size={14} className="text-muted-foreground group-hover:text-primary transition-colors mt-1 shrink-0" />
                      </button>
                    </div>
                  ))}
                </div>
                {hiddenAccounts.size > 0 && (
                  <div className="mt-3 pt-3 border-t border-border">
                    <p className="text-xs text-muted-foreground mb-2">{hiddenAccounts.size} conta(s) oculta(s)</p>
                    <div className="flex flex-wrap gap-2">
                      {metaAccounts.filter((a) => hiddenAccounts.has(a.id)).map((acc) => (
                        <button
                          key={acc.id}
                          onClick={() => unhideAccount(acc.id)}
                          className="text-[11px] px-2 py-1 rounded-md border border-border bg-muted/30 text-muted-foreground hover:text-foreground hover:border-primary/30 flex items-center gap-1.5"
                        >
                          <Plus size={10} />
                          {acc.name || acc.account_id}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                </>
              )}
            </div>
          )}

          {loadingCampaigns && (
            <div className="card border border-border animate-fade-in space-y-3 p-4">
              {/* Skeleton header */}
              <div className="flex items-center justify-between">
                <div className="h-4 w-40 bg-card/[0.06] rounded-md animate-pulse" />
                <div className="h-4 w-20 bg-card/[0.06] rounded-md animate-pulse" />
              </div>
              {/* Skeleton rows */}
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center gap-3 py-3 border-t border-border/50">
                  <div className="h-3 w-3 rounded-full bg-card/[0.06] animate-pulse shrink-0" />
                  <div className="h-3 flex-1 bg-card/[0.06] rounded animate-pulse" style={{ maxWidth: `${200 + i * 30}px` }} />
                  <div className="h-3 w-16 bg-card/[0.06] rounded animate-pulse" />
                  <div className="h-3 w-20 bg-card/[0.06] rounded animate-pulse" />
                  <div className="h-3 w-14 bg-card/[0.06] rounded animate-pulse" />
                </div>
              ))}
              <div className="flex items-center justify-center gap-2 pt-2">
                <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <span className="text-xs text-muted-foreground">Carregando campanhas e métricas...</span>
              </div>
            </div>
          )}
        </div>
      ) : isAdmin ? (
        <div className={`rounded-xl p-4 flex items-center gap-4 ${
          meta.tokenExpired
            ? "bg-lone-warning-bg border border-lone-warning-border"
            : "bg-primary/5 border border-primary/20"
        }`}>
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
            meta.tokenExpired ? "bg-lone-warning-bg" : "bg-primary/10"
          }`}>
            {meta.tokenExpired ? <AlertTriangle size={20} className="text-lone-warning" /> : <Megaphone size={20} className="text-primary" />}
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-foreground">
              {meta.tokenExpired ? "Meta Ads — Sessão Expirada" : "Meta Ads — Não Conectado"}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {meta.tokenExpired
                ? "Seu token de acesso expirou. Reconecte para continuar vendo dados reais."
                : "Conecte a conta Meta da agência para ver dados reais de campanhas."
              }
            </p>
          </div>
          <button onClick={meta.connect} className={`btn-ghost text-xs border ${
            meta.tokenExpired
              ? "border-lone-warning-border text-lone-warning hover:bg-lone-warning-bg"
              : "border-primary/20 text-primary hover:bg-primary/10"
          }`}>
            {meta.tokenExpired ? "Reconectar" : "Conectar Meta Ads"}
          </button>
        </div>
      ) : null}

      {/* Sem token neste navegador: a rota do token só responde a admin — nada de número inventado. */}
      {!meta.loading && !meta.connected && !isAdmin && (
        <div className="rounded-xl border border-border bg-card px-4 py-6 flex items-start gap-3">
          <Info size={16} className="text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-sm text-muted-foreground">
            Os dados de anúncios desta aba ainda vêm do navegador do admin. Peça para um admin abrir a aba, ou use{" "}
            <Link href="/traffic/budgets" className="text-primary hover:underline">Saldos, Verba &amp; Alertas</Link>.
          </p>
        </div>
      )}

      {/* Conteúdo só com conta real selecionada */}
      {!loadingCampaigns && isUsingRealData && (
      <>
      {metaCampaigns.some(insightFalhou) && (
        <div className="rounded-xl border border-lone-warning-border bg-lone-warning-bg px-4 py-3 flex items-center gap-2 text-xs text-lone-warning">
          <AlertTriangle size={14} className="shrink-0" />
          {metaCampaigns.filter(insightFalhou).length} campanha(s) sem dados — a Meta não respondeu. Os totais abaixo não incluem elas; clique em Atualizar Dados.
        </div>
      )}
      {/* ═══ FILTERS BAR ═══ */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Bússola — busca rápida de cliente */}
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar cliente..."
            value={clientSearch}
            onChange={(e) => setClientSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
              const matches = clients
                .filter((c) => accounts.some((a) => a.clientId === c.id) || !!c.metaAdAccountId)
                .filter((c) => !clientSearch || norm(c.name).includes(norm(clientSearch)));
              if (matches.length === 0) return;
              const c = matches[0];
              setSelectedClient(c.id);
              setClientSearch("");
              if (meta.connected && c.metaAdAccountId) {
                const match = metaAccounts.find((a: any) => a.id === c.metaAdAccountId || a.account_id === c.metaAdAccountId);
                if (match) handleSelectAccount(match.id);
              }
            }}
            className="bg-muted border border-border rounded-lg pl-8 pr-7 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 w-[180px]"
          />
          {clientSearch && (
            <button
              onClick={() => setClientSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X size={11} />
            </button>
          )}
        </div>
        {/* Client pills */}
        <div className="flex items-center gap-1 flex-wrap">
          <button
            onClick={() => setSelectedClient("all")}
            className={`text-xs px-2.5 py-1 rounded-lg transition-all border ${
              selectedClient === "all"
                ? "bg-primary/10 text-primary border-primary/30 font-medium"
                : "bg-muted text-muted-foreground border-transparent hover:text-foreground"
            }`}
          >
            Todos
          </button>
          {clients
            .filter((c) => accounts.some((a) => a.clientId === c.id) || !!c.metaAdAccountId)
            .filter((c) => {
              if (!clientSearch) return true;
              const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
              return norm(c.name).includes(norm(clientSearch));
            })
            .map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  setSelectedClient(c.id);
                  // Auto-select Meta account when using real data
                  if (meta.connected && c.metaAdAccountId) {
                    const match = metaAccounts.find((a: any) => a.id === c.metaAdAccountId || a.account_id === c.metaAdAccountId);
                    if (match) handleSelectAccount(match.id);
                  }
                }}
                className={`text-xs px-2.5 py-1 rounded-lg transition-all border flex items-center gap-1.5 ${
                  selectedClient === c.id
                    ? "bg-primary/10 text-primary border-primary/30 font-medium"
                    : "bg-muted text-muted-foreground border-transparent hover:text-foreground hover:border-border/50"
                }`}
              >
                {c.metaAdAccountId && (
                  <Facebook size={9} className={selectedClient === c.id ? "text-primary" : "text-primary opacity-70"} />
                )}
                <span className="max-w-[130px] truncate">{c.name}</span>
              </button>
            ))}
          {clientSearch && clients.filter((c) => {
            const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
            return (accounts.some((a) => a.clientId === c.id) || !!c.metaAdAccountId) && norm(c.name).includes(norm(clientSearch));
          }).length === 0 && (
            <span className="text-xs text-muted-foreground italic px-1">Nenhum cliente encontrado</span>
          )}
        </div>
        <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
          {[{ key: "all", label: "Todas" }, { key: "active", label: "Ativas" }, { key: "paused", label: "Pausadas" }, { key: "completed", label: "Finalizadas" }].map((s) => (
            <button
              key={s.key}
              onClick={() => setStatusFilter(s.key)}
              className={`text-xs px-2.5 py-1.5 rounded-md transition-colors ${
                statusFilter === s.key ? "bg-card text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        {/* Ad Account Quick Filter (when Meta connected) */}
        {meta.connected && visibleAccounts.length > 1 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-medium">Conta:</span>
            <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
              {visibleAccounts.map((acc) => (
                <button
                  key={acc.id}
                  onClick={() => handleSelectAccount(acc.id)}
                  className={`text-xs px-3 py-1.5 rounded-md transition-all ${
                    selectedMetaAccount === acc.id
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {acc.name}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="flex items-center gap-2">
          <Calendar size={14} className="text-muted-foreground flex-shrink-0" />
          <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
            {[{ days: 7, label: "7d" }, { days: 14, label: "14d" }, { days: 30, label: "30d" }, { days: 90, label: "90d" }].map((d) => (
              <button
                key={d.days}
                onClick={() => { setDateRange(d.days); setCustomDateFrom(""); setCustomDateTo(""); setShowCustomRange(false); }}
                className={`text-xs px-2.5 py-1.5 rounded-md transition-colors ${
                  dateRange === d.days && !customDateFrom ? "bg-card text-foreground font-medium" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {d.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                if (showCustomRange) {
                  setShowCustomRange(false);
                  return;
                }
                const to = customDateTo || todaySP();
                const from = customDateFrom || diasAntes(todaySP(), dateRange);
                setPendingFrom(from);
                setPendingTo(to);
                setShowCustomRange(true);
              }}
              className={`text-xs px-2.5 py-1.5 rounded-md transition-colors ${
                customDateFrom ? "bg-card text-foreground font-medium" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {customDateFrom
                ? `${customDateFrom.slice(8, 10)}/${customDateFrom.slice(5, 7)} – ${customDateTo.slice(8, 10)}/${customDateTo.slice(5, 7)}`
                : "Personalizado"}
            </button>
          </div>
          {showCustomRange && (
            <div className="flex items-center gap-1.5 bg-muted border border-border rounded-lg px-2 py-1">
              <input
                type="date"
                value={pendingFrom}
                max={pendingTo || todaySP()}
                onChange={(e) => setPendingFrom(e.target.value)}
                className="text-xs px-1.5 py-1 rounded bg-card border border-border text-foreground w-[120px] cursor-pointer"
              />
              <span className="text-xs text-muted-foreground">–</span>
              <input
                type="date"
                value={pendingTo}
                min={pendingFrom || undefined}
                max={todaySP()}
                onChange={(e) => setPendingTo(e.target.value)}
                className="text-xs px-1.5 py-1 rounded bg-card border border-border text-foreground w-[120px] cursor-pointer"
              />
              <button
                type="button"
                onClick={() => {
                  if (!pendingFrom || !pendingTo) return;
                  const diff = diasEntre(pendingFrom, pendingTo) ?? 0;
                  if (diff > 0) setDateRange(diff);
                  setCustomDateFrom(pendingFrom);
                  setCustomDateTo(pendingTo);
                  setShowCustomRange(false);
                }}
                disabled={!pendingFrom || !pendingTo}
                className="text-xs px-2.5 py-1 bg-primary text-primary-foreground rounded-md font-semibold hover:bg-primary/90 transition-colors disabled:opacity-40"
              >
                OK
              </button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={() => setShowMetricConfig(!showMetricConfig)}
            className={`text-xs flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-colors ${
              showMetricConfig ? "bg-primary/10 border-primary/30 text-primary" : "bg-muted border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            <Settings2 size={13} />
            Métricas
          </button>
          <button onClick={handleExportPdf} disabled={exportingPdf} className="text-xs flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition-colors font-medium disabled:opacity-50">
            {exportingPdf ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
            {exportingPdf ? "Gerando..." : "PDF Interno"}
          </button>
          <div className="w-px h-5 bg-card/10 self-center" />
          <button onClick={handleExportClientPdf} disabled={exportingPdf} className="text-xs flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition-colors font-medium disabled:opacity-50">
            {exportingPdf ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
            {exportingPdf ? "Gerando..." : "PDF Cliente"}
          </button>
          <button
            onClick={handleExportAllPdf}
            disabled={exportingAll}
            className="text-xs flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition-colors font-medium disabled:opacity-50"
          >
            {exportingAll ? <Loader2 size={13} className="animate-spin" /> : <FolderDown size={13} />}
            {exportingAll ? "Gerando PDFs..." : "Todos os Clientes"}
          </button>
        </div>
      </div>

      {/* Export progress banner */}
      {exportAllProgress && (
        <div className="flex items-center gap-2.5 px-4 py-3 bg-primary/10 border border-primary/20 rounded-xl text-xs text-primary animate-fade-in">
          <Loader2 size={13} className="animate-spin shrink-0" />
          <span className="flex-1">{exportAllProgress}</span>
        </div>
      )}

      {/* Export error banner */}
      {exportAllError && (
        <div className="flex items-start gap-2.5 px-4 py-3 bg-lone-warning-bg border border-lone-warning-border rounded-xl text-xs text-lone-warning animate-fade-in">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          <span className="flex-1">{exportAllError}</span>
          <button onClick={() => setExportAllError(null)} className="text-lone-warning hover:text-lone-warning transition-colors">✕</button>
        </div>
      )}

      {/* Metric Configuration Panel */}
      {showMetricConfig && (
        <div className="card border border-primary/20 animate-fade-in">
          <div className="flex items-center gap-2 mb-3">
            <Settings2 size={14} className="text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Métricas do Painel</h3>
          </div>
          <div className="grid grid-cols-3 lg:grid-cols-5 gap-2">
            {ALL_METRICS.map((m) => {
              const active = visibleMetrics.includes(m.key);
              const MIcon = m.icon;
              return (
                <button
                  key={m.key}
                  onClick={() => toggleMetric(m.key)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-xs font-medium transition-all ${
                    active
                      ? "bg-primary/10 border-primary/30 text-foreground"
                      : "bg-muted/50 border-border text-muted-foreground hover:border-primary/20"
                  }`}
                >
                  <MIcon size={14} className={active ? m.color : "text-muted-foreground"} />
                  {m.label}
                  {active && <Check size={12} className="text-primary ml-auto" />}
                </button>
              );
            })}
          </div>
          <div className="mt-3 pt-3 border-t border-border flex items-center gap-2">
            <button onClick={() => setVisibleMetrics(DEFAULT_VISIBLE_METRICS)} className="text-xs text-muted-foreground hover:text-foreground">Restaurar padrão</button>
            <button onClick={() => setVisibleMetrics(ALL_METRICS.map((m) => m.key))} className="text-xs text-muted-foreground hover:text-foreground ml-2">Selecionar todas</button>
          </div>
        </div>
      )}

      {/* ═══ AI HEALTH OVERVIEW — Premium Hero Section ═══ */}
      {aiAnalysis && (
        <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 via-surface to-surface overflow-hidden">
          <div className="p-6">
            <div className="flex items-start gap-6">
              {/* Health Score Ring */}
              <div className="shrink-0">
                <HealthScoreRing score={aiAnalysis.healthScore} label={aiAnalysis.healthLabel} size={130} />
              </div>

              {/* Summary Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <Brain size={16} className="text-primary" />
                  <h3 className="text-sm font-bold text-foreground uppercase tracking-wide">Análise Inteligente</h3>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 font-semibold">AI</span>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                  <div className="bg-card/60 border border-border rounded-xl p-3">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Campanhas</p>
                    <p className="text-lg font-black text-foreground tabular-nums">{aiAnalysis.activeCampaigns}<span className="text-xs font-normal text-muted-foreground">/{aiAnalysis.totalCampaigns}</span></p>
                    <p className="text-[10px] text-muted-foreground">ativas</p>
                  </div>
                  <div className="bg-card/60 border border-border rounded-xl p-3">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Tendência Gasto</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      {aiAnalysis.spendTrend === "up" ? <ArrowUpRight size={16} className="text-destructive" /> : aiAnalysis.spendTrend === "down" ? <ArrowDownRight size={16} className="text-primary" /> : <Minus size={16} className="text-muted-foreground" />}
                      <span className={`text-lg font-black tabular-nums ${aiAnalysis.spendTrend === "up" ? "text-destructive" : aiAnalysis.spendTrend === "down" ? "text-primary" : "text-foreground"}`}>
                        {aiAnalysis.spendTrend === "up" ? "Alta" : aiAnalysis.spendTrend === "down" ? "Queda" : "Estável"}
                      </span>
                    </div>
                  </div>
                  <div className="bg-card/60 border border-border rounded-xl p-3">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Performance</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      {aiAnalysis.performanceTrend === "improving" ? <TrendingUp size={16} className="text-primary" /> : aiAnalysis.performanceTrend === "declining" ? <TrendingDown size={16} className="text-destructive" /> : <Activity size={16} className="text-muted-foreground" />}
                      <span className={`text-lg font-black tabular-nums ${aiAnalysis.performanceTrend === "improving" ? "text-primary" : aiAnalysis.performanceTrend === "declining" ? "text-destructive" : "text-foreground"}`}>
                        {aiAnalysis.performanceTrend === "improving" ? "Melhorando" : aiAnalysis.performanceTrend === "declining" ? "Em Queda" : "Estável"}
                      </span>
                    </div>
                  </div>
                  <div className="bg-card/60 border border-border rounded-xl p-3">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Alertas</p>
                    <div className="flex items-center gap-2 mt-1">
                      {criticalInsights.length > 0 && <span className="text-lg font-black text-destructive tabular-nums">{criticalInsights.length}<span className="text-[10px] font-normal"> críticos</span></span>}
                      {warningInsights.length > 0 && <span className="text-lg font-black text-primary tabular-nums">{warningInsights.length}<span className="text-[10px] font-normal"> atenção</span></span>}
                      {criticalInsights.length === 0 && warningInsights.length === 0 && <span className="text-lg font-black text-primary">Nenhum</span>}
                    </div>
                  </div>
                </div>

                {/* Top / Worst performers */}
                <div className="flex items-center gap-6 text-xs">
                  {aiAnalysis.topPerformer && (
                    <div className="flex items-center gap-2">
                      <Star size={12} className="text-primary" />
                      <span className="text-muted-foreground">Melhor:</span>
                      <span className="text-foreground font-semibold">{aiAnalysis.topPerformer.name}</span>
                      <span className="text-primary font-bold">{aiAnalysis.topPerformer.value}</span>
                    </div>
                  )}
                  {aiAnalysis.worstPerformer && (
                    <div className="flex items-center gap-2">
                      <ShieldAlert size={12} className="text-destructive" />
                      <span className="text-muted-foreground">Revisar:</span>
                      <span className="text-foreground font-semibold">{aiAnalysis.worstPerformer.name}</span>
                      <span className="text-destructive font-bold">{aiAnalysis.worstPerformer.value}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ AI INSIGHTS PANEL ═══ */}
      {activeInsights.length > 0 && (
        <div className="card border border-primary/10">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Zap size={16} className="text-primary" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-foreground">Insights & Alertas</h3>
                <p className="text-[10px] text-muted-foreground">{activeInsights.length} recomendações da análise inteligente</p>
              </div>
            </div>
            {activeInsights.length > 4 && (
              <button
                onClick={() => setShowAllInsights(!showAllInsights)}
                className="text-xs text-primary hover:text-primary/80 font-medium"
              >
                {showAllInsights ? "Ver menos" : `Ver todos (${activeInsights.length})`}
              </button>
            )}
          </div>
          <div className="space-y-2">
            {(showAllInsights ? activeInsights : activeInsights.slice(0, 4)).map((insight) => {
              const config = SEVERITY_CONFIG[insight.severity] ?? SEVERITY_CONFIG.info;
              const SIcon = config.icon;
              return (
                <div key={insight.id} className={`flex items-start gap-3 p-3.5 rounded-xl border ${config.border} ${config.bg} group`}>
                  <div className={`w-7 h-7 rounded-lg ${config.bg} flex items-center justify-center shrink-0 mt-0.5`}>
                    <SIcon size={14} className={config.color} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-xs font-bold text-foreground">{insight.title}</p>
                      {insight.campaignName && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted/50 text-muted-foreground border border-border">{insight.campaignName}</span>
                      )}
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                        insight.priority === "critical" ? "bg-destructive/10 text-destructive border border-destructive/20" :
                        insight.priority === "high" ? "bg-primary/10 text-primary border border-primary/20" :
                        insight.priority === "medium" ? "bg-primary/10 text-primary border border-primary/15" :
                        "bg-card text-muted-foreground border border-border"
                      }`}>
                        {insight.priority === "critical" ? "Crítico" : insight.priority === "high" ? "Alta" : insight.priority === "medium" ? "Média" : "Baixa"}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{insight.description}</p>
                    <div className="flex items-center gap-3 mt-2">
                      <div className="flex items-center gap-1.5 text-[11px] text-primary font-medium">
                        <Sparkles size={11} />
                        {insight.action}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => setDismissedInsights((prev) => new Set([...prev, insight.id]))}
                    className="w-6 h-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                    title="Dispensar"
                  >
                    <X size={12} />
                  </button>
                </div>
              );
            })}
          </div>
          {dismissedInsights.size > 0 && (
            <button
              onClick={() => setDismissedInsights(new Set())}
              className="text-[11px] text-muted-foreground hover:text-foreground mt-3 flex items-center gap-1"
            >
              <Bell size={10} /> Mostrar {dismissedInsights.size} alerta(s) dispensado(s)
            </button>
          )}
        </div>
      )}

      {/* ═══ DATA FRESHNESS ═══ */}
      {isUsingRealData && lastSyncTimestamp && (
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <Activity size={12} className="text-primary" />
          <span>Última sincronização: {new Date(lastSyncTimestamp).toLocaleString("pt-BR", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}</span>
          {filteredCampaigns.some(c => c.hasData === false) && (
            <span className="text-lone-warning flex items-center gap-1">
              <AlertCircle size={11} />
              {filteredCampaigns.filter(c => c.hasData === false).length} campanha(s) sem dados no período
            </span>
          )}
        </div>
      )}

      {/* ═══ METRICS GRID ═══ */}
      <div className={`grid gap-3 ${
        visibleMetrics.length <= 3 ? "grid-cols-3" :
        visibleMetrics.length <= 4 ? "grid-cols-2 lg:grid-cols-4" :
        visibleMetrics.length <= 6 ? "grid-cols-2 lg:grid-cols-3 xl:grid-cols-6" :
        "grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
      }`}>
        {ALL_METRICS.filter((m) => visibleMetrics.includes(m.key)).map((m) => {
          const MIcon = m.icon;
          const val = metricValues[m.key];
          // KPI thermometer: cost metrics glow based on thresholds
          const kpiClass = (() => {
            if (val === 0) return "";
            // Cost-per metrics: lower is better
            if (m.key === "costPerLead") return val <= 15 ? "kpi-good" : val <= 40 ? "kpi-warning" : "kpi-danger";
            if (m.key === "costPerMessage") return val <= 5 ? "kpi-good" : val <= 15 ? "kpi-warning" : "kpi-danger";
            if (m.key === "costPerConv") return val <= 30 ? "kpi-good" : val <= 80 ? "kpi-warning" : "kpi-danger";
            if (m.key === "costPerResult") return val <= 20 ? "kpi-good" : val <= 50 ? "kpi-warning" : "kpi-danger";
            if (m.key === "cpc") return val <= 2 ? "kpi-good" : val <= 5 ? "kpi-warning" : "kpi-danger";
            // CTR: higher is better (inverted)
            if (m.key === "ctr") return val >= 2 ? "kpi-good" : val >= 0.8 ? "kpi-warning" : "kpi-danger";
            return "";
          })();
          return (
            <div key={m.key} className={`rounded-xl border border-border bg-card p-4 text-center transition-all ${kpiClass || "hover:border-primary/30"}`}>
              <div className={`w-9 h-9 mx-auto rounded-lg flex items-center justify-center mb-2 ${
                kpiClass === "kpi-danger" ? "bg-destructive/10 border border-destructive/20" :
                kpiClass === "kpi-warning" ? "bg-lone-warning-bg border border-lone-warning-border" :
                "bg-primary/10 border border-primary/15"
              }`}>
                <MIcon size={16} className={
                  kpiClass === "kpi-danger" ? "text-destructive" :
                  kpiClass === "kpi-warning" ? "text-lone-warning" :
                  "text-primary"
                } />
              </div>
              <p className={`text-xl font-black tabular-nums ${
                kpiClass === "kpi-danger" ? "text-destructive" :
                kpiClass === "kpi-warning" ? "text-lone-warning" :
                "text-foreground"
              }`}>{m.format(val)}</p>
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mt-0.5">{m.label}</p>
              {kpiClass && (
                <p className={`text-[9px] mt-1 font-semibold uppercase tracking-wider ${
                  kpiClass === "kpi-good" ? "text-primary" :
                  kpiClass === "kpi-warning" ? "text-lone-warning" :
                  "text-destructive"
                }`}>
                  {kpiClass === "kpi-good" ? "● Saudável" : kpiClass === "kpi-warning" ? "● Atenção" : "● Crítico"}
                </p>
              )}
              {m.key === "costPerMessage" && (
                <p className="text-[9px] text-muted-foreground/50 mt-1 truncate px-1" title={championAdSetName ?? undefined}>
                  {championAdSetName ? championAdSetName.slice(0, 22) : "melhor conjunto ativo"}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* ═══ CHARTS ═══ */}
      {dailyChartData.length > 0 && (
        <div className="card border border-border">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-foreground">Performance Diária — Últimos {dateRange} dias</h3>
            <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
              {(["spend", "clicks", "conversions", "impressions"] as const).map((key) => (
                <button
                  key={key}
                  onClick={() => toggleChartMetric(key)}
                  className={`text-xs px-2.5 py-1 rounded-md transition-colors ${
                    chartMetrics.includes(key) ? "bg-card text-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {{ spend: "Gasto", clicks: "Cliques", conversions: "Conv", impressions: "Impr" }[key]}
                </button>
              ))}
            </div>
          </div>
          {chartMetrics.length > 0 ? (
            <SpendAreaChart data={dailyChartData} visibleMetrics={chartMetrics} />
          ) : (
            <p className="text-sm text-muted-foreground text-center py-10">Selecione ao menos uma métrica para ver o gráfico.</p>
          )}
          <div className="flex items-center gap-6 mt-3 pt-3 border-t border-border text-xs text-muted-foreground">
            <span>Total período: <span className="text-foreground font-semibold">R$ {formatCurrency(dailyChartData.reduce((s, d) => s + d.spend, 0))}</span></span>
            <span>Conversões: <span className="text-foreground font-semibold">{dailyChartData.reduce((s, d) => s + d.conversions, 0)}</span></span>
            <span>Cliques: <span className="text-foreground font-semibold">{formatNumber(dailyChartData.reduce((s, d) => s + d.clicks, 0))}</span></span>
          </div>
        </div>
      )}

      {/* Client breakdown */}
      {selectedClient === "all" && clientBreakdown.length > 1 && (
        <div className="card border border-border">
          <h3 className="text-sm font-semibold text-foreground mb-4">Investimento por Cliente</h3>
          <ClientSpendBar data={clientBarData} />
          <div className="space-y-3 mt-4 pt-4 border-t border-border">
            {clientBreakdown.map(([clientId, data]) => {
              const pct = totalSpend > 0 ? (data.spend / totalSpend) * 100 : 0;
              return (
                <div key={clientId}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-md bg-primary/20 text-primary flex items-center justify-center text-xs font-bold">
                        {data.name[0]}
                      </div>
                      <span className="text-sm font-medium text-foreground">{data.name}</span>
                      <span className="text-xs text-muted-foreground">({data.campaigns} campanhas)</span>
                    </div>
                    <div className="flex items-center gap-4 text-xs">
                      <span className="text-muted-foreground">{data.conversions} conv</span>
                      <span className="text-foreground font-semibold">R$ {formatCurrency(data.spend)}</span>
                      <span className="text-muted-foreground w-10 text-right">{pct.toFixed(0)}%</span>
                    </div>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══ LONE ADS SPECIALIST (AI Analysis) ═══ */}
      {selectedClient !== "all" && filteredCampaigns.length > 0 && (
        <AdsInsightCard
          clientName={clients.find((c) => c.id === selectedClient)?.name ?? selectedClient}
          clientId={selectedClient}
          campaigns={filteredCampaigns}
          period="ultimos 30 dias"
          triggeredBy={currentUser}
        />
      )}

      {/* ═══ AI ACCOUNT REPORTS ═══ */}
      {clientBreakdown.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Brain size={16} className="text-primary" />
            <h3 className="text-sm font-bold text-foreground">Relatório AI por Conta</h3>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 font-semibold">AI</span>
          </div>
          {clientBreakdown.map(([clientId, data]) => {
            const clientCampaigns = filteredCampaigns.filter((c) => c.clientId === clientId);
            const report = generateAccountReport(clientCampaigns, data.name);
            if (report.activeCampaigns === 0) return null;
            return (
              <div key={clientId} className={`rounded-xl border overflow-hidden ${
                report.urgency === "critical" ? "border-destructive/20" : report.urgency === "warning" ? "border-primary/15" : "border-primary/20"
              }`}>
                <div className={`px-5 py-4 ${
                  report.urgency === "critical" ? "bg-destructive/[0.03]" : report.urgency === "warning" ? "bg-primary/[0.03]" : "bg-primary/[0.03]"
                }`}>
                  <div className="flex items-center gap-4">
                    <div className="shrink-0">
                      <HealthScoreRing score={report.healthScore} label={report.healthLabel} size={80} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <h4 className="text-sm font-bold text-foreground">{report.accountName}</h4>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                          report.urgency === "critical" ? "bg-destructive/10 text-destructive border border-destructive/20" :
                          report.urgency === "warning" ? "bg-primary/10 text-primary border border-primary/15" :
                          "bg-primary/10 text-primary border border-primary/20"
                        }`}>
                          {report.urgency === "critical" ? "CRÍTICO" : report.urgency === "warning" ? "ATENÇÃO" : "SAUDÁVEL"}
                        </span>
                        <span className="text-[10px] text-muted-foreground">{report.activeCampaigns} campanhas ativas · R$ {formatCurrency(report.totalSpend)} investidos</span>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        {/* Positives */}
                        <div>
                          <p className="text-[10px] text-primary font-semibold uppercase tracking-wider mb-1.5 flex items-center gap-1">
                            <CheckCircle size={10} /> O que está bom
                          </p>
                          <div className="space-y-1">
                            {report.positives.slice(0, 3).map((p, i) => (
                              <p key={i} className="text-xs text-muted-foreground leading-relaxed flex items-start gap-1.5">
                                <span className="text-primary mt-0.5 shrink-0">+</span> {p}
                              </p>
                            ))}
                          </div>
                        </div>
                        {/* Improvements */}
                        <div>
                          <p className="text-[10px] text-primary font-semibold uppercase tracking-wider mb-1.5 flex items-center gap-1">
                            <AlertTriangle size={10} /> O que melhorar
                          </p>
                          <div className="space-y-1">
                            {report.improvements.length === 0 ? (
                              <p className="text-xs text-muted-foreground">Nenhum ponto crítico encontrado</p>
                            ) : (
                              report.improvements.slice(0, 3).map((imp, i) => (
                                <p key={i} className="text-xs text-muted-foreground leading-relaxed flex items-start gap-1.5">
                                  <span className="text-primary mt-0.5 shrink-0">!</span> {imp}
                                </p>
                              ))
                            )}
                            {report.improvements.length > 3 && (
                              <p className="text-[10px] text-muted-foreground">+ {report.improvements.length - 3} pontos adicionais</p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ═══ ACTIVE CAMPAIGNS LIST ═══ */}
      <div className="card border border-border">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Megaphone size={16} className="text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Campanhas Ativas ({filteredCampaigns.filter((c) => c.status === "active").length})</h3>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-primary" /> {filteredCampaigns.filter((c) => c.status === "active").length} ativas</span>
            {statusFilter === "all" && <span className="text-[10px] text-muted-foreground/60">Mostrando todas as campanhas</span>}
          </div>
        </div>
        <div className="space-y-2">
          {(() => {
            const displayCampaigns = filteredCampaigns;
            if (displayCampaigns.length === 0) return (
              <p className="text-sm text-muted-foreground text-center py-6">Nenhuma campanha encontrada com os filtros selecionados.</p>
            );
            return displayCampaigns.map((camp) => {
            const statusInfo = STATUS_LABELS[camp.status];
            const Icon = statusInfo?.icon ?? CheckCircle;
            const isExpanded = expandedCampaign === camp.id;
            const budgetPct = camp.totalBudget > 0 ? (camp.spend / camp.totalBudget) * 100 : 0;
            return (
              <div key={camp.id} className={`border rounded-xl overflow-hidden transition-colors ${isExpanded ? "border-primary/30 bg-primary/[0.02]" : "border-border"}`}>
                <button
                  onClick={() => setExpandedCampaign(isExpanded ? null : camp.id)}
                  className="w-full flex items-center gap-3 p-3.5 hover:bg-muted/50 transition-colors text-left"
                >
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border ${statusInfo?.cls}`}>
                    <Icon size={15} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-foreground truncate">{camp.name}</p>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${statusInfo?.cls}`}>{statusInfo?.label}</span>
                      {insightFalhou(camp) ? (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-lone-warning-bg text-lone-warning border border-lone-warning-border font-bold uppercase tracking-wider" title="A Meta não respondeu os números desta campanha">Sem dados — falha na Meta</span>
                      ) : camp.hasData === false && <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border font-bold uppercase tracking-wider">Sem dados</span>}
                      {budgetPct > 90 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-destructive/10 text-destructive border border-destructive/20 font-semibold">Verba {budgetPct.toFixed(0)}%</span>}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                      <span>{camp.clientName}</span>
                      <span className="text-border">|</span>
                      <span>{OBJECTIVE_LABELS[camp.objective] ?? camp.objective}</span>
                      <span className="text-border">|</span>
                      <span>R$ {formatCurrency(camp.dailyBudget)}/dia</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-5 text-xs shrink-0">
                    <div className="text-right">
                      <p className="font-bold text-foreground tabular-nums">{insightFalhou(camp) ? "—" : `R$ ${formatCurrency(camp.spend)}`}</p>
                      <p className="text-[10px] text-muted-foreground">Gasto</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-foreground tabular-nums">{formatNumber(camp.impressions)}</p>
                      <p className="text-[10px] text-muted-foreground">Impr</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-foreground tabular-nums">{Math.round(camp.conversions)}</p>
                      <p className="text-[10px] text-muted-foreground">Conv</p>
                    </div>
                    <div className="text-right">
                      <p className={`font-bold tabular-nums ${camp.ctr >= 2 ? "text-primary" : camp.ctr < 0.5 ? "text-destructive" : "text-foreground"}`}>{camp.ctr.toFixed(2)}%</p>
                      <p className="text-[10px] text-muted-foreground">CTR</p>
                    </div>
                    {isExpanded ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-border p-4 bg-muted/20 space-y-4 animate-fade-in">
                    <div className="grid grid-cols-3 lg:grid-cols-6 gap-2">
                      {[
                        { label: "Alcance", value: formatNumber(camp.reach) },
                        { label: "Cliques", value: formatNumber(camp.clicks) },
                        { label: "CPC", value: fmtMetric(camp.cpc, "R$") },
                        { label: "CPM", value: fmtMetric(camp.cpm, "R$") },
                        { label: "Leads", value: camp.leads ? String(camp.leads) : "N/A" },
                        { label: "CPL", value: camp.costPerLead ? fmtMetric(camp.costPerLead, "R$") : "N/A" },
                        { label: "Msgs", value: camp.messages ? String(camp.messages) : "N/A" },
                        { label: camp.cheapestAdSetName ? `Custo Campeão (${camp.cheapestAdSetName.slice(0, 16)})` : "Custo Campeão", value: camp.cheapestAdSetCostPerMessage ? fmtMetric(camp.cheapestAdSetCostPerMessage, "R$") : "—" },
                        { label: "Resultado", value: camp.results ? String(camp.results) : "N/A" },
                        { label: "Custo/Resultado", value: camp.costPerResult ? fmtMetric(camp.costPerResult, "R$") : "N/A" },
                        { label: "Frequência", value: camp.frequency ? camp.frequency.toFixed(2) : "N/A" },
                        { label: "Conversões", value: camp.conversions > 0 ? String(camp.conversions) : "N/A" },
                      ].map((item) => (
                        <div key={item.label} className="bg-card border border-border rounded-lg p-2.5 text-center">
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{item.label}</p>
                          <p className="text-sm font-bold text-foreground tabular-nums mt-0.5">{item.value}</p>
                        </div>
                      ))}
                    </div>
                    {/* Budget bar */}
                    {camp.totalBudget > 0 && (
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-muted-foreground">Consumo do Orçamento</span>
                          <span className="text-xs font-semibold text-foreground tabular-nums">R$ {formatCurrency(camp.spend)} / R$ {formatCurrency(camp.totalBudget)}</span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              budgetPct > 90 ? "bg-destructive" : budgetPct > 70 ? "bg-primary" : "bg-primary"
                            }`}
                            style={{ width: `${Math.min(budgetPct, 100)}%` }}
                          />
                        </div>
                      </div>
                    )}
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>Início: {camp.startDate}</span>
                      {camp.endDate && <span>Fim: {camp.endDate}</span>}
                      {camp.totalBudget > 0 && <span>{budgetPct.toFixed(0)}% do orçamento consumido</span>}
                    </div>
                    {camp.status === "active" && camp.dailyMetrics.some((d) => d.spend > 0) && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-2">Performance diária</p>
                        <SpendAreaChart
                          data={camp.dailyMetrics.map((dm) => ({
                            date: dm.date,
                            label: dm.date.slice(8),
                            spend: Math.round(dm.spend * 100) / 100,
                            impressions: dm.impressions,
                            clicks: dm.clicks,
                            conversions: dm.conversions,
                          }))}
                          visibleMetrics={["spend"]}
                        />
                      </div>
                    )}
                    {/* Escrita na Meta (pausar/orçamento) removida a pedido: o sistema NÃO altera verba/
                        campanha — só LÊ. A verba/orçamento é gerida no Gerenciador da Meta e sincroniza
                        pro sistema (o gestor move verba entre anúncios; o sistema não pode brigar com isso). */}
                    {/* Request new creative from Designer */}
                    <button
                      onClick={() => {
                        const cl = clients.find((c) => c.id === camp.clientId);
                        if (cl && onRequestCreative) onRequestCreative(camp, cl);
                      }}
                      className="btn-primary text-xs flex items-center gap-1.5 w-fit"
                    >
                      <Sparkles size={12} /> Solicitar Novo Criativo ao Designer
                    </button>
                  </div>
                )}
              </div>
            );
          });
          })()}
        </div>
      </div>
      </>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// INVESTMENT CONTROL TAB
// ══════════════════════════════════════════════════════════════

function fmtBRL(value: number): string {
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatInputBRL(raw: string): string {
  // While typing, keep numbers and a single comma/dot
  const digits = raw.replace(/[^0-9,\.]/g, "");
  return digits;
}

interface InvestmentForm {
  monthlyRaw: string;   // raw input string
  dailyRaw: string;
  paymentMethod: InvestmentPaymentMethod;
  nextPaymentDate: string;
  dirty: boolean;
}

function InvestmentControlTab({
  clients,
  adCampaigns,
  investmentData,
  monthSpendByClient,
  onSave,
  monthSpendFalhou,
  isUsingRealData,
  currentUser,
}: {
  clients: Client[];
  adCampaigns: AdCampaign[];
  investmentData: Record<string, ClientInvestmentData>;
  monthSpendByClient: Map<string, number>;
  monthSpendFalhou: boolean;
  onSave: (clientId: string, data: Partial<ClientInvestmentData>, actor: string) => Promise<{ ok: boolean; error?: string }>;
  isUsingRealData: boolean;
  currentUser: string;
}) {
  const [selectedId, setSelectedId] = useState(clients[0]?.id ?? "");
  // Trocar o filtro de workspace tirava o cliente selecionado da lista e a aba ficava em branco.
  useEffect(() => {
    if (clients.length > 0 && !clients.some((c) => c.id === selectedId)) setSelectedId(clients[0].id);
  }, [clients, selectedId]);
  const [forms, setForms] = useState<Record<string, InvestmentForm>>({});
  const [savedFlash, setSavedFlash] = useState<string | null>(null);

  // Dia de hoje e total de dias do mês — em São Paulo (não UTC), pra bater com o gasto do servidor.
  const [spYear, spMonth, spDay] = todaySP().split("-").map(Number);
  const daysInMonth = useMemo(() => new Date(spYear, spMonth, 0).getDate(), [spYear, spMonth]);

  // Initialize forms from investmentData whenever it changes
  useEffect(() => {
    setForms((prev) => {
      const next = { ...prev };
      clients.forEach((c) => {
        if (!next[c.id]) {
          const stored = investmentData[c.id];
          const monthly = stored?.monthlyBudget ?? c.monthlyBudget;
          const daily = stored?.dailyBudget ?? c.dailyBudget ?? parseFloat((monthly / daysInMonth).toFixed(2));
          const pm: InvestmentPaymentMethod = stored?.paymentMethod ??
            (c.paymentMethod === "transferencia" ? "pix" : c.paymentMethod as InvestmentPaymentMethod);
          next[c.id] = {
            monthlyRaw: fmtBRL(monthly),
            dailyRaw: fmtBRL(daily),
            paymentMethod: pm,
            nextPaymentDate: stored?.nextPaymentDate ?? "",
            dirty: false,
          };
        }
      });
      return next;
    });
  }, [clients, investmentData, daysInMonth]);

  const form = forms[selectedId];
  const selectedClient = clients.find((c) => c.id === selectedId);

  // Gasto do mês: prioriza o valor sincronizado no servidor (current_month_spend, janela
  // "this_month" da Meta em BRT). Só cai pro somatório das campanhas (janela do preset da aba
  // Anúncios, ~7d) se o servidor ainda não sincronizou — senão o pacing compararia 7 dias de
  // gasto contra o orçamento do mês inteiro e mentiria ("campanha travada").
  // null = não sabemos o gasto (sincronização falhou ou conta sem dado) — nunca vira R$0.
  const getMonthlySpend = useCallback((clientId: string): number | null => {
    if (monthSpendFalhou) return null;
    const server = monthSpendByClient.get(clientId);
    if (server != null) return server;
    const camps = adCampaigns.filter((c) => c.clientId === clientId);
    if (camps.length === 0 || camps.some(insightFalhou)) return null;
    return camps.reduce((sum, c) => sum + (c.spend ?? 0), 0);
  }, [adCampaigns, monthSpendByClient, monthSpendFalhou]);

  // Get today's spend (data de hoje em São Paulo, não UTC)
  const getTodaySpend = useCallback((clientId: string): number => {
    const today = todaySP();
    return adCampaigns
      .filter((c) => c.clientId === clientId)
      .flatMap((c) => c.dailyMetrics ?? [])
      .filter((m) => m.date === today)
      .reduce((sum, m) => sum + (m.spend ?? 0), 0);
  }, [adCampaigns]);

  function updateForm(clientId: string, patch: Partial<InvestmentForm>) {
    setForms((prev) => ({
      ...prev,
      [clientId]: { ...prev[clientId], ...patch, dirty: true },
    }));
  }

  function handleMonthlyChange(raw: string) {
    const monthly = parseBRL(raw);
    const daily = monthly > 0 ? parseFloat((monthly / daysInMonth).toFixed(2)) : 0;
    updateForm(selectedId, {
      monthlyRaw: formatInputBRL(raw),
      dailyRaw: fmtBRL(daily),
    });
  }

  function handleDailyChange(raw: string) {
    const daily = parseBRL(raw);
    const monthly = daily > 0 ? parseFloat((daily * daysInMonth).toFixed(2)) : 0;
    updateForm(selectedId, {
      dailyRaw: formatInputBRL(raw),
      monthlyRaw: fmtBRL(monthly),
    });
  }

  async function handleSave() {
    if (!form || !selectedId) return;
    const monthly = parseBRL(form.monthlyRaw);
    const daily = parseBRL(form.dailyRaw);
    const result = await onSave(selectedId, {
      monthlyBudget: monthly,
      dailyBudget: daily,
      paymentMethod: form.paymentMethod,
      nextPaymentDate: form.nextPaymentDate || undefined,
    }, currentUser);
    if (!result?.ok) {
      // Não mostra "Salvo!" se o banco recusou — mantém o form sujo p/ retentar
      toast.error(result?.error ?? "Erro ao salvar a verba. Tente novamente.");
      return;
    }
    setForms((prev) => ({
      ...prev,
      [selectedId]: { ...prev[selectedId], dirty: false },
    }));
    setSavedFlash(selectedId);
    setTimeout(() => setSavedFlash(null), 2000);
  }

  // Summary stats across all clients
  const totalMonthly = clients.reduce((sum, c) => {
    const stored = investmentData[c.id];
    return sum + (stored?.monthlyBudget ?? c.monthlyBudget);
  }, 0);
  const totalSpend = clients.reduce((sum, c) => sum + (getMonthlySpend(c.id) ?? 0), 0);
  const semGasto = clients.filter((c) => getMonthlySpend(c.id) === null).length;

  if (clients.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-10">Nenhum cliente neste workspace.</p>;
  }
  if (!form || !selectedClient) return null;

  const monthlyBudget = parseBRL(form.monthlyRaw);
  const dailyBudget = parseBRL(form.dailyRaw);
  const monthlySpendOuNull = getMonthlySpend(selectedId);
  const monthlySpend = monthlySpendOuNull ?? 0;
  const todaySpend = getTodaySpend(selectedId);
  const remaining = Math.max(0, monthlyBudget - monthlySpend);
  const currentDay = spDay;
  const daysLeft = daysInMonth - currentDay;

  // ── Pacing logic ──────────────────────────────────────────────
  // timePct: how far into the month we are (0–1)
  const timePct = currentDay / daysInMonth;
  // expectedSpend: what should have been spent by today at a linear pace
  const expectedSpend = monthlyBudget * timePct;
  // actual spend % of budget (used for bar fill)
  const spendPct = monthlyBudget > 0 ? Math.min(100, (monthlySpend / monthlyBudget) * 100) : 0;
  // time marker position (%) — always represents "today" on the bar
  const timePctBar = Math.min(100, timePct * 100);
  // deviation of actual vs expected (positive = over-pacing, negative = under-pacing)
  const deviationPct = expectedSpend > 0 ? ((monthlySpend - expectedSpend) / expectedSpend) * 100 : 0;
  // projected end day: at the current daily burn rate, when does the budget run out?
  const avgDailyBurn = currentDay > 0 ? monthlySpend / currentDay : 0;
  const projectedEndDay = avgDailyBurn > 0
    ? currentDay + Math.floor(remaining / avgDailyBurn)
    : daysInMonth;
  // ideal daily spend
  const idealDailyBudget = monthlyBudget > 0 ? monthlyBudget / daysInMonth : 0;

  const pacingStatus = statusPacing({ verba: monthlyBudget, gasto: monthlySpendOuNull, dia: currentDay, diasNoMes: daysInMonth });
  const pacingUi = PACING_UI[pacingStatus];
  const pacingLabel = pacingStatus === "sem_dados" && monthSpendFalhou ? "Sem dados — sincronização falhou" : pacingUi.label;

  const needsPaymentDate = form.paymentMethod === "pix" || form.paymentMethod === "boleto";
  const boletoAt80 = form.paymentMethod === "boleto" && spendPct >= 80;

  // Days until next payment
  const daysUntilPayment = form.nextPaymentDate ? diasEntre(todaySP(), form.nextPaymentDate) : null;
  const balanceWarnDays = daysUntilPayment !== null && daysUntilPayment <= 5 && remaining < dailyBudget * 3;

  return (
    <div className="animate-fade-in space-y-5">
      {/* Header summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Investimento Total / Mês</p>
          <p className="text-xl font-bold text-foreground tabular-nums">R$ {fmtBRL(totalMonthly)}</p>
          <p className="text-xs text-muted-foreground mt-1">{clients.length} clientes</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Gasto Total (Meta)</p>
          {monthSpendFalhou ? (
            <>
              <p className="text-xl font-bold tabular-nums text-muted-foreground">—</p>
              <p className="text-xs text-lone-warning mt-1">Sem dados — sincronização falhou</p>
            </>
          ) : (
            <>
              <p className="text-xl font-bold tabular-nums text-primary">
                R$ {fmtBRL(totalSpend)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {totalMonthly > 0 ? ((totalSpend / totalMonthly) * 100).toFixed(1) : 0}% do orçamento total
                {semGasto > 0 && ` · ${semGasto} sem dados`}
              </p>
            </>
          )}
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Saldo Restante</p>
          <p className="text-xl font-bold text-primary tabular-nums">{monthSpendFalhou ? "—" : `R$ ${fmtBRL(Math.max(0, totalMonthly - totalSpend))}`}</p>
          {/* Total pacing bar with time marker */}
          <div className="mt-1.5 relative h-1.5 bg-muted rounded-full overflow-visible">
            <div
              className="absolute top-0 left-0 h-full rounded-full transition-all bg-primary"
              style={{
                width: `${totalMonthly > 0 ? Math.min(100, (totalSpend / totalMonthly) * 100) : 0}%`,
              }}
            />
            {/* Time marker */}
            <div
              className="absolute top-1/2 -translate-y-1/2 w-0.5 h-3 rounded-full bg-card/60"
              style={{ left: `${timePctBar}%` }}
              title={`Dia ${currentDay} de ${daysInMonth}`}
            />
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">Dia {currentDay}/{daysInMonth} · marcador = hoje</p>
        </div>
      </div>

      {/* Main panel */}
      <div className="flex gap-5">
        {/* Left: Client list */}
        <div className="w-72 shrink-0 space-y-2">
          <p className="text-xs text-muted-foreground font-medium px-1">Clientes ({clients.length})</p>
          {clients.map((c) => {
            const spendOuNull = getMonthlySpend(c.id);
            const spend = spendOuNull ?? 0;
            const budget = investmentData[c.id]?.monthlyBudget ?? c.monthlyBudget;
            const pct = budget > 0 ? Math.min(100, (spend / budget) * 100) : 0;
            const isSelected = c.id === selectedId;
            const isDirty = forms[c.id]?.dirty ?? false;
            const cUi = PACING_UI[statusPacing({ verba: budget, gasto: spendOuNull, dia: currentDay, diasNoMes: daysInMonth })];
            return (
              <button
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                className={`w-full text-left p-3 rounded-xl border transition-all ${
                  isSelected
                    ? "border-primary/40 bg-primary/8"
                    : "border-border bg-card hover:border-primary/20"
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={`w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold shrink-0 ${
                      isSelected ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
                    }`}>
                      {c.name[0]}
                    </div>
                    <span className="text-xs font-semibold text-foreground truncate">{c.name}</span>
                    {isDirty && <span className="w-1.5 h-1.5 rounded-full bg-lone-warning-bg shrink-0" title="Alterações não salvas" />}
                  </div>
                  <span className={`text-[10px] tabular-nums shrink-0 ml-1 font-semibold ${cUi.texto}`} title={cUi.label}>
                    {spendOuNull === null ? "—" : `${pct.toFixed(0)}%`}
                  </span>
                </div>
                {/* Pacing bar with time marker */}
                <div className="relative h-1 bg-muted rounded-full overflow-visible">
                  <div
                    className={`absolute top-0 left-0 h-full rounded-full transition-all ${cUi.barra}`}
                    style={{ width: `${pct}%` }}
                  />
                  <div
                    className="absolute top-1/2 -translate-y-1/2 w-px h-2.5 rounded-full bg-card/50"
                    style={{ left: `${timePctBar}%` }}
                  />
                </div>
                <div className="flex items-center justify-between mt-1.5">
                  <span className="text-[10px] text-muted-foreground">{spendOuNull === null ? "sem dados" : `R$ ${fmtBRL(spend)}`}</span>
                  <span className="text-[10px] text-muted-foreground">/ R$ {fmtBRL(budget)}</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Right: Detail panel */}
        <div className="flex-1 min-w-0">
          <div className="bg-card border border-primary/25 rounded-2xl overflow-hidden">
            {/* Panel header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold bg-primary/15 text-primary">
                  {selectedClient.name[0]}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-foreground">{selectedClient.name}</h3>
                  <p className="text-[10px] text-muted-foreground">
                    {selectedClient.metaAdAccountName ?? "Sem conta Meta vinculada"} · {selectedClient.assignedTraffic}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isUsingRealData && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 font-bold uppercase tracking-wider">
                    Meta API
                  </span>
                )}
              </div>
            </div>

            <div className="p-5 space-y-5">
              {/* ALERTS — pacing-aware */}
              {pacingStatus === "parado" && (
                <div className="flex items-start gap-3 p-3.5 rounded-xl border border-destructive/25 bg-destructive/10">
                  <AlertOctagon size={16} className="text-destructive shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-destructive">Parado — nenhum gasto no mês até o dia {currentDay}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Confira na Meta se a conta tem saldo, se as campanhas estão ativas e se o cartão/boleto passou.
                    </p>
                  </div>
                </div>
              )}
              {pacingStatus === "sem_dados" && (
                <div className="flex items-start gap-3 p-3.5 rounded-xl border border-border bg-muted">
                  <Info size={16} className="text-muted-foreground shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">{pacingLabel}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {monthSpendFalhou
                        ? "Não consegui buscar o gasto do mês no servidor. Recarregue a página; se continuar, confira Saldos, Verba & Alertas."
                        : "Esta conta ainda não tem gasto sincronizado. Confira se a conta Meta está vinculada ao cliente."}
                    </p>
                  </div>
                </div>
              )}
              {pacingStatus === "critical" && (
                <div className="flex items-start gap-3 p-3.5 rounded-xl border border-destructive/25 bg-destructive/8">
                  <AlertOctagon size={16} className="text-destructive shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-destructive">
                      {projectedEndDay < 25
                        ? `Verba acaba no dia ~${projectedEndDay} — antes do fim do mês`
                        : "Gasto acima de 30% do ritmo esperado"}
                    </p>
                    <p className="text-xs text-destructive/70 mt-0.5">
                      Esperado até hoje: <strong>R$ {fmtBRL(expectedSpend)}</strong> · Gasto real: <strong>R$ {fmtBRL(monthlySpend)}</strong> · Desvio: +{deviationPct.toFixed(0)}%
                    </p>
                  </div>
                </div>
              )}
              {pacingStatus === "warning" && (
                <div className="flex items-start gap-3 p-3.5 rounded-xl border border-lone-warning-border bg-lone-warning-bg">
                  <AlertTriangle size={16} className="text-lone-warning shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-lone-warning">Ritmo de gasto elevado — monitorar</p>
                    <p className="text-xs text-lone-warning mt-0.5">
                      Esperado até hoje: <strong>R$ {fmtBRL(expectedSpend)}</strong> · Gasto real: <strong>R$ {fmtBRL(monthlySpend)}</strong> · Desvio: +{deviationPct.toFixed(0)}%
                    </p>
                  </div>
                </div>
              )}
              {pacingStatus === "slow" && (
                <div className="flex items-start gap-3 p-3.5 rounded-xl border border-[color-mix(in_srgb,var(--chart-4)_25%,transparent)] bg-[color-mix(in_srgb,var(--chart-4)_8%,transparent)]">
                  <AlertCircle size={16} className="text-chart-4 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-chart-4">Campanha abaixo do ritmo — verba sobrando</p>
                    <p className="text-xs text-chart-4 opacity-70 mt-0.5">
                      Esperado até hoje: <strong>R$ {fmtBRL(expectedSpend)}</strong> · Gasto real: <strong>R$ {fmtBRL(monthlySpend)}</strong> · Desvio: {deviationPct.toFixed(0)}%
                    </p>
                  </div>
                </div>
              )}
              {boletoAt80 && (
                <div className="flex items-start gap-3 p-3.5 rounded-xl border border-lone-warning-border bg-lone-warning-bg">
                  <Banknote size={16} className="text-lone-warning shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-lone-warning">Gerar novo boleto para {selectedClient.name}</p>
                    <p className="text-xs text-lone-warning mt-0.5">
                      {spendPct.toFixed(0)}% do orçamento consumido · Pagamento via Boleto — providencie o próximo aporte.
                    </p>
                  </div>
                </div>
              )}
              {balanceWarnDays && (
                <div className="flex items-start gap-3 p-3.5 rounded-xl border border-lone-warning-border bg-lone-warning-bg">
                  <AlertTriangle size={16} className="text-lone-warning shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-lone-warning">Saldo baixo — aporte próximo</p>
                    <p className="text-xs text-lone-warning mt-0.5">
                      Saldo restante <strong>R$ {fmtBRL(remaining)}</strong> pode não cobrir os próximos {daysLeft} dias.
                      {daysUntilPayment !== null && <> Próximo aporte em <strong>{daysUntilPayment} dia(s)</strong>.</>}
                    </p>
                  </div>
                </div>
              )}

              {/* PACING BAR — Barra de Saúde do Orçamento */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Activity size={13} className={pacingUi.texto} />
                    Barra de Saúde do Orçamento
                  </span>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${pacingUi.texto} ${pacingUi.borda} ${pacingUi.fundo}`}>
                      {pacingLabel}
                    </span>
                    <span className={`text-xs font-bold tabular-nums ${pacingUi.texto}`}>
                      {monthlySpendOuNull === null ? "—" : `${spendPct.toFixed(1)}%`}
                    </span>
                  </div>
                </div>

                {/* Main pacing bar */}
                <div className="relative h-5 bg-muted rounded-full overflow-visible">
                  {/* Spend fill */}
                  <div
                    className={`absolute top-0 left-0 h-full rounded-full transition-all duration-500 opacity-90 ${pacingUi.barra}`}
                    style={{ width: `${spendPct}%` }}
                  />
                  {/* Time marker — thin white line at "today" position */}
                  <div
                    className="absolute top-0 bottom-0 w-0.5 rounded-full z-10"
                    style={{
                      left: `${timePctBar}%`,
                      backgroundColor: "var(--foreground)",
                    }}
                    title={`Dia ${currentDay} de ${daysInMonth} (${timePctBar.toFixed(0)}% do mês)`}
                  />
                  {/* Day label on the marker */}
                  <div
                    className="absolute -top-5 text-[9px] font-bold text-foreground -translate-x-1/2 whitespace-nowrap"
                    style={{ left: `${timePctBar}%` }}
                  >
                    dia {currentDay}
                  </div>
                </div>

                {/* Legend row */}
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>0%</span>
                  <span className="flex items-center gap-1">
                    <span className={`inline-block w-2 h-2 rounded-sm ${pacingUi.barra}`} />
                    Gasto real: {spendPct.toFixed(1)}%
                    <span className="mx-1">·</span>
                    <span className="w-px h-3 inline-block bg-card/50 align-middle" />
                    Hoje: {timePctBar.toFixed(0)}% do mês
                  </span>
                  <span>100%</span>
                </div>

                {/* Daily comparison row */}
                <div className="grid grid-cols-3 gap-2 mt-1">
                  <div className="bg-muted/40 rounded-lg p-2.5 text-center border border-border">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Diária Ideal</p>
                    <p className="text-sm font-bold tabular-nums mt-0.5 text-foreground">R$ {fmtBRL(idealDailyBudget)}</p>
                    <p className="text-[9px] text-muted-foreground">{monthlyBudget > 0 ? `÷ ${daysInMonth} dias` : "—"}</p>
                  </div>
                  <div className="bg-muted/40 rounded-lg p-2.5 text-center border border-border">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Diária Real (Meta)</p>
                    <p className={`text-sm font-bold tabular-nums mt-0.5 ${avgDailyBurn > idealDailyBudget * 1.15 ? "text-destructive" : avgDailyBurn < idealDailyBudget * 0.85 ? "text-lone-info" : pacingUi.texto}`}>
                      R$ {fmtBRL(avgDailyBurn)}
                    </p>
                    <p className="text-[9px] text-muted-foreground">média {currentDay}d</p>
                  </div>
                  <div className="bg-muted/40 rounded-lg p-2.5 text-center border border-border">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Projeção Fim</p>
                    <p className={`text-sm font-bold tabular-nums mt-0.5 ${projectedEndDay < 25 ? "text-destructive" : projectedEndDay <= daysInMonth ? "text-foreground" : "text-primary"}`}>
                      {avgDailyBurn > 0 ? `Dia ~${Math.min(projectedEndDay, 99)}` : "—"}
                    </p>
                    <p className="text-[9px] text-muted-foreground">
                      {avgDailyBurn > 0 ? (projectedEndDay < daysInMonth ? "acaba antes do mês" : "cobre o mês") : "sem dados"}
                    </p>
                  </div>
                </div>

                {/* Metric cards row */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-muted/50 rounded-lg p-2.5 text-center border border-border">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Gasto Mês</p>
                    <p className={`text-sm font-bold tabular-nums mt-0.5 ${pacingUi.texto}`}>
                      {monthlySpendOuNull === null ? "—" : `R$ ${fmtBRL(monthlySpend)}`}
                    </p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-2.5 text-center border border-border">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Saldo</p>
                    <p className={`text-sm font-bold tabular-nums mt-0.5 ${remaining > 0 ? "text-primary" : "text-destructive"}`}>
                      R$ {fmtBRL(remaining)}
                    </p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-2.5 text-center border border-border">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Hoje</p>
                    <p className={`text-sm font-bold tabular-nums mt-0.5 ${todaySpend > idealDailyBudget * 1.15 ? "text-destructive" : "text-foreground"}`}>
                      R$ {fmtBRL(todaySpend)}
                    </p>
                  </div>
                </div>
              </div>

              {/* DIVIDER */}
              <div className="border-t border-border" />

              {/* BUDGET INPUTS */}
              <div>
                <p className="text-xs font-semibold text-foreground mb-3 flex items-center gap-1.5">
                  <DollarSign size={13} className="text-primary" />
                  Orçamento Planejado
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
                      Investimento Mensal (R$)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-medium">R$</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={form.monthlyRaw}
                        onChange={(e) => handleMonthlyChange(e.target.value)}
                        onBlur={() => {
                          const monthly = parseBRL(form.monthlyRaw);
                          updateForm(selectedId, { monthlyRaw: fmtBRL(monthly) });
                        }}
                        placeholder="0,00"
                        className="w-full bg-muted border border-border rounded-lg pl-8 pr-3 py-2.5 text-sm text-foreground outline-none focus:border-primary/60 font-mono tabular-nums transition-colors"
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground">Alterar atualiza a diária automaticamente</p>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
                      Valor Diário (R$) — {daysInMonth}d
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-medium">R$</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={form.dailyRaw}
                        onChange={(e) => handleDailyChange(e.target.value)}
                        onBlur={() => {
                          const daily = parseBRL(form.dailyRaw);
                          updateForm(selectedId, { dailyRaw: fmtBRL(daily) });
                        }}
                        placeholder="0,00"
                        className="w-full bg-muted border border-border rounded-lg pl-8 pr-3 py-2.5 text-sm text-foreground outline-none focus:border-primary/60 font-mono tabular-nums transition-colors"
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground">Alterar recalcula o mensal proporcional</p>
                  </div>
                </div>

                {/* Calculation preview */}
                {monthlyBudget > 0 && (
                  <div className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground bg-muted/50 rounded-lg px-3 py-2 border border-border">
                    <Info size={11} />
                    <span>
                      R$ {fmtBRL(monthlyBudget)} ÷ {daysInMonth} dias = <span className="text-foreground font-semibold">R$ {fmtBRL(idealDailyBudget)}/dia</span>
                      {avgDailyBurn > 0 && (
                        <> · Queima real: <span className={avgDailyBurn > idealDailyBudget * 1.15 ? "text-destructive font-semibold" : "text-primary font-semibold"}>R$ {fmtBRL(avgDailyBurn)}/dia</span></>
                      )}
                    </span>
                  </div>
                )}
              </div>

              {/* PAYMENT METHOD */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider flex items-center gap-1">
                    <CreditCard size={11} />
                    Forma de Pagamento
                  </label>
                  <select
                    value={form.paymentMethod}
                    onChange={(e) => updateForm(selectedId, { paymentMethod: e.target.value as InvestmentPaymentMethod })}
                    className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary/60 transition-colors"
                  >
                    <option value="pix">PIX</option>
                    <option value="boleto">Boleto</option>
                    <option value="cartao">Cartão de Crédito</option>
                  </select>
                </div>

                {needsPaymentDate && (
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider flex items-center gap-1">
                      <Calendar size={11} />
                      Data do Próximo Aporte
                    </label>
                    <input
                      type="date"
                      value={form.nextPaymentDate}
                      onChange={(e) => updateForm(selectedId, { nextPaymentDate: e.target.value })}
                      className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary/60 transition-colors"
                    />
                    {daysUntilPayment !== null && (
                      <p className={`text-[10px] font-medium ${daysUntilPayment <= 3 ? "text-lone-warning" : "text-muted-foreground"}`}>
                        {daysUntilPayment <= 0 ? "Aporte vencido!" : `Em ${daysUntilPayment} dia(s)`}
                      </p>
                    )}
                  </div>
                )}

                {!needsPaymentDate && (
                  <div className="flex items-end pb-1">
                    <div className="flex items-center gap-2 text-xs text-primary bg-primary/10 border border-primary/20 rounded-lg px-3 py-2.5 w-full">
                      <CheckCircle size={13} />
                      Cartão — débito automático
                    </div>
                  </div>
                )}
              </div>

              {/* Meta account link info */}
              {selectedClient.metaAdAccountId && (
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground bg-muted/40 rounded-lg px-3 py-2 border border-border">
                  <Facebook size={12} className="text-primary" />
                  <span>Conta de anúncios: <span className="text-foreground font-medium">{selectedClient.metaAdAccountName}</span> · ID: {selectedClient.metaAdAccountId}</span>
                </div>
              )}

              {/* SAVE */}
              <div className="flex items-center justify-between pt-2 border-t border-border">
                {savedFlash === selectedId ? (
                  <span className="text-xs text-primary flex items-center gap-1.5 font-semibold">
                    <CheckCircle size={13} /> Salvo com sucesso!
                  </span>
                ) : form.dirty ? (
                  <span className="text-xs text-lone-warning flex items-center gap-1.5">
                    <AlertCircle size={13} /> Alterações não salvas
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">Sem alterações pendentes</span>
                )}
                <button
                  onClick={handleSave}
                  disabled={!form.dirty}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all disabled:opacity-40 ${form.dirty ? "bg-primary text-primary-foreground" : ""}`}
                >
                  <Save size={13} />
                  Salvar Alterações
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

