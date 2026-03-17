"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import NewClientModal from "@/components/NewClientModal";
import { useAppState } from "@/lib/context/AppStateContext";
import { useRole } from "@/lib/context/RoleContext";
import type { Client } from "@/lib/types";
import {
  formatCurrency,
  getAttentionColor,
  getAttentionLabel,
  getStatusColor,
  getStatusLabel,
} from "@/lib/utils";
import {
  Search, UserPlus, ChevronRight, MessageSquare,
  ExternalLink, Activity,
} from "lucide-react";
import Link from "next/link";

// Simple health score per client (0-100)
function calcHealthScore(client: Client): number {
  let score = 50;
  if (client.status === "good") score += 20;
  else if (client.status === "average") score -= 5;
  else if (client.status === "at_risk") score -= 30;
  if (client.attentionLevel === "low") score += 10;
  else if (client.attentionLevel === "high") score -= 10;
  else if (client.attentionLevel === "critical") score -= 25;
  if (client.lastPostDate) {
    const days = Math.floor((Date.now() - new Date(client.lastPostDate).getTime()) / 86400000);
    if (days <= 3) score += 10;
    else if (days > 7) score -= 15;
  }
  return Math.max(0, Math.min(100, score));
}

function HealthBar({ score }: { score: number }) {
  const color = score >= 70 ? "bg-green-400" : score >= 45 ? "bg-yellow-400" : "bg-red-400";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-surface-border rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className={`text-xs font-medium tabular-nums ${score >= 70 ? "text-green-400" : score >= 45 ? "text-yellow-400" : "text-red-400"}`}>
        {score}
      </span>
    </div>
  );
}

export default function ClientsPage() {
  const router = useRouter();
  const { clients, clientChats, sendClientMessage } = useAppState();
  const { currentUser } = useRole();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [showNewModal, setShowNewModal] = useState(false);

  const filtered = clients.filter((c) => {
    const matchSearch = c.name.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || c.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const handleSend = () => {
    if (!chatInput.trim() || !selectedClient) return;
    sendClientMessage(selectedClient.id, currentUser, chatInput.trim());
    setChatInput("");
  };

  const selectedChats = selectedClient ? (clientChats[selectedClient.id] ?? []) : [];

  return (
    <>
      {showNewModal && (
        <NewClientModal
          onClose={() => setShowNewModal(false)}
          onSuccess={(id) => {
            setShowNewModal(false);
            router.push(`/clients/${id}`);
          }}
        />
      )}

      <div className="flex flex-col flex-1 overflow-auto">
        <Header title="Gestão de Clientes" subtitle="Base completa de clientes e seus dados" />

        <div className="flex flex-1 overflow-hidden">
          {/* Client List */}
          <div className="flex-1 p-6 overflow-auto space-y-5">
            {/* Summary cards */}
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
              {[
                { label: "Total de Clientes", value: clients.length, color: "text-white", bg: "bg-surface-border" },
                { label: "Bons Resultados", value: clients.filter((c) => c.status === "good").length, color: "text-green-400", bg: "bg-green-500/10" },
                { label: "Em Risco (Churn)", value: clients.filter((c) => c.status === "at_risk").length, color: "text-red-400", bg: "bg-red-500/10" },
                { label: "Em Onboarding", value: clients.filter((c) => c.status === "onboarding").length, color: "text-blue-400", bg: "bg-blue-500/10" },
              ].map((stat) => (
                <div key={stat.label} className={`rounded-xl p-4 ${stat.bg} border border-surface-border`}>
                  <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                  <p className="text-xs text-gray-500 mt-1">{stat.label}</p>
                </div>
              ))}
            </div>

            {/* Filters + Add Button */}
            <div className="flex gap-3">
              <div className="flex-1 flex items-center gap-2 bg-surface-card border border-surface-border rounded-lg px-3 py-2">
                <Search size={14} className="text-gray-500" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar cliente..."
                  className="bg-transparent text-sm text-gray-200 placeholder-gray-600 outline-none w-full"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-surface-card border border-surface-border text-sm text-gray-300 rounded-lg px-3 py-2 outline-none focus:border-brand"
              >
                <option value="all">Todos os status</option>
                <option value="onboarding">Onboarding</option>
                <option value="good">Bons Resultados</option>
                <option value="average">Resultados Médios</option>
                <option value="at_risk">Em Risco</option>
              </select>
              <button
                onClick={() => setShowNewModal(true)}
                className="btn-primary flex items-center gap-2 whitespace-nowrap"
              >
                <UserPlus size={15} />
                Novo Cliente
              </button>
            </div>

            {/* Client Cards */}
            <div className="space-y-3">
              {filtered.length === 0 && (
                <div className="card text-center py-10 text-gray-500">
                  Nenhum cliente encontrado.
                </div>
              )}
              {filtered.map((client) => {
                const health = calcHealthScore(client);
                return (
                  <div
                    key={client.id}
                    onClick={() => setSelectedClient(client === selectedClient ? null : client)}
                    className={`card cursor-pointer transition-all hover:border-brand/40 ${
                      selectedClient?.id === client.id ? "border-brand/60 bg-brand/5" : ""
                    } ${client.status === "at_risk" ? "border-red-500/20" : ""}`}
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-11 h-11 rounded-xl bg-brand/20 flex items-center justify-center text-sm font-bold text-brand-light shrink-0">
                        {client.name[0]}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <h4 className="font-semibold text-white">{client.name}</h4>
                          <span className={`badge border text-xs ${getStatusColor(client.status)}`}>
                            {getStatusLabel(client.status)}
                          </span>
                          <span className={`badge border text-xs ${getAttentionColor(client.attentionLevel)}`}>
                            {getAttentionLabel(client.attentionLevel)}
                          </span>
                          {client.tags.map((tag) => (
                            <span
                              key={tag}
                              className={`badge border text-xs ${
                                tag === "Premium" ? "tag-premium" :
                                tag === "Risco de Churn" ? "tag-risk" : "tag-matcon"
                              }`}
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-400 mb-2 flex-wrap">
                          <span>{client.industry}</span>
                          <span className="text-gray-600">·</span>
                          <span className="font-medium text-green-400">{formatCurrency(client.monthlyBudget)}/mês</span>
                          <span className="text-gray-600">·</span>
                          <span>T: {client.assignedTraffic}</span>
                          <span className="text-gray-600">·</span>
                          <span>SM: {client.assignedSocial}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500 w-14 shrink-0">Health</span>
                          <div className="flex-1 max-w-36">
                            <HealthBar score={health} />
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedClient(client === selectedClient ? null : client);
                          }}
                          className="btn-ghost text-xs flex items-center gap-1"
                        >
                          <MessageSquare size={12} />
                          Chat
                        </button>
                        <Link
                          href={`/clients/${client.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="btn-ghost text-xs flex items-center gap-1"
                        >
                          <ExternalLink size={12} />
                          Abrir
                        </Link>
                      </div>
                    </div>

                    {client.notes && (
                      <p className="mt-3 text-xs text-gray-400 bg-surface-border rounded-lg px-3 py-2 border-l-2 border-yellow-500/50">
                        {client.notes}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Client Quick-Chat Panel */}
          {selectedClient && (
            <div className="w-80 border-l border-surface-border flex flex-col animate-slide-up shrink-0">
              <div className="p-4 border-b border-surface-border">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-brand/20 flex items-center justify-center text-sm font-bold text-brand-light">
                      {selectedClient.name[0]}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white leading-none">{selectedClient.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">Chat interno da equipe</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Link
                      href={`/clients/${selectedClient.id}`}
                      className="p-1.5 rounded-lg hover:bg-surface-hover text-gray-500 hover:text-white transition-colors"
                    >
                      <Activity size={14} />
                    </Link>
                    <button
                      onClick={() => setSelectedClient(null)}
                      className="p-1.5 rounded-lg hover:bg-surface-hover text-gray-500 hover:text-white transition-colors"
                    >
                      ✕
                    </button>
                  </div>
                </div>
                <div className="text-xs text-gray-500 flex items-center gap-1">
                  <MessageSquare size={11} />
                  <span>Cada mensagem é salva no histórico do cliente</span>
                </div>
              </div>

              <div className="flex-1 overflow-auto p-3 space-y-3">
                {selectedChats.length === 0 && (
                  <p className="text-xs text-gray-600 text-center pt-6">
                    Sem mensagens ainda. Seja o primeiro!
                  </p>
                )}
                {selectedChats.map((msg) => (
                  <div key={msg.id} className={`flex flex-col ${msg.user === currentUser ? "items-end" : "items-start"}`}>
                    <span className="text-xs text-gray-500 mb-0.5">{msg.user} · {msg.timestamp}</span>
                    <div className={`rounded-xl px-3 py-2 text-xs max-w-[85%] ${
                      msg.user === currentUser
                        ? "bg-brand/30 text-brand-light"
                        : "bg-surface-border text-gray-200"
                    }`}>
                      {msg.text}
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-3 border-t border-surface-border flex gap-2">
                <input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSend()}
                  placeholder="Mensagem..."
                  className="flex-1 bg-surface-border rounded-lg px-3 py-2 text-xs text-gray-200 placeholder-gray-600 outline-none focus:ring-1 focus:ring-brand"
                />
                <button onClick={handleSend} className="btn-primary px-3 text-xs">
                  →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
