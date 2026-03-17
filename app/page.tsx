"use client";

import Header from "@/components/Header";
import MetricCard from "@/components/MetricCard";
import {
  Users, TrendingUp, AlertTriangle, UserPlus,
  Activity, Megaphone, Clock, Bell, Send, X,
  Flame, AlertCircle, ZapOff, CheckCircle2,
} from "lucide-react";
import { mockActivities, mockTasks } from "@/lib/mockData";
import { getAttentionColor, getAttentionLabel, getStatusColor, getStatusLabel } from "@/lib/utils";
import { useAppState } from "@/lib/context/AppStateContext";
import { useRole } from "@/lib/context/RoleContext";
import Link from "next/link";
import { useState } from "react";
import type { ClientStatus } from "@/lib/types";

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

export default function DashboardPage() {
  const { clients, notices, addNotice, contentCards } = useAppState();
  const { role, currentUser } = useRole();

  const [statusFilter, setStatusFilter] = useState<ClientStatus | "all">("all");
  const [noticeForm, setNoticeForm] = useState({ title: "", body: "", urgent: false });
  const [showNoticeForm, setShowNoticeForm] = useState(false);

  const activeClients = clients.filter((c) => c.status !== "onboarding").length;
  const atRiskClients = clients.filter((c) => c.status === "at_risk").length;
  const onboardingClients = clients.filter((c) => c.status === "onboarding").length;
  const urgentTasks = mockTasks.filter((t) => t.priority === "critical" && t.status !== "done").length;

  // Alert feed
  const inactivityAlerts = clients
    .filter((c) => c.status !== "onboarding")
    .map((c) => ({ client: c, hours: hoursSince(c.lastKanbanActivity) }))
    .filter((x) => x.hours >= 24)
    .sort((a, b) => b.hours - a.hours);

  const zeroPostClients = clients.filter(
    (c) => (c.postsThisMonth ?? 0) === 0 && c.status !== "onboarding"
  );

  // 7-day zero-activity report
  const sevenDaysAgo = Date.now() - 7 * 86400000;
  const inactiveSevenDays = clients.filter((c) => {
    const noKanban = !c.lastKanbanActivity || new Date(c.lastKanbanActivity).getTime() < sevenDaysAgo;
    const noPost = !c.lastPostDate || new Date(c.lastPostDate).getTime() < sevenDaysAgo;
    return noKanban && noPost && c.status !== "onboarding";
  });

  // Filtered clients for table
  const tableClients = statusFilter === "all"
    ? clients
    : clients.filter((c) => c.status === statusFilter);

  const handleAddNotice = () => {
    if (!noticeForm.title.trim()) return;
    addNotice({ ...noticeForm, createdBy: currentUser });
    setNoticeForm({ title: "", body: "", urgent: false });
    setShowNoticeForm(false);
  };

  return (
    <div className="flex flex-col flex-1 overflow-auto">
      <Header title="Dashboard" subtitle="Visão 360° da operação" />

      <div className="p-6 space-y-6 animate-fade-in">

        {/* CEO Broadcast Banner */}
        {notices.length > 0 && (
          <div className="space-y-2">
            {notices.filter((n) => n.urgent).slice(0, 2).map((n) => (
              <div key={n.id} className="flex items-start gap-3 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
                <Megaphone size={15} className="text-red-400 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-red-300">{n.title}</p>
                  {n.body && <p className="text-xs text-red-400/80 mt-0.5">{n.body}</p>}
                  <p className="text-xs text-gray-600 mt-1">por {n.createdBy} · {n.createdAt}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Metrics Row */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <MetricCard icon={Users} label="Clientes Ativos" value={activeClients} sub="total na base" iconColor="text-green-400" iconBg="bg-green-500/20" />
          <MetricCard icon={AlertTriangle} label="Em Risco (Churn)" value={atRiskClients} sub="precisam de atenção" iconColor="text-red-400" iconBg="bg-red-500/20" />
          <MetricCard icon={UserPlus} label="Em Onboarding" value={onboardingClients} sub="novos clientes" iconColor="text-blue-400" iconBg="bg-blue-500/20" />
          <MetricCard icon={Clock} label="Tarefas Urgentes" value={urgentTasks} sub="prioridade crítica" iconColor="text-orange-400" iconBg="bg-orange-500/20" />
        </div>

        {/* Main grid */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Activity Feed */}
          <div className="xl:col-span-2 card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-white flex items-center gap-2">
                <Activity size={16} className="text-brand-light" />
                Feed de Atividades
              </h3>
              <span className="text-xs text-gray-500">Hoje</span>
            </div>
            <div className="space-y-3">
              {mockActivities.map((activity) => (
                <div key={activity.id} className="flex items-start gap-3 py-3 border-b border-surface-border last:border-0">
                  <div className="w-8 h-8 rounded-full bg-brand/20 flex items-center justify-center shrink-0">
                    <span className="text-xs font-bold text-brand-light">
                      {activity.user.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-200">
                      <span className="font-medium text-white">{activity.user}</span>{" "}
                      {activity.action}{" "}
                      <span className="text-brand-light">{activity.target}</span>
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">{activity.timestamp}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right column */}
          <div className="space-y-4">
            {/* Alert Feed */}
            <div className="card">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-white flex items-center gap-2">
                  <Bell size={15} className="text-orange-400" />
                  Feed de Alertas
                </h3>
                {inactivityAlerts.length > 0 && (
                  <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full border border-red-500/30">
                    {inactivityAlerts.length} alerta{inactivityAlerts.length > 1 ? "s" : ""}
                  </span>
                )}
              </div>
              <div className="space-y-2 max-h-52 overflow-auto">
                {inactivityAlerts.length === 0 && zeroPostClients.length === 0 && (
                  <p className="text-xs text-gray-600 text-center py-4">Nenhum alerta no momento 🟢</p>
                )}
                {inactivityAlerts.map(({ client, hours }) => (
                  <div key={client.id} className={`flex items-center gap-2 p-2 rounded-lg ${
                    hours >= 48 ? "bg-red-500/10 border border-red-500/20" : "bg-yellow-500/10 border border-yellow-500/20"
                  }`}>
                    {hours >= 48
                      ? <AlertCircle size={12} className="text-red-400 shrink-0 animate-pulse" />
                      : <Clock size={12} className="text-yellow-400 shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-medium truncate ${hours >= 48 ? "text-red-300" : "text-yellow-300"}`}>
                        {client.name}
                      </p>
                      <p className={`text-xs ${hours >= 48 ? "text-red-400" : "text-yellow-500"}`}>
                        {hours >= 48 ? "🔴 Urgente" : "🟡 Atenção"} — {Math.floor(hours)}h sem movimentação
                      </p>
                    </div>
                  </div>
                ))}
                {zeroPostClients.map((client) => (
                  <div key={`zp-${client.id}`} className="flex items-center gap-2 p-2 rounded-lg bg-orange-500/10 border border-orange-500/20">
                    <ZapOff size={12} className="text-orange-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-orange-300 truncate">{client.name}</p>
                      <p className="text-xs text-orange-400">0 posts publicados este mês</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Notices + CEO form */}
            <div className="card">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-white flex items-center gap-2">
                  <Megaphone size={15} className="text-yellow-400" />
                  Avisos Gerais
                </h3>
                {(role === "admin" || role === "manager") && (
                  <button
                    onClick={() => setShowNoticeForm(!showNoticeForm)}
                    className="text-xs text-brand-light hover:text-white transition-colors flex items-center gap-1"
                  >
                    + Publicar
                  </button>
                )}
              </div>

              {showNoticeForm && (
                <div className="mb-3 p-3 bg-brand/10 border border-brand/20 rounded-xl space-y-2">
                  <input
                    value={noticeForm.title}
                    onChange={(e) => setNoticeForm((p) => ({ ...p, title: e.target.value }))}
                    placeholder="Título do aviso"
                    className="w-full bg-surface-border rounded-lg px-3 py-2 text-xs text-gray-200 placeholder-gray-600 outline-none focus:ring-1 focus:ring-brand"
                  />
                  <textarea
                    value={noticeForm.body}
                    onChange={(e) => setNoticeForm((p) => ({ ...p, body: e.target.value }))}
                    rows={2}
                    placeholder="Mensagem (opcional)"
                    className="w-full bg-surface-border rounded-lg px-3 py-2 text-xs text-gray-200 placeholder-gray-600 outline-none focus:ring-1 focus:ring-brand resize-none"
                  />
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={noticeForm.urgent}
                        onChange={(e) => setNoticeForm((p) => ({ ...p, urgent: e.target.checked }))}
                        className="w-3.5 h-3.5 accent-red-400"
                      />
                      <span className="text-xs text-red-400">Urgente</span>
                    </label>
                    <div className="flex gap-2">
                      <button onClick={() => setShowNoticeForm(false)} className="text-xs text-gray-500 hover:text-white">Cancelar</button>
                      <button onClick={handleAddNotice} className="btn-primary text-xs flex items-center gap-1"><Send size={11} /> Publicar</button>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-2 max-h-48 overflow-auto">
                {notices.slice(0, 5).map((notice) => (
                  <div key={notice.id} className={`p-3 rounded-lg border text-sm ${
                    notice.urgent ? "bg-red-500/10 border-red-500/30" : "bg-surface-border border-transparent"
                  }`}>
                    <p className={`font-medium text-xs ${notice.urgent ? "text-red-300" : "text-white"}`}>{notice.title}</p>
                    {notice.body && <p className="text-gray-400 text-xs mt-0.5 leading-relaxed">{notice.body}</p>}
                    <p className="text-gray-600 text-xs mt-1">por {notice.createdBy} · {notice.createdAt}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Urgent Tasks */}
            <div className="card">
              <h3 className="font-semibold text-white flex items-center gap-2 mb-3">
                <TrendingUp size={15} className="text-orange-400" />
                Tarefas Urgentes
              </h3>
              <div className="space-y-2">
                {mockTasks.filter((t) => ["critical", "high"].includes(t.priority) && t.status !== "done").slice(0, 4).map((task) => (
                  <div key={task.id} className="flex items-start gap-2 p-2 rounded-lg hover:bg-surface-hover transition-colors">
                    <span className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${task.priority === "critical" ? "bg-red-400" : "bg-orange-400"}`} />
                    <div className="min-w-0">
                      <p className="text-xs text-gray-200 leading-tight">{task.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{task.clientName} · {task.assignedTo}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* 7-day report */}
        {inactiveSevenDays.length > 0 && (
          <div className="card border border-orange-500/20">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle size={15} className="text-orange-400" />
              <h3 className="font-semibold text-white text-sm">
                Relatório 7 Dias — {inactiveSevenDays.length} cliente(s) sem qualquer interação
              </h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {inactiveSevenDays.map((c) => (
                <Link
                  key={c.id}
                  href={`/clients/${c.id}`}
                  className="flex items-center gap-2 bg-orange-500/10 border border-orange-500/20 rounded-lg px-3 py-2 hover:border-orange-400/40 transition-colors"
                >
                  <span className="w-2 h-2 rounded-full bg-orange-400" />
                  <span className="text-sm text-orange-200">{c.name}</span>
                  <span className="text-xs text-orange-400">{c.industry}</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Client Status table with filter */}
        <div className="card">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <h3 className="font-semibold text-white">Status dos Clientes</h3>
            <div className="flex items-center gap-2">
              <div className="flex gap-1">
                {STATUS_FILTER_CONFIG.map((f) => (
                  <button
                    key={f.key}
                    onClick={() => setStatusFilter(f.key as ClientStatus | "all")}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                      statusFilter === f.key
                        ? "bg-brand/20 text-brand-light border border-brand/30"
                        : "text-gray-500 hover:text-white hover:bg-surface-hover"
                    }`}
                  >
                    {f.label}
                    <span className="ml-1 text-gray-600">
                      ({f.key === "all" ? clients.length : clients.filter((c) => c.status === f.key).length})
                    </span>
                  </button>
                ))}
              </div>
              <Link href="/clients" className="text-xs text-brand-light hover:underline">Ver todos →</Link>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-border">
                  <th className="text-left py-2.5 px-3 text-gray-500 font-medium text-xs">Cliente</th>
                  <th className="text-left py-2.5 px-3 text-gray-500 font-medium text-xs">Setor</th>
                  <th className="text-left py-2.5 px-3 text-gray-500 font-medium text-xs">Status</th>
                  <th className="text-left py-2.5 px-3 text-gray-500 font-medium text-xs">Posts/Mês</th>
                  <th className="text-left py-2.5 px-3 text-gray-500 font-medium text-xs">Responsáveis</th>
                </tr>
              </thead>
              <tbody>
                {tableClients.map((client) => {
                  const posts = client.postsThisMonth ?? 0;
                  const goal = client.postsGoal ?? 12;
                  const pct = Math.min(100, Math.round((posts / goal) * 100));
                  return (
                    <tr key={client.id} className="border-b border-surface-border/50 hover:bg-surface-hover/50 transition-colors">
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-brand/20 flex items-center justify-center text-xs font-bold text-brand-light">
                            {client.name[0]}
                          </div>
                          <Link href={`/clients/${client.id}`} className="font-medium text-white hover:text-brand-light transition-colors">
                            {client.name}
                          </Link>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-gray-400 text-xs">{client.industry}</td>
                      <td className="py-3 px-3">
                        <span className={`badge border ${getStatusColor(client.status)}`}>{getStatusLabel(client.status)}</span>
                      </td>
                      <td className="py-3 px-3">
                        {client.status !== "onboarding" && (
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-1.5 bg-surface-border rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${pct >= 80 ? "bg-green-400" : pct >= 50 ? "bg-yellow-400" : "bg-red-400"}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="text-xs text-gray-400">{posts}/{goal}</span>
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3 text-gray-400 text-xs">{client.assignedTraffic}, {client.assignedSocial}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}
