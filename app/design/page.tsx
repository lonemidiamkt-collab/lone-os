"use client";

import Header from "@/components/Header";
import KanbanBoard from "@/components/KanbanBoard";
import ContentCardModal from "@/components/ContentCardModal";
import DriveButton from "@/components/DriveButton";
import { useAppState } from "@/lib/context/AppStateContext";
import { getPriorityColor, getPriorityLabel } from "@/lib/utils";
import {
  Palette, Filter, Clock, CheckCircle, Loader, Paperclip, X,
  AlertTriangle, Zap, LayoutList, Columns3, Upload, Download,
  ImageIcon, Eye, ChevronDown, User, FileText, FileWarning, FolderOpen,
  ExternalLink, BarChart2,
} from "lucide-react";
import { useState, useMemo, useRef, useEffect } from "react";
import { useRole } from "@/lib/context/RoleContext";
import { useNav } from "@/lib/context/NavContext";
import type { ContentCard, DesignRequest } from "@/lib/types";

// ── Content card columns (same pipeline as social page) ──────────────────────

const CONTENT_COLUMNS = [
  { id: "ideas",           title: "Ideias",              color: "bg-zinc-600" },
  { id: "script",          title: "Roteiro",             color: "bg-zinc-600" },
  { id: "in_production",   title: "Em Produção",         color: "bg-primary" },
  { id: "approval",        title: "Aprovação",           color: "bg-[#3b6ff5]" },
  { id: "client_approval", title: "Aprov. Cliente",      color: "bg-[#0a34f5]" },
  { id: "scheduled",       title: "Agendado",            color: "bg-blue-500" },
  { id: "published",       title: "Publicado",           color: "bg-[#0a34f5]" },
];

// ── Design request columns ───────────────────────────────────────────────────

const DESIGN_COLUMNS = [
  { id: "queued",      title: "Na Fila",       color: "bg-zinc-600" },
  { id: "in_progress", title: "Em Produção",   color: "bg-primary" },
  { id: "done",        title: "Concluído",     color: "bg-[#0a34f5]" },
];

type TabView = "kanbans" | "requests" | "performance";

function getDeadlineUrgency(dueDate?: string): "overdue" | "today" | "soon" | "ok" | null {
  if (!dueDate) return null;
  const diff = (new Date(dueDate).getTime() - Date.now()) / 86400000;
  if (diff < 0) return "overdue";
  if (diff < 1) return "today";
  if (diff <= 3) return "soon";
  return "ok";
}

const URGENCY_BADGE: Record<string, { label: string; cls: string }> = {
  overdue: { label: "Vencido", cls: "text-red-500 bg-red-500/10 border-red-500/20" },
  today:   { label: "Hoje",   cls: "text-[#3b6ff5] bg-[#0a34f5]/10 border-[#0a34f5]/15" },
  soon:    { label: "Em breve", cls: "text-primary bg-primary/10 border-primary/20" },
  ok:      { label: "",       cls: "text-muted-foreground" },
};

// ── Upload Modal (Link Drive) ────────────────────────────────────────────────

function UploadArtModal({
  card,
  onClose,
}: {
  card: ContentCard;
  onClose: () => void;
}) {
  const { updateContentCard, updateDesignRequest, clients } = useAppState();
  const { currentUser } = useRole();
  const [artLink, setArtLink] = useState(
    card.imageUrl && card.imageUrl.includes("drive.google.com") ? card.imageUrl : ""
  );
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const clientDriveLink = clients.find((c) => c.id === card.clientId)?.driveLink;

  const handleSave = () => {
    if (!artLink.trim()) { setError("Insira o link da arte."); return; }
    if (!artLink.includes("drive.google.com") && !artLink.includes("docs.google.com") && !artLink.includes("http")) {
      setError("Insira um link válido (Google Drive ou URL)."); return;
    }
    updateContentCard(card.id, {
      imageUrl: artLink.trim(),
      designerDeliveredAt: new Date().toISOString(),
      designerDeliveredBy: currentUser,
    });
    if (card.designRequestId) {
      updateDesignRequest(card.designRequestId, { status: "done" });
    }
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      onClose();
    }, 800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-black border border-[#1a1a1a] rounded-2xl w-full max-w-md mx-4 shadow-[0_0_60px_rgba(10,52,245,0.08)] animate-fade-in" onClick={(e) => e.stopPropagation()}>
        <div className="h-px w-full bg-gradient-to-r from-transparent via-[#0a34f5]/40 to-transparent" />
        <div className="flex items-center justify-between p-5 border-b border-[#1a1a1a]">
          <div>
            <h3 className="font-semibold text-foreground text-sm flex items-center gap-2">
              <Upload size={14} className="text-[#0a34f5]" /> Entregar Arte
            </h3>
            <p className="text-xs text-primary mt-0.5">{card.title} — {card.clientName}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Client Drive quick access */}
          {clientDriveLink && (
            <a
              href={clientDriveLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-[#0a34f5]/[0.04] border border-[#0a34f5]/20 hover:border-[#0a34f5]/40 hover:shadow-[0_0_15px_rgba(10,52,245,0.1)] transition-all"
            >
              <FolderOpen size={14} className="text-[#0a34f5] drop-shadow-[0_0_4px_rgba(10,52,245,0.6)]" />
              <div className="flex-1">
                <p className="text-xs text-foreground font-medium">Pasta do cliente no Drive</p>
                <p className="text-[9px] text-muted-foreground">Abrir para fazer upload da arte</p>
              </div>
              <ExternalLink size={12} className="text-[#0a34f5]" />
            </a>
          )}

          {/* Art link input */}
          <div className="space-y-1.5">
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Link da Arte (Google Drive)</label>
            <input
              value={artLink}
              onChange={(e) => { setArtLink(e.target.value); setError(""); }}
              placeholder="https://drive.google.com/file/d/..."
              className="w-full bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-zinc-700 focus:border-[#0a34f5]/50 focus:shadow-[0_0_0_3px_rgba(10,52,245,0.08)] outline-none transition-all"
              autoFocus
            />
            {error && <p className="text-[10px] text-red-400">{error}</p>}
          </div>

          {/* Preview link */}
          {artLink && artLink.includes("http") && (
            <a
              href={artLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-xs text-[#0a34f5] hover:underline"
            >
              <ExternalLink size={11} /> Verificar link antes de enviar
            </a>
          )}

          {/* Card info */}
          <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-3 space-y-1.5 text-xs">
            <div className="flex items-center gap-2">
              <User size={11} className="text-muted-foreground" />
              <span className="text-muted-foreground">Social:</span>
              <span className="text-foreground">{card.socialMedia}</span>
            </div>
            <div className="flex items-center gap-2">
              <FileText size={11} className="text-muted-foreground" />
              <span className="text-muted-foreground">Formato:</span>
              <span className="text-foreground">{card.format}</span>
            </div>
            {card.briefing && (
              <div className="pt-1.5 border-t border-[#1a1a1a] mt-1.5">
                <p className="text-muted-foreground leading-relaxed line-clamp-3">{card.briefing}</p>
              </div>
            )}
          </div>
        </div>

        <div className="p-5 border-t border-[#1a1a1a] flex gap-2">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl text-xs text-zinc-500 hover:text-foreground hover:bg-white/5 transition-all">Cancelar</button>
          <button
            onClick={handleSave}
            disabled={!artLink.trim() || saved}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#0a34f5] text-white text-xs font-medium hover:bg-[#0a34f5]/80 transition-all shadow-[0_0_15px_rgba(10,52,245,0.3)] disabled:opacity-30 disabled:shadow-none"
          >
            {saved ? (
              <><CheckCircle size={14} /> Entregue!</>
            ) : (
              <><Upload size={14} /> Entregar Arte</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function DesignPage() {
  const { clients, contentCards, designRequests, updateDesignRequest, updateContentCard } = useAppState();
  const { role, currentUser } = useRole();
  const [tab, setTab] = useState<TabView>("kanbans");
  const { pendingTab, setPendingTab, setCurrentTab } = useNav();

  // NavContext wiring — sidebar tab switching
  useEffect(() => {
    if (pendingTab && ["kanbans", "requests", "performance"].includes(pendingTab)) {
      setTab(pendingTab as TabView);
      setPendingTab("");
    }
  }, [pendingTab, setPendingTab]);

  useEffect(() => {
    setCurrentTab(tab);
  }, [tab, setCurrentTab]);

  const [uploadCard, setUploadCard] = useState<ContentCard | null>(null);
  const [detailCard, setDetailCard] = useState<ContentCard | null>(null);
  const [briefingReq, setBriefingReq] = useState<DesignRequest | null>(null);
  const [nonDeliveryCard, setNonDeliveryCard] = useState<ContentCard | null>(null);
  const [nonDeliveryReason, setNonDeliveryReason] = useState("");

  // Filter content cards to only show clients assigned to this designer
  const myClientIds = useMemo(() => {
    if (role === "designer") {
      return new Set(clients.filter((c) => c.assignedDesigner === currentUser).map((c) => c.id));
    }
    return null; // null = show all (admin/manager)
  }, [clients, role, currentUser]);

  const myContentCards = useMemo(() => {
    if (!myClientIds) return contentCards;
    return contentCards.filter((c) => myClientIds.has(c.clientId));
  }, [contentCards, myClientIds]);

  const myDesignRequests = useMemo(() => {
    if (!myClientIds) return designRequests;
    return designRequests.filter((r) => myClientIds.has(r.clientId));
  }, [designRequests, myClientIds]);

  // Get social media people from content cards
  const socialPeople = useMemo(() => {
    return [...new Set(myContentCards.map((c) => c.socialMedia))].sort();
  }, [myContentCards]);

  // Group cards per social media person
  const cardsBySocial = useMemo(() => {
    const map: Record<string, ContentCard[]> = {};
    socialPeople.forEach((p) => {
      map[p] = myContentCards.filter((c) => c.socialMedia === p);
    });
    return map;
  }, [myContentCards, socialPeople]);

  // Stats
  const needsArt = myContentCards.filter((c) =>
    !c.imageUrl && ["in_production", "approval", "client_approval"].includes(c.status)
  ).length;
  const totalInProduction = myContentCards.filter((c) => c.status === "in_production").length;
  const totalDone = myDesignRequests.filter((r) => r.status === "done").length;
  const urgentCards = myContentCards.filter((c) => {
    if (c.status === "published" || c.status === "scheduled") return false;
    const u = getDeadlineUrgency(c.dueDate);
    return u === "overdue" || u === "today";
  }).length;

  return (
    <div className="flex flex-col flex-1 overflow-auto">
      <Header title="Área do Designer" subtitle="Produção de artes — kanbans por social media" />

      <div className="p-6 space-y-6 animate-fade-in">
        {/* Tab selector */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
            <button
              onClick={() => setTab("kanbans")}
              className={`text-xs px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 ${
                tab === "kanbans" ? "bg-card text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Columns3 size={13} /> Kanbans Social Media
            </button>
            <button
              onClick={() => setTab("requests")}
              className={`text-xs px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 ${
                tab === "requests" ? "bg-card text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <LayoutList size={13} /> Solicitações de Design
            </button>
            <button
              onClick={() => setTab("performance")}
              className={`text-xs px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 ${
                tab === "performance" ? "bg-card text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <BarChart2 size={13} /> Performance
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="card flex items-center gap-4">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${needsArt > 0 ? "bg-[#3b6ff5]/15" : "bg-[#111118]"}`}>
              <ImageIcon size={18} className={needsArt > 0 ? "text-[#3b6ff5]" : "text-zinc-400"} />
            </div>
            <div>
              <p className={`text-2xl font-bold ${needsArt > 0 ? "text-[#3b6ff5]" : "text-foreground"}`}>{needsArt}</p>
              <p className="text-xs text-muted-foreground">Precisam de arte</p>
            </div>
          </div>
          <div className="card flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
              <Loader size={18} className="text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{totalInProduction}</p>
              <p className="text-xs text-muted-foreground">Em produção</p>
            </div>
          </div>
          <div className="card flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-[#0a34f5]/15 flex items-center justify-center">
              <CheckCircle size={18} className="text-[#0a34f5]" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{totalDone}</p>
              <p className="text-xs text-muted-foreground">Designs concluídos</p>
            </div>
          </div>
          <div className="card flex items-center gap-4">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${urgentCards > 0 ? "bg-red-500/15" : "bg-[#111118]"}`}>
              <AlertTriangle size={18} className={urgentCards > 0 ? "text-red-500" : "text-zinc-500"} />
            </div>
            <div>
              <p className={`text-2xl font-bold ${urgentCards > 0 ? "text-red-500" : "text-foreground"}`}>{urgentCards}</p>
              <p className="text-xs text-muted-foreground">Urgentes</p>
            </div>
          </div>
        </div>

        {/* ═══ PASTAS DRIVE — Acesso rápido por cliente ═══ */}
        {(() => {
          const uniqueClientIds = [...new Set(myContentCards.map((c) => c.clientId))];
          const driveClients = uniqueClientIds
            .map((id) => clients.find((c) => c.id === id))
            .filter(Boolean) as typeof clients;
          if (driveClients.length === 0) return null;
          return (
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mr-1">
                <FolderOpen size={12} /> Drive:
              </div>
              {driveClients.map((c) => (
                <DriveButton key={c.id} driveLink={c.driveLink} clientName={c.name} size="md" />
              ))}
            </div>
          );
        })()}

        {/* ═══ KANBANS TAB ═══ */}
        {tab === "kanbans" && (
          <div className="space-y-8">
            {/* Pending deadlines strip */}
            {(() => {
              const upcoming = contentCards
                .filter((c) => c.dueDate && c.status !== "published" && c.status !== "scheduled" && !c.designerDeliveredAt)
                .sort((a, b) => {
                  const cmp = (a.dueDate ?? "").localeCompare(b.dueDate ?? "");
                  if (cmp !== 0) return cmp;
                  return (a.dueTime ?? "23:59").localeCompare(b.dueTime ?? "23:59");
                })
                .slice(0, 6);
              if (upcoming.length === 0) return null;
              return (
                <div className="bg-card border border-border rounded-xl p-4">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-3 flex items-center gap-1.5">
                    <Clock size={11} /> Próximas Pendências — Artes sem Entrega
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {upcoming.map((card) => {
                      const urg = getDeadlineUrgency(card.dueDate);
                      const isOverdue = urg === "overdue";
                      const isToday = urg === "today";
                      return (
                        <div
                          key={card.id}
                          className={`flex items-center gap-2.5 p-2.5 rounded-lg border transition-colors cursor-pointer hover:border-primary/30 ${
                            isOverdue ? "bg-red-500/5 border-red-500/20" : isToday ? "bg-[#0a34f5]/5 border-[#0a34f5]/15" : "bg-muted/50 border-border"
                          }`}
                          onClick={() => setUploadCard(card)}
                        >
                          <div className={`w-2 h-2 rounded-full shrink-0 ${isOverdue ? "bg-red-500" : isToday ? "bg-[#3b6ff5]" : "bg-primary"}`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-foreground font-medium truncate">{card.title}</p>
                            <p className="text-[10px] text-muted-foreground">{card.clientName} · {card.socialMedia}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className={`text-[10px] font-medium ${isOverdue ? "text-red-500" : isToday ? "text-[#3b6ff5]" : "text-muted-foreground"}`}>
                              {card.dueDate}
                            </p>
                            {card.dueTime && (
                              <p className="text-[10px] text-foreground font-semibold">{card.dueTime}</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {socialPeople.map((person) => {
              const cards = cardsBySocial[person] ?? [];
              const personNeedsArt = cards.filter((c) =>
                !c.imageUrl && ["in_production", "approval", "client_approval"].includes(c.status)
              ).length;

              return (
                <div key={person} className="space-y-3">
                  {/* Person header */}
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                      <User size={14} className="text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">{person}</h3>
                      <p className="text-xs text-muted-foreground">
                        {cards.length} cards
                        {personNeedsArt > 0 && (
                          <span className="text-[#3b6ff5] ml-2">
                            · {personNeedsArt} precisam de arte
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Kanban for this person — sorted by deadline */}
                  <KanbanBoard
                    columns={CONTENT_COLUMNS.map((col) => ({
                      ...col,
                      items: cards
                        .filter((c) => c.status === col.id)
                        .sort((a, b) => {
                          // Sort by deadline urgency: overdue first, then today, then by date
                          if (!a.dueDate && !b.dueDate) return 0;
                          if (!a.dueDate) return 1;
                          if (!b.dueDate) return -1;
                          const dateCompare = a.dueDate.localeCompare(b.dueDate);
                          if (dateCompare !== 0) return dateCompare;
                          // Same date: sort by time
                          return (a.dueTime ?? "23:59").localeCompare(b.dueTime ?? "23:59");
                        })
                        .map((c) => ({
                          id: c.id,
                          title: c.title,
                          clientName: c.clientName,
                          format: c.format,
                          priority: c.priority,
                          dueDate: c.dueDate,
                          dueTime: c.dueTime,
                          imageUrl: c.imageUrl,
                          briefing: c.briefing,
                          requestedByTraffic: c.requestedByTraffic,
                          _card: c,
                        })),
                    }))}
                    renderCard={(item) => {
                      const urgency = getDeadlineUrgency(item.dueDate);
                      const badge = urgency && urgency !== "ok" ? URGENCY_BADGE[urgency] : null;
                      const hasArt = !!item.imageUrl;

                      return (
                        <div className={`bg-card border rounded-lg p-3 space-y-2 transition-colors ${
                          !hasArt && ["in_production", "approval", "client_approval"].includes(
                            contentCards.find((c) => c.id === item.id)?.status ?? ""
                          )
                            ? "border-yellow-500/30 bg-[#0a34f5]/5"
                            : "border-border hover:border-primary/30"
                        }`}>
                          {/* Art thumbnail */}
                          {hasArt && (
                            <div className="w-full h-20 rounded-md overflow-hidden bg-muted">
                              <img src={item.imageUrl} alt="" className="w-full h-full object-cover" />
                            </div>
                          )}

                          {item.requestedByTraffic && (
                            <div className="flex items-center gap-1.5 text-[10px] font-medium px-2 py-1 rounded-md border text-[#3b6ff5] bg-[#3b6ff5]/10 border-[#3b6ff5]/20">
                              <Zap size={10} />
                              Solicitação Tráfego
                            </div>
                          )}

                          <p className="text-sm font-medium text-foreground leading-tight">{item.title}</p>

                          <div className="flex items-center gap-2 text-xs">
                            <span className="text-primary">{item.clientName}</span>
                            <span className="text-muted-foreground">{item.format}</span>
                          </div>

                          {/* Date + Time + Urgency */}
                          {item.dueDate && (
                            <div className="flex items-center gap-1.5 text-[10px]">
                              <Clock size={9} className="text-muted-foreground" />
                              <span className="text-muted-foreground">{item.dueDate}</span>
                              {item.dueTime && <span className="text-foreground font-medium">{item.dueTime}</span>}
                              {badge && (
                                <span className={`px-1.5 py-0.5 rounded border ml-auto ${badge.cls}`}>
                                  {badge.label}
                                </span>
                              )}
                            </div>
                          )}

                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`badge border text-[10px] ${getPriorityColor(item.priority)}`}>
                              {getPriorityLabel(item.priority)}
                            </span>
                            {hasArt ? (
                              <span className="text-[10px] text-[#0a34f5] flex items-center gap-0.5">
                                <CheckCircle size={9} /> Arte
                              </span>
                            ) : (
                              <span className="text-[10px] text-[#3b6ff5] flex items-center gap-0.5">
                                <ImageIcon size={9} /> Sem arte
                              </span>
                            )}
                          </div>

                          {/* Handoff status */}
                          {(() => {
                            const fullCard = item._card as ContentCard;
                            return (
                              <>
                                {fullCard.designerDeliveredAt && (
                                  <div className="flex items-center gap-1 text-[10px]">
                                    <CheckCircle size={9} className="text-[#0a34f5]" />
                                    <span className="text-[#0a34f5]">Entregue</span>
                                    {fullCard.socialConfirmedAt ? (
                                      <span className="text-[#0a34f5] ml-1">· Confirmado</span>
                                    ) : (
                                      <span className="text-[#3b6ff5] ml-1">· Aguardando social</span>
                                    )}
                                  </div>
                                )}
                                {fullCard.nonDeliveryReason && (
                                  <div className="flex items-center gap-1 text-[10px] text-red-400" title={fullCard.nonDeliveryReason}>
                                    <FileWarning size={9} /> N/Entregue: {fullCard.nonDeliveryReason.slice(0, 30)}...
                                  </div>
                                )}
                              </>
                            );
                          })()}

                          {/* Actions */}
                          <div className="flex items-center gap-1 pt-1.5 border-t border-border flex-wrap">
                            <button
                              onClick={(e) => { e.stopPropagation(); setUploadCard(item._card as ContentCard); }}
                              className="text-[10px] px-2 py-1 rounded-md bg-primary/15 text-primary hover:bg-primary/25 transition-colors flex items-center gap-1"
                            >
                              <Upload size={10} />
                              {hasArt ? "Trocar" : "Enviar Arte"}
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); setDetailCard(item._card as ContentCard); }}
                              className="text-[10px] px-2 py-1 rounded-md bg-muted text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                            >
                              <Eye size={10} /> Detalhes
                            </button>
                            {hasArt && (
                              <a
                                href={item.imageUrl}
                                download
                                onClick={(e) => e.stopPropagation()}
                                className="text-[10px] px-2 py-1 rounded-md bg-muted text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                              >
                                <Download size={10} /> Baixar
                              </a>
                            )}
                            {(() => {
                              const fc = item._card as ContentCard;
                              const isOverdue = item.dueDate && getDeadlineUrgency(item.dueDate) === "overdue";
                              if (fc.nonDeliveryReason || fc.status === "published" || fc.status === "scheduled") return null;
                              if (!isOverdue) return null;
                              return (
                                <button
                                  onClick={(e) => { e.stopPropagation(); setNonDeliveryCard(fc); }}
                                  className="text-[10px] px-2 py-1 rounded-md bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-colors flex items-center gap-1"
                                >
                                  <FileWarning size={10} /> Reportar
                                </button>
                              );
                            })()}
                          </div>
                        </div>
                      );
                    }}
                    onMove={(itemId, _from, to) => {
                      updateContentCard(itemId, {
                        status: to as ContentCard["status"],
                        statusChangedAt: new Date().toISOString(),
                      });
                    }}
                  />
                </div>
              );
            })}
          </div>
        )}

        {/* ═══ REQUESTS TAB ═══ */}
        {tab === "requests" && (
          <RequestsView
            designRequests={myDesignRequests}
            contentCards={myContentCards}
            updateDesignRequest={updateDesignRequest}
            onBriefing={setBriefingReq}
          />
        )}
      </div>

      {/* ═══ PERFORMANCE TAB ═══ */}
      {tab === "performance" && (
        <div className="space-y-6 animate-fade-in">
          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="card">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Total Entregues</p>
              <p className="text-2xl font-bold text-foreground">{myContentCards.filter((c) => c.designerDeliveredAt).length}</p>
              <p className="text-xs text-muted-foreground">artes finalizadas</p>
            </div>
            <div className="card">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">No Prazo</p>
              <p className="text-2xl font-bold text-[#0a34f5]">
                {myContentCards.filter((c) => c.designerDeliveredAt && c.dueDate && c.designerDeliveredAt.slice(0, 10) <= c.dueDate).length}
              </p>
              <p className="text-xs text-muted-foreground">entregas antes do deadline</p>
            </div>
            <div className="card">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Atrasadas</p>
              <p className="text-2xl font-bold text-red-400">
                {myContentCards.filter((c) => c.designerDeliveredAt && c.dueDate && c.designerDeliveredAt.slice(0, 10) > c.dueDate).length}
              </p>
              <p className="text-xs text-muted-foreground">entregas após deadline</p>
            </div>
            <div className="card">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Pendentes</p>
              <p className="text-2xl font-bold text-amber-400">{needsArt}</p>
              <p className="text-xs text-muted-foreground">aguardando arte</p>
            </div>
          </div>

          {/* Delivery rate by social media person */}
          <div className="card">
            <h3 className="font-semibold text-foreground text-sm mb-4">Entregas por Social Media</h3>
            <div className="space-y-3">
              {socialPeople.map((person) => {
                const personCards = cardsBySocial[person] ?? [];
                const delivered = personCards.filter((c) => c.designerDeliveredAt).length;
                const total = personCards.filter((c) => !["ideas", "script"].includes(c.status)).length;
                const pct = total > 0 ? Math.round((delivered / total) * 100) : 0;
                return (
                  <div key={person}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-foreground">{person}</span>
                      <span className="text-xs text-muted-foreground">{delivered}/{total} ({pct}%)</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#0a34f5] rounded-full transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Recent deliveries */}
          <div className="card">
            <h3 className="font-semibold text-foreground text-sm mb-4">Entregas Recentes</h3>
            {myContentCards.filter((c) => c.designerDeliveredAt).length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhuma entrega registrada ainda.</p>
            ) : (
              <div className="space-y-2">
                {myContentCards
                  .filter((c) => c.designerDeliveredAt)
                  .sort((a, b) => (b.designerDeliveredAt ?? "").localeCompare(a.designerDeliveredAt ?? ""))
                  .slice(0, 10)
                  .map((c) => {
                    const onTime = c.dueDate && c.designerDeliveredAt && c.designerDeliveredAt.slice(0, 10) <= c.dueDate;
                    return (
                      <div key={c.id} className="flex items-center gap-3 py-2 border-b border-border/50 last:border-0">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${onTime ? "bg-[#0a34f5]" : "bg-red-400"}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-foreground truncate">{c.title}</p>
                          <p className="text-[10px] text-muted-foreground">{c.clientName} · {c.socialMedia}</p>
                        </div>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${onTime ? "bg-[#0a34f5]/10 text-[#0a34f5] border border-[#0a34f5]/20" : "bg-red-500/10 text-red-400 border border-red-500/20"}`}>
                          {onTime ? "No prazo" : "Atrasado"}
                        </span>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Upload Art Modal */}
      {uploadCard && (
        <UploadArtModal card={uploadCard} onClose={() => setUploadCard(null)} />
      )}

      {/* Card Detail Modal (reuse ContentCardModal from social) */}
      {detailCard && (
        <ContentCardModal card={detailCard} onClose={() => setDetailCard(null)} />
      )}

      {/* Non-delivery report modal */}
      {nonDeliveryCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => { setNonDeliveryCard(null); setNonDeliveryReason(""); }}>
          <div className="bg-card border border-border rounded-2xl w-full max-w-md mx-4 shadow-2xl animate-fade-in" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-border">
              <h3 className="font-semibold text-foreground text-sm">Reportar Não Entrega</h3>
              <p className="text-xs text-primary mt-0.5">{nonDeliveryCard.title} — {nonDeliveryCard.clientName}</p>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-xs text-muted-foreground">Informe o motivo pelo qual esta arte/conteúdo não foi entregue:</p>
              <textarea
                value={nonDeliveryReason}
                onChange={(e) => setNonDeliveryReason(e.target.value)}
                rows={3}
                placeholder="Ex: Cliente não enviou materiais, briefing incompleto..."
                className="w-full bg-muted rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary resize-none"
              />
            </div>
            <div className="p-5 border-t border-border flex gap-2">
              <button onClick={() => { setNonDeliveryCard(null); setNonDeliveryReason(""); }} className="btn-ghost flex-1 text-sm">Cancelar</button>
              <button
                onClick={() => {
                  if (!nonDeliveryReason.trim()) return;
                  updateContentCard(nonDeliveryCard.id, {
                    nonDeliveryReason: nonDeliveryReason.trim(),
                    nonDeliveryReportedBy: currentUser,
                    nonDeliveryReportedAt: new Date().toISOString(),
                  });
                  setNonDeliveryCard(null);
                  setNonDeliveryReason("");
                }}
                disabled={!nonDeliveryReason.trim()}
                className="btn-primary flex-1 text-sm disabled:opacity-50"
              >
                Reportar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Briefing Modal — with designer actions */}
      {briefingReq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setBriefingReq(null)}>
          <div className="bg-card border border-border rounded-2xl w-full max-w-lg mx-4 shadow-2xl animate-fade-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between p-5 border-b border-border">
              <div>
                <h3 className="font-semibold text-foreground">{briefingReq.title}</h3>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-primary">{briefingReq.clientName}</span>
                  <span className="text-muted-foreground/50">·</span>
                  <span className="text-xs text-muted-foreground">{briefingReq.format}</span>
                  <span className="text-muted-foreground/50">·</span>
                  <span className={`badge border text-xs ${getPriorityColor(briefingReq.priority)}`}>
                    {getPriorityLabel(briefingReq.priority)}
                  </span>
                </div>
              </div>
              <button onClick={() => setBriefingReq(null)} className="text-muted-foreground hover:text-foreground transition-colors p-1">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <p className="text-xs text-muted-foreground font-medium mb-1.5">Briefing Completo</p>
                <p className="text-sm text-foreground leading-relaxed bg-muted border border-border rounded-lg p-4">
                  {briefingReq.briefing}
                </p>
              </div>
              {briefingReq.deadline && (
                <div className="flex items-center gap-2">
                  <Clock size={13} className="text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Prazo: <span className="text-foreground font-medium">{briefingReq.deadline}</span></span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Palette size={13} className="text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Pedido por: <span className="text-foreground font-medium">{briefingReq.requestedBy}</span></span>
              </div>
              {/* Status badge */}
              <div className="flex items-center gap-2">
                <span className={`badge border text-xs ${
                  briefingReq.status === "done" ? "text-[#0a34f5] bg-[#0a34f5]/10 border-[#0a34f5]/20" :
                  briefingReq.status === "in_progress" ? "text-primary bg-primary/10 border-primary/20" :
                  "text-zinc-400 bg-[#0e0e14] border-[#1e1e2a]"
                }`}>
                  {briefingReq.status === "queued" ? "Na Fila" : briefingReq.status === "in_progress" ? "Em Produção" : "Concluído"}
                </span>
              </div>
            </div>
            <div className="p-5 border-t border-border flex gap-2">
              {briefingReq.status === "queued" && (
                <button
                  onClick={() => {
                    updateDesignRequest(briefingReq.id, { status: "in_progress" });
                    setBriefingReq({ ...briefingReq, status: "in_progress" });
                  }}
                  className="btn-primary flex-1 text-sm flex items-center justify-center gap-1.5"
                >
                  <Zap size={13} /> Aceitar e Iniciar
                </button>
              )}
              {briefingReq.status === "in_progress" && (
                <button
                  onClick={() => {
                    updateDesignRequest(briefingReq.id, { status: "done" });
                    setBriefingReq(null);
                  }}
                  className="bg-[#0a34f5] hover:bg-[#0a34f5]/80 text-white px-3 py-2 rounded-lg font-medium text-sm transition-colors flex-1 flex items-center justify-center gap-1.5"
                >
                  <CheckCircle size={13} /> Marcar Concluído
                </button>
              )}
              <button onClick={() => setBriefingReq(null)} className="btn-ghost flex-1 text-sm">Fechar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Requests sub-view (old design requests list + kanban) ────────────────────

function RequestsView({
  designRequests,
  contentCards,
  updateDesignRequest,
  onBriefing,
}: {
  designRequests: DesignRequest[];
  contentCards: ContentCard[];
  updateDesignRequest: (id: string, updates: Partial<DesignRequest>) => void;
  onBriefing: (req: DesignRequest) => void;
}) {
  const [viewMode, setViewMode] = useState<"list" | "kanban">("kanban");
  const [statusFilter, setStatusFilter] = useState<"all" | "queued" | "in_progress" | "done">("all");

  const filtered = designRequests.filter((r) => {
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    return true;
  });

  const getLinkedCard = (req: DesignRequest) =>
    contentCards.find((c) => c.designRequestId === req.id);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-muted-foreground" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="bg-card border border-border text-sm text-[#c0c0cc] rounded-lg px-3 py-1.5 outline-none focus:border-primary"
          >
            <option value="all">Status: Todos</option>
            <option value="queued">Na Fila</option>
            <option value="in_progress">Em Produção</option>
            <option value="done">Concluído</option>
          </select>
        </div>

        <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5 ml-auto">
          <button onClick={() => setViewMode("kanban")}
            className={`text-xs px-2.5 py-1.5 rounded-md transition-colors flex items-center gap-1 ${viewMode === "kanban" ? "bg-card text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          ><Columns3 size={13} /> Kanban</button>
          <button onClick={() => setViewMode("list")}
            className={`text-xs px-2.5 py-1.5 rounded-md transition-colors flex items-center gap-1 ${viewMode === "list" ? "bg-card text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          ><LayoutList size={13} /> Lista</button>
        </div>

        <span className="text-xs text-muted-foreground">{filtered.length} resultado(s)</span>
      </div>

      {viewMode === "kanban" && (
        <KanbanBoard
          columns={DESIGN_COLUMNS.map((col) => ({
            ...col,
            items: filtered
              .filter((r) => r.status === col.id)
              .map((r) => ({
                id: r.id,
                title: r.title,
                clientName: r.clientName,
                format: r.format,
                priority: r.priority,
                deadline: r.deadline,
                requestedBy: r.requestedBy,
                briefing: r.briefing,
                _req: r,
              })),
          }))}
          renderCard={(item) => (
            <div className="bg-card border border-border rounded-lg p-3 space-y-2 hover:border-primary/30 transition-colors">
              <p className="text-sm font-medium text-foreground">{item.title}</p>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-primary">{item.clientName}</span>
                <span className="text-muted-foreground">{item.format}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className={`badge border text-xs ${getPriorityColor(item.priority)}`}>{getPriorityLabel(item.priority)}</span>
                {item.deadline && <span className="text-[10px] text-muted-foreground">{item.deadline}</span>}
              </div>
              <div className="flex items-center gap-1.5 pt-1.5 border-t border-border">
                <p className="text-[10px] text-muted-foreground flex-1">por {item.requestedBy}</p>
                <button
                  onClick={(e) => { e.stopPropagation(); onBriefing(item._req as DesignRequest); }}
                  className="text-[10px] px-2 py-1 rounded-md bg-muted text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                >
                  <Paperclip size={10} /> Briefing
                </button>
              </div>
            </div>
          )}
          onMove={(itemId, _from, to) => {
            updateDesignRequest(itemId, { status: to as DesignRequest["status"] });
          }}
        />
      )}

      {viewMode === "list" && (
        <div className="space-y-2">
          {filtered.length === 0 && (
            <div className="card text-center py-10 text-muted-foreground">Nenhuma solicitação encontrada.</div>
          )}
          {filtered.map((req) => {
            const linked = getLinkedCard(req);
            return (
              <div key={req.id} className="card border border-border hover:border-primary/30 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h4 className="font-semibold text-foreground text-sm">{req.title}</h4>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-xs text-primary">{req.clientName}</span>
                      <span className="text-muted-foreground/50">·</span>
                      <span className="text-xs text-muted-foreground">{req.format}</span>
                      <span className="text-muted-foreground/50">·</span>
                      <span className="text-xs text-muted-foreground">por {req.requestedBy}</span>
                    </div>
                    {req.briefing && <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">{req.briefing}</p>}
                    {linked && (
                      <span className="text-[10px] text-zinc-400 bg-[#111118] border border-[#1e1e2a] px-2 py-0.5 rounded-full mt-1.5 inline-block">
                        Card: {linked.title}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`badge border text-xs ${getPriorityColor(req.priority)}`}>{getPriorityLabel(req.priority)}</span>
                    <span className={`badge border text-xs ${
                      req.status === "done" ? "text-[#0a34f5] bg-[#0a34f5]/10 border-[#0a34f5]/20" :
                      req.status === "in_progress" ? "text-primary bg-primary/10 border-primary/20" :
                      "text-zinc-400 bg-[#0e0e14] border-[#1e1e2a]"
                    }`}>
                      {req.status === "queued" ? "Na Fila" : req.status === "in_progress" ? "Em Produção" : "Concluído"}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-3 pt-2 border-t border-border">
                  {req.status === "queued" && (
                    <button onClick={() => updateDesignRequest(req.id, { status: "in_progress" })} className="btn-primary text-xs py-1.5">
                      Iniciar Produção
                    </button>
                  )}
                  {req.status === "in_progress" && (
                    <button onClick={() => updateDesignRequest(req.id, { status: "done" })} className="bg-[#0a34f5] hover:bg-[#0a34f5]/80 text-white px-3 py-1.5 rounded-lg font-medium text-xs transition-colors">
                      Marcar Concluído
                    </button>
                  )}
                  {req.status === "done" && (
                    <span className="text-xs text-[#0a34f5] flex items-center gap-1"><CheckCircle size={12} /> Concluído</span>
                  )}
                  <button onClick={() => onBriefing(req)} className="btn-ghost text-xs flex items-center gap-1">
                    <Paperclip size={12} /> Briefing
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
