"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import NewClientModal from "@/components/NewClientModal";
import { useClientsStore } from "@/stores/useClientsStore";
import { useRole } from "@/lib/context/RoleContext";
import type { Client } from "@/lib/types";
import {
  getAttentionColor,
  getAttentionLabel,
  getStatusColor,
  getStatusLabel,
  getStatusLed,
  calcHealthScore,
} from "@/lib/utils";
import {
  Search, UserPlus, ChevronRight, MessageSquare,
  ExternalLink, Activity, MoreHorizontal, Facebook, AlertTriangle, Zap,
  Check, X, Loader2, Clock, Send, Archive, RotateCcw,
} from "lucide-react";
import Link from "next/link";
import { mockAdCampaigns } from "@/lib/mockData";
import { fetchDraftClients, fetchChurnedClients } from "@/lib/supabase/queries";
import { authedFetch } from "@/lib/supabase/authed-fetch";

// Health score: uses shared calcHealthScore from lib/utils.ts

function HealthBar({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1 bg-[#0a0a10] rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all bg-primary" style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs font-medium tabular-nums text-muted-foreground">
        {score}
      </span>
    </div>
  );
}

export default function ClientsPage() {
  const router = useRouter();
  const clients = useClientsStore((s) => s.clients);
  const clientChats = useClientsStore((s) => s.clientChats);
  const sendClientMessage = useClientsStore((s) => s.sendClientMessage);
  const init = useClientsStore((s) => s.init);
  const subscribeRealtime = useClientsStore((s) => s.subscribeRealtime);
  const { role, currentUser } = useRole();

  useEffect(() => {
    init();
    const unsub = subscribeRealtime();
    return unsub;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [responsibleFilter, setResponsibleFilter] = useState("mine");

  // Read URL filter on mount (avoids useSearchParams Suspense requirement)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const filter = params.get("filter");
    if (filter === "at_risk" || filter === "onboarding") {
      setStatusFilter(filter);
      setResponsibleFilter("all");
    }
  }, []);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [showNewModal, setShowNewModal] = useState(false);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);

  // ─── Draft clients (pending invite / awaiting approval) ───
  const isAdmin = role === "admin" || role === "manager";
  const [drafts, setDrafts] = useState<Client[]>([]);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [draftActionError, setDraftActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    fetchDraftClients().then(setDrafts);
  }, [isAdmin]);

  const handleApprove = async (clientId: string) => {
    setApprovingId(clientId);
    setDraftActionError(null);
    try {
      const res = await authedFetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve", clientId }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setDrafts((prev) => prev.filter((d) => d.id !== clientId));
    } catch (err) {
      setDraftActionError(`Erro ao aprovar: ${err instanceof Error ? err.message : "tente novamente"}`);
    } finally {
      setApprovingId(null);
    }
  };

  const handleReject = async (clientId: string) => {
    if (!confirm("Tem certeza que deseja rejeitar este cadastro? Os dados serao removidos.")) return;
    setDraftActionError(null);
    try {
      const res = await authedFetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject", clientId }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setDrafts((prev) => prev.filter((d) => d.id !== clientId));
    } catch (err) {
      setDraftActionError(`Erro ao rejeitar: ${err instanceof Error ? err.message : "tente novamente"}`);
    }
  };

  // ─── Lifecycle: arquivar (churn) / reativar (admin/manager) ───
  const [showArchived, setShowArchived] = useState(false);
  const [archived, setArchived] = useState<Client[]>([]);
  const [archivedLoading, setArchivedLoading] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<Client | null>(null);
  const [archiveReason, setArchiveReason] = useState("");
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const [lifecycleError, setLifecycleError] = useState<string | null>(null);

  const loadArchived = () => {
    setArchivedLoading(true);
    fetchChurnedClients().then(setArchived).finally(() => setArchivedLoading(false));
  };
  useEffect(() => {
    if (showArchived && isAdmin) loadArchived();
  }, [showArchived, isAdmin]);

  const confirmArchive = async () => {
    if (!archiveTarget) return;
    setLifecycleBusy(true);
    setLifecycleError(null);
    try {
      const res = await authedFetch(`/api/clients/${archiveTarget.id}/lifecycle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "archive", reason: archiveReason.trim() || undefined }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || `HTTP ${res.status}`);
      // O realtime patcha active=false → o cliente sai da lista ativa (filtro abaixo).
      setArchiveTarget(null);
      setArchiveReason("");
      if (showArchived) loadArchived();
    } catch (e) {
      setLifecycleError(e instanceof Error ? e.message : "Erro ao arquivar");
    } finally {
      setLifecycleBusy(false);
    }
  };

  const handleReactivate = async (clientId: string) => {
    setLifecycleBusy(true);
    setLifecycleError(null);
    try {
      const res = await authedFetch(`/api/clients/${clientId}/lifecycle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reactivate" }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || `HTTP ${res.status}`);
      setArchived((prev) => prev.filter((c) => c.id !== clientId));
      window.location.reload(); // recarrega p/ trazer o cliente de volta à carteira ativa
    } catch (e) {
      setLifecycleError(e instanceof Error ? e.message : "Erro ao reativar");
      setLifecycleBusy(false);
    }
  };

  // Role-based: which field maps the current user to a client
  const isOperator = role === "traffic" || role === "social" || role === "designer";
  const getAssignedField = (c: Client): string => {
    if (role === "traffic") return c.assignedTraffic;
    if (role === "social") return c.assignedSocial;
    if (role === "designer") return c.assignedDesigner;
    return "";
  };

  // Collect unique responsible names for the dropdown (for operator roles)
  const responsibleNames = isOperator
    ? [...new Set(clients.map(getAssignedField))].sort()
    : [];

  const filtered = clients.filter((c) => {
    if (c.active === false) return false; // arquivados (churn) não aparecem na carteira ativa
    const matchSearch = c.name.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || c.status === statusFilter;
    // Role-based filter: operators see only their clients by default
    const matchResponsible =
      !isOperator || responsibleFilter === "all"
        ? true
        : responsibleFilter === "mine"
          ? getAssignedField(c) === currentUser
          : getAssignedField(c) === responsibleFilter;
    return matchSearch && matchStatus && matchResponsible;
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

      {archiveTarget && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
          onClick={() => !lifecycleBusy && setArchiveTarget(null)}
        >
          <div className="bg-card border border-border rounded-xl w-full max-w-md p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-1">
              <Archive size={16} className="text-amber-500" />
              <h3 className="font-semibold text-foreground">Arquivar cliente</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-3">
              <span className="text-foreground font-medium">{archiveTarget.name}</span> sai da carteira ativa e de
              toda a automação (mensagens, relatórios, sync). O histórico é mantido e pode ser reativado.
            </p>
            <label className="text-xs text-muted-foreground">Motivo do churn (opcional)</label>
            <textarea
              value={archiveReason}
              onChange={(e) => setArchiveReason(e.target.value)}
              rows={3}
              placeholder="Ex.: encerrou contrato, trocou de agência…"
              className="w-full mt-1 bg-muted rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-amber-500 resize-none"
            />
            {lifecycleError && <p className="text-xs text-destructive mt-2">{lifecycleError}</p>}
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setArchiveTarget(null)} disabled={lifecycleBusy} className="btn-secondary text-sm disabled:opacity-50">
                Cancelar
              </button>
              <button
                onClick={confirmArchive}
                disabled={lifecycleBusy}
                className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium bg-amber-500 text-black hover:bg-amber-400 transition-colors disabled:opacity-50"
              >
                {lifecycleBusy ? <Loader2 className="animate-spin" size={14} /> : <Archive size={14} />}
                Arquivar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col flex-1 overflow-auto">
        <Header title="Gestão de Clientes" subtitle="Base completa de clientes e seus dados" />

        <div className="flex flex-1 overflow-hidden">
          {/* Client List */}
          <div className="flex-1 p-6 overflow-auto space-y-5">
            {/* Summary cards */}
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
              {[
                { label: isOperator ? "Meus Clientes" : "Total de Clientes", value: filtered.length, color: "text-foreground", bg: "bg-muted" },
                { label: "Bons Resultados", value: filtered.filter((c) => c.status === "good").length, color: "text-primary", bg: "bg-[#111118]" },
                { label: "Em Risco (Churn)", value: filtered.filter((c) => c.status === "at_risk").length, color: "text-red-500", bg: "bg-red-500/10" },
                { label: "Em Onboarding", value: filtered.filter((c) => c.status === "onboarding").length, color: "text-primary", bg: "bg-[#111118]" },
              ].map((stat) => (
                <div key={stat.label} className={`rounded-xl p-4 ${stat.bg} border border-border`}>
                  <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
                </div>
              ))}
            </div>

            {/* ═══ PENDING APPROVALS (Admin Only) ═══ */}
            {isAdmin && drafts.length > 0 && (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.03] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock size={14} className="text-amber-500" />
                    <h3 className="text-sm font-semibold text-amber-400">
                      Cadastros Pendentes ({drafts.length})
                    </h3>
                  </div>
                  <Link href="/clients/pending" className="text-xs text-[#0d4af5] hover:underline flex items-center gap-1">
                    Revisar todos <ExternalLink size={10} />
                  </Link>
                </div>
                {draftActionError && (
                  <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2">{draftActionError}</p>
                )}
                <div className="space-y-2">
                  {drafts.map((draft) => (
                    <div key={draft.id} className="flex items-center gap-3 bg-[#111113] border border-[#1e1e2a] rounded-lg p-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">{draft.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-zinc-500">{draft.industry}</span>
                          {draft.draftStatus === "pending_invite" && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center gap-1">
                              <Send size={8} /> Link enviado
                            </span>
                          )}
                          {draft.draftStatus === "awaiting_approval" && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#0d4af5]/10 text-[#3b6ff5] border border-[#0d4af5]/20 flex items-center gap-1">
                              <Check size={8} /> Formulario recebido
                            </span>
                          )}
                          {draft.contactName && (
                            <span className="text-[10px] text-zinc-500">Contato: {draft.contactName}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {draft.draftStatus === "awaiting_approval" && (
                          <button
                            onClick={() => handleApprove(draft.id)}
                            disabled={approvingId === draft.id}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-400 text-xs font-medium hover:bg-emerald-500/25 transition-colors border border-emerald-500/20"
                          >
                            {approvingId === draft.id ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />}
                            Aprovar
                          </button>
                        )}
                        <button
                          onClick={() => handleReject(draft.id)}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-zinc-500 text-xs hover:text-red-400 hover:bg-red-500/10 transition-colors"
                        >
                          <X size={10} /> Rejeitar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Filters + Add Button */}
            <div className="flex gap-3">
              <div className="flex-1 flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-2">
                <Search size={14} className="text-muted-foreground" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar cliente..."
                  className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none w-full"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-card border border-border text-sm text-[#c0c0cc] rounded-lg px-3 py-2 outline-none focus:border-primary"
              >
                <option value="all">Todos os status</option>
                <option value="onboarding">Onboarding</option>
                <option value="good">Bons Resultados</option>
                <option value="average">Resultados Médios</option>
                <option value="at_risk">Em Risco</option>
              </select>
              {isOperator && (
                <select
                  value={responsibleFilter}
                  onChange={(e) => setResponsibleFilter(e.target.value)}
                  className="bg-card border border-border text-sm text-[#c0c0cc] rounded-lg px-3 py-2 outline-none focus:border-primary"
                >
                  <option value="mine">Meus clientes</option>
                  <option value="all">Todos os clientes</option>
                  {responsibleNames.filter((n) => n !== currentUser).map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              )}
              {isAdmin && (
                <button
                  onClick={() => setShowArchived((v) => !v)}
                  className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm border transition-colors ${
                    showArchived
                      ? "bg-amber-500/15 text-amber-500 border-amber-500/30"
                      : "bg-card text-muted-foreground border-border hover:text-foreground"
                  }`}
                >
                  <Archive size={15} />
                  Arquivados
                </button>
              )}
              <button
                onClick={() => setShowNewModal(true)}
                className="btn-primary flex items-center gap-2 whitespace-nowrap"
              >
                <UserPlus size={15} />
                Novo Cliente
              </button>
            </div>

            {/* Client Cards / Arquivados */}
            {showArchived ? (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Archive size={12} /> Ex-clientes (churn). Reativar traz o cliente de volta à carteira ativa.
                </p>
                {lifecycleError && <p className="text-xs text-destructive">{lifecycleError}</p>}
                {archivedLoading && (
                  <div className="card text-center py-6 text-muted-foreground flex items-center justify-center gap-2">
                    <Loader2 className="animate-spin" size={16} /> Carregando…
                  </div>
                )}
                {!archivedLoading && archived.length === 0 && (
                  <div className="card text-center py-10 text-muted-foreground">Nenhum cliente arquivado.</div>
                )}
                {archived.map((c) => (
                  <div key={c.id} className="card flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold text-foreground tracking-tight truncate">{c.name}</h4>
                        <span className="text-xs text-muted-foreground shrink-0">{c.industry}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Arquivado {c.churnedAt ? new Date(c.churnedAt).toLocaleDateString("pt-BR") : "—"}
                        {c.churnReason ? ` · ${c.churnReason}` : ""}
                      </p>
                    </div>
                    <button
                      onClick={() => handleReactivate(c.id)}
                      disabled={lifecycleBusy}
                      className="btn-secondary flex items-center gap-2 whitespace-nowrap text-xs disabled:opacity-50"
                    >
                      <RotateCcw size={13} /> Reativar
                    </button>
                  </div>
                ))}
              </div>
            ) : (
            <div className="space-y-3">
              {filtered.length === 0 && (
                <div className="card text-center py-10 text-muted-foreground">
                  Nenhum cliente encontrado.
                </div>
              )}
              {filtered.map((client) => {
                const health = calcHealthScore(client);
                const hasMetaLinked = !!client.metaAdAccountId;
                const clientCampaignErrors = mockAdCampaigns.filter((c) => c.clientId === client.id && c.status === "error");
                const hasAdError = clientCampaignErrors.length > 0;
                return (
                  <div
                    key={client.id}
                    className={`card cursor-pointer transition-all select-none hover:border-primary/40 hover:bg-zinc-800/50 hover:shadow-lg ${
                      selectedClient?.id === client.id ? "border-primary/60 bg-primary/5" : ""
                    } ${client.status === "at_risk" ? "border-red-500/20" : ""} ${
                      hasMetaLinked ? "ring-1 ring-[#0d4af5]/30" : ""
                    } ${hasAdError ? "ring-1 ring-red-500/40" : ""}`}
                    onClick={() => {
                      if (client.status === "onboarding") {
                        router.push(`/clients/${client.id}?tab=onboarding`);
                      } else {
                        router.push(`/clients/${client.id}`);
                      }
                    }}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`${getStatusLed(client.status)}`} />

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <h4 className="font-semibold text-foreground tracking-tight">{client.name}</h4>
                            <span className="text-xs text-muted-foreground">{getStatusLabel(client.status)}</span>
                            {hasMetaLinked && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-[#0d4af5]/10 text-[#3b6ff5] border border-[#0d4af5]/20">
                                <Facebook size={9} />
                                Meta
                              </span>
                            )}
                            {hasAdError && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-red-500/10 text-red-400 border border-red-500/20 animate-pulse">
                                <AlertTriangle size={9} />
                                Erro em campanha
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground">{client.industry}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground w-12 shrink-0">Health</span>
                          <div className="flex-1 max-w-40">
                            <HealthBar score={health} />
                          </div>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                          <span>Tráfego: <span className="text-foreground/70">{client.assignedTraffic}</span></span>
                          <span>Social: <span className="text-foreground/70">{client.assignedSocial}</span></span>
                          <span>Designer: <span className="text-foreground/70">{client.assignedDesigner}</span></span>
                        </div>
                      </div>

                      {/* Three-dot menu */}
                      <div className="relative shrink-0">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setMenuOpen(menuOpen === client.id ? null : client.id);
                          }}
                          className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <MoreHorizontal size={16} />
                        </button>
                        {menuOpen === client.id && (
                          <>
                            <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setMenuOpen(null); }} />
                            <div className="absolute right-0 top-full mt-1 w-40 bg-card border border-border rounded-lg shadow-xl z-50 py-1 animate-fade-in">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedClient(client === selectedClient ? null : client);
                                  setMenuOpen(null);
                                }}
                                className="w-full text-left px-3 py-2 text-xs text-foreground hover:bg-muted transition-colors flex items-center gap-2"
                              >
                                <MessageSquare size={12} />
                                Chat
                              </button>
                              <Link
                                href={`/clients/${client.id}`}
                                onClick={(e) => { e.stopPropagation(); setMenuOpen(null); }}
                                className="w-full text-left px-3 py-2 text-xs text-foreground hover:bg-muted transition-colors flex items-center gap-2"
                              >
                                <ExternalLink size={12} />
                                Abrir Perfil
                              </Link>
                              {isAdmin && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setArchiveTarget(client);
                                    setArchiveReason("");
                                    setLifecycleError(null);
                                    setMenuOpen(null);
                                  }}
                                  className="w-full text-left px-3 py-2 text-xs text-amber-500 hover:bg-muted transition-colors flex items-center gap-2"
                                >
                                  <Archive size={12} />
                                  Arquivar (churn)
                                </button>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    {client.notes && (
                      <p className="mt-3 text-xs text-muted-foreground bg-muted rounded-lg px-3 py-2 border-l-2 border-zinc-600">
                        {client.notes}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
            )}
          </div>

          {/* Client Quick-Chat Panel */}
          {selectedClient && (
            <div className="w-80 border-l border-border flex flex-col animate-slide-up shrink-0">
              <div className="p-4 border-b border-border">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center text-sm font-bold text-primary">
                      {selectedClient.name[0]}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground leading-none">{selectedClient.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Chat interno da equipe</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Link
                      href={`/clients/${selectedClient.id}`}
                      className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Activity size={14} />
                    </Link>
                    <button
                      onClick={() => setSelectedClient(null)}
                      className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    >
                      ✕
                    </button>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <MessageSquare size={11} />
                  <span>Cada mensagem é salva no histórico do cliente</span>
                </div>
              </div>

              <div className="flex-1 overflow-auto p-3 space-y-3">
                {selectedChats.length === 0 && (
                  <p className="text-xs text-muted-foreground/50 text-center pt-6">
                    Sem mensagens ainda. Seja o primeiro!
                  </p>
                )}
                {selectedChats.map((msg) => (
                  <div key={msg.id} className={`flex flex-col ${msg.user === currentUser ? "items-end" : "items-start"}`}>
                    <span className="text-xs text-muted-foreground mb-0.5">{msg.user} · {msg.timestamp}</span>
                    <div className={`rounded-xl px-3 py-2 text-xs max-w-[85%] ${
                      msg.user === currentUser
                        ? "bg-primary/30 text-primary"
                        : "bg-muted text-foreground"
                    }`}>
                      {msg.text}
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-3 border-t border-border flex gap-2">
                <input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSend()}
                  placeholder="Mensagem..."
                  className="flex-1 bg-muted rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary"
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
