"use client";

import Header from "@/components/Header";
import MetricCard from "@/components/MetricCard";
import KanbanBoard from "@/components/KanbanBoard";
import { mockClients, mockTasks } from "@/lib/mockData";
import {
  DollarSign, TrendingUp, AlertTriangle, CheckCircle,
  CreditCard, Calendar, ChevronDown, User
} from "lucide-react";
import { formatCurrency, getAttentionColor, getAttentionLabel, getPriorityColor, getPriorityLabel } from "@/lib/utils";
import type { Client, Task } from "@/lib/types";
import { useState } from "react";

const STATUS_COLUMNS = [
  { id: "onboarding", title: "Onboarding", color: "bg-blue-400" },
  { id: "good", title: "Bons Resultados", color: "bg-green-400" },
  { id: "average", title: "Resultados Médios", color: "bg-yellow-400" },
  { id: "at_risk", title: "Em Risco 🔴", color: "bg-red-400" },
];

const TASK_COLUMNS = [
  { id: "pending", title: "Pendente", color: "bg-gray-400" },
  { id: "in_progress", title: "Em Execução", color: "bg-blue-400" },
  { id: "review", title: "Validação", color: "bg-yellow-400" },
  { id: "done", title: "Concluído", color: "bg-green-400" },
];

export default function TrafficPage() {
  const [activeTab, setActiveTab] = useState<"status" | "kanban" | "report">("status");

  const totalBudget = mockClients.reduce((sum, c) => sum + c.monthlyBudget, 0);
  const dailyBudget = totalBudget / 30;
  const atRiskCount = mockClients.filter((c) => c.status === "at_risk").length;
  const goodCount = mockClients.filter((c) => c.status === "good").length;

  const statusKanbanCols = STATUS_COLUMNS.map((col) => ({
    ...col,
    items: mockClients.filter((c) => c.status === col.id),
  }));

  const trafficTasks = mockTasks.filter((t) => t.role === "traffic");
  const taskKanbanCols = TASK_COLUMNS.map((col) => ({
    ...col,
    items: trafficTasks.filter((t) => t.status === col.id),
  }));

  return (
    <div className="flex flex-col flex-1 overflow-auto">
      <Header title="Tráfego Pago" subtitle="Gestão de performance e campanhas" />

      <div className="p-6 space-y-6 animate-fade-in">
        {/* Metrics */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <MetricCard
            icon={DollarSign}
            label="Investimento Mensal"
            value={formatCurrency(totalBudget)}
            iconColor="text-green-400"
            iconBg="bg-green-500/20"
          />
          <MetricCard
            icon={TrendingUp}
            label="Média Diária"
            value={formatCurrency(dailyBudget)}
            sub="estimado"
            iconColor="text-blue-400"
            iconBg="bg-blue-500/20"
          />
          <MetricCard
            icon={CheckCircle}
            label="Bons Resultados"
            value={goodCount}
            sub="clientes"
            iconColor="text-green-400"
            iconBg="bg-green-500/20"
          />
          <MetricCard
            icon={AlertTriangle}
            label="Em Risco"
            value={atRiskCount}
            sub="clientes"
            iconColor="text-red-400"
            iconBg="bg-red-500/20"
          />
        </div>

        {/* Budget Overview Table */}
        <div className="card">
          <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
            <CreditCard size={16} className="text-brand-light" />
            Painel de Investimentos
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-border">
                  <th className="text-left py-2.5 px-3 text-gray-500 font-medium text-xs">Cliente</th>
                  <th className="text-left py-2.5 px-3 text-gray-500 font-medium text-xs">Gestor</th>
                  <th className="text-left py-2.5 px-3 text-gray-500 font-medium text-xs">Investimento/mês</th>
                  <th className="text-left py-2.5 px-3 text-gray-500 font-medium text-xs">Diário (est.)</th>
                  <th className="text-left py-2.5 px-3 text-gray-500 font-medium text-xs">Forma Pag.</th>
                  <th className="text-left py-2.5 px-3 text-gray-500 font-medium text-xs">Atenção</th>
                </tr>
              </thead>
              <tbody>
                {mockClients.map((client) => (
                  <tr key={client.id} className="border-b border-surface-border/50 hover:bg-surface-hover/50 transition-colors">
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-brand/20 flex items-center justify-center text-xs font-bold text-brand-light">
                          {client.name[0]}
                        </div>
                        <span className="font-medium text-white">{client.name}</span>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-gray-400 text-xs">{client.assignedTraffic}</td>
                    <td className="py-3 px-3 font-semibold text-green-400">{formatCurrency(client.monthlyBudget)}</td>
                    <td className="py-3 px-3 text-gray-400">{formatCurrency(client.monthlyBudget / 30)}</td>
                    <td className="py-3 px-3">
                      <span className="badge bg-surface-border text-gray-300 capitalize">{client.paymentMethod}</span>
                    </td>
                    <td className="py-3 px-3">
                      <span className={`badge border ${getAttentionColor(client.attentionLevel)}`}>
                        {getAttentionLabel(client.attentionLevel)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Tabs: Status / Kanban / Report */}
        <div>
          <div className="flex gap-1 mb-5 border-b border-surface-border">
            {(["status", "kanban", "report"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                  activeTab === tab
                    ? "border-brand text-brand-light"
                    : "border-transparent text-gray-400 hover:text-white"
                }`}
              >
                {tab === "status" ? "Status de Performance" : tab === "kanban" ? "Kanban de Tarefas" : "Relatório Interno"}
              </button>
            ))}
          </div>

          {activeTab === "status" && (
            <div className="animate-fade-in">
              <p className="text-gray-400 text-sm mb-4">Arraste os clientes entre colunas para atualizar o status de performance.</p>
              <KanbanBoard<Client>
                columns={statusKanbanCols}
                renderCard={(client) => (
                  <div className="bg-surface-raised border border-surface-border rounded-lg p-3 hover:border-brand/30 transition-colors">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-7 h-7 rounded-md bg-brand/20 flex items-center justify-center text-xs font-bold text-brand-light">
                        {client.name[0]}
                      </div>
                      <span className="font-medium text-white text-sm">{client.name}</span>
                    </div>
                    <p className="text-xs text-gray-500 mb-2">{client.assignedTraffic}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-green-400">{formatCurrency(client.monthlyBudget)}/mês</span>
                      <span className={`badge border text-xs ${getAttentionColor(client.attentionLevel)}`}>
                        {getAttentionLabel(client.attentionLevel)}
                      </span>
                    </div>
                  </div>
                )}
              />
            </div>
          )}

          {activeTab === "kanban" && (
            <div className="animate-fade-in">
              <p className="text-gray-400 text-sm mb-4">Fluxo interno de tarefas da equipe de tráfego.</p>
              <KanbanBoard<Task>
                columns={taskKanbanCols}
                renderCard={(task) => (
                  <div className="bg-surface-raised border border-surface-border rounded-lg p-3 hover:border-brand/30 transition-colors">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <p className="font-medium text-white text-sm leading-tight">{task.title}</p>
                      <span className={`badge border text-xs shrink-0 ${getPriorityColor(task.priority)}`}>
                        {getPriorityLabel(task.priority)}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">{task.clientName}</p>
                    <div className="flex items-center gap-1 mt-2">
                      <User size={11} className="text-gray-600" />
                      <span className="text-xs text-gray-400">{task.assignedTo}</span>
                      {task.dueDate && (
                        <>
                          <Calendar size={11} className="text-gray-600 ml-1" />
                          <span className="text-xs text-gray-500">{task.dueDate}</span>
                        </>
                      )}
                    </div>
                  </div>
                )}
              />
            </div>
          )}

          {activeTab === "report" && (
            <div className="animate-fade-in max-w-2xl space-y-4">
              <p className="text-gray-400 text-sm">Registro interno da equipe — não visível ao cliente.</p>
              {mockClients.filter((c) => c.status === "at_risk" || c.attentionLevel === "high" || c.attentionLevel === "critical").map((client) => (
                <div key={client.id} className="card border border-red-500/20">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-8 h-8 rounded-lg bg-red-500/20 flex items-center justify-center text-sm font-bold text-red-400">
                      {client.name[0]}
                    </div>
                    <div>
                      <p className="font-semibold text-white">{client.name}</p>
                      <p className="text-xs text-gray-500">Gestor: {client.assignedTraffic}</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div>
                      <label className="text-xs text-gray-500 font-medium">Momento atual do cliente</label>
                      <textarea
                        defaultValue={client.notes || ""}
                        placeholder="Descreva a situação atual, o que está acontecendo com as campanhas..."
                        className="w-full mt-1 bg-surface-border rounded-lg p-3 text-sm text-gray-200 placeholder-gray-600 outline-none focus:ring-1 focus:ring-brand resize-none"
                        rows={3}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 font-medium">Próximos passos estratégicos</label>
                      <textarea
                        placeholder="O que será feito para melhorar os resultados..."
                        className="w-full mt-1 bg-surface-border rounded-lg p-3 text-sm text-gray-200 placeholder-gray-600 outline-none focus:ring-1 focus:ring-brand resize-none"
                        rows={3}
                      />
                    </div>
                    <button className="btn-primary">Salvar Relatório</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
