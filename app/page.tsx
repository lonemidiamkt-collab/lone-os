"use client";

import Header from "@/components/Header";
import MetricCard from "@/components/MetricCard";
import MorningBriefing from "@/components/MorningBriefing";
import {
  Users, TrendingUp, AlertTriangle, UserPlus,
  Activity, Megaphone, Clock, Bell, Send, X,
  AlertCircle, ZapOff, LayoutList,
  CheckCircle, CheckCircle2, Palette, Instagram, BarChart2,
  Target, Zap, FileText, ChevronRight, Plus, Inbox,
} from "lucide-react";
import { getStatusLed, getStatusLabel } from "@/lib/utils";
import { useAppState } from "@/lib/context/AppStateContext";
import { useRole } from "@/lib/context/RoleContext";
import Link from "next/link";
import { useState, useMemo } from "react";
import type { ClientStatus } from "@/lib/types";
import { mockAdCampaigns } from "@/lib/mockData";

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
  const { addNotice, deleteNotice, notices } = useAppState();
  const { role, currentUser } = useRole();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    title: "", body: "", urgent: false, scheduledAt: "", category: "general" as "general" | "meeting" | "deadline" | "reminder",
  });

  const [formSuccess, setFormSuccess] = useState(false);

  const handleAdd = () => {
    if (!form.title.trim()) return;
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
              className="bg-muted rounded-lg px-2 py-1.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary flex-1 min-w-[160px]"
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
          <p className="text-xs text-zinc-600 text-center py-5">Nenhum aviso. Tudo sob controle.</p>
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
  const {
    clients, tasks, contentCards, designRequests, notices,
    trafficRoutineChecks, timeline,
  } = useAppState();
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
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
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
                <div className="w-10 h-10 rounded-xl bg-zinc-900/50 flex items-center justify-center mb-3">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-zinc-700"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                </div>
                <p className="text-xs text-zinc-600">Nenhuma tarefa pendente. Respire.</p>
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
            {myClients.filter((c) => c.status !== "onboarding").map((client) => (
              <Link
                key={client.id}
                href={`/clients/${client.id}`}
                className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors"
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
  const {
    clients, contentCards, tasks, designRequests,
    trafficRoutineChecks, timeline, updateTask,
  } = useAppState();
  const { role } = useRole();

  const [statusFilter, setStatusFilter] = useState<ClientStatus | "all">("all");

  const activeClients = clients.filter((c) => c.status !== "onboarding");
  const atRiskClients = clients.filter((c) => c.status === "at_risk");
  const onboardingClients = clients.filter((c) => c.status === "onboarding");
  const urgentTasks = tasks.filter((t) => t.priority === "critical" && t.status !== "done");

  const pipelineCards = contentCards.filter((c) => c.status !== "published");
  const publishedThisMonth = contentCards.filter((c) => c.status === "published").length;
  const stuckCards = pipelineCards.filter((c) => {
    const enteredAt = c.columnEnteredAt?.[c.status] ?? c.statusChangedAt;
    return hoursSince(enteredAt) >= 48;
  });
  const pendingApproval = contentCards.filter((c) => c.status === "approval" || c.status === "client_approval").length;

  const designQueued = designRequests.filter((r) => r.status === "queued").length;
  const designInProg = designRequests.filter((r) => r.status === "in_progress").length;

  const teamProductivity = useMemo(() => {
    const socialMembers = [...new Set(clients.map((c) => c.assignedSocial))];
    return socialMembers.map((name) => {
      const memberClients = clients.filter((c) => c.assignedSocial === name && c.status !== "onboarding");
      const memberCards = contentCards.filter((c) => c.socialMedia === name);
      const published = memberCards.filter((c) => c.status === "published").length;
      const inPipeline = memberCards.filter((c) => c.status !== "published").length;
      return { name, clientCount: memberClients.length, published, inPipeline };
    });
  }, [clients, contentCards]);

  const trafficProductivity = useMemo(() => {
    const managers = [...new Set(clients.map((c) => c.assignedTraffic))];
    const today = new Date().toISOString().slice(0, 10);
    return managers.map((name) => {
      const memberClients = clients.filter((c) => c.assignedTraffic === name && c.status !== "onboarding");
      const todayChecks = trafficRoutineChecks.filter((c) => c.date === today && c.completedBy === name);
      const supportDone = todayChecks.filter((c) => c.type === "support").length;
      return { name, clientCount: memberClients.length, supportDone, supportTotal: memberClients.length };
    });
  }, [clients, trafficRoutineChecks]);

  const inactivityAlerts = clients
    .filter((c) => c.status !== "onboarding")
    .map((c) => ({ client: c, hours: hoursSince(c.lastKanbanActivity) }))
    .filter((x) => x.hours >= 24)
    .sort((a, b) => b.hours - a.hours);

  const zeroPostClients = clients.filter(
    (c) => (c.postsThisMonth ?? 0) === 0 && c.status !== "onboarding"
  );

  const sevenDaysAgo = Date.now() - 7 * 86400000;
  const inactiveSevenDays = clients.filter((c) => {
    const noKanban = !c.lastKanbanActivity || new Date(c.lastKanbanActivity).getTime() < sevenDaysAgo;
    const noPost = !c.lastPostDate || new Date(c.lastPostDate).getTime() < sevenDaysAgo;
    return noKanban && noPost && c.status !== "onboarding";
  });

  const recentActivities = useMemo(() => {
    const allEntries: { clientId: string; actor: string; description: string; timestamp: string; type: string }[] = [];
    for (const [, entries] of Object.entries(timeline)) {
      entries.forEach((e) => allEntries.push(e));
    }
    return allEntries.sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 10);
  }, [timeline]);

  const tableClients = statusFilter === "all"
    ? clients
    : clients.filter((c) => c.status === statusFilter);

  return (
    <>
      {/* Metrics Row */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricCard icon={Users} label="Clientes Ativos" value={activeClients.length} sub="clientes em operacao" iconColor="text-primary" iconBg="bg-primary/10" href="/clients" />
        <MetricCard icon={AlertTriangle} label="Em Risco" value={atRiskClients.length} sub="precisam de atencao" iconColor="text-red-500" iconBg="bg-red-500/10" href="/clients?filter=at_risk" />
        <MetricCard icon={UserPlus} label="Onboarding" value={onboardingClients.length} sub="novos clientes" iconColor="text-primary" iconBg="bg-primary/10" href="/clients?filter=onboarding" />
        <MetricCard icon={Clock} label="Tarefas Urgentes" value={urgentTasks.length} sub="prioridade critica" iconColor="text-primary" iconBg="bg-primary/10" href="/my-work" />
      </div>

      {/* Quick Actions */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground mr-1">Ações rápidas:</span>
        <Link href="/calendar" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#0d4af5]/10 text-[#0d4af5] border border-[#0d4af5]/20 hover:bg-[#0d4af5]/20 hover:shadow-[0_0_12px_rgba(10,52,245,0.15)] transition-all">
          <Plus size={12} /> Nova Tarefa
        </Link>
        <Link href="/social" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/5 text-foreground border border-white/10 hover:bg-white/10 transition-all">
          <FileText size={12} /> Novo Card
        </Link>
        <Link href="/my-work" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/5 text-foreground border border-white/10 hover:bg-white/10 transition-all">
          <Inbox size={12} /> Meu Trabalho
        </Link>
        <span className="ml-auto text-[10px] text-zinc-700">⌘K para buscar</span>
      </div>

      {/* Ad Rejection Alert */}
      {mockAdCampaigns.filter((c) => c.status === "error").length > 0 && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 kpi-danger animate-fade-in">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-red-500/15 flex items-center justify-center shrink-0">
              <AlertCircle size={18} className="text-red-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h4 className="text-sm font-bold text-red-400">Anúncios Rejeitados / com Erro</h4>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/20 font-bold">
                  {mockAdCampaigns.filter((c) => c.status === "error").length}
                </span>
              </div>
              <div className="space-y-1.5">
                {mockAdCampaigns.filter((c) => c.status === "error").map((camp) => (
                  <div key={camp.id} className="flex items-center gap-2 text-xs">
                    <ZapOff size={12} className="text-red-400 shrink-0" />
                    <span className="text-foreground font-medium">{camp.name}</span>
                    <span className="text-muted-foreground">·</span>
                    <span className="text-muted-foreground">{camp.clientName}</span>
                    <Link href="/traffic" className="text-[#0d4af5] hover:text-[#3b6ff5] font-medium ml-auto flex items-center gap-1">
                      Ver detalhes <ChevronRight size={11} />
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Morning Briefing (AI) — only for traffic/admin/manager */}
      {(role === "admin" || role === "manager" || role === "traffic") && (
        <MorningBriefing
          clients={clients.filter((c) => c.status !== "onboarding").map((c) => ({
            id: c.id,
            name: c.name,
            campaigns: mockAdCampaigns.filter((camp) => camp.clientId === c.id),
            totalSpend: mockAdCampaigns.filter((camp) => camp.clientId === c.id).reduce((s, camp) => s + camp.spend, 0),
            totalBudget: mockAdCampaigns.filter((camp) => camp.clientId === c.id).reduce((s, camp) => s + camp.totalBudget, 0),
          }))}
        />
      )}

      {/* Urgências do Dia */}
      {(pendingApproval > 0 || urgentTasks.length > 0 || stuckCards.length > 0 || atRiskClients.length > 0) && (
        <div className="rounded-xl border border-[#0d4af5]/20 bg-[#0d4af5]/[0.03] p-4 animate-fade-in">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-[#0d4af5]/15 flex items-center justify-center">
              <Zap size={14} className="text-[#0d4af5]" />
            </div>
            <h4 className="text-sm font-bold text-foreground">Urgências do Dia</h4>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            {pendingApproval > 0 && (
              <Link href="/social" className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-500/5 border border-amber-500/15 hover:border-amber-500/30 transition-all">
                <Clock size={13} className="text-amber-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-foreground">{pendingApproval} aguardando aprovação</p>
                  <p className="text-[10px] text-muted-foreground">posts sem validação</p>
                </div>
              </Link>
            )}
            {urgentTasks.length > 0 && (
              <Link href="/calendar" className="flex items-center gap-2 p-2.5 rounded-lg bg-red-500/5 border border-red-500/15 hover:border-red-500/30 transition-all">
                <AlertCircle size={13} className="text-red-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-foreground">{urgentTasks.length} tarefas críticas</p>
                  <p className="text-[10px] text-muted-foreground">prioridade máxima</p>
                </div>
              </Link>
            )}
            {stuckCards.length > 0 && (
              <Link href="/social" className="flex items-center gap-2 p-2.5 rounded-lg bg-orange-500/5 border border-orange-500/15 hover:border-orange-500/30 transition-all">
                <AlertTriangle size={13} className="text-orange-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-foreground">{stuckCards.length} cards parados</p>
                  <p className="text-[10px] text-muted-foreground">mais de 48h sem mover</p>
                </div>
              </Link>
            )}
            {atRiskClients.length > 0 && (
              <button onClick={() => setStatusFilter("at_risk")} className="flex items-center gap-2 p-2.5 rounded-lg bg-red-500/5 border border-red-500/15 hover:border-red-500/30 transition-all text-left">
                <Users size={13} className="text-red-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-foreground">{atRiskClients.length} clientes em risco</p>
                  <p className="text-[10px] text-muted-foreground">atenção imediata</p>
                </div>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Pipeline Quick Stats */}
      <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
        <Link href="/social" className="bg-card border border-border rounded-xl p-4 hover:border-[#0d4af5]/30 hover:shadow-[0_0_15px_rgba(10,52,245,0.08)] transition-all cursor-pointer">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Pipeline</p>
          <p className="text-xl font-bold text-foreground">{pipelineCards.length}</p>
          <p className="text-xs text-muted-foreground">cards em andamento</p>
        </Link>
        <Link href="/social" className="bg-card border border-border rounded-xl p-4 hover:border-[#0d4af5]/30 hover:shadow-[0_0_15px_rgba(10,52,245,0.08)] transition-all cursor-pointer">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Publicados</p>
          <p className="text-xl font-bold text-primary">{publishedThisMonth}</p>
          <p className="text-xs text-muted-foreground">este mês</p>
        </Link>
        <Link href="/social" className={`bg-card border rounded-xl p-4 hover:border-[#0d4af5]/30 hover:shadow-[0_0_15px_rgba(10,52,245,0.08)] transition-all cursor-pointer ${stuckCards.length > 0 ? "border-red-500/20" : "border-border"}`}>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Parados 48h+</p>
          <p className={`text-xl font-bold ${stuckCards.length > 0 ? "text-red-500" : "text-foreground"}`}>{stuckCards.length}</p>
          <p className="text-xs text-muted-foreground">SLA violado</p>
        </Link>
        <Link href="/social" className="bg-card border border-border rounded-xl p-4 hover:border-[#0d4af5]/30 hover:shadow-[0_0_15px_rgba(10,52,245,0.08)] transition-all cursor-pointer">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Aprovação</p>
          <p className="text-xl font-bold text-foreground">{pendingApproval}</p>
          <p className="text-xs text-muted-foreground">aguardando review</p>
        </Link>
        <Link href="/design" className="bg-card border border-border rounded-xl p-4 hover:border-[#0d4af5]/30 hover:shadow-[0_0_15px_rgba(10,52,245,0.08)] transition-all cursor-pointer">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Design</p>
          <p className="text-xl font-bold text-foreground">{designQueued + designInProg}</p>
          <p className="text-xs text-muted-foreground">{designQueued} fila · {designInProg} produzindo</p>
        </Link>
      </div>

      {/* Bottlenecks */}
      {(() => {
        const statusCounts: Record<string, { count: number; clients: string[] }> = {};
        const statusLabels: Record<string, string> = {
          ideas: "Ideias", script: "Roteiro", in_production: "Em Produção",
          approval: "Aprovação Interna", client_approval: "Aprovação do Cliente", scheduled: "Agendado",
        };
        contentCards.filter((c) => c.status !== "published").forEach((c) => {
          if (!statusCounts[c.status]) statusCounts[c.status] = { count: 0, clients: [] };
          statusCounts[c.status].count++;
          if (!statusCounts[c.status].clients.includes(c.clientName)) {
            statusCounts[c.status].clients.push(c.clientName);
          }
        });
        const bottlenecks = Object.entries(statusCounts).filter(([, v]) => v.count >= 2).sort((a, b) => b[1].count - a[1].count);
        if (bottlenecks.length === 0) return null;
        return (
          <div className="card border border-[#1e1e2a]">
            <div className="flex items-center gap-2 mb-3">
              <LayoutList size={16} className="text-zinc-400" />
              <h3 className="font-semibold text-foreground text-sm">Gargalos da Semana</h3>
              <span className="text-xs text-zinc-400 bg-[#111118]/50 px-2 py-0.5 rounded-full border border-[#1e1e2a]">
                {bottlenecks.length} gargalo{bottlenecks.length > 1 ? "s" : ""}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {bottlenecks.map(([status, data]) => (
                <Link
                  key={status}
                  href={status === "in_production" || status === "ideas" || status === "script" ? "/social" : status === "approval" || status === "client_approval" ? "/social" : "/social"}
                  className="flex items-start gap-3 bg-[#0c0c12] border border-[#1e1e2a] rounded-lg p-3 hover:border-primary/30 transition-colors group"
                >
                  <div className="w-8 h-8 rounded-lg bg-[#111118] flex items-center justify-center shrink-0">
                    <span className="text-sm font-bold text-zinc-400">{data.count}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-zinc-300">{statusLabels[status] ?? status}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{data.count} itens parados</p>
                    <p className="text-xs text-muted-foreground mt-1 truncate">
                      {data.clients.slice(0, 3).join(", ")}{data.clients.length > 3 ? ` +${data.clients.length - 3}` : ""}
                    </p>
                  </div>
                  <ChevronRight size={14} className="text-muted-foreground/30 group-hover:text-primary shrink-0 mt-1 transition-colors" />
                </Link>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Team Productivity */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="card">
          <h3 className="font-semibold text-foreground flex items-center gap-2 mb-3 text-sm">
            <Instagram size={15} className="text-primary" />
            Equipe Social
          </h3>
          <div className="space-y-2">
            {teamProductivity.map((m) => (
              <div key={m.name} className="flex items-center gap-3 p-2.5 bg-muted/30 rounded-lg">
                <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                  <span className="text-[10px] font-bold text-primary">{m.name.split(" ").map((n) => n[0]).join("")}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground">{m.name}</p>
                  <p className="text-[10px] text-muted-foreground">{m.clientCount} clientes</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-primary font-bold">{m.published}</p>
                  <p className="text-[10px] text-muted-foreground">publicados</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-foreground font-bold">{m.inPipeline}</p>
                  <p className="text-[10px] text-muted-foreground">pipeline</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <h3 className="font-semibold text-foreground flex items-center gap-2 mb-3 text-sm">
            <TrendingUp size={15} className="text-primary" />
            Equipe Tráfego
          </h3>
          <div className="space-y-2">
            {trafficProductivity.map((m) => (
              <div key={m.name} className="flex items-center gap-3 p-2.5 bg-muted/30 rounded-lg">
                <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                  <span className="text-[10px] font-bold text-primary">{m.name.split(" ").map((n) => n[0]).join("")}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground">{m.name}</p>
                  <p className="text-[10px] text-muted-foreground">{m.clientCount} clientes</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-bold text-foreground">{m.supportDone}/{m.supportTotal}</p>
                  <p className="text-[10px] text-muted-foreground">suporte hoje</p>
                </div>
                <div className="w-16">
                  <div className="h-1.5 bg-[#111118] rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${m.supportDone >= m.supportTotal ? "bg-primary" : "bg-zinc-500"}`}
                      style={{ width: `${m.supportTotal > 0 ? Math.round((m.supportDone / m.supportTotal) * 100) : 0}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <Activity size={16} className="text-primary" />
              Feed de Atividades
            </h3>
            <span className="text-xs text-muted-foreground">Tempo real</span>
          </div>
          <div className="space-y-3">
            {recentActivities.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">Nenhuma atividade recente.</p>
            )}
            {recentActivities.map((entry, i) => (
              <div key={`${entry.timestamp}-${i}`} className="flex items-start gap-3 py-3 border-b border-border last:border-0">
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                  <span className="text-xs font-bold text-primary">
                    {entry.actor.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground">
                    <span className="font-medium">{entry.actor}</span>{" "}
                    <span className="text-muted-foreground">{entry.description}</span>
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">{entry.timestamp}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          {/* Alert Feed */}
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <Bell size={15} className="text-zinc-400" />
                Feed de Alertas
              </h3>
              {inactivityAlerts.length > 0 && (
                <span className="text-xs bg-red-500/10 text-red-500 px-2 py-0.5 rounded-full border border-red-500/20">
                  {inactivityAlerts.length}
                </span>
              )}
            </div>
            <div className="space-y-2 max-h-52 overflow-auto">
              {inactivityAlerts.length === 0 && zeroPostClients.length === 0 && (
                <p className="text-xs text-muted-foreground/50 text-center py-4">Nenhum alerta no momento</p>
              )}
              {inactivityAlerts.map(({ client, hours }) => (
                <Link key={client.id} href={`/clients/${client.id}`} className={`flex items-center gap-2 p-2 rounded-lg hover:border-primary/30 transition-colors group ${
                  hours >= 48 ? "bg-red-500/10 border border-red-500/20" : "bg-[#0e0e14] border border-[#1e1e2a]"
                }`}>
                  {hours >= 48
                    ? <AlertCircle size={12} className="text-red-500 shrink-0" />
                    : <Clock size={12} className="text-zinc-400 shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-medium truncate ${hours >= 48 ? "text-red-500" : "text-zinc-300"}`}>
                      {client.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {Math.floor(hours)}h sem movimentação
                    </p>
                  </div>
                  <ChevronRight size={12} className="text-muted-foreground/30 group-hover:text-primary shrink-0 transition-colors" />
                </Link>
              ))}
              {zeroPostClients.map((client) => (
                <div key={`zp-${client.id}`} className="flex items-center gap-2 p-2 rounded-lg bg-[#0e0e14] border border-[#1e1e2a]">
                  <ZapOff size={12} className="text-zinc-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-zinc-300 truncate">{client.name}</p>
                    <p className="text-xs text-zinc-400">0 posts este mês</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Notices */}
          <NoticeFormBlock />

          {/* Urgent Tasks */}
          <div className="card">
            <h3 className="font-semibold text-foreground flex items-center gap-2 mb-3">
              <AlertTriangle size={15} className="text-zinc-400" />
              Tarefas Urgentes
            </h3>
            <div className="space-y-2">
              {tasks.filter((t) => ["critical", "high"].includes(t.priority) && t.status !== "done").slice(0, 5).map((task) => (
                <div key={task.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted transition-colors group">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${task.priority === "critical" ? "bg-red-500" : "bg-zinc-500"}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-foreground leading-tight">{task.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{task.clientName} · {task.assignedTo}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    {task.status === "pending" && (
                      <button onClick={() => updateTask(task.id, { status: "in_progress" })} className="text-[10px] px-2 py-0.5 rounded bg-primary/15 text-primary hover:bg-primary/25">Iniciar</button>
                    )}
                    {task.status === "in_progress" && (
                      <button onClick={() => updateTask(task.id, { status: "done" })} className="text-[10px] px-2 py-0.5 rounded bg-[#0d4af5]/15 text-[#0d4af5] hover:bg-[#0d4af5]/25">Concluir</button>
                    )}
                    <Link href={`/clients/${task.clientId}`} className="text-[10px] px-2 py-0.5 rounded bg-muted text-muted-foreground hover:text-foreground">
                      <ChevronRight size={10} />
                    </Link>
                  </div>
                </div>
              ))}
              {tasks.filter((t) => ["critical", "high"].includes(t.priority) && t.status !== "done").length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-2">Nenhuma tarefa urgente</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 7-day report */}
      {inactiveSevenDays.length > 0 && (
        <div className="card border border-[#1e1e2a]">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={15} className="text-zinc-400" />
            <h3 className="font-semibold text-foreground text-sm">
              Relatório 7 Dias — {inactiveSevenDays.length} cliente(s) sem qualquer interação
            </h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {inactiveSevenDays.map((c) => (
              <Link
                key={c.id}
                href={`/clients/${c.id}`}
                className="flex items-center gap-2 bg-[#0e0e14] border border-[#1e1e2a] rounded-lg px-3 py-2 hover:border-zinc-600 transition-colors"
              >
                <span className="w-2 h-2 rounded-full bg-zinc-500" />
                <span className="text-sm text-zinc-300">{c.name}</span>
                <span className="text-xs text-zinc-400">{c.industry}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Client Status Table */}
      <div className="card">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h3 className="font-semibold text-foreground">Status dos Clientes</h3>
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              {STATUS_FILTER_CONFIG.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setStatusFilter(f.key as ClientStatus | "all")}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                    statusFilter === f.key
                      ? "bg-primary/20 text-primary border border-primary/30"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                >
                  {f.label}
                  <span className="ml-1 text-muted-foreground/50">
                    ({f.key === "all" ? clients.length : clients.filter((c) => c.status === f.key).length})
                  </span>
                </button>
              ))}
            </div>
            <Link href="/clients" className="text-xs text-primary hover:underline">Ver todos</Link>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2.5 px-3 text-muted-foreground font-medium text-xs">Cliente</th>
                <th className="text-left py-2.5 px-3 text-muted-foreground font-medium text-xs">Status</th>
                <th className="text-left py-2.5 px-3 text-muted-foreground font-medium text-xs">Posts/Mês</th>
                <th className="text-left py-2.5 px-3 text-muted-foreground font-medium text-xs">Responsáveis</th>
              </tr>
            </thead>
            <tbody>
              {tableClients.map((client) => {
                const posts = client.postsThisMonth ?? 0;
                const goal = client.postsGoal ?? 12;
                const pct = Math.min(100, Math.round((posts / goal) * 100));
                return (
                  <tr key={client.id} className="border-b border-border/50 hover:bg-muted/50 transition-colors">
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2.5">
                        <div className={`${getStatusLed(client.status)}`} />
                        <Link href={`/clients/${client.id}`} className="font-medium text-foreground hover:text-primary transition-colors">
                          {client.name}
                        </Link>
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <span className="text-xs text-muted-foreground">{getStatusLabel(client.status)}</span>
                    </td>
                    <td className="py-3 px-3">
                      {client.status !== "onboarding" && (
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1 bg-[#0a0a10] rounded-full overflow-hidden">
                            <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs text-muted-foreground">{posts}/{goal}</span>
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-3 text-muted-foreground text-xs">{client.assignedTraffic}, {client.assignedSocial}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// ── Main Dashboard Page ──
export default function DashboardPage() {
  const { role, currentUser } = useRole();
  const { notices } = useAppState();

  const isAdmin = role === "admin" || role === "manager";

  return (
    <div className="flex flex-col flex-1 overflow-auto">
      <Header
        title="Dashboard"
        subtitle={isAdmin ? "Visão 360° da operação" : `Painel de ${currentUser.split(" ")[0]}`}
      />

      <div className="p-6 space-y-6 animate-fade-in">
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
