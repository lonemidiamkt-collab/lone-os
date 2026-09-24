"use client";

import Header from "@/components/Header";
import MetricCard from "@/components/MetricCard";
import {
  Users, AlertTriangle, UserPlus,
  Activity, Check, CheckCircle, Palette, Instagram,
  Target, Zap, FileText, ChevronRight, Plus, Inbox,
} from "lucide-react";
import { toast } from "sonner";
import { getStatusLed, getStatusLabel, todaySP, spDateStr } from "@/lib/utils";
import { useClientsStore } from "@/stores/useClientsStore";
import { useContentStore } from "@/stores/useContentStore";
import { useOperationalStore } from "@/stores/useOperationalStore";
import { useTrafficStore } from "@/stores/useTrafficStore";
import { useRole } from "@/lib/context/RoleContext";
import DashboardInsights from "@/components/DashboardInsights";
import SectionHeader from "@/components/ui/SectionHeader";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useMemo, useEffect } from "react";
import type { ClientStatus, ContentCard } from "@/lib/types";
import { supabase } from "@/lib/supabase/client";
import { emOperacao } from "@/lib/clients/operacao";
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
import PostCounter from "@/components/sector/PostCounter";
import DesignQueue from "@/components/sector/DesignQueue";
import DesignDeliveriesAlert from "@/components/DesignDeliveriesAlert";
import SmartAlerts from "@/components/SmartAlerts";
import SystemAlertBanner from "@/components/SystemAlertBanner";
import ClientHealthRadar from "@/components/ClientHealthRadar";
import PlatformUpdatesWidget from "@/components/PlatformUpdatesWidget";


// Publicado no mês corrente (SP) — antes contava o acumulado de sempre como "este mês".
function publicadoNoMes(c: ContentCard): boolean {
  if (c.status !== "published") return false;
  const quando = c.publishVerifiedAt ?? c.statusChangedAt;
  return !!quando && spDateStr(quando).slice(0, 7) === todaySP().slice(0, 7);
}

// O que não carregou. Falha de carga nunca pode aparecer como zero de verdade.
interface Falhas { clientes: boolean; tarefas: boolean; conteudo: boolean }

// ── Employee Dashboard (Traffic/Social/Designer) ──
function EmployeeDashboard({ falhas }: { falhas: Falhas }) {
  const clients = useClientsStore((s) => s.clients);
  const opsPronto = useOperationalStore((s) => s.initialized);
  const contentCards = useContentStore((s) => s.contentCards);
  const designRequests = useContentStore((s) => s.designRequests);
  const tasks = useOperationalStore((s) => s.tasks);
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
    // Sem tarefa atribuída = sem dado, não 0% vermelho.
    const rate: number | null = total > 0 ? Math.round((done / total) * 100) : null;

    let published = 0;
    let inPipeline = 0;
    if (role === "social") {
      published = contentCards.filter((c) => c.socialMedia === currentUser && publicadoNoMes(c)).length;
      inPipeline = contentCards.filter((c) => c.socialMedia === currentUser && c.status !== "published").length;
    }

    let supportDone = 0;
    let supportTotal = 0;
    if (role === "traffic") {
      const today = todaySP();
      const memberClients = clients.filter((c) => c.assignedTraffic === currentUser && emOperacao(c));
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
      <div className="bg-gradient-to-r from-primary/10 to-transparent border border-primary/20 rounded-2xl p-5">
        <h2 className="text-lg font-bold text-foreground">
          {greeting}, {currentUser.split(" ")[0]}!
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          {role === "traffic" && `Você tem ${myClients.filter(emOperacao).length} clientes e ${myTasks.length} tarefas pendentes.`}
          {role === "social" && `Você tem ${myCards.filter((c) => c.status !== "published").length} cards no pipeline e ${myTasks.length} tarefas pendentes.`}
          {role === "designer" && `Você tem ${myDesignRequests.length} pedidos de design na fila e ${myTasks.length} tarefas pendentes.`}
        </p>
      </div>

      {/* Quick metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        <MetricCard
          icon={Target}
          label="Tarefas Pendentes"
          value={opsPronto ? myTasks.length : "—"}
          sub={`${myCompletedTasks.length} concluídas`}
          iconColor="text-primary"
          iconBg="bg-primary/10"
          href="/calendar"
        />
        <MetricCard
          icon={CheckCircle}
          label="Taxa de Conclusão"
          value={performance.rate === null ? "—" : `${performance.rate}%`}
          sub={performance.rate === null ? "sem tarefas atribuídas" : `${performance.done}/${performance.total} tarefas`}
          iconColor={performance.rate === null || performance.rate >= 50 ? "text-primary" : "text-lone-danger"}
          iconBg={performance.rate === null || performance.rate >= 50 ? "bg-primary/10" : "bg-lone-danger-bg"}
          href="/calendar"
        />
        {role === "social" && (
          <>
            <MetricCard icon={Instagram} label="Publicados" value={performance.published} sub="este mês" iconColor="text-primary" iconBg="bg-primary/10" href="/social" />
            <MetricCard icon={FileText} label="No Pipeline" value={performance.inPipeline} sub="cards em andamento" iconColor="text-primary" iconBg="bg-primary/10" href="/social" />
          </>
        )}
        {role === "traffic" && (
          <>
            <MetricCard icon={Users} label="Meus Clientes" value={myClients.filter(emOperacao).length} sub="em operação" iconColor="text-primary" iconBg="bg-primary/10" href="/clients" />
            <MetricCard
              icon={Zap}
              label="Suporte Hoje"
              value={`${performance.supportDone}/${performance.supportTotal}`}
              sub="check-ins feitos"
              iconColor={performance.supportDone >= performance.supportTotal ? "text-primary" : "text-primary"}
              iconBg={performance.supportDone >= performance.supportTotal ? "bg-primary/10" : "bg-primary/10"}
              href="/traffic"
            />
          </>
        )}
        {role === "designer" && (
          <>
            <MetricCard icon={Palette} label="Na Fila" value={myDesignRequests.filter((r) => r.status === "queued").length} sub="pedidos aguardando" iconColor="text-primary" iconBg="bg-primary/10" href="/design" />
            <MetricCard icon={Activity} label="Em Produção" value={myDesignRequests.filter((r) => r.status === "in_progress").length} sub="fazendo agora" iconColor="text-primary" iconBg="bg-primary/10" href="/design" />
          </>
        )}
      </div>

      {/* Sector-specific widgets */}
      {role === "social" && (
        <DesignDeliveriesAlert cards={contentCards.filter((c) => c.socialMedia === currentUser)} />
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
            {!opsPronto && (
              <p className={`text-xs text-center py-8 ${falhas.tarefas ? "text-lone-danger" : "text-muted-foreground"}`}>
                {falhas.tarefas ? "Não consegui carregar suas tarefas. Recarregue a página." : "Carregando tarefas…"}
              </p>
            )}
            {opsPronto && myTasks.length === 0 && (
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
                  task.priority === "critical" ? "bg-destructive" :
                  task.priority === "high" ? "bg-primary" :
                  task.priority === "medium" ? "bg-chart-2" : "bg-muted-foreground"
                }`} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground">{task.title}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] text-muted-foreground">{task.clientName}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                      task.status === "in_progress" ? "bg-primary/10 text-primary" :
                      task.status === "review" ? "bg-primary/10 text-primary" :
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
                {performance.rate !== null && (
                  <circle
                    cx="50" cy="50" r="40" fill="none"
                    stroke={performance.rate >= 80 ? "var(--lone-success)" : performance.rate >= 50 ? "var(--lone-warning)" : "var(--lone-danger)"}
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={`${performance.rate * 2.51} 251`}
                  />
                )}
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-xl font-black text-foreground">{performance.rate === null ? "—" : `${performance.rate}%`}</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {performance.rate === null ? "Sem tarefas atribuídas" : `${performance.done} de ${performance.total} tarefas concluídas`}
            </p>
          </div>

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
function AdminDashboard({ falhas }: { falhas: Falhas }) {
  const clients = useClientsStore((s) => s.clients);
  const clientesProntos = useClientsStore((s) => s.initialized);
  const opsPronto = useOperationalStore((s) => s.initialized);
  const contentCards = useContentStore((s) => s.contentCards);
  const designRequests = useContentStore((s) => s.designRequests);
  const tasks = useOperationalStore((s) => s.tasks);
  const updateTask = useOperationalStore((s) => s.updateTask);
  const trafficRoutineChecks = useTrafficStore((s) => s.trafficRoutineChecks);
  const router = useRouter();

  const [statusFilter, setStatusFilter] = useState<ClientStatus | "all">("all");
  const [contractStats, setContractStats] = useState({ active: 0, pending: 0, expiring: 0 });
  const [contratosErro, setContratosErro] = useState(false);

  useEffect(() => {
    let mounted = true;
    supabase.from("contracts").select("id, status, end_date").then(({ data, error }) => {
      if (!mounted) return;
      if (error || !data) { setContratosErro(true); return; }
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
    activeClients, atRiskClients, onboardingClients, onboardingEsquecidos, urgentTasks,
    pipelineCards, stuckCards, pendingApproval,
    designQueued, designInProg, teamProductivity: teamProductivityTotal, trafficProductivity,
    inactiveSevenDays,
  } = useMemo(
    () => getDashboardData({ clients, contentCards, designRequests, tasks, trafficRoutineChecks }),
    [clients, contentCards, designRequests, tasks, trafficRoutineChecks]
  );
  // "Publicados" = mês corrente de verdade (o helper conta o acumulado).
  const publishedThisMonth = useMemo(() => contentCards.filter(publicadoNoMes).length, [contentCards]);
  const teamProductivity = useMemo(
    () => teamProductivityTotal.map((m) => ({
      ...m,
      published: contentCards.filter((c) => c.socialMedia === m.name && publicadoNoMes(c)).length,
    })),
    [teamProductivityTotal, contentCards],
  );
  const kpi = (n: number, pronto: boolean) => (pronto ? n : "—");

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


  return (
    <>
      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        <KPICard label="Clientes Ativos" value={kpi(activeClients.length, clientesProntos)} caption={clientesProntos ? "em operação" : falhas.clientes ? "não carregou" : "carregando…"} tone="default" accent icon={<Users size={12} />} onClick={() => router.push("/clients")} />
        <KPICard label="Em Risco" value={kpi(atRiskClients.length, clientesProntos)} caption="precisam atenção" tone={atRiskClients.length > 0 ? "danger" : "default"} accent icon={<AlertTriangle size={12} />} onClick={() => router.push("/clients?filter=at_risk")} />
        <KPICard label="Onboarding" value={kpi(onboardingClients.length, clientesProntos)} caption="novos clientes" tone={onboardingClients.length > 0 ? "warning" : "default"} accent icon={<UserPlus size={12} />} onClick={() => router.push("/clients?filter=onboarding")} />
        <KPICard label="Tarefas Urgentes" value={kpi(urgentTasks.length, opsPronto)} caption={opsPronto ? "prioridade crítica" : falhas.tarefas ? "não carregou" : "carregando…"} tone={urgentTasks.length > 0 ? "warning" : "default"} accent icon={<Zap size={12} />} onClick={() => router.push("/my-work")} />
      </div>

      {/* Status parado no tempo: cliente marcado como "onboarding" que já opera há semanas. Some
          sozinho quando o time promover — não é alerta perpétuo. */}
      {onboardingEsquecidos.length > 0 && (
        <button
          onClick={() => router.push("/clients?filter=onboarding")}
          className="w-full text-left rounded-xl border border-lone-warning-border bg-lone-warning-bg px-4 py-3 hover:opacity-80 transition-colors"
        >
          <p className="text-xs font-semibold text-lone-warning mb-0.5">
            {onboardingEsquecidos.length} {onboardingEsquecidos.length === 1 ? "cliente segue" : "clientes seguem"} marcados como onboarding
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Já estão operando (grupo, anúncios ou posts) mas o cadastro nunca foi promovido:{" "}
            {onboardingEsquecidos.slice(0, 4).map((c) => c.name).join(", ")}
            {onboardingEsquecidos.length > 4 ? ` e mais ${onboardingEsquecidos.length - 4}` : ""}.
            Eles contam como ativos aqui — mas vale acertar o cadastro.
          </p>
        </button>
      )}

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
        <Link href="/clients/pending" className="block rounded-xl border border-lone-border bg-lone-brand-bg-soft p-4 hover:border-lone-border-strong transition-all group">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-lone-bg-card flex items-center justify-center">
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

      {/* Artes entregues pelo designer aguardando confirmação do social */}
      <DesignDeliveriesAlert cards={contentCards} />

      {/* Health Radar + Smart Alerts */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <ClientHealthRadar />
        <SmartAlerts />
      </div>

      {contratosErro && (
        <p className="rounded-xl border border-lone-danger-border bg-lone-danger-bg px-4 py-3 text-lone-caption text-lone-danger">
          Não consegui ler os contratos — o resumo e o aviso de vencimento ficaram de fora.
        </p>
      )}

      {/* Resumo de contratos — somente admin */}
      {(contractStats.active > 0 || contractStats.pending > 0 || contractStats.expiring > 0) && (
        <div className="rounded-xl border border-lone-border bg-lone-bg-card p-4">
          <p className="text-lone-eyebrow font-inter text-lone-text-tertiary mb-3 flex items-center gap-1.5 tracking-[1.5px]">
            <FileText size={11} aria-hidden="true" /> CONTRATOS
          </p>
          <div className="flex gap-6">
            <div>
              <p className="text-lone-h1 font-sans font-bold tabular-nums text-[var(--lone-success)]">{contractStats.active}</p>
              <p className="text-lone-caption font-inter text-lone-text-tertiary">Assinados</p>
            </div>
            <div>
              <p className="text-lone-h1 font-sans font-bold tabular-nums text-[var(--lone-warning)]">{contractStats.pending}</p>
              <p className="text-lone-caption font-inter text-lone-text-tertiary">Pendentes</p>
            </div>
            {contractStats.expiring > 0 && (
              <div>
                <p className="text-lone-h1 font-sans font-bold tabular-nums text-[var(--lone-danger)]">{contractStats.expiring}</p>
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

      {/* Tarefas Urgentes */}
      <div>
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
                    onClick={() => {
                      // O store desfaz a marcação se o servidor recusar; aqui a pessoa fica sabendo.
                      updateTask(task.id, { status: task.status === "done" ? "pending" : "done" })
                        .catch(() => toast.error(`Não consegui atualizar "${task.title}". Tente de novo.`));
                    }}
                    className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-all ${
                      task.status === "done"
                        ? "bg-lone-brand border-lone-brand text-primary-foreground"
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
              <p className={`text-lone-caption font-inter text-center py-4 ${falhas.tarefas ? "text-lone-danger" : "text-lone-text-tertiary"}`}>
                {!opsPronto ? (falhas.tarefas ? "Não consegui carregar as tarefas" : "Carregando…") : "Nenhuma tarefa urgente"}
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
  const conteudoFalhou = useContentStore((s) => s.loadError);
  const [falhasInit, setFalhasInit] = useState({ clientes: false, tarefas: false });
  const initClients = useClientsStore((s) => s.init);
  const initContent = useContentStore((s) => s.init);
  const initOps = useOperationalStore((s) => s.init);
  const initTraffic = useTrafficStore((s) => s.init);
  const subClients = useClientsStore((s) => s.subscribeRealtime);
  const subContent = useContentStore((s) => s.subscribeRealtime);
  const subOps = useOperationalStore((s) => s.subscribeRealtime);

  useEffect(() => {
    // Os stores de clientes e operação não têm flag de erro: init terminou sem "initialized" = falhou.
    initClients().then(() => {
      if (!useClientsStore.getState().initialized) setFalhasInit((f) => ({ ...f, clientes: true }));
    });
    initOps().then(() => {
      if (!useOperationalStore.getState().initialized) setFalhasInit((f) => ({ ...f, tarefas: true }));
    });
    initContent(); initTraffic();
    const u1 = subClients(); const u2 = subContent(); const u3 = subOps();
    return () => { u1(); u2(); u3(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const isAdmin = role === "admin" || role === "manager";
  const falhas: Falhas = { ...falhasInit, conteudo: conteudoFalhou };
  const oQueFalhou = [falhas.clientes && "clientes", falhas.tarefas && "tarefas", falhas.conteudo && "cards de conteúdo"].filter(Boolean).join(", ");
  useEffect(() => {
    if (oQueFalhou) toast.error(`Não consegui carregar: ${oQueFalhou}.`);
  }, [oQueFalhou]);

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
        {/* MetaHealthCard saiu do dashboard a pedido do Roberto: "essa parte de meta conectado não
            deveria estar". Ele vivia vermelho ("Problema detectado") sem haver problema — a regra
            considerava sync com mais de 2h como falha, e o sync roda 1×/dia às 6h. O componente
            continua existindo pra /settings; o alarme de token vencido chega por outro caminho. */}

        {oQueFalhou && (
          <div className="flex items-start gap-3 rounded-xl border border-lone-danger-border bg-lone-danger-bg px-4 py-3">
            <AlertTriangle size={15} className="text-lone-danger shrink-0 mt-0.5" />
            <p className="text-lone-body text-lone-danger">
              Não consegui carregar {oQueFalhou}. Os números abaixo estão incompletos — recarregue a página.
            </p>
          </div>
        )}

        {/* Insights acionáveis — o que precisa de atenção hoje (a rota filtra por papel) */}
        <div>
          <SectionHeader eyebrow="Operação" title="O que precisa de atenção" subtitle="O que resolver primeiro hoje — priorizado por urgência." />
          <DashboardInsights />
        </div>

        {/* Role-based content */}
        {isAdmin ? <AdminDashboard falhas={falhas} /> : <EmployeeDashboard falhas={falhas} />}
      </div>
    </div>
  );
}
