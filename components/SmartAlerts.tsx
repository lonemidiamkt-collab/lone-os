"use client";

import { useMemo } from "react";
import { useAppState } from "@/lib/context/AppStateContext";
import Link from "next/link";
import {
  AlertTriangle, Clock, FileText, Instagram,
  TrendingDown, UserX, Calendar, CheckCircle,
} from "lucide-react";

interface Alert {
  id: string;
  type: "danger" | "warning" | "info";
  icon: typeof AlertTriangle;
  title: string;
  detail: string;
  href: string;
  clientId?: string;
}

export default function SmartAlerts() {
  const { clients, contentCards, tasks, timeline } = useAppState();

  const alerts = useMemo<Alert[]>(() => {
    const result: Alert[] = [];
    const now = Date.now();
    const today = new Date().toISOString().slice(0, 10);

    for (const client of clients) {
      if (client.status === "onboarding" || client.draftStatus) continue;

      // No post in 5+ days
      if (client.lastPostDate) {
        const daysSince = Math.floor((now - new Date(client.lastPostDate).getTime()) / 86400000);
        if (daysSince >= 5) {
          result.push({
            id: `post-${client.id}`,
            type: daysSince >= 10 ? "danger" : "warning",
            icon: Instagram,
            title: `${client.nomeFantasia || client.name} sem post ha ${daysSince} dias`,
            detail: `Ultimo post: ${client.lastPostDate}`,
            href: `/clients/${client.id}`,
            clientId: client.id,
          });
        }
      }

      // Client at risk
      if (client.status === "at_risk") {
        result.push({
          id: `risk-${client.id}`,
          type: "danger",
          icon: UserX,
          title: `${client.nomeFantasia || client.name} em risco de churn`,
          detail: `Atencao: ${client.attentionLevel}`,
          href: `/clients/${client.id}`,
          clientId: client.id,
        });
      }

      // Contract expiring (if contract_end exists)
      if (client.contractEnd) {
        const daysUntil = Math.ceil((new Date(client.contractEnd).getTime() - now) / 86400000);
        if (daysUntil > 0 && daysUntil <= 30) {
          result.push({
            id: `contract-${client.id}`,
            type: daysUntil <= 15 ? "danger" : "warning",
            icon: FileText,
            title: `Contrato de ${client.nomeFantasia || client.name} vence em ${daysUntil} dias`,
            detail: `Vencimento: ${client.contractEnd}`,
            href: `/clients/${client.id}?tab=contratos`,
            clientId: client.id,
          });
        }
      }
    }

    // Overdue tasks
    const overdueTasks = tasks.filter((t) => t.dueDate && t.dueDate < today && t.status !== "done");
    for (const task of overdueTasks.slice(0, 3)) {
      result.push({
        id: `task-${task.id}`,
        type: "warning",
        icon: Clock,
        title: `Tarefa atrasada: ${task.title}`,
        detail: `Responsavel: ${task.assignedTo} — Prazo: ${task.dueDate}`,
        href: `/clients/${task.clientId}`,
      });
    }

    // Cards stuck in approval for 48h+
    const stuckCards = contentCards.filter((c) => {
      if (c.status !== "approval" && c.status !== "client_approval") return false;
      const changedAt = c.statusChangedAt || c.columnEnteredAt?.[c.status];
      if (!changedAt) return false;
      return (now - new Date(changedAt).getTime()) > 48 * 3600000;
    });
    for (const card of stuckCards.slice(0, 3)) {
      result.push({
        id: `stuck-${card.id}`,
        type: "warning",
        icon: Calendar,
        title: `Card parado em aprovacao: ${card.title}`,
        detail: `Cliente: ${card.clientName} — Responsavel: ${card.socialMedia}`,
        href: "/social",
      });
    }

    return result.sort((a, b) => {
      const order = { danger: 0, warning: 1, info: 2 };
      return order[a.type] - order[b.type];
    });
  }, [clients, contentCards, tasks]);

  if (alerts.length === 0) return null;

  const dangerCount = alerts.filter((a) => a.type === "danger").length;
  const warningCount = alerts.filter((a) => a.type === "warning").length;

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <AlertTriangle size={14} className="text-amber-400" />
          Alertas Inteligentes
        </h3>
        <div className="flex items-center gap-2">
          {dangerCount > 0 && <span className="text-[10px] px-2 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">{dangerCount} criticos</span>}
          {warningCount > 0 && <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">{warningCount} avisos</span>}
        </div>
      </div>

      <div className="space-y-1.5">
        {alerts.slice(0, 6).map((alert) => {
          const Icon = alert.icon;
          return (
            <Link key={alert.id} href={alert.href}
              className={`flex items-start gap-3 p-2.5 rounded-lg transition-colors hover:bg-muted/30 ${
                alert.type === "danger" ? "border-l-2 border-red-500" : alert.type === "warning" ? "border-l-2 border-amber-500" : ""
              }`}>
              <Icon size={13} className={`mt-0.5 shrink-0 ${
                alert.type === "danger" ? "text-red-400" : alert.type === "warning" ? "text-amber-400" : "text-zinc-400"
              }`} />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-foreground">{alert.title}</p>
                <p className="text-[10px] text-muted-foreground">{alert.detail}</p>
              </div>
            </Link>
          );
        })}
      </div>

      {alerts.length > 6 && (
        <p className="text-[10px] text-zinc-600 text-center">+{alerts.length - 6} alertas</p>
      )}
    </div>
  );
}
