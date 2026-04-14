"use client";

import { useMemo, useState } from "react";
import {
  Inbox, Check, Clock, AlertTriangle, FileText, Palette,
  TrendingUp, Instagram, ChevronRight, CheckCircle, Filter,
  Eye, Bell,
} from "lucide-react";
import { useAppState } from "@/lib/context/AppStateContext";
import { useRole } from "@/lib/context/RoleContext";
import { getPriorityColor, getPriorityLabel, formatTimeSpent, getLiveTimeSpentMs } from "@/lib/utils";
import Link from "next/link";
import type { Task, ContentCard, DesignRequest } from "@/lib/types";

type FilterType = "all" | "tasks" | "content" | "design" | "approvals";

export default function MyWorkPage() {
  const { tasks, contentCards, designRequests, notifications, markNotificationRead } = useAppState();
  const { role, currentUser } = useRole();
  const [filter, setFilter] = useState<FilterType>("all");

  const isAdmin = role === "admin" || role === "manager";
  const pSort = (a: { priority: string }, b: { priority: string }) => {
    const pOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    return (pOrder[a.priority] ?? 3) - (pOrder[b.priority] ?? 3);
  };

  // Tasks: Admin/Manager = ALL open tasks, Staff = only assigned to me
  const myTasks = useMemo(() =>
    tasks
      .filter((t) => t.status !== "done" && (isAdmin || t.assignedTo === currentUser))
      .sort(pSort),
    [tasks, currentUser, isAdmin]
  );

  // Content cards: Admin/Manager = ALL unpublished, Social = my assigned
  const myCards = useMemo(() =>
    contentCards
      .filter((c) => c.status !== "published" && (isAdmin || c.socialMedia === currentUser))
      .sort(pSort),
    [contentCards, currentUser, isAdmin]
  );

  // Design requests: Admin = all, Designer = all, Others = requested by me
  const myDesignReqs = useMemo(() =>
    designRequests.filter((r) => r.status !== "done" && (isAdmin || role === "designer" || r.requestedBy === currentUser)),
    [designRequests, currentUser, role, isAdmin]
  );

  // Approvals: Admin/Manager = all, Staff = my cards only
  const pendingApprovals = useMemo(() =>
    contentCards.filter((c) =>
      (c.status === "approval" || c.status === "client_approval") &&
      (isAdmin || c.socialMedia === currentUser)
    ),
    [contentCards, isAdmin, currentUser]
  );

  // Unread notifications
  const unreadNotifs = useMemo(() =>
    notifications.filter((n) => !n.read).slice(0, 5),
    [notifications]
  );

  const totalItems = myTasks.length + myCards.length + myDesignReqs.length + pendingApprovals.length;

  const FILTERS: { key: FilterType; label: string; count: number; icon: typeof Check }[] = [
    { key: "all", label: "Tudo", count: totalItems, icon: Inbox },
    { key: "tasks", label: "Tarefas", count: myTasks.length, icon: Check },
    { key: "content", label: "Conteúdo", count: myCards.length, icon: FileText },
    { key: "design", label: "Design", count: myDesignReqs.length, icon: Palette },
    { key: "approvals", label: "Aprovações", count: pendingApprovals.length, icon: Eye },
  ];

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
          <Inbox size={24} className="text-[#0d4af5]" />
          Meu Trabalho
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {isAdmin ? "Todas as tarefas da equipe" : `Tarefas de ${currentUser}`}
        </p>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {FILTERS.map((f) => {
          const Icon = f.icon;
          const active = filter === f.key;
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`p-3 rounded-xl border transition-all text-left ${
                active
                  ? "border-[#0d4af5]/30 bg-[#0d4af5]/[0.05] shadow-[0_0_15px_rgba(10,52,245,0.08)]"
                  : "border-border bg-card hover:border-[#0d4af5]/20"
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <Icon size={14} className={active ? "text-[#0d4af5]" : "text-muted-foreground"} />
                <span className={`text-xs font-medium ${active ? "text-[#0d4af5]" : "text-muted-foreground"}`}>{f.label}</span>
              </div>
              <p className={`text-xl font-bold ${active ? "text-[#0d4af5]" : "text-foreground"}`}>{f.count}</p>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6">
        {/* Main content */}
        <div className="space-y-4">
          {/* Tasks */}
          {(filter === "all" || filter === "tasks") && myTasks.length > 0 && (
            <div className="card">
              <h3 className="font-semibold text-foreground text-sm mb-3 flex items-center gap-2">
                <Check size={14} className="text-[#0d4af5]" />
                Minhas Tarefas ({myTasks.length})
              </h3>
              <div className="space-y-2">
                {myTasks.map((task) => (
                  <TaskRow key={task.id} task={task} />
                ))}
              </div>
            </div>
          )}

          {/* Content cards */}
          {(filter === "all" || filter === "content") && myCards.length > 0 && (
            <div className="card">
              <h3 className="font-semibold text-foreground text-sm mb-3 flex items-center gap-2">
                <FileText size={14} className="text-[#0d4af5]" />
                Meus Cards de Conteúdo ({myCards.length})
              </h3>
              <div className="space-y-2">
                {myCards.map((card) => (
                  <CardRow key={card.id} card={card} />
                ))}
              </div>
            </div>
          )}

          {/* Design requests */}
          {(filter === "all" || filter === "design") && myDesignReqs.length > 0 && (
            <div className="card">
              <h3 className="font-semibold text-foreground text-sm mb-3 flex items-center gap-2">
                <Palette size={14} className="text-[#0d4af5]" />
                Solicitações de Design ({myDesignReqs.length})
              </h3>
              <div className="space-y-2">
                {myDesignReqs.map((req) => (
                  <div key={req.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border/50 hover:border-[#0d4af5]/20 transition-all">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${
                      req.status === "queued" ? "bg-zinc-500" : req.status === "in_progress" ? "bg-[#0d4af5]" : "bg-emerald-500"
                    }`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{req.title}</p>
                      <p className="text-[10px] text-muted-foreground">{req.clientName} · {req.format}</p>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${
                      req.status === "queued" ? "text-zinc-400 bg-zinc-500/10 border-zinc-500/20" :
                      req.status === "in_progress" ? "text-[#0d4af5] bg-[#0d4af5]/10 border-[#0d4af5]/20" :
                      "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
                    }`}>
                      {req.status === "queued" ? "Na fila" : req.status === "in_progress" ? "Em progresso" : "Concluído"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pending approvals */}
          {(filter === "all" || filter === "approvals") && pendingApprovals.length > 0 && (
            <div className="card">
              <h3 className="font-semibold text-foreground text-sm mb-3 flex items-center gap-2">
                <Eye size={14} className="text-amber-400" />
                Aguardando Aprovação ({pendingApprovals.length})
              </h3>
              <div className="space-y-2">
                {pendingApprovals.map((card) => (
                  <CardRow key={card.id} card={card} isApproval />
                ))}
              </div>
            </div>
          )}

          {/* Empty state */}
          {totalItems === 0 && (
            <div className="card text-center py-16">
              <CheckCircle size={40} className="mx-auto text-[#0d4af5]/30 mb-3" />
              <p className="text-foreground font-medium">Tudo em dia!</p>
              <p className="text-sm text-muted-foreground mt-1">Nenhuma tarefa ou card pendente no momento.</p>
            </div>
          )}
        </div>

        {/* Sidebar — Recent notifications */}
        <div className="space-y-4">
          <div className="card">
            <h3 className="font-semibold text-foreground text-sm mb-3 flex items-center gap-2">
              <Bell size={14} className="text-[#0d4af5]" />
              Notificações Recentes
            </h3>
            {unreadNotifs.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhuma notificação não lida.</p>
            ) : (
              <div className="space-y-2">
                {unreadNotifs.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => markNotificationRead(n.id)}
                    className="w-full text-left p-2.5 rounded-lg bg-[#0d4af5]/[0.03] border border-[#0d4af5]/10 hover:border-[#0d4af5]/30 transition-all"
                  >
                    <p className="text-[11px] font-medium text-foreground leading-tight">{n.title}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Quick links */}
          <div className="card">
            <h3 className="font-semibold text-foreground text-sm mb-3">Acesso Rápido</h3>
            <div className="space-y-1">
              {[
                { href: "/calendar", label: "Calendário", icon: Clock },
                { href: "/social", label: "Social Media", icon: Instagram },
                { href: "/traffic", label: "Tráfego", icon: TrendingUp },
                { href: "/design", label: "Designer", icon: Palette },
              ].map((link) => {
                const Icon = link.icon;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all"
                  >
                    <Icon size={13} />
                    {link.label}
                    <ChevronRight size={11} className="ml-auto" />
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TaskRow({ task }: { task: Task }) {
  const { updateTask } = useAppState();
  const statusConfig: Record<string, { label: string; color: string }> = {
    pending: { label: "Aguardando", color: "text-zinc-400 bg-zinc-500/10 border-zinc-500/20" },
    in_progress: { label: "Em Execucao", color: "text-[#0d4af5] bg-[#0d4af5]/10 border-[#0d4af5]/20" },
    review: { label: "Validacao", color: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
    done: { label: "Entregue", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
  };
  const s = statusConfig[task.status] ?? statusConfig.pending;
  const timeMs = getLiveTimeSpentMs(task.workStartedAt, task.totalTimeSpentMs);
  const isDone = task.status === "done";
  const route = task.role === "social" ? "/social" : task.role === "designer" ? "/design" : "/traffic";

  return (
    <Link href={route} className={`flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border/50 hover:border-[#0d4af5]/20 transition-all cursor-pointer ${isDone ? "opacity-50" : ""}`}>
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); updateTask(task.id, { status: isDone ? "pending" : "done" }); }}
        className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-all ${
          isDone ? "bg-[#0d4af5] border-[#0d4af5] text-white" : "border-zinc-600 hover:border-[#0d4af5]"
        }`}
        title={isDone ? "Reabrir" : "Concluir"}
      >
        {isDone && <Check size={10} />}
      </button>
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-medium text-foreground truncate ${isDone ? "line-through text-zinc-500" : ""}`}>{task.title}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[10px] text-muted-foreground">{task.clientName}</span>
          {task.dueDate && (
            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
              <Clock size={9} /> {task.dueDate}
            </span>
          )}
          {timeMs > 0 && (
            <span className="text-[10px] text-zinc-600">{formatTimeSpent(timeMs)}</span>
          )}
        </div>
      </div>
      <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium shrink-0 ${s.color}`}>
        {s.label}
      </span>
      <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium shrink-0 ${getPriorityColor(task.priority)}`}>
        {getPriorityLabel(task.priority)}
      </span>
      <ChevronRight size={12} className="text-zinc-700 shrink-0" />
    </Link>
  );
}

function CardRow({ card, isApproval }: { card: ContentCard; isApproval?: boolean }) {
  const STATUS_LABELS: Record<string, string> = {
    ideas: "Ideia", script: "Roteiro", in_production: "Produção",
    approval: "Aprovação", client_approval: "Aprov. Cliente",
    scheduled: "Agendado", published: "Publicado",
  };

  return (
    <Link href="/social" className={`flex items-center gap-3 p-3 rounded-lg border transition-all cursor-pointer ${
      isApproval
        ? "bg-amber-500/[0.03] border-amber-500/20 hover:border-amber-500/40"
        : "bg-muted/30 border-border/50 hover:border-[#0d4af5]/20"
    }`}>
      {card.imageUrl && card.imageUrl.includes("http") ? (
        <div className="w-10 h-10 rounded-lg overflow-hidden bg-muted shrink-0">
          <img src={card.imageUrl} alt="" className="w-full h-full object-cover" />
        </div>
      ) : (
        <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
          <FileText size={14} className="text-muted-foreground" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-foreground truncate">{card.title}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[10px] text-muted-foreground">{card.clientName}</span>
          <span className="text-[10px] text-muted-foreground">· {card.format}</span>
          {card.dueDate && (
            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
              <Clock size={9} /> {card.dueDate}
            </span>
          )}
        </div>
      </div>
      <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium shrink-0 ${
        isApproval ? "text-amber-400 bg-amber-500/10 border-amber-500/20" :
        "text-muted-foreground bg-muted border-border"
      }`}>
        {STATUS_LABELS[card.status] ?? card.status}
      </span>
      <ChevronRight size={12} className="text-zinc-700 shrink-0" />
    </Link>
  );
}
