"use client";

import Header from "@/components/Header";
import MetricCard from "@/components/MetricCard";
import KanbanBoard from "@/components/KanbanBoard";
import { useAppState } from "@/lib/context/AppStateContext";
import { useRole } from "@/lib/context/RoleContext";
import { useNav } from "@/lib/context/NavContext";
import {
  TrendingUp, AlertTriangle, CheckCircle, Users,
  Calendar, User, Save,
  Plus, X, Filter,
  ClipboardCheck, BarChart2,
  MessageCircle, FileText, Star, ArrowUpRight, ArrowDownRight, Minus,
  Check, Megaphone, Eye, MousePointerClick, DollarSign, Target,
  Pause, AlertCircle, Download, ChevronDown, ChevronUp,
  Settings2, GripVertical, Zap, Activity, TrendingDown,
  Brain, ShieldAlert, Sparkles, CircleDot, Bell, FolderDown, Loader2, Facebook,
  Wallet, CreditCard, Banknote, AlertOctagon, Info,
} from "lucide-react";
import { getAttentionColor, getAttentionLabel, getPriorityColor, getPriorityLabel, formatTimeSpent, getLiveTimeSpentMs, OVERTIME_THRESHOLD_MS } from "@/lib/utils";
import type { Client, Task, TrafficMonthlyReport, AdCampaign, AdAccount, ClientInvestmentData, InvestmentPaymentMethod } from "@/lib/types";
import { mockAdAccounts, mockAdCampaigns } from "@/lib/mockData";
import { useMetaConnection, fetchAdAccounts, fetchCampaignInsights, TokenExpiredError } from "@/lib/meta/useMetaAds";
import { useState, useMemo, useEffect, useCallback } from "react";
import { exportReportAsPdf } from "@/lib/exportPdf";
import { exportTrafficReportPdf, buildTrafficReportData, exportAllTrafficReportsZip } from "@/lib/exportTrafficPdf";
import { analyzeCampaigns, generateAnalysisSummary, generateAccountReport, generateDailyRoutineAlerts } from "@/lib/ai/campaignAnalyzer";
import type { CampaignInsight, PortfolioSummary, AccountAIReport, DailyRoutineAlert } from "@/lib/ai/campaignAnalyzer";

const STATUS_COLUMNS = [
  { id: "onboarding", title: "Onboarding", color: "bg-zinc-500" },
  { id: "good", title: "Bons Resultados", color: "bg-primary" },
  { id: "average", title: "Resultados Medios", color: "bg-zinc-500" },
  { id: "at_risk", title: "Em Risco", color: "bg-red-500" },
];

const TASK_COLUMNS = [
  { id: "pending", title: "Pendente", color: "bg-zinc-600" },
  { id: "in_progress", title: "Em Execucao", color: "bg-primary" },
  { id: "review", title: "Validacao", color: "bg-zinc-500" },
  { id: "done", title: "Concluido", color: "bg-primary" },
];

type TabType = "rotina" | "status" | "kanban" | "relatorios" | "report" | "anuncios" | "investimento";

function getTodayStr() {
  return new Date().toISOString().slice(0, 10);
}

function getDayOfWeek(): number {
  return new Date().getDay(); // 0=Sun, 1=Mon, ... 5=Fri
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
  const {
    clients, tasks, updateClientData, updateClientStatus, addTask, updateTask,
    trafficReports, trafficRoutineChecks, addTrafficReport, updateTrafficReport, addTrafficRoutineCheck,
    addDesignRequest, addContentCard,
    investmentData, updateInvestmentData,
  } = useAppState();
  const { currentUser, role } = useRole();
  const { pendingTab, setPendingTab, setCurrentTab } = useNav();
  const [activeTab, setActiveTab] = useState<TabType>("rotina");

  // Consume pendingTab from secondary sidebar navigation
  useEffect(() => {
    if (!pendingTab) return;
    const VALID: TabType[] = ["rotina","status","kanban","relatorios","report","anuncios","investimento"];
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
  const taskKanbanCols = TASK_COLUMNS.map((col) => ({
    ...col,
    items: trafficTasks.filter((t) => t.status === col.id),
  }));

  const [showNewTask, setShowNewTask] = useState(false);
  const [showContentRequest, setShowContentRequest] = useState(false);

  const tabs: { key: TabType; label: string; icon?: React.ReactNode }[] = [
    { key: "rotina", label: "Rotina Diaria", icon: <ClipboardCheck size={14} /> },
    { key: "status", label: "Status Clientes" },
    { key: "kanban", label: "Kanban Tarefas" },
    { key: "relatorios", label: "Relatorios Mensais", icon: <BarChart2 size={14} /> },
    { key: "report", label: "Analise" },
    { key: "anuncios", label: "Anuncios", icon: <Megaphone size={14} /> },
    { key: "investimento", label: "Controle de Investimento", icon: <Wallet size={14} /> },
  ];

  return (
    <div className="flex flex-col flex-1 overflow-auto">
      <Header title="Trafego Pago" subtitle="Gestao de performance e campanhas" />

      <div className="p-6 space-y-6 animate-fade-in">
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
          <span className="text-xs text-muted-foreground ml-auto">
            {filteredClients.length} cliente(s)
          </span>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <MetricCard icon={Users} label="Clientes" value={filteredClients.length} sub="na carteira" iconColor="text-primary" iconBg="bg-primary/15" />
          <MetricCard icon={CheckCircle} label="Bons Resultados" value={goodCount} sub="clientes" iconColor="text-primary" iconBg="bg-primary/15" />
          <MetricCard icon={AlertTriangle} label="Em Risco" value={atRiskCount} sub="clientes" iconColor="text-red-500" iconBg="bg-red-500/10" />
          <MetricCard icon={TrendingUp} label="Tarefas Abertas" value={trafficTasks.filter(t => t.status !== "done").length} sub="pendentes" iconColor="text-primary" iconBg="bg-primary/15" />
        </div>

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
                {tab.key === "kanban" && (
                  <span className="ml-1 text-xs bg-muted px-1.5 py-0.5 rounded-full">
                    {trafficTasks.filter((t) => t.status !== "done").length}
                  </span>
                )}
                {tab.key === "rotina" && (() => {
                  const today = getTodayStr();
                  const todayChecks = trafficRoutineChecks.filter((c) => c.date === today && (effectiveFilter === "all" || c.completedBy === effectiveFilter));
                  const activeClients = filteredClients.filter((c) => c.status !== "onboarding");
                  const pending = activeClients.length - todayChecks.filter((c) => c.type === "support").length;
                  return pending > 0 ? (
                    <span className="ml-1 text-xs bg-red-500/20 text-red-500 px-1.5 py-0.5 rounded-full">{pending}</span>
                  ) : null;
                })()}
              </button>
            ))}
          </div>

          {/* Rotina Diaria Tab */}
          {activeTab === "rotina" && (
            <RoutineTab
              clients={filteredClients}
              routineChecks={trafficRoutineChecks}
              onCheck={addTrafficRoutineCheck}
              currentUser={currentUser}
              effectiveFilter={effectiveFilter}
              tasks={trafficTasks}
              adCampaigns={sharedIsUsingRealData ? sharedRealCampaigns : mockAdCampaigns}
              isUsingRealData={sharedIsUsingRealData}
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
                  <div className={`bg-card border rounded-lg p-3 transition-colors ${
                    client.status === "at_risk"
                      ? "border-red-500/30 hover:border-red-500/50"
                      : "border-border hover:border-primary/30"
                  }`}>
                    <div className="flex items-center gap-2 mb-2">
                      <div className={`w-7 h-7 rounded-md flex items-center justify-center text-xs font-bold ${
                        client.status === "at_risk" ? "bg-red-500/20 text-red-500" : "bg-primary/20 text-primary"
                      }`}>
                        {client.name[0]}
                      </div>
                      <span className="font-medium text-foreground text-sm">{client.name}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mb-2">{client.assignedTraffic}</p>
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

          {/* Task Kanban */}
          {activeTab === "kanban" && (
            <div className="animate-fade-in">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <p className="text-muted-foreground text-sm">Fluxo interno de tarefas da equipe de trafego.</p>
                  <div className="flex items-center gap-2">
                    {taskKanbanCols.map((col) => (
                      <span key={col.id} className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-md">
                        {col.title}: <span className="text-foreground font-medium">{col.items.length}</span>
                      </span>
                    ))}
                  </div>
                </div>
                <button onClick={() => setShowContentRequest(true)} className="text-xs flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#3b6ff5]/15 text-[#3b6ff5] hover:bg-[#3b6ff5]/25 border border-[#3b6ff5]/20 transition-colors">
                  <FileText size={13} />
                  Solicitar Conteúdo
                </button>
                <button onClick={() => setShowNewTask(true)} className="btn-primary text-xs flex items-center gap-1.5">
                  <Plus size={13} />
                  Nova Tarefa
                </button>
              </div>
              <KanbanBoard<Task>
                columns={taskKanbanCols}
                onMove={(taskId, _from, toStatus) => {
                  updateTask(taskId, { status: toStatus as Task["status"] });
                }}
                renderCard={(task) => (
                  <div className="bg-card border border-border rounded-lg p-3 hover:border-primary/30 transition-colors">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <p className="font-medium text-foreground text-sm leading-tight">{task.title}</p>
                      <span className={`badge border text-xs shrink-0 ${getPriorityColor(task.priority)}`}>
                        {getPriorityLabel(task.priority)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">{task.clientName}</p>
                    <div className="flex items-center gap-1 mt-2">
                      <User size={11} className="text-muted-foreground/50" />
                      <span className="text-xs text-muted-foreground">{task.assignedTo}</span>
                      {task.dueDate && (
                        <>
                          <Calendar size={11} className="text-muted-foreground/50 ml-1" />
                          <span className="text-xs text-muted-foreground">{task.dueDate}</span>
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-1 mt-2 pt-2 border-t border-border">
                      {task.status === "pending" && (
                        <button onClick={(e) => { e.stopPropagation(); updateTask(task.id, { status: "in_progress" }); }} className="text-xs text-primary hover:underline">Iniciar</button>
                      )}
                      {task.status === "in_progress" && (
                        <button onClick={(e) => { e.stopPropagation(); updateTask(task.id, { status: "review" }); }} className="text-xs text-primary hover:underline">Enviar p/ Validacao</button>
                      )}
                      {task.status === "review" && (
                        <button onClick={(e) => { e.stopPropagation(); updateTask(task.id, { status: "done" }); }} className="text-xs text-primary hover:underline">Concluir</button>
                      )}
                      {task.status === "done" && (
                        <span className="text-xs text-primary flex items-center gap-1"><CheckCircle size={11} /> Concluido</span>
                      )}
                      {/* Timesheet — manager/admin only */}
                      {(role === "admin" || role === "manager") && (() => {
                        const timeMs = getLiveTimeSpentMs(task.workStartedAt, task.totalTimeSpentMs);
                        if (timeMs <= 0) return null;
                        const isOvertime = timeMs >= OVERTIME_THRESHOLD_MS;
                        return (
                          <span className={`ml-auto text-[10px] flex items-center gap-1 ${isOvertime ? "text-amber-400 font-bold" : "text-zinc-600"}`}>
                            {isOvertime ? "⚠️" : "⏱️"} {formatTimeSpent(timeMs)}
                          </span>
                        );
                      })()}
                    </div>
                  </div>
                )}
              />
            </div>
          )}

          {/* Relatorios Mensais Tab */}
          {activeTab === "relatorios" && (
            <MonthlyReportsTab
              clients={filteredClients}
              reports={trafficReports}
              onAddReport={addTrafficReport}
              onUpdateReport={updateTrafficReport}
              currentUser={currentUser}
              effectiveFilter={effectiveFilter}
            />
          )}

          {/* Analise / Report Tab */}
          {activeTab === "report" && (
            <TrafficReportTab clients={filteredClients} />
          )}

          {/* Anuncios Tab */}
          {activeTab === "anuncios" && (
            <AdAnalyticsTab
              clients={filteredClients}
              accounts={mockAdAccounts}
              campaigns={mockAdCampaigns}
              addDesignRequest={addDesignRequest}
              updateClientData={updateClientData}
              currentUser={currentUser}
              onRealDataChange={(campaigns, isReal) => {
                setSharedRealCampaigns(campaigns);
                setSharedIsUsingRealData(isReal);
              }}
            />
          )}

          {/* Controle de Investimento Tab */}
          {activeTab === "investimento" && (
            <InvestmentControlTab
              clients={filteredClients}
              adCampaigns={sharedIsUsingRealData ? sharedRealCampaigns : mockAdCampaigns}
              investmentData={investmentData}
              onSave={updateInvestmentData}
              isUsingRealData={sharedIsUsingRealData}
              currentUser={currentUser}
            />
          )}
        </div>
      </div>

      {/* Content Request Modal */}
      {showContentRequest && (
        <ContentRequestModal
          clients={filteredClients}
          currentUser={currentUser}
          onClose={() => setShowContentRequest(false)}
          onSave={(card) => { addContentCard(card); setShowContentRequest(false); }}
        />
      )}

      {/* New Task Modal */}
      {showNewTask && (
        <NewTaskModal
          clients={filteredClients}
          trafficManagers={trafficManagers}
          currentUser={currentUser}
          onClose={() => setShowNewTask(false)}
          onSave={(task) => { addTask(task); setShowNewTask(false); }}
        />
      )}
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
}: {
  clients: Client[];
  routineChecks: typeof import("@/lib/mockData").mockTrafficRoutineChecks;
  onCheck: (check: { clientId: string; clientName: string; date: string; type: "support" | "report" | "feedback" | "analysis"; completedBy: string; note?: string }) => void;
  currentUser: string;
  effectiveFilter: string;
  tasks: Task[];
  adCampaigns: AdCampaign[];
  isUsingRealData?: boolean;
}) {
  const today = getTodayStr();
  const dayOfWeek = getDayOfWeek();
  const activeClients = clients.filter((c) => c.status !== "onboarding");

  const todayChecks = routineChecks.filter(
    (c) => c.date === today && (effectiveFilter === "all" || c.completedBy === effectiveFilter)
  );

  const supportDone = new Set(todayChecks.filter((c) => c.type === "support").map((c) => c.clientId));
  const supportPending = activeClients.filter((c) => !supportDone.has(c.id));
  const supportCompleted = activeClients.filter((c) => supportDone.has(c.id));

  // Weekly checks
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
  const weekStartStr = weekStart.toISOString().slice(0, 10);
  const weekChecks = routineChecks.filter(
    (c) => c.date >= weekStartStr && (effectiveFilter === "all" || c.completedBy === effectiveFilter)
  );

  const isMonday = dayOfWeek === 1;
  const isWednesday = dayOfWeek === 3;
  const isFriday = dayOfWeek === 5;

  const reportsDone = new Set(weekChecks.filter((c) => c.type === "report").map((c) => c.clientId));
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
  const overdueTasks = openTasks.filter((t) => {
    if (!t.dueDate) return false;
    return new Date(t.dueDate + "T23:59:59") < new Date();
  });
  const dueSoonTasks = openTasks.filter((t) => {
    if (!t.dueDate) return false;
    const due = new Date(t.dueDate + "T23:59:59");
    const now = new Date();
    const diff = (due.getTime() - now.getTime()) / (1000 * 60 * 60);
    return diff > 0 && diff <= 48;
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
              {isUsingRealData ? (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 font-bold uppercase tracking-wider ml-auto">Dados reais</span>
              ) : (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20 font-bold uppercase tracking-wider ml-auto">Dados simulados</span>
              )}
            </div>
            <div className="space-y-2.5">
              {dailyAIAlerts.map((alert, i) => (
                <div
                  key={alert.clientId}
                  className={`flex items-start gap-3 p-3.5 rounded-xl border ${
                    alert.urgency === "critical"
                      ? "border-red-500/20 bg-red-500/5"
                      : "border-[#0a34f5]/15 bg-[#0a34f5]/5"
                  }`}
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-xs font-black ${
                    alert.urgency === "critical"
                      ? "bg-red-500/10 text-red-400"
                      : "bg-[#0a34f5]/10 text-[#3b6ff5]"
                  }`}>
                    {alert.healthScore}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-sm font-bold text-foreground">{alert.clientName}</p>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                        alert.urgency === "critical"
                          ? "bg-red-500/10 text-red-400 border border-red-500/20"
                          : "bg-[#0a34f5]/10 text-[#3b6ff5] border border-[#0a34f5]/15"
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
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle size={16} className="text-red-500" />
                <h3 className="text-sm font-semibold text-red-500">
                  {overdueTasks.length} tarefa(s) atrasada(s)
                </h3>
              </div>
              <div className="space-y-1.5">
                {overdueTasks.map((t) => (
                  <div key={t.id} className="flex items-center gap-2 text-xs">
                    <span className="text-red-400 font-medium">{t.title}</span>
                    <span className="text-red-400/60">· {t.clientName}</span>
                    <span className="text-red-400/60 ml-auto">Venceu: {t.dueDate}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {dueSoonTasks.length > 0 && (
            <div className="bg-[#0a34f5]/10 border border-[#0a34f5]/15 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Calendar size={16} className="text-[#3b6ff5]" />
                <h3 className="text-sm font-semibold text-[#3b6ff5]">
                  {dueSoonTasks.length} tarefa(s) vencem em ate 48h
                </h3>
              </div>
              <div className="space-y-1.5">
                {dueSoonTasks.map((t) => (
                  <div key={t.id} className="flex items-center gap-2 text-xs">
                    <span className="text-[#3b6ff5] font-medium">{t.title}</span>
                    <span className="text-[#3b6ff5]/60">· {t.clientName}</span>
                    <span className="text-[#3b6ff5]/60 ml-auto">Vence: {t.dueDate}</span>
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
              Suporte Diario nos Grupos
            </h3>
            <p className="text-xs text-muted-foreground mt-1">Marque conforme enviar suporte no grupo de cada cliente hoje.</p>
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

        {/* Pending */}
        {supportPending.length > 0 && (
          <div className="space-y-2 mb-4">
            <p className="text-xs font-medium text-zinc-400">Pendentes ({supportPending.length})</p>
            {supportPending.map((client) => (
              <div key={client.id} className="flex items-center gap-3 bg-[#0c0c12] border border-[#1e1e2a] rounded-lg px-3 py-2.5">
                <div className={`w-7 h-7 rounded-md flex items-center justify-center text-xs font-bold ${
                  client.status === "at_risk" ? "bg-red-500/20 text-red-500" : "bg-primary/20 text-primary"
                }`}>
                  {client.name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{client.name}</p>
                  <p className="text-xs text-muted-foreground">{client.assignedTraffic}</p>
                </div>
                <button
                  onClick={() => handleSupport(client)}
                  className="btn-primary text-xs py-1.5 flex items-center gap-1.5"
                >
                  <MessageCircle size={12} />
                  Marcar Suporte
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Completed */}
        {supportCompleted.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-primary">Concluidos ({supportCompleted.length})</p>
            {supportCompleted.map((client) => (
              <div key={client.id} className="flex items-center gap-3 bg-primary/5 border border-primary/10 rounded-lg px-3 py-2">
                <Check size={14} className="text-primary shrink-0" />
                <span className="text-sm text-zinc-400">{client.name}</span>
                <span className="text-xs text-muted-foreground ml-auto">
                  {todayChecks.find((c) => c.clientId === client.id && c.type === "support")?.completedBy}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Weekly: Monday Reports */}
      <div className="card border border-border">
        <div className="flex items-center gap-2 mb-3">
          <FileText size={16} className={isMonday ? "text-primary" : "text-muted-foreground"} />
          <h3 className="font-semibold text-foreground">Relatorios Semanais</h3>
          <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">Toda segunda-feira</span>
          {isMonday && <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full font-medium">HOJE</span>}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {activeClients.map((client) => {
            const done = reportsDone.has(client.id);
            return (
              <div key={client.id} className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 border ${
                done ? "bg-primary/5 border-primary/10" : "bg-[#0c0c12] border-[#1e1e2a]"
              }`}>
                {done ? <Check size={14} className="text-primary shrink-0" /> : <div className="w-3.5 h-3.5 rounded border border-zinc-600 shrink-0" />}
                <span className={`text-sm flex-1 ${done ? "text-zinc-400" : "text-foreground"}`}>{client.name}</span>
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
        <p className="text-xs text-muted-foreground mb-3">Analise rapida: como esta a performance dos anuncios ate agora? Algum ajuste necessario?</p>
        <div className="space-y-2">
          {activeClients.map((client) => {
            const done = analysisDone.has(client.id);
            return (
              <div key={client.id} className={`rounded-lg px-3 py-2.5 border ${
                done ? "bg-primary/5 border-primary/10" : "bg-[#0c0c12] border-[#1e1e2a]"
              }`}>
                <div className="flex items-center gap-2.5">
                  {done ? <Check size={14} className="text-primary shrink-0" /> : <div className="w-3.5 h-3.5 rounded border border-zinc-600 shrink-0" />}
                  <span className={`text-sm flex-1 ${done ? "text-zinc-400" : "text-foreground"}`}>{client.name}</span>
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
                done ? "bg-primary/5 border-primary/10" : "bg-[#0c0c12] border-[#1e1e2a]"
              }`}>
                <div className="flex items-center gap-2.5">
                  {done ? <Check size={14} className="text-primary shrink-0" /> : <div className="w-3.5 h-3.5 rounded border border-zinc-600 shrink-0" />}
                  <span className={`text-sm flex-1 ${done ? "text-zinc-400" : "text-foreground"}`}>{client.name}</span>
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
// RELATORIOS MENSAIS TAB (+ COMPARATIVO)
// ══════════════════════════════════════════════════════════════

function MonthlyReportsTab({
  clients,
  reports,
  onAddReport,
  onUpdateReport,
  currentUser,
  effectiveFilter,
}: {
  clients: Client[];
  reports: TrafficMonthlyReport[];
  onAddReport: (r: Omit<TrafficMonthlyReport, "id" | "createdAt">) => TrafficMonthlyReport;
  onUpdateReport: (id: string, updates: Partial<TrafficMonthlyReport>) => void;
  currentUser: string;
  effectiveFilter: string;
}) {
  const [selectedClient, setSelectedClient] = useState<string>(clients[0]?.id ?? "");
  const [showForm, setShowForm] = useState(false);
  const [editingReport, setEditingReport] = useState<TrafficMonthlyReport | null>(null);

  const activeClients = clients.filter((c) => c.status !== "onboarding");
  const clientReports = useMemo(
    () => reports.filter((r) => r.clientId === selectedClient).sort((a, b) => a.month.localeCompare(b.month)),
    [reports, selectedClient]
  );

  const selectedClientData = clients.find((c) => c.id === selectedClient);

  // Compute month-over-month changes
  const comparisons = useMemo(() => {
    return clientReports.map((report, idx) => {
      const prev = idx > 0 ? clientReports[idx - 1] : null;
      return {
        report,
        changes: prev ? {
          messages: pctChange(report.messages, prev.messages),
          messageCost: pctChange(report.messageCost, prev.messageCost),
          impressions: pctChange(report.impressions, prev.impressions),
        } : null,
      };
    });
  }, [clientReports]);

  const latest = comparisons.length > 0 ? comparisons[comparisons.length - 1] : null;

  const handleEdit = (report: TrafficMonthlyReport) => {
    setEditingReport(report);
    setShowForm(false);
  };

  return (
    <div className="animate-fade-in space-y-6">
      {/* Client selector */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm text-muted-foreground font-medium">Cliente:</span>
        <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5 flex-wrap">
          {activeClients.map((c) => (
            <button
              key={c.id}
              onClick={() => { setSelectedClient(c.id); setShowForm(false); setEditingReport(null); }}
              className={`text-xs px-3 py-1.5 rounded-md transition-colors ${
                selectedClient === c.id ? "bg-card text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={() => {
              if (!selectedClientData) return;
              const now = new Date();
              const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
              // Auto-generate from mock campaign data
              const clientCampaigns = mockAdCampaigns.filter((c) => c.clientId === selectedClient);
              const totalSpend = clientCampaigns.reduce((s, c) => s + c.dailyMetrics.reduce((ds, m) => ds + m.spend, 0), 0);
              const totalImpressions = clientCampaigns.reduce((s, c) => s + c.dailyMetrics.reduce((ds, m) => ds + m.impressions, 0), 0);
              const totalMessages = clientCampaigns.reduce((s, c) => s + c.dailyMetrics.reduce((ds, m) => ds + (m.messages ?? m.leads ?? 0), 0), 0);
              const costPerMsg = totalMessages > 0 ? totalSpend / totalMessages : 0;
              onAddReport({
                clientId: selectedClient,
                clientName: selectedClientData.name,
                month,
                createdBy: currentUser,
                messages: totalMessages,
                messageCost: Math.round(costPerMsg * 100) / 100,
                impressions: totalImpressions,
                observations: `Relatorio auto-gerado. ${clientCampaigns.length} campanha(s), investimento total R$ ${totalSpend.toFixed(2)}.`,
              });
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-all"
            title="Gerar relatorio automaticamente a partir dos dados de campanha"
          >
            <Zap size={13} />
            Auto-gerar
          </button>
          <button
            onClick={() => { setShowForm(!showForm); setEditingReport(null); }}
            className="btn-primary text-xs flex items-center gap-1.5"
          >
            <Plus size={13} />
            Novo Relatorio
          </button>
        </div>
      </div>

      {/* New Report Form */}
      {showForm && selectedClientData && (
        <NewReportForm
          client={selectedClientData}
          currentUser={currentUser}
          onSubmit={(data) => { onAddReport(data); setShowForm(false); }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {/* Edit Report Form */}
      {editingReport && selectedClientData && (
        <EditReportForm
          report={editingReport}
          onSave={(updates) => { onUpdateReport(editingReport.id, updates); setEditingReport(null); }}
          onCancel={() => setEditingReport(null)}
        />
      )}

      {/* Latest Month Summary */}
      {latest && !editingReport && (
        <div className="card border border-primary/20">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-foreground">{selectedClientData?.name} — Ultimo Mes</h3>
              <p className="text-xs text-muted-foreground mt-0.5">{formatMonthLabel(latest.report.month)}</p>
            </div>
            <div className="flex items-center gap-3">
              {latest.changes && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">Tendencia geral:</span>
                  {(() => {
                    const trend = latest.changes.messages;
                    if (trend > 5) return <span className="flex items-center gap-1 text-xs font-medium text-[#0a34f5]"><ArrowUpRight size={14} /> Crescendo</span>;
                    if (trend < -5) return <span className="flex items-center gap-1 text-xs font-medium text-red-500"><ArrowDownRight size={14} /> Caindo</span>;
                    return <span className="flex items-center gap-1 text-xs font-medium text-zinc-400"><Minus size={14} /> Estavel</span>;
                  })()}
                </div>
              )}
              <button
                onClick={() => exportReportAsPdf({
                  title: "Relatório Mensal de Tráfego",
                  clientName: selectedClientData?.name ?? "",
                  period: formatMonthLabel(latest.report.month),
                  createdBy: latest.report.createdBy,
                  createdAt: latest.report.createdAt,
                  sections: [
                    { label: "Mensagens/Leads", value: latest.report.messages, type: "metric" },
                    { label: "Custo por Lead", value: `R$ ${latest.report.messageCost.toFixed(2)}`, type: "metric" },
                    { label: "Impressões", value: latest.report.impressions.toLocaleString("pt-BR"), type: "metric" },
                    ...(latest.report.observations ? [{ label: "Observações", value: latest.report.observations, type: "text" as const }] : []),
                  ],
                })}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                <FileText size={12} /> PDF
              </button>
              <button onClick={() => handleEdit(latest.report)} className="text-xs text-primary hover:underline flex items-center gap-1">
                Editar
              </button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <MetricBox label="Mensagens/Leads" value={latest.report.messages} change={latest.changes?.messages} />
            <MetricBox label="Custo por Lead" value={`R$ ${latest.report.messageCost.toFixed(2)}`} change={latest.changes?.messageCost} invertColor />
            <MetricBox label="Impressoes" value={formatNumber(latest.report.impressions)} change={latest.changes?.impressions} />
          </div>

          {latest.report.observations && (
            <div className="mt-4 bg-muted border border-border rounded-lg p-3">
              <p className="text-xs text-muted-foreground font-medium mb-1">Observacoes do Gestor</p>
              <p className="text-sm text-foreground leading-relaxed">{latest.report.observations}</p>
            </div>
          )}
        </div>
      )}

      {/* Historical Comparison */}
      {comparisons.length > 1 && !editingReport && (
        <div className="card border border-border">
          <div className="flex items-center gap-2 mb-4">
            <BarChart2 size={16} className="text-primary" />
            <h3 className="font-semibold text-foreground">Evolucao Mensal — {selectedClientData?.name}</h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2.5 px-3 text-muted-foreground font-medium text-xs">Mes</th>
                  <th className="text-right py-2.5 px-3 text-muted-foreground font-medium text-xs">Leads</th>
                  <th className="text-right py-2.5 px-3 text-muted-foreground font-medium text-xs">Var.</th>
                  <th className="text-right py-2.5 px-3 text-muted-foreground font-medium text-xs">CPL</th>
                  <th className="text-right py-2.5 px-3 text-muted-foreground font-medium text-xs">Var.</th>
                  <th className="text-right py-2.5 px-3 text-muted-foreground font-medium text-xs">Impressoes</th>
                  <th className="text-right py-2.5 px-3 text-muted-foreground font-medium text-xs">Var.</th>
                  <th className="py-2.5 px-3 text-muted-foreground font-medium text-xs w-16"></th>
                </tr>
              </thead>
              <tbody>
                {comparisons.map(({ report, changes }) => (
                  <tr key={report.id} className="border-b border-border/50 hover:bg-muted/50 transition-colors group">
                    <td className="py-3 px-3 font-medium text-foreground">{formatMonthLabel(report.month)}</td>
                    <td className="py-3 px-3 text-right text-foreground">{report.messages}</td>
                    <td className="py-3 px-3 text-right">{changes ? <ChangeChip value={changes.messages} /> : <span className="text-xs text-zinc-600">—</span>}</td>
                    <td className="py-3 px-3 text-right text-foreground">R$ {report.messageCost.toFixed(2)}</td>
                    <td className="py-3 px-3 text-right">{changes ? <ChangeChip value={changes.messageCost} invert /> : <span className="text-xs text-zinc-600">—</span>}</td>
                    <td className="py-3 px-3 text-right text-foreground">{formatNumber(report.impressions)}</td>
                    <td className="py-3 px-3 text-right">{changes ? <ChangeChip value={changes.impressions} /> : <span className="text-xs text-zinc-600">—</span>}</td>
                    <td className="py-3 px-3 text-center">
                      <button
                        onClick={() => handleEdit(report)}
                        className="text-xs text-muted-foreground hover:text-primary opacity-0 group-hover:opacity-100 transition-all"
                      >
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {comparisons.length === 0 && !editingReport && (
        <div className="card text-center py-10 text-muted-foreground">
          Nenhum relatorio registrado para {selectedClientData?.name}. Clique em &quot;Novo Relatorio&quot; para adicionar.
        </div>
      )}
    </div>
  );
}

// ── Metric Box ───────────────────────────────────────────

function MetricBox({ label, value, change, invertColor }: { label: string; value: string | number; change?: number; invertColor?: boolean }) {
  return (
    <div className="bg-[#0c0c12] border border-[#1e1e2a] rounded-lg p-3">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <div className="flex items-end justify-between gap-2">
        <p className="text-lg font-bold text-foreground">{value}</p>
        {change !== undefined && <ChangeChip value={change} invert={invertColor} />}
      </div>
    </div>
  );
}

function ChangeChip({ value, invert }: { value: number; invert?: boolean }) {
  const isPositive = value > 0;
  const isNeutral = Math.abs(value) < 1;
  // For cost metrics, positive = bad (invert colors)
  const isGood = invert ? !isPositive : isPositive;

  if (isNeutral) return <span className="text-xs text-zinc-500">0%</span>;

  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${isGood ? "text-[#0a34f5]" : "text-red-500"}`}>
      {isPositive ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
      {Math.abs(value).toFixed(1)}%
    </span>
  );
}

function formatMonthLabel(month: string): string {
  const [y, m] = month.split("-");
  const names = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  return `${names[parseInt(m) - 1]}/${y}`;
}

// ── New Report Form ──────────────────────────────────────

function NewReportForm({
  client,
  currentUser,
  onSubmit,
  onCancel,
}: {
  client: Client;
  currentUser: string;
  onSubmit: (data: Omit<TrafficMonthlyReport, "id" | "createdAt">) => void;
  onCancel: () => void;
}) {
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const [month, setMonth] = useState(defaultMonth);
  const [messages, setMessages] = useState("");
  const [messageCost, setMessageCost] = useState("");
  const [impressions, setImpressions] = useState("");
  const [observations, setObservations] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!messages || !messageCost) return;
    onSubmit({
      clientId: client.id,
      clientName: client.name,
      month,
      createdBy: currentUser,
      messages: Number(messages),
      messageCost: Number(messageCost),
      impressions: Number(impressions),
      observations: observations || undefined,
    });
  };

  return (
    <div className="card border border-primary/20">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-foreground">Novo Relatorio — {client.name}</h3>
        <button onClick={onCancel} className="text-muted-foreground hover:text-foreground p-1"><X size={16} /></button>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-muted-foreground font-medium">Mes *</label>
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-full mt-1 bg-muted rounded-lg p-2.5 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground font-medium">Mensagens/Leads *</label>
            <input type="number" value={messages} onChange={(e) => setMessages(e.target.value)} placeholder="300" className="w-full mt-1 bg-muted rounded-lg p-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground font-medium">Custo por Lead (R$) *</label>
            <input type="number" step="0.01" value={messageCost} onChange={(e) => setMessageCost(e.target.value)} placeholder="8.50" className="w-full mt-1 bg-muted rounded-lg p-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground font-medium">Impressoes</label>
            <input type="number" value={impressions} onChange={(e) => setImpressions(e.target.value)} placeholder="70000" className="w-full mt-1 bg-muted rounded-lg p-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary" />
          </div>
        </div>
        <div>
          <label className="text-xs text-muted-foreground font-medium">Observacoes do Gestor</label>
          <input value={observations} onChange={(e) => setObservations(e.target.value)} placeholder="Notas sobre o desempenho do mes..." className="w-full mt-1 bg-muted rounded-lg p-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary" />
        </div>
        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onCancel} className="btn-ghost flex-1">Cancelar</button>
          <button type="submit" className="btn-primary flex-1 flex items-center justify-center gap-1.5">
            <Save size={14} />
            Salvar Relatorio
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Edit Report Form ─────────────────────────────────────

function EditReportForm({
  report,
  onSave,
  onCancel,
}: {
  report: TrafficMonthlyReport;
  onSave: (updates: Partial<TrafficMonthlyReport>) => void;
  onCancel: () => void;
}) {
  const [messages, setMessages] = useState(String(report.messages));
  const [messageCost, setMessageCost] = useState(String(report.messageCost));
  const [impressions, setImpressions] = useState(String(report.impressions));
  const [observations, setObservations] = useState(report.observations ?? "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!messages || !messageCost) return;
    onSave({
      messages: Number(messages),
      messageCost: Number(messageCost),
      impressions: Number(impressions),
      observations: observations || undefined,
    });
  };

  return (
    <div className="card border border-zinc-500/30">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-foreground">Editar Relatorio — {report.clientName}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{formatMonthLabel(report.month)} · Criado por {report.createdBy}</p>
        </div>
        <button onClick={onCancel} className="text-muted-foreground hover:text-foreground p-1"><X size={16} /></button>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-muted-foreground font-medium">Mes</label>
            <div className="w-full mt-1 bg-muted/50 rounded-lg p-2.5 text-sm text-zinc-400">{formatMonthLabel(report.month)}</div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground font-medium">Mensagens/Leads *</label>
            <input type="number" value={messages} onChange={(e) => setMessages(e.target.value)} className="w-full mt-1 bg-muted rounded-lg p-2.5 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground font-medium">Custo por Lead (R$) *</label>
            <input type="number" step="0.01" value={messageCost} onChange={(e) => setMessageCost(e.target.value)} className="w-full mt-1 bg-muted rounded-lg p-2.5 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground font-medium">Impressoes</label>
            <input type="number" value={impressions} onChange={(e) => setImpressions(e.target.value)} className="w-full mt-1 bg-muted rounded-lg p-2.5 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary" />
          </div>
        </div>
        <div>
          <label className="text-xs text-muted-foreground font-medium">Observacoes do Gestor</label>
          <input value={observations} onChange={(e) => setObservations(e.target.value)} placeholder="Notas sobre o desempenho do mes..." className="w-full mt-1 bg-muted rounded-lg p-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary" />
        </div>
        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onCancel} className="btn-ghost flex-1">Cancelar</button>
          <button type="submit" className="btn-primary flex-1 flex items-center justify-center gap-1.5">
            <Save size={14} />
            Salvar Alteracoes
          </button>
        </div>
      </form>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// ANALISE TAB (antigo Report)
// ══════════════════════════════════════════════════════════════

function TrafficReportTab({ clients }: { clients: Client[] }) {
  const { updateClientData } = useAppState();
  const relevantClients = clients.filter(
    (c) => c.status === "at_risk" || c.attentionLevel === "high" || c.attentionLevel === "critical"
  );
  const healthyClients = clients.filter(
    (c) => c.status === "good" && c.attentionLevel !== "high" && c.attentionLevel !== "critical"
  );
  const [saved, setSaved] = useState<Record<string, boolean>>({});

  return (
    <div className="animate-fade-in space-y-6">
      <p className="text-muted-foreground text-sm">Registro interno da equipe — nao visivel ao cliente.</p>

      {relevantClients.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-red-500 flex items-center gap-2">
            <AlertTriangle size={14} />
            Clientes que Precisam de Atencao ({relevantClients.length})
          </h3>
          {relevantClients.map((client) => (
            <div key={client.id} className="card border border-red-500/20">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center text-sm font-bold text-red-500">
                  {client.name[0]}
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-foreground">{client.name}</p>
                  <p className="text-xs text-muted-foreground">Gestor: {client.assignedTraffic}</p>
                </div>
                {saved[client.id] && <span className="text-xs text-primary font-medium animate-fade-in">Salvo!</span>}
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  const notes = fd.get("notes") as string;
                  updateClientData(client.id, { notes: notes || undefined });
                  setSaved((prev) => ({ ...prev, [client.id]: true }));
                  setTimeout(() => setSaved((prev) => ({ ...prev, [client.id]: false })), 1500);
                }}
                className="space-y-2"
              >
                <div>
                  <label className="text-xs text-muted-foreground font-medium">Momento atual do cliente</label>
                  <textarea
                    name="notes"
                    defaultValue={client.notes || ""}
                    placeholder="Descreva a situacao atual, o que esta acontecendo com as campanhas..."
                    className="w-full mt-1 bg-muted rounded-lg p-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary resize-none"
                    rows={3}
                  />
                </div>
                <button type="submit" className="btn-primary flex items-center gap-2 text-xs">
                  <Save size={13} />
                  Salvar Relatorio
                </button>
              </form>
            </div>
          ))}
        </div>
      )}

      {healthyClients.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-primary flex items-center gap-2">
            <CheckCircle size={14} />
            Clientes com Bons Resultados ({healthyClients.length})
          </h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {healthyClients.map((client) => (
              <div key={client.id} className="card flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
                  {client.name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground text-sm truncate">{client.name}</p>
                  <p className="text-xs text-muted-foreground">{client.assignedTraffic}</p>
                </div>
                <div className="text-right">
                  <span className={`badge border text-xs ${getAttentionColor(client.attentionLevel)}`}>
                    {getAttentionLabel(client.attentionLevel)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// NEW TASK MODAL
// ══════════════════════════════════════════════════════════════

function NewTaskModal({
  clients, trafficManagers, currentUser, onClose, onSave,
}: {
  clients: Client[];
  trafficManagers: string[];
  currentUser: string;
  onClose: () => void;
  onSave: (task: Omit<Task, "id">) => void;
}) {
  const ROLE_OPTIONS: { value: import("@/lib/types").Role; label: string }[] = [
    { value: "traffic", label: "Tráfego" },
    { value: "social", label: "Social Media" },
    { value: "designer", label: "Designer" },
    { value: "manager", label: "Gerente" },
  ];
  const ALL_MEMBERS: Record<string, string[]> = {
    traffic: trafficManagers,
    social: ["Carlos Melo", "Mariana Costa"],
    designer: ["Rafael Designer"],
    manager: ["Gerente Ops"],
  };

  const [title, setTitle] = useState("");
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [taskRole, setTaskRole] = useState<import("@/lib/types").Role>("traffic");
  const [assignedTo, setAssignedTo] = useState(currentUser);
  const [priority, setPriority] = useState<Task["priority"]>("medium");
  const [dueDate, setDueDate] = useState("");

  const selectedClient = clients.find((c) => c.id === clientId);
  const availableMembers = ALL_MEMBERS[taskRole] ?? trafficManagers;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !clientId) return;
    onSave({
      title: title.trim(),
      clientId,
      clientName: selectedClient?.name ?? "",
      assignedTo,
      role: taskRole,
      status: "pending",
      priority,
      dueDate: dueDate || undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl w-full max-w-md mx-4 shadow-2xl animate-fade-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h3 className="font-semibold text-foreground">Nova Tarefa de Trafego</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors p-1"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="text-xs text-muted-foreground font-medium">Titulo *</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Otimizar campanhas Google Ads" className="w-full mt-1 bg-muted rounded-lg p-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary" autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground font-medium">Cliente *</label>
              <select value={clientId} onChange={(e) => setClientId(e.target.value)} className="w-full mt-1 bg-muted rounded-lg p-2.5 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary">
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground font-medium">Setor</label>
              <select value={taskRole} onChange={(e) => { setTaskRole(e.target.value as import("@/lib/types").Role); setAssignedTo(ALL_MEMBERS[e.target.value]?.[0] ?? currentUser); }} className="w-full mt-1 bg-muted rounded-lg p-2.5 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary">
                {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground font-medium">Responsável</label>
            <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} className="w-full mt-1 bg-muted rounded-lg p-2.5 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary">
              {availableMembers.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground font-medium">Prioridade</label>
              <select value={priority} onChange={(e) => setPriority(e.target.value as Task["priority"])} className="w-full mt-1 bg-muted rounded-lg p-2.5 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary">
                <option value="low">Baixa</option>
                <option value="medium">Media</option>
                <option value="high">Alta</option>
                <option value="critical">Critica</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground font-medium">Prazo</label>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-full mt-1 bg-muted rounded-lg p-2.5 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary" />
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancelar</button>
            <button type="submit" className="btn-primary flex-1 flex items-center justify-center gap-1.5"><Plus size={14} /> Criar Tarefa</button>
          </div>
        </form>
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
  { key: "spend", label: "Gasto Total", icon: DollarSign, color: "text-[#0a34f5]", format: (v) => `R$ ${formatCurrency(v)}` },
  { key: "impressions", label: "Impressões", icon: Eye, color: "text-[#0a34f5]", format: (v) => formatNumber(v) },
  { key: "reach", label: "Alcance", icon: Users, color: "text-[#0a34f5]", format: (v) => formatNumber(v) },
  { key: "clicks", label: "Cliques", icon: MousePointerClick, color: "text-[#0a34f5]", format: (v) => formatNumber(v) },
  { key: "conversions", label: "Conversões", icon: Target, color: "text-[#0a34f5]", format: (v) => Math.round(v).toString() },
  { key: "leads", label: "Leads", icon: Target, color: "text-[#0a34f5]", format: (v) => v > 0 ? Math.round(v).toString() : "N/A" },
  { key: "messages", label: "Mensagens", icon: MessageCircle, color: "text-[#0a34f5]", format: (v) => v > 0 ? formatNumber(v) : "N/A" },
  { key: "ctr", label: "CTR Médio", icon: TrendingUp, color: "text-[#0a34f5]", format: (v) => `${v.toFixed(2)}%` },
  { key: "cpc", label: "CPC Médio", icon: MousePointerClick, color: "text-[#0a34f5]", format: (v) => fmtMetric(v, "R$") },
  { key: "cpm", label: "CPM Médio", icon: Eye, color: "text-[#0a34f5]", format: (v) => fmtMetric(v, "R$") },
  { key: "costPerConv", label: "Custo/Conversão", icon: Target, color: "text-[#0a34f5]", format: (v) => fmtMetric(v, "R$") },
  { key: "costPerLead", label: "Custo/Lead (CPL)", icon: Target, color: "text-[#0a34f5]", format: (v) => fmtMetric(v, "R$") },
  { key: "costPerMessage", label: "Custo/Mensagem", icon: MessageCircle, color: "text-[#0a34f5]", format: (v) => fmtMetric(v, "R$") },
  { key: "costPerResult", label: "Custo/Resultado", icon: Zap, color: "text-[#0a34f5]", format: (v) => fmtMetric(v, "R$") },
];

const DEFAULT_VISIBLE_METRICS: MetricKey[] = ["spend", "impressions", "clicks", "leads", "messages", "costPerLead", "costPerMessage", "ctr"];

function AdAnalyticsTab({
  clients,
  accounts,
  campaigns,
  addDesignRequest,
  updateClientData,
  currentUser,
  onRealDataChange,
}: {
  clients: Client[];
  accounts: AdAccount[];
  campaigns: AdCampaign[];
  addDesignRequest: (req: Omit<import("@/lib/types").DesignRequest, "id"> & { contentCardId?: string }) => import("@/lib/types").DesignRequest;
  updateClientData: (id: string, data: Partial<Client>) => void;
  currentUser: string;
  onRealDataChange?: (campaigns: AdCampaign[], isReal: boolean) => void;
}) {
  const OBJECTIVE_LABELS: Record<string, string> = {
    messages: "Mensagens", traffic: "Tráfego", conversions: "Conversões",
    reach: "Alcance", engagement: "Engajamento", leads: "Leads",
  };

  const STATUS_LABELS: Record<string, { label: string; cls: string; icon: typeof CheckCircle }> = {
    active: { label: "Ativa", cls: "text-[#0a34f5] bg-[#0a34f5]/10 border-[#0a34f5]/20", icon: CheckCircle },
    paused: { label: "Pausada", cls: "text-[#3b6ff5] bg-[#0a34f5]/10 border-[#0a34f5]/15", icon: Pause },
    completed: { label: "Finalizada", cls: "text-zinc-400 bg-zinc-500/10 border-zinc-500/20", icon: Check },
    error: { label: "Erro", cls: "text-red-500 bg-red-500/10 border-red-500/20", icon: AlertCircle },
  };

  const [selectedClient, setSelectedClient] = useState<string>("all");
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
  const [hiddenAccounts, setHiddenAccounts] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const stored = localStorage.getItem("hidden_ad_accounts");
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch { return new Set(); }
  });
  const [dateRange, setDateRange] = useState<number>(7);
  const [customDateFrom, setCustomDateFrom] = useState("");
  const [customDateTo, setCustomDateTo] = useState("");

  // Sync Carteira state
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ matched: number; total: number } | null>(null);

  // Refresh All state
  const [refreshingAll, setRefreshingAll] = useState(false);

  const hideAccount = (accId: string) => {
    setHiddenAccounts((prev) => {
      const next = new Set(prev);
      next.add(accId);
      localStorage.setItem("hidden_ad_accounts", JSON.stringify([...next]));
      return next;
    });
  };

  const unhideAccount = (accId: string) => {
    setHiddenAccounts((prev) => {
      const next = new Set(prev);
      next.delete(accId);
      localStorage.setItem("hidden_ad_accounts", JSON.stringify([...next]));
      return next;
    });
  };

  const visibleAccounts = metaAccounts.filter((a) => !hiddenAccounts.has(a.id));

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
        setMetaError("Erro ao buscar contas: " + err.message);
        setLoadingAccounts(false);
      });
  }, [meta.connected, meta.token]);

  // Fetch campaigns when an account is selected
  const handleSelectAccount = useCallback(async (accountId: string) => {
    if (!meta.token) return;
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
      const mapped: AdCampaign[] = camps
        .filter((c: any) => !c.error)
        .map((c: any) => ({
          id: c.id,
          accountId,
          clientId: accountId,
          clientName: metaAccounts.find((a) => a.id === accountId)?.name ?? accountId,
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
          leads: c.leads ?? 0,
          costPerLead: c.costPerLead ?? 0,
          results: c.results ?? 0,
          costPerResult: c.costPerResult ?? 0,
          frequency: c.frequency ?? 0,
          dailyMetrics: c.dailyMetrics ?? [],
          hasData: c.hasData ?? false,
          lastSyncAt: c.lastSyncAt,
        }));
      setMetaCampaigns(mapped);
    } catch (err: any) {
      if (err instanceof TokenExpiredError) {
        meta.handleTokenError();
        setMetaError("Token expirado. Reconecte sua conta Meta Ads.");
      } else {
        setMetaError("Erro ao buscar campanhas: " + err.message);
      }
    }
    setLoadingCampaigns(false);
  }, [meta.token, meta.handleTokenError, metaAccounts, dateRange, customDateFrom, customDateTo]);

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

  function normalizeName(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  const handleSyncCarteira = useCallback(async () => {
    if (!meta.token || metaAccounts.length === 0) return;
    setSyncing(true);
    setSyncResult(null);
    let matched = 0;
    for (const client of clients) {
      if (client.metaAdAccountId) continue;
      const clientNorm = normalizeName(client.name);
      const best = metaAccounts.find((acc) => {
        const accNorm = normalizeName(acc.name ?? "");
        return accNorm.includes(clientNorm.slice(0, 5)) || clientNorm.includes(accNorm.slice(0, 5));
      });
      if (best) {
        updateClientData(client.id, { metaAdAccountId: best.id, metaAdAccountName: best.name ?? best.account_id });
        matched++;
      }
    }
    setSyncing(false);
    setSyncResult({ matched, total: clients.filter((c) => !c.metaAdAccountId).length + matched });
    setTimeout(() => setSyncResult(null), 4000);
  }, [meta.token, metaAccounts, clients, updateClientData]);

  const handleRefreshAll = useCallback(async () => {
    if (!meta.token || linkedClients.length === 0) return;
    setRefreshingAll(true);
    const newMap = new Map<string, AdCampaign[]>();
    await Promise.all(
      linkedClients.map(async (client) => {
        if (!client.metaAdAccountId || !meta.token) return;
        try {
          const camps = await fetchCampaignInsights(meta.token, client.metaAdAccountId, dateRange);
          const mapped: AdCampaign[] = camps.filter((c: any) => !c.error).map((c: any) => ({
            id: c.id, accountId: client.metaAdAccountId!, clientId: client.id,
            clientName: client.name, name: c.name, objective: mapMetaObjective(c.objective),
            status: (c.status === "active" || c.status === "paused") ? c.status : "active" as any,
            dailyBudget: c.dailyBudget ?? 0, totalBudget: c.totalBudget ?? 0,
            startDate: c.startDate ?? "", endDate: c.endDate,
            spend: c.spend ?? 0, impressions: c.impressions ?? 0, reach: c.reach ?? 0,
            clicks: c.clicks ?? 0, ctr: c.ctr ?? 0, cpc: c.cpc ?? 0, cpm: c.cpm ?? 0,
            conversions: c.conversions ?? 0, costPerConversion: c.costPerConversion ?? 0,
            messages: c.messages ?? 0, costPerMessage: c.costPerMessage ?? 0,
            leads: c.leads ?? 0, costPerLead: c.costPerLead ?? 0,
            results: c.results ?? 0, costPerResult: c.costPerResult ?? 0,
            frequency: c.frequency ?? 0, dailyMetrics: c.dailyMetrics ?? [],
            hasData: c.hasData ?? false, lastSyncAt: c.lastSyncAt,
          }));
          newMap.set(client.id, mapped);
        } catch (err: any) {
          if (err instanceof TokenExpiredError) meta.handleTokenError();
        }
      })
    );
    setPortfolioCampaigns(newMap);
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

  // Date range boundaries for dailyMetrics filtering
  const rangeEnd = customDateTo ? new Date(customDateTo) : new Date();
  const rangeStart = customDateFrom ? new Date(customDateFrom) : new Date(rangeEnd.getTime() - dateRange * 86400000);
  const rangeStartStr = rangeStart.toISOString().slice(0, 10);
  const rangeEndStr = rangeEnd.toISOString().slice(0, 10);

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
  const avgCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
  const avgCpc = totalClicks > 0 ? totalSpend / totalClicks : 0;
  const avgCpm = totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : 0;
  const avgCostPerConv = totalConversions > 0 ? totalSpend / totalConversions : 0;
  const avgCostPerMessage = totalMessages > 0 ? totalSpend / totalMessages : 0;
  const avgCostPerLead = totalLeads > 0 ? totalSpend / totalLeads : 0;
  const avgCostPerResult = totalResults > 0 ? totalSpend / totalResults : 0;

  // Data freshness — most recent sync timestamp across all campaigns
  const lastSyncTimestamp = filteredCampaigns.reduce((latest, c) => {
    if (c.lastSyncAt && (!latest || c.lastSyncAt > latest)) return c.lastSyncAt;
    return latest;
  }, "" as string);

  const metricValues: Record<MetricKey, number> = {
    spend: totalSpend, impressions: totalImpressions, reach: totalReach,
    clicks: totalClicks, conversions: totalConversions, messages: totalMessages,
    leads: totalLeads, ctr: avgCtr, cpc: avgCpc, cpm: avgCpm,
    costPerConv: avgCostPerConv, costPerMessage: avgCostPerMessage,
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

  const [exportingAll, setExportingAll] = useState(false);

  const handleExportAllPdf = async () => {
    setExportingAll(true);
    try {
      const now = new Date();
      const since = new Date(now);
      since.setDate(since.getDate() - dateRange);
      const periodLabel = `${since.toLocaleDateString("pt-BR")} - ${now.toLocaleDateString("pt-BR")}`;

      const mockDemographics = {
        ageRanges: [
          { range: "18-24", percentage: 12.5 },
          { range: "25-34", percentage: 35.2 },
          { range: "35-44", percentage: 28.1 },
          { range: "45-54", percentage: 14.8 },
          { range: "55-64", percentage: 6.9 },
          { range: "65+", percentage: 2.5 },
        ],
        genderSplit: { women: 62.3, men: 37.7 },
      };

      const reports: { clientName: string; data: import("@/lib/exportTrafficPdf").TrafficReportData }[] = [];

      for (const client of clients) {
        // Find accounts for this client
        const clientAccountIds = new Set(accounts.filter((a) => a.clientId === client.id).map((a) => a.id));
        const clientCampaigns = campaigns.filter((c) => clientAccountIds.has(c.accountId) && (statusFilter === "all" || c.status === statusFilter));

        if (clientCampaigns.length === 0) continue;

        const reportData = buildTrafficReportData(
          client.name,
          clientCampaigns,
          periodLabel,
          undefined,
          mockDemographics,
          !isUsingRealData ? { startStr: rangeStartStr, endStr: rangeEndStr } : undefined,
        );

        reports.push({ clientName: client.name, data: reportData });
      }

      if (reports.length === 0) {
        alert("Nenhum cliente com campanhas encontradas no período.");
        return;
      }

      await exportAllTrafficReportsZip(reports);
    } finally {
      setExportingAll(false);
    }
  };

  const handleExportPdf = () => {
    // Build period label
    const now = new Date();
    const since = new Date(now);
    since.setDate(since.getDate() - dateRange);
    const periodLabel = `${since.toLocaleDateString("pt-BR")} - ${now.toLocaleDateString("pt-BR")}`;

    // Determine client name
    const clientName = selectedClient !== "all"
      ? (clients.find((c) => c.id === selectedClient)?.name ?? "Todas as Contas")
      : isUsingRealData
        ? (metaAccounts.find((a) => a.id === selectedMetaAccount)?.name ?? "Conta Meta Ads")
        : "Todas as Contas";

    // Mock demographics — in production these come from Meta Insights API /age_gender breakdowns
    const mockDemographics = {
      ageRanges: [
        { range: "18-24", percentage: 12.5 },
        { range: "25-34", percentage: 35.2 },
        { range: "35-44", percentage: 28.1 },
        { range: "45-54", percentage: 14.8 },
        { range: "55-64", percentage: 6.9 },
        { range: "65+", percentage: 2.5 },
      ],
      genderSplit: { women: 62.3, men: 37.7 },
    };

    const reportData = buildTrafficReportData(
      clientName,
      filteredCampaigns,
      periodLabel,
      undefined,
      mockDemographics,
      !isUsingRealData ? { startStr: rangeStartStr, endStr: rangeEndStr } : undefined,
    );

    exportTrafficReportPdf(reportData);
  };

  const SEVERITY_CONFIG: Record<string, { color: string; bg: string; border: string; icon: typeof AlertCircle }> = {
    critical: { color: "text-red-500", bg: "bg-red-500/5", border: "border-red-500/20", icon: AlertCircle },
    warning: { color: "text-[#0a34f5]", bg: "bg-[#0a34f5]/5", border: "border-[#0a34f5]/20", icon: AlertTriangle },
    info: { color: "text-[#0a34f5]", bg: "bg-[#0a34f5]/5", border: "border-[#0a34f5]/15", icon: CircleDot },
    success: { color: "text-[#0a34f5]", bg: "bg-[#0a34f5]/5", border: "border-[#0a34f5]/15", icon: Sparkles },
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
          <div className="bg-card border border-[#0a34f5]/20 rounded-xl p-4 flex items-center gap-4 shadow-[0_0_20px_rgba(10,52,245,0.05)]">
            {/* Status indicator */}
            <div className="relative shrink-0">
              <div className="w-10 h-10 rounded-lg bg-[#0a34f5]/10 border border-[#0a34f5]/20 flex items-center justify-center">
                <Facebook size={18} className="text-[#0a34f5]" />
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-green-500 border-2 border-card rounded-full flex items-center justify-center">
                <span className="w-1.5 h-1.5 bg-white rounded-full" />
              </span>
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-semibold text-foreground">Meta Ads Conectado</h3>
                {/* Token type badge */}
                {meta.tokenType && (
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${
                    isTokenShort
                      ? "bg-yellow-500/10 border-yellow-500/20 text-yellow-400"
                      : "bg-green-500/10 border-green-500/20 text-green-400"
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
              {isTokenShort && (
                <p className="text-[10px] text-yellow-500/70 mt-0.5">
                  Token de curta duração ativo. Configure META_APP_SECRET no .env.local para upgrade automático para 60 dias.
                </p>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
              {/* Sync Carteira button */}
              {metaAccounts.length > 0 && (
                <button
                  onClick={handleSyncCarteira}
                  disabled={syncing}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-[#0a34f5]/30 bg-[#0a34f5]/5 text-[#0a34f5] hover:bg-[#0a34f5]/10 transition-all disabled:opacity-50"
                  title="Auto-vincula clientes da carteira às contas Meta pelo nome"
                >
                  {syncing ? <Loader2 size={12} className="animate-spin" /> : <Users size={12} />}
                  Sincronizar Carteira
                </button>
              )}
              {/* Refresh All button */}
              {linkedClients.length > 0 && (
                <button
                  onClick={handleRefreshAll}
                  disabled={refreshingAll}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border bg-muted/50 text-muted-foreground hover:text-foreground hover:border-[#0a34f5]/30 transition-all disabled:opacity-50"
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
              <button onClick={meta.disconnect} className="btn-ghost text-xs border border-red-500/30 text-red-500 hover:bg-red-500/10">
                Desconectar
              </button>
            </div>
          </div>

          {/* Sync result toast */}
          {syncResult && (
            <div className="flex items-center gap-2 px-4 py-2.5 bg-[#0a34f5]/10 border border-[#0a34f5]/20 rounded-xl text-xs text-[#0a34f5] animate-fade-in">
              <CheckCircle size={13} />
              Sincronização concluída: {syncResult.matched} cliente(s) vinculado(s) automaticamente de {syncResult.total} analisado(s).
            </div>
          )}

          {/* ── Portfolio Summary ──────────────────────────────────────────── */}
          {portfolioCampaigns.size > 0 && (
            <div className="card border border-[#0a34f5]/15 shadow-[0_0_30px_rgba(10,52,245,0.04)]">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-[#0a34f5]/10 flex items-center justify-center">
                    <BarChart2 size={14} className="text-[#0a34f5]" />
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
                  { label: "Gasto Total", value: `R$ ${formatCurrency(portfolioAgg.spend)}`, color: "text-[#0a34f5]" },
                  { label: "Resultados", value: formatNumber(portfolioAgg.results), color: "text-green-400" },
                  { label: "Leads", value: formatNumber(portfolioAgg.leads), color: "text-green-400" },
                  { label: "Mensagens", value: formatNumber(portfolioAgg.messages), color: "text-[#0a34f5]" },
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
                className="text-xs px-3 py-1.5 rounded-lg bg-[#0a34f5]/10 border border-[#0a34f5]/20 text-[#0a34f5] hover:bg-[#0a34f5]/15 transition-all flex items-center gap-1.5"
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
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 mb-3 text-xs text-red-400">
                  {metaError}
                </div>
              )}

              {loadingAccounts ? (
                <div className="space-y-3 py-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="p-4 rounded-xl border border-border bg-muted/30 space-y-2">
                        <div className="h-4 w-32 bg-white/[0.06] rounded animate-pulse" />
                        <div className="h-3 w-24 bg-white/[0.06] rounded animate-pulse" />
                        <div className="h-3 w-16 bg-white/[0.06] rounded animate-pulse" />
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-[#0a34f5] border-t-transparent rounded-full animate-spin" />
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
                        className="absolute top-2 right-2 w-6 h-6 rounded-md bg-red-500/10 text-red-400 hover:bg-red-500/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
                        title="Ocultar esta conta"
                      >
                        <X size={12} />
                      </button>
                      <button
                        onClick={() => handleSelectAccount(acc.id)}
                        className="flex items-start gap-3 flex-1 text-left"
                      >
                        <div className="w-10 h-10 rounded-lg bg-[#0a34f5]/10 flex items-center justify-center shrink-0 group-hover:bg-primary/10 transition-colors">
                          <Megaphone size={18} className="text-[#0a34f5] group-hover:text-primary transition-colors" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{acc.name || `Conta ${acc.account_id}`}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">ID: {acc.account_id}</p>
                          {acc.business_name && (
                            <p className="text-xs text-muted-foreground">Business: {acc.business_name}</p>
                          )}
                          <div className="flex items-center gap-2 mt-1.5">
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#0a34f5]/10 text-[#0a34f5] border border-[#0a34f5]/20">
                              {acc.currency ?? "BRL"}
                            </span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                              acc.account_status === 1
                                ? "bg-[#0a34f5]/10 text-[#0a34f5] border-[#0a34f5]/20"
                                : "bg-[#0a34f5]/10 text-[#3b6ff5] border-[#0a34f5]/15"
                            }`}>
                              {acc.account_status === 1 ? "Ativa" : acc.account_status === 2 ? "Desativada" : "Status " + acc.account_status}
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
                <div className="h-4 w-40 bg-white/[0.06] rounded-md animate-pulse" />
                <div className="h-4 w-20 bg-white/[0.06] rounded-md animate-pulse" />
              </div>
              {/* Skeleton rows */}
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center gap-3 py-3 border-t border-border/50">
                  <div className="h-3 w-3 rounded-full bg-white/[0.06] animate-pulse shrink-0" />
                  <div className="h-3 flex-1 bg-white/[0.06] rounded animate-pulse" style={{ maxWidth: `${200 + i * 30}px` }} />
                  <div className="h-3 w-16 bg-white/[0.06] rounded animate-pulse" />
                  <div className="h-3 w-20 bg-white/[0.06] rounded animate-pulse" />
                  <div className="h-3 w-14 bg-white/[0.06] rounded animate-pulse" />
                </div>
              ))}
              <div className="flex items-center justify-center gap-2 pt-2">
                <div className="w-4 h-4 border-2 border-[#0a34f5] border-t-transparent rounded-full animate-spin" />
                <span className="text-xs text-muted-foreground">Carregando campanhas e métricas...</span>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className={`rounded-xl p-4 flex items-center gap-4 ${
          meta.tokenExpired
            ? "bg-amber-500/5 border border-amber-500/20"
            : "bg-blue-500/5 border border-[#0a34f5]/20"
        }`}>
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
            meta.tokenExpired ? "bg-amber-500/10" : "bg-[#0a34f5]/10"
          }`}>
            {meta.tokenExpired ? <AlertTriangle size={20} className="text-amber-500" /> : <Megaphone size={20} className="text-[#0a34f5]" />}
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-foreground">
              {meta.tokenExpired ? "Meta Ads — Sessão Expirada" : "Meta Ads — Dados Simulados"}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {meta.tokenExpired
                ? "Seu token de acesso expirou. Reconecte para continuar vendo dados reais."
                : "Conecte sua conta Meta para ver dados reais de campanhas, métricas e relatórios."
              }
            </p>
          </div>
          <button onClick={meta.connect} className={`btn-ghost text-xs border ${
            meta.tokenExpired
              ? "border-amber-500/30 text-amber-500 hover:bg-amber-500/10"
              : "border-[#0a34f5]/20 text-[#0a34f5] hover:bg-[#0a34f5]/10"
          }`}>
            {meta.tokenExpired ? "Reconectar" : "Conectar Meta Ads"}
          </button>
        </div>
      )}

      {/* Mock data warning banner */}
      {!isUsingRealData && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0">
            <AlertCircle size={16} className="text-amber-500" />
          </div>
          <div className="flex-1">
            <p className="text-xs font-semibold text-amber-400">Dados Simulados</p>
            <p className="text-[10px] text-amber-500/70 mt-0.5">
              As campanhas e métricas abaixo são fictícias para demonstração. Conecte sua conta Meta Ads para ver dados reais.
            </p>
          </div>
          <span className="text-[9px] font-bold text-amber-500 bg-amber-500/10 border border-amber-500/20 px-2 py-1 rounded-md uppercase tracking-wider shrink-0">
            Demo
          </span>
        </div>
      )}

      {/* Main Content — always show (mock data when no Meta account selected) */}
      {!loadingCampaigns && (
      <>
      {/* ═══ FILTERS BAR ═══ */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-muted-foreground" />
          <span className="text-xs text-muted-foreground font-medium">Cliente:</span>
        </div>
        <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5 flex-wrap">
          <button
            onClick={() => setSelectedClient("all")}
            className={`text-xs px-3 py-1.5 rounded-md transition-colors ${
              selectedClient === "all" ? "bg-card text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Todos
          </button>
          {clients.filter((c) => accounts.some((a) => a.clientId === c.id)).map((c) => (
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
              className={`text-xs px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 ${
                selectedClient === c.id ? "bg-card text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {c.metaAdAccountId && <Facebook size={10} className="text-[#3b6ff5]" />}
              {c.name}
            </button>
          ))}
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
                      ? "bg-[#0a34f5] text-white shadow-[0_0_12px_rgba(10,52,245,0.3)]"
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
          <Calendar size={14} className="text-muted-foreground" />
          <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
            {[{ days: 7, label: "7d" }, { days: 14, label: "14d" }, { days: 30, label: "30d" }, { days: 90, label: "90d" }].map((d) => (
              <button
                key={d.days}
                onClick={() => { setDateRange(d.days); setCustomDateFrom(""); setCustomDateTo(""); }}
                className={`text-xs px-2.5 py-1.5 rounded-md transition-colors ${
                  dateRange === d.days && !customDateFrom ? "bg-card text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
          <input
            type="date"
            value={customDateFrom}
            max={customDateTo || undefined}
            onChange={(e) => {
              setCustomDateFrom(e.target.value);
              if (customDateTo && e.target.value) {
                const diff = Math.ceil((new Date(customDateTo).getTime() - new Date(e.target.value).getTime()) / (1000 * 60 * 60 * 24));
                if (diff > 0) setDateRange(diff);
              }
            }}
            className="text-xs px-2 py-1.5 rounded-md bg-muted border border-border text-foreground w-[120px]"
          />
          <span className="text-xs text-muted-foreground">até</span>
          <input
            type="date"
            value={customDateTo}
            min={customDateFrom || undefined}
            onChange={(e) => {
              setCustomDateTo(e.target.value);
              if (customDateFrom && e.target.value) {
                const diff = Math.ceil((new Date(e.target.value).getTime() - new Date(customDateFrom).getTime()) / (1000 * 60 * 60 * 24));
                if (diff > 0) setDateRange(diff);
              }
            }}
            className="text-xs px-2 py-1.5 rounded-md bg-muted border border-border text-foreground w-[120px]"
          />
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
          <button onClick={handleExportPdf} className="text-xs flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition-colors font-medium">
            <Download size={13} />
            Relatório PDF
          </button>
          <button
            onClick={handleExportAllPdf}
            disabled={exportingAll}
            className="text-xs flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition-colors font-medium disabled:opacity-50"
          >
            {exportingAll ? <Loader2 size={13} className="animate-spin" /> : <FolderDown size={13} />}
            {exportingAll ? "Gerando..." : "Todos os Clientes"}
          </button>
        </div>
      </div>

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
                      {aiAnalysis.spendTrend === "up" ? <ArrowUpRight size={16} className="text-red-400" /> : aiAnalysis.spendTrend === "down" ? <ArrowDownRight size={16} className="text-[#0a34f5]" /> : <Minus size={16} className="text-zinc-500" />}
                      <span className={`text-lg font-black tabular-nums ${aiAnalysis.spendTrend === "up" ? "text-red-400" : aiAnalysis.spendTrend === "down" ? "text-[#0a34f5]" : "text-foreground"}`}>
                        {aiAnalysis.spendTrend === "up" ? "Alta" : aiAnalysis.spendTrend === "down" ? "Queda" : "Estável"}
                      </span>
                    </div>
                  </div>
                  <div className="bg-card/60 border border-border rounded-xl p-3">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Performance</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      {aiAnalysis.performanceTrend === "improving" ? <TrendingUp size={16} className="text-[#0a34f5]" /> : aiAnalysis.performanceTrend === "declining" ? <TrendingDown size={16} className="text-red-400" /> : <Activity size={16} className="text-zinc-500" />}
                      <span className={`text-lg font-black tabular-nums ${aiAnalysis.performanceTrend === "improving" ? "text-[#0a34f5]" : aiAnalysis.performanceTrend === "declining" ? "text-red-400" : "text-foreground"}`}>
                        {aiAnalysis.performanceTrend === "improving" ? "Melhorando" : aiAnalysis.performanceTrend === "declining" ? "Em Queda" : "Estável"}
                      </span>
                    </div>
                  </div>
                  <div className="bg-card/60 border border-border rounded-xl p-3">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Alertas</p>
                    <div className="flex items-center gap-2 mt-1">
                      {criticalInsights.length > 0 && <span className="text-lg font-black text-red-400 tabular-nums">{criticalInsights.length}<span className="text-[10px] font-normal"> críticos</span></span>}
                      {warningInsights.length > 0 && <span className="text-lg font-black text-[#0a34f5] tabular-nums">{warningInsights.length}<span className="text-[10px] font-normal"> atenção</span></span>}
                      {criticalInsights.length === 0 && warningInsights.length === 0 && <span className="text-lg font-black text-[#0a34f5]">Nenhum</span>}
                    </div>
                  </div>
                </div>

                {/* Top / Worst performers */}
                <div className="flex items-center gap-6 text-xs">
                  {aiAnalysis.topPerformer && (
                    <div className="flex items-center gap-2">
                      <Star size={12} className="text-[#0a34f5]" />
                      <span className="text-muted-foreground">Melhor:</span>
                      <span className="text-foreground font-semibold">{aiAnalysis.topPerformer.name}</span>
                      <span className="text-primary font-bold">{aiAnalysis.topPerformer.value}</span>
                    </div>
                  )}
                  {aiAnalysis.worstPerformer && (
                    <div className="flex items-center gap-2">
                      <ShieldAlert size={12} className="text-red-400" />
                      <span className="text-muted-foreground">Revisar:</span>
                      <span className="text-foreground font-semibold">{aiAnalysis.worstPerformer.name}</span>
                      <span className="text-red-400 font-bold">{aiAnalysis.worstPerformer.value}</span>
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
                        insight.priority === "critical" ? "bg-red-500/10 text-red-400 border border-red-500/20" :
                        insight.priority === "high" ? "bg-[#0a34f5]/10 text-[#0a34f5] border border-[#0a34f5]/20" :
                        insight.priority === "medium" ? "bg-[#0a34f5]/10 text-[#0a34f5] border border-[#0a34f5]/15" :
                        "bg-[#111118] text-zinc-500 border border-[#1e1e2a]"
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
            <span className="text-amber-500 flex items-center gap-1">
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
            <div key={m.key} className={`rounded-xl border border-[#1e1e2a] bg-[#111118] p-4 text-center transition-all ${kpiClass || "hover:border-[#0a34f5]/30 hover:shadow-[0_0_15px_rgba(10,52,245,0.08)]"}`}>
              <div className={`w-9 h-9 mx-auto rounded-lg flex items-center justify-center mb-2 ${
                kpiClass === "kpi-danger" ? "bg-red-500/10 border border-red-500/20" :
                kpiClass === "kpi-warning" ? "bg-amber-500/10 border border-amber-500/20" :
                "bg-[#0a34f5]/10 border border-[#0a34f5]/15"
              }`}>
                <MIcon size={16} className={
                  kpiClass === "kpi-danger" ? "text-red-400" :
                  kpiClass === "kpi-warning" ? "text-amber-400" :
                  "text-[#0a34f5]"
                } />
              </div>
              <p className={`text-xl font-black tabular-nums ${
                kpiClass === "kpi-danger" ? "text-red-400" :
                kpiClass === "kpi-warning" ? "text-amber-400" :
                "text-foreground"
              }`}>{m.format(val)}</p>
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mt-0.5">{m.label}</p>
              {kpiClass && (
                <p className={`text-[9px] mt-1 font-semibold uppercase tracking-wider ${
                  kpiClass === "kpi-good" ? "text-[#0a34f5]" :
                  kpiClass === "kpi-warning" ? "text-amber-400" :
                  "text-red-400"
                }`}>
                  {kpiClass === "kpi-good" ? "● Saudável" : kpiClass === "kpi-warning" ? "● Atenção" : "● Crítico"}
                </p>
              )}
              {m.key === "costPerMessage" && (
                <p className="text-[9px] text-muted-foreground/50 mt-1" title="Valores da API Meta podem variar até 15% em relação ao Gerenciador de Anúncios devido a janelas de atribuição e delays de processamento.">⚠ variação de até 15%</p>
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
                report.urgency === "critical" ? "border-red-500/20" : report.urgency === "warning" ? "border-[#0a34f5]/15" : "border-primary/20"
              }`}>
                <div className={`px-5 py-4 ${
                  report.urgency === "critical" ? "bg-red-500/[0.03]" : report.urgency === "warning" ? "bg-[#3b6ff5]/[0.03]" : "bg-primary/[0.03]"
                }`}>
                  <div className="flex items-center gap-4">
                    <div className="shrink-0">
                      <HealthScoreRing score={report.healthScore} label={report.healthLabel} size={80} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <h4 className="text-sm font-bold text-foreground">{report.accountName}</h4>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                          report.urgency === "critical" ? "bg-red-500/10 text-red-400 border border-red-500/20" :
                          report.urgency === "warning" ? "bg-[#0a34f5]/10 text-[#3b6ff5] border border-[#0a34f5]/15" :
                          "bg-[#0a34f5]/10 text-[#0a34f5] border border-[#0a34f5]/20"
                        }`}>
                          {report.urgency === "critical" ? "CRÍTICO" : report.urgency === "warning" ? "ATENÇÃO" : "SAUDÁVEL"}
                        </span>
                        <span className="text-[10px] text-muted-foreground">{report.activeCampaigns} campanhas ativas · R$ {formatCurrency(report.totalSpend)} investidos</span>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        {/* Positives */}
                        <div>
                          <p className="text-[10px] text-[#0a34f5] font-semibold uppercase tracking-wider mb-1.5 flex items-center gap-1">
                            <CheckCircle size={10} /> O que está bom
                          </p>
                          <div className="space-y-1">
                            {report.positives.slice(0, 3).map((p, i) => (
                              <p key={i} className="text-xs text-muted-foreground leading-relaxed flex items-start gap-1.5">
                                <span className="text-[#0a34f5] mt-0.5 shrink-0">+</span> {p}
                              </p>
                            ))}
                          </div>
                        </div>
                        {/* Improvements */}
                        <div>
                          <p className="text-[10px] text-[#3b6ff5] font-semibold uppercase tracking-wider mb-1.5 flex items-center gap-1">
                            <AlertTriangle size={10} /> O que melhorar
                          </p>
                          <div className="space-y-1">
                            {report.improvements.length === 0 ? (
                              <p className="text-xs text-muted-foreground">Nenhum ponto crítico encontrado</p>
                            ) : (
                              report.improvements.slice(0, 3).map((imp, i) => (
                                <p key={i} className="text-xs text-muted-foreground leading-relaxed flex items-start gap-1.5">
                                  <span className="text-[#3b6ff5] mt-0.5 shrink-0">!</span> {imp}
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
            <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-[#0a34f5]" /> {filteredCampaigns.filter((c) => c.status === "active").length} ativas</span>
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
                      {!isUsingRealData && <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20 font-bold uppercase tracking-wider">Simulado</span>}
                      {isUsingRealData && camp.hasData === false && <span className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-500/10 text-zinc-400 border border-zinc-500/20 font-bold uppercase tracking-wider">Sem dados</span>}
                      {budgetPct > 90 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20 font-semibold">Verba {budgetPct.toFixed(0)}%</span>}
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
                      <p className="font-bold text-foreground tabular-nums">R$ {formatCurrency(camp.spend)}</p>
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
                      <p className={`font-bold tabular-nums ${camp.ctr >= 2 ? "text-[#0a34f5]" : camp.ctr < 0.5 ? "text-red-400" : "text-foreground"}`}>{camp.ctr.toFixed(2)}%</p>
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
                        { label: "Custo/Msg", value: camp.costPerMessage ? fmtMetric(camp.costPerMessage, "R$") : "N/A" },
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
                              budgetPct > 90 ? "bg-red-500" : budgetPct > 70 ? "bg-[#3b6ff5]" : "bg-primary"
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
                    {/* Request new creative from Designer */}
                    <button
                      onClick={() => {
                        const cl = clients.find((c) => c.id === camp.clientId);
                        if (!cl) return;
                        addDesignRequest({
                          title: `Novo criativo — ${camp.name}`,
                          clientId: cl.id,
                          clientName: cl.name,
                          requestedBy: currentUser,
                          priority: camp.ctr < 1 || camp.cpc > 5 ? "high" : "medium",
                          status: "queued",
                          format: "Post Feed",
                          briefing: `Campanha "${camp.name}" (${camp.objective}) precisa de novo criativo. CTR: ${camp.ctr.toFixed(2)}%, CPC: R$${camp.cpc.toFixed(2)}. Objetivo: melhorar performance.`,
                        });
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

const INVESTMENT_BLUE = "#0a34f5";
const INVESTMENT_BLUE_LIGHT = "#3b6ff5";

function fmtBRL(value: number): string {
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseBRL(raw: string): number {
  // Remove R$, dots (thousands), then replace comma with dot
  const cleaned = raw.replace(/[R$\s.]/g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
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
  onSave,
  isUsingRealData,
  currentUser,
}: {
  clients: Client[];
  adCampaigns: AdCampaign[];
  investmentData: Record<string, ClientInvestmentData>;
  onSave: (clientId: string, data: Partial<ClientInvestmentData>, actor: string) => void;
  isUsingRealData: boolean;
  currentUser: string;
}) {
  const [selectedId, setSelectedId] = useState(clients[0]?.id ?? "");
  const [forms, setForms] = useState<Record<string, InvestmentForm>>({});
  const [savedFlash, setSavedFlash] = useState<string | null>(null);

  // Compute days in current month
  const daysInMonth = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  }, []);

  // Initialize forms from investmentData whenever it changes
  useEffect(() => {
    setForms((prev) => {
      const next = { ...prev };
      clients.forEach((c) => {
        if (!next[c.id]) {
          const stored = investmentData[c.id];
          const monthly = stored?.monthlyBudget ?? c.monthlyBudget;
          const daily = stored?.dailyBudget ?? parseFloat((monthly / daysInMonth).toFixed(2));
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

  // Get total monthly spend from campaigns
  const getMonthlySpend = useCallback((clientId: string): number => {
    return adCampaigns
      .filter((c) => c.clientId === clientId)
      .reduce((sum, c) => sum + (c.spend ?? 0), 0);
  }, [adCampaigns]);

  // Get today's spend
  const getTodaySpend = useCallback((clientId: string): number => {
    const today = new Date().toISOString().slice(0, 10);
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

  function handleSave() {
    if (!form || !selectedId) return;
    const monthly = parseBRL(form.monthlyRaw);
    const daily = parseBRL(form.dailyRaw);
    onSave(selectedId, {
      monthlyBudget: monthly,
      dailyBudget: daily,
      paymentMethod: form.paymentMethod,
      nextPaymentDate: form.nextPaymentDate || undefined,
    }, currentUser);
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
  const totalSpend = clients.reduce((sum, c) => sum + getMonthlySpend(c.id), 0);

  if (!form || !selectedClient) return null;

  const monthlyBudget = parseBRL(form.monthlyRaw);
  const dailyBudget = parseBRL(form.dailyRaw);
  const monthlySpend = getMonthlySpend(selectedId);
  const todaySpend = getTodaySpend(selectedId);
  const remaining = Math.max(0, monthlyBudget - monthlySpend);
  const currentDay = new Date().getDate();
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

  // Pacing health status
  type PacingStatus = "ok" | "warning" | "critical" | "slow";
  const pacingStatus: PacingStatus = (() => {
    if (monthlyBudget === 0 || monthlySpend === 0) return "ok";
    if (deviationPct > 30 || projectedEndDay < 25) return "critical";
    if (deviationPct > 15) return "warning";
    if (deviationPct < -15) return "slow"; // significantly under-pacing
    return "ok";
  })();

  const pacingColor = {
    ok:       INVESTMENT_BLUE,       // #0a34f5
    warning:  "#f59e0b",             // amber
    critical: "#ef4444",             // red
    slow:     "#a78bfa",             // purple — underperforming
  }[pacingStatus];

  const pacingLabel = {
    ok:       "No ritmo esperado",
    warning:  "Acima do ritmo — atenção",
    critical: "Verba acabando rápido",
    slow:     "Abaixo do ritmo — campanha travada",
  }[pacingStatus];

  const needsPaymentDate = form.paymentMethod === "pix" || form.paymentMethod === "boleto";
  const boletoAt80 = form.paymentMethod === "boleto" && spendPct >= 80;

  // Days until next payment
  const daysUntilPayment = form.nextPaymentDate
    ? Math.ceil((new Date(form.nextPaymentDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;
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
          <p className="text-xl font-bold tabular-nums" style={{ color: INVESTMENT_BLUE_LIGHT }}>
            R$ {fmtBRL(totalSpend)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {totalMonthly > 0 ? ((totalSpend / totalMonthly) * 100).toFixed(1) : 0}% do orçamento total
          </p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Saldo Restante</p>
          <p className="text-xl font-bold text-primary tabular-nums">R$ {fmtBRL(Math.max(0, totalMonthly - totalSpend))}</p>
          {/* Total pacing bar with time marker */}
          <div className="mt-1.5 relative h-1.5 bg-muted rounded-full overflow-visible">
            <div
              className="absolute top-0 left-0 h-full rounded-full transition-all"
              style={{
                width: `${totalMonthly > 0 ? Math.min(100, (totalSpend / totalMonthly) * 100) : 0}%`,
                backgroundColor: INVESTMENT_BLUE,
              }}
            />
            {/* Time marker */}
            <div
              className="absolute top-1/2 -translate-y-1/2 w-0.5 h-3 rounded-full bg-white/60"
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
            const spend = getMonthlySpend(c.id);
            const budget = investmentData[c.id]?.monthlyBudget ?? c.monthlyBudget;
            const pct = budget > 0 ? Math.min(100, (spend / budget) * 100) : 0;
            const isSelected = c.id === selectedId;
            const isDirty = forms[c.id]?.dirty ?? false;
            // Per-client pacing
            const cExpected = budget * timePct;
            const cDeviation = cExpected > 0 ? ((spend - cExpected) / cExpected) * 100 : 0;
            const cAvgBurn = currentDay > 0 ? spend / currentDay : 0;
            const cRemaining = Math.max(0, budget - spend);
            const cProjectedEnd = cAvgBurn > 0 ? currentDay + Math.floor(cRemaining / cAvgBurn) : daysInMonth;
            const cStatus: "ok"|"warning"|"critical"|"slow" =
              budget === 0 || spend === 0 ? "ok"
              : cDeviation > 30 || cProjectedEnd < 25 ? "critical"
              : cDeviation > 15 ? "warning"
              : cDeviation < -15 ? "slow"
              : "ok";
            const cColor = { ok: INVESTMENT_BLUE, warning: "#f59e0b", critical: "#ef4444", slow: "#a78bfa" }[cStatus];
            return (
              <button
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                className={`w-full text-left p-3 rounded-xl border transition-all ${
                  isSelected
                    ? "border-[#0a34f5]/40 bg-[#0a34f5]/8"
                    : "border-border bg-card hover:border-[#0a34f5]/20"
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={`w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold shrink-0 ${
                      isSelected ? "bg-[#0a34f5]/20 text-[#3b6ff5]" : "bg-muted text-muted-foreground"
                    }`}>
                      {c.name[0]}
                    </div>
                    <span className="text-xs font-semibold text-foreground truncate">{c.name}</span>
                    {isDirty && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" title="Alterações não salvas" />}
                  </div>
                  <span className="text-[10px] tabular-nums shrink-0 ml-1 font-semibold" style={{ color: cColor }}>
                    {pct.toFixed(0)}%
                  </span>
                </div>
                {/* Pacing bar with time marker */}
                <div className="relative h-1 bg-muted rounded-full overflow-visible">
                  <div
                    className="absolute top-0 left-0 h-full rounded-full transition-all"
                    style={{ width: `${pct}%`, backgroundColor: cColor }}
                  />
                  <div
                    className="absolute top-1/2 -translate-y-1/2 w-px h-2.5 rounded-full bg-white/50"
                    style={{ left: `${timePctBar}%` }}
                  />
                </div>
                <div className="flex items-center justify-between mt-1.5">
                  <span className="text-[10px] text-muted-foreground">R$ {fmtBRL(spend)}</span>
                  <span className="text-[10px] text-muted-foreground">/ R$ {fmtBRL(budget)}</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Right: Detail panel */}
        <div className="flex-1 min-w-0">
          <div className="bg-card border rounded-2xl overflow-hidden"
            style={{ borderColor: `${INVESTMENT_BLUE}25` }}
          >
            {/* Panel header */}
            <div className="flex items-center justify-between px-5 py-4 border-b"
              style={{ borderColor: `${INVESTMENT_BLUE}20`, background: `linear-gradient(to right, ${INVESTMENT_BLUE}08, transparent)` }}
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold"
                  style={{ backgroundColor: `${INVESTMENT_BLUE}20`, color: INVESTMENT_BLUE_LIGHT }}
                >
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
                {!isUsingRealData && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold uppercase tracking-wider">
                    Dados simulados
                  </span>
                )}
                {isUsingRealData && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 font-bold uppercase tracking-wider">
                    Meta API
                  </span>
                )}
              </div>
            </div>

            <div className="p-5 space-y-5">
              {/* ALERTS — pacing-aware */}
              {pacingStatus === "critical" && (
                <div className="flex items-start gap-3 p-3.5 rounded-xl border border-red-500/25 bg-red-500/8">
                  <AlertOctagon size={16} className="text-red-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-red-400">
                      {projectedEndDay < 25
                        ? `Verba acaba no dia ~${projectedEndDay} — antes do fim do mês`
                        : "Gasto acima de 30% do ritmo esperado"}
                    </p>
                    <p className="text-xs text-red-400/70 mt-0.5">
                      Esperado até hoje: <strong>R$ {fmtBRL(expectedSpend)}</strong> · Gasto real: <strong>R$ {fmtBRL(monthlySpend)}</strong> · Desvio: +{deviationPct.toFixed(0)}%
                    </p>
                  </div>
                </div>
              )}
              {pacingStatus === "warning" && (
                <div className="flex items-start gap-3 p-3.5 rounded-xl border border-amber-500/25 bg-amber-500/8">
                  <AlertTriangle size={16} className="text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-amber-400">Ritmo de gasto elevado — monitorar</p>
                    <p className="text-xs text-amber-400/70 mt-0.5">
                      Esperado até hoje: <strong>R$ {fmtBRL(expectedSpend)}</strong> · Gasto real: <strong>R$ {fmtBRL(monthlySpend)}</strong> · Desvio: +{deviationPct.toFixed(0)}%
                    </p>
                  </div>
                </div>
              )}
              {pacingStatus === "slow" && (
                <div className="flex items-start gap-3 p-3.5 rounded-xl border border-purple-500/25 bg-purple-500/8">
                  <AlertCircle size={16} className="text-purple-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-purple-400">Campanha abaixo do ritmo — verba sobrando</p>
                    <p className="text-xs text-purple-400/70 mt-0.5">
                      Esperado até hoje: <strong>R$ {fmtBRL(expectedSpend)}</strong> · Gasto real: <strong>R$ {fmtBRL(monthlySpend)}</strong> · Desvio: {deviationPct.toFixed(0)}%
                    </p>
                  </div>
                </div>
              )}
              {boletoAt80 && (
                <div className="flex items-start gap-3 p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/10">
                  <Banknote size={16} className="text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-amber-400">Gerar novo boleto para {selectedClient.name}</p>
                    <p className="text-xs text-amber-400/70 mt-0.5">
                      {spendPct.toFixed(0)}% do orçamento consumido · Pagamento via Boleto — providencie o próximo aporte.
                    </p>
                  </div>
                </div>
              )}
              {balanceWarnDays && (
                <div className="flex items-start gap-3 p-3.5 rounded-xl border border-amber-500/25 bg-amber-500/8">
                  <AlertTriangle size={16} className="text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-amber-400">Saldo baixo — aporte próximo</p>
                    <p className="text-xs text-amber-400/70 mt-0.5">
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
                    <Activity size={13} style={{ color: pacingColor }} />
                    Barra de Saúde do Orçamento
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold border"
                      style={{ color: pacingColor, borderColor: `${pacingColor}40`, backgroundColor: `${pacingColor}12` }}
                    >
                      {pacingLabel}
                    </span>
                    <span className="text-xs font-bold tabular-nums" style={{ color: pacingColor }}>
                      {spendPct.toFixed(1)}%
                    </span>
                  </div>
                </div>

                {/* Main pacing bar */}
                <div className="relative h-5 bg-muted rounded-full overflow-visible">
                  {/* Spend fill */}
                  <div
                    className="absolute top-0 left-0 h-full rounded-full transition-all duration-500"
                    style={{ width: `${spendPct}%`, backgroundColor: pacingColor, opacity: 0.85 }}
                  />
                  {/* Time marker — thin white line at "today" position */}
                  <div
                    className="absolute top-0 bottom-0 w-0.5 rounded-full z-10"
                    style={{
                      left: `${timePctBar}%`,
                      backgroundColor: "rgba(255,255,255,0.8)",
                      boxShadow: "0 0 4px rgba(255,255,255,0.5)",
                    }}
                    title={`Dia ${currentDay} de ${daysInMonth} (${timePctBar.toFixed(0)}% do mês)`}
                  />
                  {/* Day label on the marker */}
                  <div
                    className="absolute -top-5 text-[9px] font-bold text-white/70 -translate-x-1/2 whitespace-nowrap"
                    style={{ left: `${timePctBar}%` }}
                  >
                    dia {currentDay}
                  </div>
                </div>

                {/* Legend row */}
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>0%</span>
                  <span className="flex items-center gap-1">
                    <span className="inline-block w-2 h-2 rounded-sm" style={{ backgroundColor: pacingColor }} />
                    Gasto real: {spendPct.toFixed(1)}%
                    <span className="mx-1">·</span>
                    <span className="w-px h-3 inline-block bg-white/50 align-middle" />
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
                    <p className="text-sm font-bold tabular-nums mt-0.5"
                      style={{ color: avgDailyBurn > idealDailyBudget * 1.15 ? "#ef4444" : avgDailyBurn < idealDailyBudget * 0.85 ? "#a78bfa" : pacingColor }}
                    >
                      R$ {fmtBRL(avgDailyBurn)}
                    </p>
                    <p className="text-[9px] text-muted-foreground">média {currentDay}d</p>
                  </div>
                  <div className="bg-muted/40 rounded-lg p-2.5 text-center border border-border">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Projeção Fim</p>
                    <p className={`text-sm font-bold tabular-nums mt-0.5 ${projectedEndDay < 25 ? "text-red-400" : projectedEndDay <= daysInMonth ? "text-foreground" : "text-primary"}`}>
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
                    <p className="text-sm font-bold tabular-nums mt-0.5" style={{ color: pacingColor }}>
                      R$ {fmtBRL(monthlySpend)}
                    </p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-2.5 text-center border border-border">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Saldo</p>
                    <p className={`text-sm font-bold tabular-nums mt-0.5 ${remaining > 0 ? "text-primary" : "text-red-400"}`}>
                      R$ {fmtBRL(remaining)}
                    </p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-2.5 text-center border border-border">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Hoje</p>
                    <p className={`text-sm font-bold tabular-nums mt-0.5 ${todaySpend > idealDailyBudget * 1.15 ? "text-red-400" : "text-foreground"}`}>
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
                        className="w-full bg-muted border border-border rounded-lg pl-8 pr-3 py-2.5 text-sm text-foreground outline-none focus:border-[#0a34f5]/60 font-mono tabular-nums transition-colors"
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
                        className="w-full bg-muted border border-border rounded-lg pl-8 pr-3 py-2.5 text-sm text-foreground outline-none focus:border-[#0a34f5]/60 font-mono tabular-nums transition-colors"
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
                        <> · Queima real: <span className={avgDailyBurn > idealDailyBudget * 1.15 ? "text-red-400 font-semibold" : "text-primary font-semibold"}>R$ {fmtBRL(avgDailyBurn)}/dia</span></>
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
                    className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm text-foreground outline-none focus:border-[#0a34f5]/60 transition-colors"
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
                      className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm text-foreground outline-none focus:border-[#0a34f5]/60 transition-colors"
                    />
                    {daysUntilPayment !== null && (
                      <p className={`text-[10px] font-medium ${daysUntilPayment <= 3 ? "text-amber-400" : "text-muted-foreground"}`}>
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
                  <Facebook size={12} style={{ color: INVESTMENT_BLUE_LIGHT }} />
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
                  <span className="text-xs text-amber-400 flex items-center gap-1.5">
                    <AlertCircle size={13} /> Alterações não salvas
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">Sem alterações pendentes</span>
                )}
                <button
                  onClick={handleSave}
                  disabled={!form.dirty}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all disabled:opacity-40"
                  style={{
                    backgroundColor: form.dirty ? INVESTMENT_BLUE : undefined,
                    color: form.dirty ? "#fff" : undefined,
                  }}
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

// ══════════════════════════════════════════════════════════════
// CONTENT REQUEST MODAL — Traffic requests content from Social
// ══════════════════════════════════════════════════════════════

function ContentRequestModal({
  clients,
  currentUser,
  onClose,
  onSave,
}: {
  clients: Client[];
  currentUser: string;
  onClose: () => void;
  onSave: (card: Omit<import("@/lib/types").ContentCard, "id">) => void;
}) {
  const [title, setTitle] = useState("");
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [format, setFormat] = useState("Post");
  const [priority, setPriority] = useState<"low" | "medium" | "high" | "critical">("medium");
  const [dueDate, setDueDate] = useState("");
  const [note, setNote] = useState("");

  const selectedClient = clients.find((c) => c.id === clientId);

  const canSubmit = title.trim() && clientId && dueDate;

  const handleSubmit = () => {
    if (!canSubmit || !selectedClient) return;
    onSave({
      title: title.trim(),
      clientId,
      clientName: selectedClient.name,
      socialMedia: selectedClient.assignedSocial,
      status: "ideas",
      priority,
      format,
      dueDate,
      requestedByTraffic: currentUser,
      trafficRequestNote: note.trim() || undefined,
      trafficRequestAt: new Date().toISOString(),
      briefing: note.trim() || `Solicitação de tráfego: ${title.trim()}`,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-xl w-full max-w-md shadow-2xl animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#3b6ff5]/15 flex items-center justify-center">
              <FileText size={16} className="text-[#3b6ff5]" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Solicitar Conteúdo</h3>
              <p className="text-[10px] text-muted-foreground">O social media receberá a solicitação no kanban</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"><X size={16} /></button>
        </div>

        <div className="p-4 space-y-4">
          {/* Title */}
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground font-medium">Título da solicitação *</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Criativo para campanha de leads"
              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
            />
          </div>

          {/* Client + Format */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground font-medium">Cliente *</label>
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
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground font-medium">Formato</label>
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value)}
                className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
              >
                {["Post", "Reels", "Story", "Carrossel", "BTS", "Destaque"].map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Priority + Due date */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground font-medium">Prioridade</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as typeof priority)}
                className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
              >
                <option value="low">Baixa</option>
                <option value="medium">Média</option>
                <option value="high">Alta</option>
                <option value="critical">Urgente</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground font-medium">Data limite *</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
              />
            </div>
          </div>

          {/* Note/Briefing */}
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground font-medium">Briefing / Observação</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="Descreva o que precisa: objetivo da campanha, público-alvo, estilo visual, texto sugerido..."
              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary resize-none"
            />
          </div>

          {/* Info */}
          {selectedClient && (
            <div className="text-[10px] text-muted-foreground bg-muted rounded-lg px-3 py-2 border border-border">
              Responsável social: <span className="text-foreground">{selectedClient.assignedSocial}</span> · Designer: <span className="text-foreground">{selectedClient.assignedDesigner}</span>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 p-4 border-t border-border">
          <button onClick={onClose} className="btn-ghost text-xs">Cancelar</button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="btn-primary text-xs flex items-center gap-1.5 disabled:opacity-40"
          >
            <FileText size={13} />
            Solicitar Conteúdo
          </button>
        </div>
      </div>
    </div>
  );
}
