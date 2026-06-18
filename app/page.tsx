"use client";

import Header from "@/components/Header";
import MetricCard from "@/components/MetricCard";
import MorningBriefing from "@/components/MorningBriefing";
import {
  Users, TrendingUp, AlertTriangle, UserPlus,
  Activity, Megaphone, Clock, Bell, Send, X,
  AlertCircle, ZapOff, LayoutList,
  Check, CheckCircle, CheckCircle2, Palette, Instagram, BarChart2,
  Target, Zap, FileText, ChevronRight, Plus, Inbox,
} from "lucide-react";
import { getStatusLed, getStatusLabel } from "@/lib/utils";
import { useClientsStore } from "@/stores/useClientsStore";
import { useContentStore } from "@/stores/useContentStore";
import { useOperationalStore } from "@/stores/useOperationalStore";
import { useTrafficStore } from "@/stores/useTrafficStore";
import { useRole } from "@/lib/context/RoleContext";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useMemo, useEffect } from "react";
import type { ClientStatus } from "@/lib/types";
import { mockAdCampaigns } from "@/lib/mockData";
import { supabase } from "@/lib/supabase/client";
import { getDashboardData } from "@/lib/dashboard/getDashboardData";
import {
  DashboardHeader,
  CriticalAlertBanner,
  QuickActions,
  TeamSection,
  WeeklyAttention,
  ClientStatusList,
} from "@/components/dashboard-v2";
import { KPICard, PillBadge } from "@/components/lone-ui";
import TrafficChecklist from "@/components/sector/TrafficChecklist";
import PostCounter from "@/components/sector/PostCounter";
import DesignQueue from "@/components/sector/DesignQueue";
import BudgetAlert from "@/components/sector/BudgetAlert";
import SmartAlerts from "@/components/SmartAlerts";
import SystemAlertBanner from "@/components/SystemAlertBanner";
import MetaHealthCard from "@/components/MetaHealthCard";
import ClientHealthRadar from "@/components/ClientHealthRadar";
import PlatformUpdatesWidget from "@/components/PlatformUpdatesWidget";


function hoursSince(isoString?: string): number {
  if (!isoString) return 9999;
  return (Date.now() - new Date(isoString).getTime()) / 3600000;
}

const STATUS_FILTER_CONFIG = [
  { key: "all",        label: "Todos" },
  { key: "good",       label: "On Fire" },
  { key: "average",    label: "Atenção" },
  { key: "at_risk",    label: "Crítico" },
  { key: "onboarding", label: "Onboarding" },
];

// ── Notice Form (Admin/Manager only) ──
function NoticeFormBlock() {
  const notices = useOperationalStore((s) => s.notices);
  const addNotice = useOperationalStore((s) => s.addNotice);
  const deleteNotice = useOperationalStore((s) => s.deleteNotice);
  const { role, currentUser } = useRole();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    title: "", body: "", urgent: false, scheduledAt: "", category: "general" as "general" | "meeting" | "deadline" | "reminder",
  });

  const [formSuccess, setFormSuccess] = useState(false);

  const handleAdd = () => {
    if (!form.title.trim()) return;
    if (form.scheduledAt && new Date(form.scheduledAt) <= new Date()) return;
    addNotice({
      title: form.title,
      body: form.body,
      urgent: form.urgent,
      createdBy: currentUser,
      scheduledAt: form.scheduledAt || undefined,
      category: form.category,
    });
    setForm({ title: "", body: "", urgent: false, scheduledAt: "", category: "general" });
    setFormSuccess(true);
    setTimeout(() => { setFormSuccess(false); setShowForm(false); }, 1200);
  };

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <Megaphone size={15} className="text-zinc-400" />
          Avisos da Empresa
        </h3>
        {(role === "admin" || role === "manager") && (
          <button
            onClick={() => setShowForm(!showForm)}
            className="text-xs text-primary hover:text-foreground transition-colors flex items-center gap-1"
          >
            + Novo Aviso
          </button>
        )}
      </div>
      {showForm && (role === "admin" || role === "manager") && (
        <div className="mb-3 p-3 bg-primary/10 border border-primary/20 rounded-xl space-y-2">
          <input
            value={form.title}
            onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
            placeholder="Título do aviso (ex: Reunião às 14h)"
            className="w-full bg-muted rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary"
          />
          <textarea
            value={form.body}
            onChange={(e) => setForm((p) => ({ ...p, body: e.target.value }))}
            rows={2}
            placeholder="Mensagem (opcional)"
            className="w-full bg-muted rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary resize-none"
          />
          <div className="flex gap-2 flex-wrap">
            <select
              value={form.category}
              onChange={(e) => setForm((p) => ({ ...p, category: e.target.value as typeof form.category }))}
              className="bg-muted rounded-lg px-2 py-1.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="general">Geral</option>
              <option value="meeting">Reunião</option>
              <option value="deadline">Prazo</option>
              <option value="reminder">Lembrete</option>
            </select>
            <input
              type="datetime-local"
              value={form.scheduledAt}
              onChange={(e) => setForm((p) => ({ ...p, scheduledAt: e.target.value }))}
              min={new Date(Date.now() + 60000).toISOString().slice(0, 16)}
              className={`bg-muted rounded-lg px-2 py-1.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary flex-1 min-w-[160px] ${form.scheduledAt && new Date(form.scheduledAt) <= new Date() ? "ring-1 ring-red-500/60" : ""}`}
            />
          </div>
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.urgent}
                onChange={(e) => setForm((p) => ({ ...p, urgent: e.target.checked }))}
                className="w-3.5 h-3.5 accent-red-400"
              />
              <span className="text-xs text-red-500">Urgente</span>
            </label>
            <div className="flex items-center gap-2">
              {formSuccess && <span className="text-xs text-[#0d4af5] font-medium flex items-center gap-1"><CheckCircle2 size={12} /> Publicado!</span>}
              <button onClick={() => setShowForm(false)} className="text-xs text-muted-foreground hover:text-foreground">Cancelar</button>
              <button onClick={handleAdd} disabled={formSuccess} className="btn-primary text-xs flex items-center gap-1 disabled:opacity-50"><Send size={11} /> Publicar</button>
            </div>
          </div>
        </div>
      )}
      <div className="space-y-2 max-h-64 overflow-auto">
        {notices.length === 0 && (
          <p className="text-xs text-muted-foreground/70 text-center py-5">Nenhum aviso. Tudo sob controle.</p>
        )}
        {notices.slice(0, 8).map((notice) => {
          const catIcon = notice.category === "meeting" ? "📅" : notice.category === "deadline" ? "⏰" : notice.category === "reminder" ? "🔔" : "";
          return (
            <div key={notice.id} className={`p-3 rounded-lg border text-sm ${
              notice.urgent ? "bg-red-500/10 border-red-500/20"
              : notice.category === "meeting" ? "bg-blue-500/5 border-[#0d4af5]/20"
              : "bg-muted border-transparent"
            }`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  {catIcon && <span className="text-xs">{catIcon}</span>}
                  <p className={`font-medium text-xs ${notice.urgent ? "text-red-500" : "text-foreground"}`}>{notice.title}</p>
                </div>
                {(role === "admin" || role === "manager") && (
                  <button
                    onClick={() => { if (window.confirm("Tem certeza que deseja excluir este aviso?")) deleteNotice(notice.id); }}
                    className="text-muted-foreground/50 hover:text-red-500 transition-colors shrink-0 p-0.5"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
              {notice.body && <p className="text-muted-foreground text-xs mt-0.5">{notice.body}</p>}
              <div className="flex items-center gap-2 mt-1">
                <p className="text-muted-foreground/50 text-xs">por {notice.createdBy} · {notice.createdAt}</p>
                {notice.scheduledAt && (
                  <span className="text-xs text-[#0d4af5] bg-[#0d4af5]/10 px-1.5 py-0.5 rounded">
                    {new Date(notice.scheduledAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Employee Dashboard (Traffic/Social/Designer) ──
function EmployeeDashboard() {
  const clients = useClientsStore((s) => s.clients);
  const contentCards = useContentStore((s) => s.contentCards);
  const designRequests = useContentStore((s) => s.designRequests);
  const tasks = useOperationalStore((s) => s.tasks);
  const notices = useOperationalStore((s) => s.notices);
  const timeline = useOperationalStore((s) => s.timeline);
  const trafficRoutineChecks = useTrafficStore((s) => s.trafficRoutineChecks);
  const { role, currentUser } = useRole();

  // My tasks
  const myTasks = useMemo(() =>
    tasks.filter((t) => t.assignedTo === currentUser && t.status !== "done"),
    [tasks, currentUser]
  );
  const myCompletedTasks = useMemo(() =>
    tasks.filter((t) => t.assignedTo === currentUser && t.status === "done"),
    [tasks, currentUser]
  );

  // My clients
  const myClients = useMemo(() => {
    if (role === "traffic") return clients.filter((c) => c.assignedTraffic === currentUser);
    if (role === "social") return clients.filter((c) => c.assignedSocial === currentUser);
    return clients;
  }, [clients, currentUser, role]);

  // My content cards (social)
  const myCards = useMemo(() => {
    if (role === "social") return contentCards.filter((c) => c.socialMedia === currentUser);
    return [];
  }, [contentCards, currentUser, role]);

  // My design requests (designer)
  const myDesignRequests = useMemo(() => {
    if (role === "designer") return designRequests.filter((r) => r.status !== "done");
    return [];
  }, [designRequests, role]);

  // Performance metrics
  const performance = useMemo(() => {
    const totalTasks = tasks.filter((t) => t.assignedTo === currentUser);
    const done = totalTasks.filter((t) => t.status === "done").length;
    const total = totalTasks.length;
    const rate = total > 0 ? Math.round((done / total) * 100) : 0;

    let published = 0;
    let inPipeline = 0;
    if (role === "social") {
      published = contentCards.filter((c) => c.socialMedia === currentUser && c.status === "published").length;
      inPipeline = contentCards.filter((c) => c.socialMedia === currentUser && c.status !== "published").length;
    }

    let supportDone = 0;
    let supportTotal = 0;
    if (role === "traffic") {
      const today = new Date().toISOString().slice(0, 10);
      const memberClients = clients.filter((c) => c.assignedTraffic === currentUser && c.status !== "onboarding");
      supportTotal = memberClients.length;
      supportDone = trafficRoutineChecks.filter((c) => c.date === today && c.completedBy === currentUser && c.type === "support").length;
    }

    return { done, total, rate, published, inPipeline, supportDone, supportTotal };
  }, [tasks, contentCards, trafficRoutineChecks, clients, currentUser, role]);

  // Recent activity (my own)
  const myRecentActivity = useMemo(() => {
    const allEntries: { clientId: string; actor: string; description: string; timestamp: string; type: string }[] = [];
    for (const [, entries] of Object.entries(timeline)) {
      entries.filter((e) => e.actor === currentUser).forEach((e) => allEntries.push(e));
    }
    return allEntries.sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 5);
  }, [timeline, currentUser]);

  const greetingTime = new Date().getHours();
  const greeting = greetingTime < 12 ? "Bom dia" : greetingTime < 18 ? "Boa tarde" : "Boa noite";

  return (
    <>
      {/* Greeting */}
      <div className="bg-gradient-to-r from-[#0d4af5]/10 to-transparent border border-[#0d4af5]/20 rounded-2xl p-5">
        <h2 className="text-lg font-bold text-foreground">
          {greeting}, {currentUser.split(" ")[0]}!
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          {role === "traffic" && `Você tem ${myClients.filter((c) => c.status !== "onboarding").length} clientes e ${myTasks.length} tarefas pendentes.`}
          {role === "social" && `Você tem ${myCards.filter((c) => c.status !== "published").length} cards no pipeline e ${myTasks.length} tarefas pendentes.`}
          {role === "designer" && `Você tem ${myDesignRequests.length} pedidos de design na fila e ${myTasks.length} tarefas pendentes.`}
        </p>
      </div>

      {/* Quick metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        <MetricCard
          icon={Target}
          label="Tarefas Pendentes"
          value={myTasks.length}
          sub={`${myCompletedTasks.length} concluídas`}
          iconColor="text-primary"
          iconBg="bg-primary/10"
          href="/calendar"
        />
        <MetricCard
          icon={CheckCircle}
          label="Taxa de Conclusão"
          value={`${performance.rate}%`}
          sub={`${performance.done}/${performance.total} tarefas`}
          iconColor={performance.rate >= 80 ? "text-[#0d4af5]" : performance.rate >= 50 ? "text-[#3b6ff5]" : "text-red-500"}
          iconBg={performance.rate >= 80 ? "bg-[#0d4af5]/10" : performance.rate >= 50 ? "bg-[#0d4af5]/10" : "bg-red-500/10"}
          href="/calendar"
        />
        {role === "social" && (
          <>
            <MetricCard icon={Instagram} label="Publicados" value={performance.published} sub="este mês" iconColor="text-[#0d4af5]" iconBg="bg-[#0d4af5]/10" href="/social" />
            <MetricCard icon={FileText} label="No Pipeline" value={performance.inPipeline} sub="cards em andamento" iconColor="text-primary" iconBg="bg-primary/10" href="/social" />
          </>
        )}
        {role === "traffic" && (
          <>
            <MetricCard icon={Users} label="Meus Clientes" value={myClients.filter((c) => c.status !== "onboarding").length} sub="em operação" iconColor="text-primary" iconBg="bg-primary/10" href="/clients" />
            <MetricCard
              icon={Zap}
              label="Suporte Hoje"
              value={`${performance.supportDone}/${performance.supportTotal}`}
              sub="check-ins feitos"
              iconColor={performance.supportDone >= performance.supportTotal ? "text-[#0d4af5]" : "text-[#3b6ff5]"}
              iconBg={performance.supportDone >= performance.supportTotal ? "bg-[#0d4af5]/10" : "bg-[#0d4af5]/10"}
              href="/traffic"
            />
          </>
        )}
        {role === "designer" && (
          <>
            <MetricCard icon={Palette} label="Na Fila" value={myDesignRequests.filter((r) => r.status === "queued").length} sub="pedidos aguardando" iconColor="text-[#3b6ff5]" iconBg="bg-[#0d4af5]/10" href="/design" />
            <MetricCard icon={Activity} label="Em Produção" value={myDesignRequests.filter((r) => r.status === "in_progress").length} sub="fazendo agora" iconColor="text-primary" iconBg="bg-primary/10" href="/design" />
          </>
        )}
      </div>

      {/* Sector-specific widgets */}
      {role === "traffic" && myClients.length > 0 && (
        <TrafficChecklist clients={myClients.filter((c) => c.status !== "onboarding")} currentUser={currentUser} />
      )}
      {role === "social" && (
        <PostCounter cards={contentCards} currentUser={currentUser} />
      )}
      {role === "designer" && myDesignRequests.length > 0 && (
        <DesignQueue requests={myDesignRequests} currentUser={currentUser} />
      )}

      {/* Two columns: Tasks + Notices/Activity */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* My Tasks */}
        <div className="xl:col-span-2 card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <Target size={16} className="text-primary" />
              Minhas Tarefas
            </h3>
            <span className="text-xs text-muted-foreground">{myTasks.length} pendentes</span>
          </div>
          <div className="space-y-2">
            {myTasks.length === 0 && (
              <div className="flex flex-col items-center py-8">
                <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center mb-3">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted-foreground/50"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                </div>
                <p className="text-xs text-muted-foreground/70">Nenhuma tarefa pendente. Respire.</p>
              </div>
            )}
            {myTasks.slice(0, 8).map((task) => (
              <div key={task.id} className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors">
                <span className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${
                  task.priority === "critical" ? "bg-red-500" :
                  task.priority === "high" ? "bg-[#3b6ff5]" :
                  task.priority === "medium" ? "bg-blue-500" : "bg-zinc-500"
                }`} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground">{task.title}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] text-muted-foreground">{task.clientName}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                      task.status === "in_progress" ? "bg-primary/10 text-primary" :
                      task.status === "review" ? "bg-[#0d4af5]/10 text-[#3b6ff5]" :
                      "bg-muted text-muted-foreground"
                    }`}>
                      {task.status === "pending" ? "Pendente" : task.status === "in_progress" ? "Em Progresso" : "Revisão"}
                    </span>
                    {task.dueDate && (
                      <span className="text-[10px] text-muted-foreground">
                        Prazo: {new Date(task.dueDate).toLocaleDateString("pt-BR")}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right sidebar: Notices + Recent activity */}
        <div className="space-y-4">
          {/* Performance ring */}
          <div className="card text-center">
            <h3 className="font-semibold text-foreground text-sm mb-3">Meu Desempenho</h3>
            <div className="relative w-24 h-24 mx-auto mb-3">
              <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="40" fill="none" stroke="var(--muted)" strokeWidth="8" />
                <circle
                  cx="50" cy="50" r="40" fill="none"
                  stroke={performance.rate >= 80 ? "#22c55e" : performance.rate >= 50 ? "#eab308" : "#ef4444"}
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={`${performance.rate * 2.51} 251`}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-xl font-black text-foreground">{performance.rate}%</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {performance.done} de {performance.total} tarefas concluídas
            </p>
          </div>

          {/* Notices */}
          <NoticeFormBlock />

          {/* My Recent Activity */}
          <div className="card">
            <h3 className="font-semibold text-foreground flex items-center gap-2 mb-3 text-sm">
              <Activity size={14} className="text-primary" />
              Minha Atividade
            </h3>
            <div className="space-y-2">
              {myRecentActivity.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-3">Nenhuma atividade recente</p>
              )}
              {myRecentActivity.map((entry, i) => (
                <div key={`${entry.timestamp}-${i}`} className="text-xs text-muted-foreground py-1.5 border-b border-border/50 last:border-0">
                  <span className="text-foreground">{entry.description}</span>
                  <p className="text-[10px] text-muted-foreground/50 mt-0.5">{entry.timestamp}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* My Clients (quick view) */}
      {myClients.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-foreground text-sm">Meus Clientes</h3>
            <Link href="/clients" className="text-xs text-primary hover:underline flex items-center gap-1">
              Ver todos <ChevronRight size={10} />
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
            {myClients.map((client) => (
              <Link
                key={client.id}
                href={client.status === "onboarding" ? `/clients/${client.id}?tab=onboarding` : `/clients/${client.id}`}
                className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg hover:bg-muted/50 hover:shadow-md select-none transition-all cursor-pointer"
              >
                <div className={getStatusLed(client.status)} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground truncate">{client.name}</p>
                  <p className="text-[10px] text-muted-foreground">{getStatusLabel(client.status)}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

// ── Admin/Manager/CEO Dashboard (Full view) ──
function AdminDashboard() {
  const clients = useClientsStore((s) => s.clients);
  const contentCards = useContentStore((s) => s.contentCards);
  const designRequests = useContentStore((s) => s.designRequests);
  const tasks = useOperationalStore((s) => s.tasks);
  const updateTask = useOperationalStore((s) => s.updateTask);
  const trafficRoutineChecks = useTrafficStore((s) => s.trafficRoutineChecks);
  const router = useRouter();

  const [statusFilter, setStatusFilter] = useState<ClientStatus | "all">("all");
  const [contractStats, setContractStats] = useState({ active: 0, pending: 0, expiring: 0 });

  useEffect(() => {
    let mounted = true;
    supabase.from("contracts").select("id, status, end_date").then(({ data }) => {
      if (!mounted || !data) return;
      const now = Date.now();
      const in30d = now + 30 * 86400000;
      setContractStats({
        active: data.filter((c) => c.status === "active").length,
        pending: data.filter((c) => c.status === "draft").length,
        expiring: data.filter((c) => c.status === "active" && c.end_date && new Date(c.end_date).getTime() <= in30d && new Date(c.end_date).getTime() > now).length,
      });
    });
    return () => { mounted = false; };
  }, []);

  const {
    activeClients, atRiskClients, onboardingClients, urgentTasks,
    pipelineCards, publishedThisMonth, stuckCards, pendingApproval,
    designQueued, designInProg, teamProductivity, trafficProductivity,
    inactiveSevenDays,
  } = useMemo(
    () => getDashboardData({ clients, contentCards, designRequests, tasks, trafficRoutineChecks }),
    [clients, contentCards, designRequests, tasks, trafficRoutineChecks]
  );

  const tableClients = useMemo(
    () => statusFilter === "all" ? clients : clients.filter((c) => c.status === statusFilter),
    [clients, statusFilter]
  );

  const bottlenecks = useMemo(() => {
    const counts: Record<string, { count: number; clients: string[] }> = {};
    contentCards.filter((c) => c.status !== "published").forEach((c) => {
      if (!counts[c.status]) counts[c.status] = { count: 0, clients: [] };
      counts[c.status].count++;
      if (!counts[c.status].clients.includes(c.clientName)) counts[c.status].clients.push(c.clientName);
    });
    return Object.entries(counts).filter(([, v]) => v.count >= 2).sort((a, b) => b[1].count - a[1].count);
  }, [contentCards]);


  const dateLabel = new Date().toLocaleDateString("pt-BR", {
    weekday: "long", day: "numeric", month: "short", year: "numeric",
  });

  return (
    <>
      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        <KPICard label="Clientes Ativos" value={activeClients.length} caption="em operação" tone="default" accent icon={<Users size={12} />} onClick={() => router.push("/clients")} />
        <KPICard label="Em Risco" value={atRiskClients.length} caption="precisam atenção" tone={atRiskClients.length > 0 ? "danger" : "default"} accent icon={<AlertTriangle size={12} />} onClick={() => router.push("/clients?filter=at_risk")} />
        <KPICard label="Onboarding" value={onboardingClients.length} caption="novos clientes" tone={onboardingClients.length > 0 ? "warning" : "default"} accent icon={<UserPlus size={12} />} onClick={() => router.push("/clients?filter=onboarding")} />
        <KPICard label="Tarefas Urgentes" value={urgentTasks.length} caption="prioridade crítica" tone={urgentTasks.length > 0 ? "warning" : "default"} accent icon={<Zap size={12} />} onClick={() => router.push("/my-work")} />
      </div>

      {/* Ações rápidas */}
      <QuickActions
        actions={[
          { id: "task", label: "Nova Tarefa", href: "/calendar", variant: "primary", icon: <Plus size={12} /> },
          { id: "card", label: "Novo Card", href: "/social", variant: "secondary", icon: <FileText size={12} /> },
          { id: "work", label: "Meu Trabalho", href: "/my-work", variant: "secondary", icon: <Inbox size={12} /> },
        ]}
      />

      {/* Onboarding pendente */}
      {onboardingClients.length > 0 && (
        <Link href="/clients/pending" className="block rounded-xl border border-lone-brand/20 bg-lone-brand/[0.03] p-4 hover:bg-lone-brand/[0.06] transition-all group">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-lone-brand/15 flex items-center justify-center">
                <UserPlus size={18} className="text-lone-brand" aria-hidden="true" />
              </div>
              <div>
                <p className="text-lone-body font-inter font-medium text-lone-text-primary">
                  {onboardingClients.length} cadastro{onboardingClients.length > 1 ? "s" : ""} pendente{onboardingClients.length > 1 ? "s" : ""}
                </p>
                <p className="text-lone-caption font-inter text-lone-text-tertiary">
                  {onboardingClients.map((c) => c.nomeFantasia || c.name).slice(0, 3).join(", ")}
                  {onboardingClients.length > 3 ? ` +${onboardingClients.length - 3}` : ""}
                </p>
              </div>
            </div>
            <ChevronRight size={16} className="text-lone-text-disabled group-hover:text-lone-brand transition-colors" aria-hidden="true" />
          </div>
        </Link>
      )}

      {/* Alertas de orçamento */}
      <BudgetAlert clients={clients} />

      {/* Banner de urgências */}
      <CriticalAlertBanner
        alerts={[
          { type: "clients_at_risk",   count: atRiskClients.length,    href: "/clients?filter=at_risk" },
          { type: "stuck_cards",        count: stuckCards.length,        href: "/social" },
          { type: "urgent_tasks",       count: urgentTasks.length,       href: "/calendar" },
          { type: "expiring_contracts", count: contractStats.expiring,   href: "/clients" },
          { type: "pending_approval",   count: pendingApproval,          href: "/social" },
        ]}
      />

      {/* Health Radar + Smart Alerts */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <ClientHealthRadar />
        <SmartAlerts />
      </div>

      {/* Resumo de contratos — somente admin */}
      {(contractStats.active > 0 || contractStats.pending > 0 || contractStats.expiring > 0) && (
        <div className="rounded-xl border border-lone-border bg-lone-bg-card p-4">
          <p className="text-lone-eyebrow font-inter text-lone-text-tertiary mb-3 flex items-center gap-1.5 tracking-[1.5px]">
            <FileText size={11} aria-hidden="true" /> CONTRATOS
          </p>
          <div className="flex gap-6">
            <div>
              <p className="text-lone-h1 font-jetbrains text-[var(--lone-success)]">{contractStats.active}</p>
              <p className="text-lone-caption font-inter text-lone-text-tertiary">Assinados</p>
            </div>
            <div>
              <p className="text-lone-h1 font-jetbrains text-[var(--lone-warning)]">{contractStats.pending}</p>
              <p className="text-lone-caption font-inter text-lone-text-tertiary">Pendentes</p>
            </div>
            {contractStats.expiring > 0 && (
              <div>
                <p className="text-lone-h1 font-jetbrains text-[var(--lone-danger)]">{contractStats.expiring}</p>
                <p className="text-lone-caption font-inter text-lone-text-tertiary">Vence em 30d</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Ad Rejection Alert — oculto: dados dependem de mockAdCampaigns (ver BACKLOG #5) */}
      {/* MorningBriefing (AI) — oculto: dados dependem de mockAdCampaigns (ver BACKLOG #5) */}

      {/* Pipeline Quick Stats */}
      <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
        <KPICard label="Pipeline"    value={pipelineCards.length}       caption="cards em andamento"   onClick={() => router.push("/social")} />
        <KPICard label="Publicados"  value={publishedThisMonth}         caption="este mês"             tone="success" onClick={() => router.push("/social")} />
        <KPICard label="Parados 48h+" value={stuckCards.length}         caption="SLA violado"          tone={stuckCards.length > 0 ? "danger" : "default"} onClick={() => router.push("/social")} />
        <KPICard label="Aprovação"   value={pendingApproval}            caption="aguardando review"    tone={pendingApproval > 0 ? "warning" : "default"} onClick={() => router.push("/social")} />
        <KPICard label="Design"      value={designQueued + designInProg} caption={`${designQueued} fila · ${designInProg} prod`} onClick={() => router.push("/design")} />
      </div>

      {/* Equipes */}
      <TeamSection socialTeam={teamProductivity} trafficTeam={trafficProductivity} />

      {/* Avisos + Tarefas Urgentes */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2">
          <NoticeFormBlock />
        </div>
        <div className="rounded-xl border border-lone-border bg-lone-bg-card p-4">
          <h3 className="text-lone-h2 font-inter font-medium text-lone-text-primary flex items-center gap-2 mb-3">
            <AlertTriangle size={14} className="text-lone-brand" aria-hidden="true" />
            Tarefas Urgentes
          </h3>
          <div className="space-y-2">
            {tasks
              .filter((t) => ["critical", "high"].includes(t.priority) && t.status !== "done")
              .slice(0, 6)
              .map((task) => (
                <div key={task.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-lone-bg-elevated transition-colors group">
                  <button
                    onClick={() => updateTask(task.id, { status: task.status === "done" ? "pending" : "done" })}
                    className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-all ${
                      task.status === "done"
                        ? "bg-lone-brand border-lone-brand text-white"
                        : "border-lone-border hover:border-lone-brand"
                    }`}
                    aria-label={task.status === "done" ? "Marcar como pendente" : "Marcar como concluída"}
                  >
                    {task.status === "done" && <Check size={10} />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-lone-body font-inter text-lone-text-primary leading-tight">{task.title}</p>
                    <p className="text-lone-caption font-inter text-lone-text-tertiary">{task.clientName} · {task.assignedTo}</p>
                  </div>
                  <Link
                    href={task.role === "social" ? "/social" : task.role === "designer" ? "/design" : "/traffic"}
                    className="text-lone-text-disabled hover:text-lone-brand transition-colors"
                    aria-label="Ir para seção da tarefa"
                  >
                    <ChevronRight size={10} />
                  </Link>
                </div>
              ))}
            {tasks.filter((t) => ["critical", "high"].includes(t.priority) && t.status !== "done").length === 0 && (
              <p className="text-lone-caption font-inter text-lone-text-disabled text-center py-4">
                Nenhuma tarefa urgente
              </p>
            )}
          </div>
        </div>
      </div>

      <WeeklyAttention clients={inactiveSevenDays} />

      {/* Lista de status dos clientes */}
      <ClientStatusList
        clients={tableClients.map((c) => ({
          id: c.id,
          name: c.name,
          status: c.status,
          postsThisMonth: c.postsThisMonth ?? 0,
          postsGoal: c.postsGoal ?? 12,
          assignedTraffic: c.assignedTraffic,
          assignedSocial: c.assignedSocial,
        }))}
        totalCount={clients.length}
        statusFilter={statusFilter}
        onFilterChange={setStatusFilter}
      />
    </>
  );
}

// ── Main Dashboard Page ──
export default function DashboardPage() {
  const { role, currentUser } = useRole();
  const notices = useOperationalStore((s) => s.notices);
  const initClients = useClientsStore((s) => s.init);
  const initContent = useContentStore((s) => s.init);
  const initOps = useOperationalStore((s) => s.init);
  const initTraffic = useTrafficStore((s) => s.init);
  const subClients = useClientsStore((s) => s.subscribeRealtime);
  const subContent = useContentStore((s) => s.subscribeRealtime);
  const subOps = useOperationalStore((s) => s.subscribeRealtime);

  useEffect(() => {
    initClients(); initContent(); initOps(); initTraffic();
    const u1 = subClients(); const u2 = subContent(); const u3 = subOps();
    return () => { u1(); u2(); u3(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const isAdmin = role === "admin" || role === "manager";

  return (
    <div className="flex flex-col flex-1 overflow-auto">
      <Header
        title="Dashboard"
        subtitle={isAdmin ? "Visão 360° da operação" : `Painel de ${currentUser.split(" ")[0]}`}
      />

      <div className="p-6 space-y-6 animate-fade-in">
        {/* Platform updates widget — aparece quando tem novidade nao lida */}
        <PlatformUpdatesWidget />
        {isAdmin && <SystemAlertBanner />}
        {isAdmin && <MetaHealthCard />}

        {/* Urgent broadcast banner — visible to all */}
        {notices.filter((n) => n.urgent).length > 0 && (
          <div className="space-y-2">
            {notices.filter((n) => n.urgent).slice(0, 2).map((n) => (
              <div key={n.id} className="flex items-start gap-3 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                <Megaphone size={15} className="text-red-500 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-red-500">{n.title}</p>
                  {n.body && <p className="text-xs text-red-500/80 mt-0.5">{n.body}</p>}
                  <p className="text-xs text-muted-foreground/50 mt-1">por {n.createdBy} · {n.createdAt}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Role-based content */}
        {isAdmin ? <AdminDashboard /> : <EmployeeDashboard />}
      </div>
    </div>
  );
}
