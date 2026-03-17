"use client";

import Header from "@/components/Header";
import { useAppState } from "@/lib/context/AppStateContext";
import { mockDesignRequests } from "@/lib/mockData";
import type { DesignRequest } from "@/lib/types";
import { getPriorityColor, getPriorityLabel } from "@/lib/utils";
import { Palette, Filter, Clock, CheckCircle, Loader, Paperclip, ChevronDown } from "lucide-react";
import { useState } from "react";

type FilterPriority = "all" | "low" | "medium" | "high" | "critical";
type FilterStatus = "all" | "queued" | "in_progress" | "done";

const statusConfig = {
  queued: { label: "Na Fila", color: "text-yellow-400 bg-yellow-500/10 border-yellow-500/30", Icon: Clock },
  in_progress: { label: "Em Produção", color: "text-blue-400 bg-blue-500/10 border-blue-500/30", Icon: Loader },
  done: { label: "Concluído", color: "text-green-400 bg-green-500/10 border-green-500/30", Icon: CheckCircle },
};

export default function DesignPage() {
  const { contentCards } = useAppState();
  type SortMode = "priority" | "postDate";
  const [sortMode, setSortMode] = useState<SortMode>("priority");
  const [priorityFilter, setPriorityFilter] = useState<FilterPriority>("all");
  const [statusFilter, setStatusFilter] = useState<FilterStatus>("all");
  const [clientFilter, setClientFilter] = useState("all");
  const [requests, setRequests] = useState<DesignRequest[]>(mockDesignRequests);

  const clients = [...new Set(mockDesignRequests.map((r) => r.clientName))];
  const requesters = [...new Set(mockDesignRequests.map((r) => r.requestedBy))];

  const filtered = requests.filter((r) => {
    if (priorityFilter !== "all" && r.priority !== priorityFilter) return false;
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (clientFilter !== "all" && r.clientName !== clientFilter) return false;
    return true;
  });

  // Get earliest upcoming post date for a design request's client
  const getClientPostDate = (clientId: string): string | null => {
    const upcoming = contentCards
      .filter((c) => c.clientId === clientId && c.dueDate && c.status !== "published")
      .map((c) => c.dueDate!)
      .sort();
    return upcoming[0] ?? null;
  };

  const queued = filtered.filter((r) => r.status === "queued").length;
  const inProg = filtered.filter((r) => r.status === "in_progress").length;
  const done = filtered.filter((r) => r.status === "done").length;

  const markStatus = (id: string, status: DesignRequest["status"]) => {
    setRequests((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
  };

  return (
    <div className="flex flex-col flex-1 overflow-auto">
      <Header title="Área do Designer" subtitle="Fila unificada de produção de artes" />

      <div className="p-6 space-y-6 animate-fade-in">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="card flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-yellow-500/20 flex items-center justify-center">
              <Clock size={18} className="text-yellow-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{requests.filter((r) => r.status === "queued").length}</p>
              <p className="text-xs text-gray-400">Na fila</p>
            </div>
          </div>
          <div className="card flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
              <Loader size={18} className="text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{requests.filter((r) => r.status === "in_progress").length}</p>
              <p className="text-xs text-gray-400">Em produção</p>
            </div>
          </div>
          <div className="card flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center">
              <CheckCircle size={18} className="text-green-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{requests.filter((r) => r.status === "done").length}</p>
              <p className="text-xs text-gray-400">Concluídos</p>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2">
            <Filter size={14} className="text-gray-500" />
            <span className="text-xs text-gray-500 font-medium">Filtrar por:</span>
          </div>

          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value as FilterPriority)}
            className="bg-surface-card border border-surface-border text-sm text-gray-300 rounded-lg px-3 py-1.5 outline-none focus:border-brand"
          >
            <option value="all">Prioridade: Todas</option>
            <option value="critical">Crítica</option>
            <option value="high">Alta</option>
            <option value="medium">Média</option>
            <option value="low">Baixa</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as FilterStatus)}
            className="bg-surface-card border border-surface-border text-sm text-gray-300 rounded-lg px-3 py-1.5 outline-none focus:border-brand"
          >
            <option value="all">Status: Todos</option>
            <option value="queued">Na Fila</option>
            <option value="in_progress">Em Produção</option>
            <option value="done">Concluído</option>
          </select>

          <select
            value={clientFilter}
            onChange={(e) => setClientFilter(e.target.value)}
            className="bg-surface-card border border-surface-border text-sm text-gray-300 rounded-lg px-3 py-1.5 outline-none focus:border-brand"
          >
            <option value="all">Cliente: Todos</option>
            {clients.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>

          <div className="flex items-center gap-1 bg-surface-border rounded-lg p-0.5">
            <button
              onClick={() => setSortMode("priority")}
              className={`text-xs px-3 py-1.5 rounded-md transition-colors ${sortMode === "priority" ? "bg-surface-card text-white" : "text-gray-500 hover:text-white"}`}
            >
              Prioridade
            </button>
            <button
              onClick={() => setSortMode("postDate")}
              className={`text-xs px-3 py-1.5 rounded-md transition-colors ${sortMode === "postDate" ? "bg-surface-card text-white" : "text-gray-500 hover:text-white"}`}
            >
              📅 Data de Post
            </button>
          </div>
          <span className="text-xs text-gray-500 ml-auto">{filtered.length} resultado(s)</span>
        </div>

        {/* Design Request Cards */}
        <div className="space-y-3">
          {filtered.length === 0 && (
            <div className="card text-center py-10 text-gray-500">
              Nenhuma arte encontrada com os filtros selecionados.
            </div>
          )}
          {filtered
            .sort((a, b) => {
              if (sortMode === "postDate") {
                const dateA = getClientPostDate(a.clientId) ?? "9999";
                const dateB = getClientPostDate(b.clientId) ?? "9999";
                return dateA.localeCompare(dateB);
              }
              const order = { critical: 0, high: 1, medium: 2, low: 3 };
              return order[a.priority] - order[b.priority];
            })
            .map((req) => {
              const cfg = statusConfig[req.status];
              const StatusIcon = cfg.Icon;
              return (
                <div
                  key={req.id}
                  className={`card border transition-colors ${
                    req.priority === "critical"
                      ? "border-red-500/40 bg-red-500/5"
                      : "border-surface-border hover:border-brand/30"
                  }`}
                >
                  <div className="flex items-start gap-4">
                    {/* Priority indicator */}
                    <div className={`w-1 self-stretch rounded-full ${
                      req.priority === "critical" ? "bg-red-400" :
                      req.priority === "high" ? "bg-orange-400" :
                      req.priority === "medium" ? "bg-blue-400" : "bg-gray-500"
                    }`} />

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h4 className="font-semibold text-white">{req.title}</h4>
                          <div className="flex flex-wrap items-center gap-2 mt-1">
                            <span className="text-xs text-brand-light">{req.clientName}</span>
                            <span className="text-gray-600">·</span>
                            <span className="text-xs text-gray-400">Pedido por: {req.requestedBy}</span>
                            <span className="text-gray-600">·</span>
                            <span className="text-xs text-gray-500 bg-surface-border px-2 py-0.5 rounded-full">
                              {req.format}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`badge border text-xs ${getPriorityColor(req.priority)}`}>
                            {getPriorityLabel(req.priority)}
                          </span>
                          <span className={`badge border text-xs ${cfg.color}`}>
                            <StatusIcon size={11} />
                            {cfg.label}
                          </span>
                        </div>
                      </div>

                      <p className="text-sm text-gray-400 mt-2 leading-relaxed">{req.briefing}</p>

                      {req.deadline && (
                        <div className="flex items-center gap-1 mt-2">
                          <Clock size={12} className="text-gray-600" />
                          <span className="text-xs text-gray-500">Prazo: {req.deadline}</span>
                        </div>
                      )}
                      {(() => {
                        const postDate = getClientPostDate(req.clientId);
                        return postDate ? (
                          <div className="flex items-center gap-1 mt-1">
                            <span className="text-xs text-teal-400 bg-teal-500/10 border border-teal-500/20 px-2 py-0.5 rounded-full">
                              📅 Post em: {postDate}
                            </span>
                          </div>
                        ) : null;
                      })()}

                      {/* Actions */}
                      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-surface-border">
                        {req.status === "queued" && (
                          <button
                            onClick={() => markStatus(req.id, "in_progress")}
                            className="btn-primary text-xs py-1.5"
                          >
                            Iniciar Produção
                          </button>
                        )}
                        {req.status === "in_progress" && (
                          <button
                            onClick={() => markStatus(req.id, "done")}
                            className="bg-green-500 hover:bg-green-600 text-white px-3 py-1.5 rounded-lg font-medium text-xs transition-colors"
                          >
                            Marcar como Concluído
                          </button>
                        )}
                        {req.status === "done" && (
                          <span className="text-xs text-green-400 flex items-center gap-1">
                            <CheckCircle size={12} /> Arte entregue
                          </span>
                        )}
                        <button className="btn-ghost text-xs flex items-center gap-1">
                          <Paperclip size={12} />
                          Ver Briefing Completo
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}
