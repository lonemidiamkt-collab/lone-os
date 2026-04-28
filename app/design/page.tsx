"use client";

import Header from "@/components/Header";
import KanbanBoard from "@/components/KanbanBoard";
import ContentCardModal from "@/components/ContentCardModal";
import { useAppState } from "@/lib/context/AppStateContext";
import { getPriorityColor, getPriorityLabel } from "@/lib/utils";
import {
  Palette, Filter, Clock, CheckCircle, Loader, Paperclip, X,
  AlertTriangle, Zap, LayoutList, Columns3, Upload, Download,
  ImageIcon, Eye, ChevronDown, User, Users, FileText, FileWarning, FolderOpen,
  ExternalLink, BarChart2, Plus, Calendar, ArrowRight,
} from "lucide-react";
import { useState, useMemo, useRef, useEffect } from "react";
import { useRole } from "@/lib/context/RoleContext";
import { useNav } from "@/lib/context/NavContext";
import type { Client, ContentCard, DesignRequest } from "@/lib/types";
import MonthObservancesAlert from "@/components/MonthObservancesAlert";
import { MarkdownView, markdownPlainText } from "@/components/Markdown";
import KanbanErrorBoundary from "@/components/KanbanErrorBoundary";

// ── Designer-focused columns (simplified from 7 → 4) ─────────────────────────
// Maps: ideas/script → "queue", in_production → "doing", blocked → "blocked", rest → "delivered"

const DESIGNER_COLUMNS = [
  { id: "queue",     title: "Fila / Pra Fazer",           color: "bg-zinc-600",   statuses: ["ideas", "script"] },
  { id: "doing",     title: "Em Producao",                color: "bg-primary",    statuses: ["in_production"] },
  { id: "blocked",   title: "Bloqueado / Devolvido",      color: "bg-red-500",    statuses: ["blocked"] },
  { id: "delivered", title: "Aprovação",                  color: "bg-[#0d4af5]",  statuses: ["approval", "client_approval", "scheduled", "published"] },
];

// Status mapping: designer column → actual content card status
const DESIGNER_COL_TO_STATUS: Record<string, string> = {
  queue: "ideas",
  doing: "in_production",
  blocked: "blocked",
  delivered: "approval",
};

const BLOCK_REASONS = [
  "Falta de dados / briefing incompleto",
  "Texto/copy muito longo ou inadequado",
  "Referencia visual ruim ou ausente",
  "Aguardando aprovacao previa",
  "Assets do cliente nao recebidos",
  "Formato/dimensao indefinido",
];

// ── Design request columns ───────────────────────────────────────────────────

const DESIGN_COLUMNS = [
  { id: "queued",      title: "Na Fila",       color: "bg-zinc-600" },
  { id: "in_progress", title: "Em Produção",   color: "bg-primary" },
  { id: "done",        title: "Concluído",     color: "bg-[#0d4af5]" },
];

type TabView = "kanbans" | "requests" | "performance" | "history" | "clientes";

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
  today:   { label: "Hoje",   cls: "text-[#3b6ff5] bg-[#0d4af5]/10 border-[#0d4af5]/15" },
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
  const { updateContentCard, updateDesignRequest, clients, pushNotification } = useAppState();
  const { currentUser } = useRole();
  const [artLink, setArtLink] = useState(
    card.imageUrl && card.imageUrl.includes("drive.google.com") ? card.imageUrl : ""
  );
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string>("");
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const clientDriveLink = clients.find((c) => c.id === card.clientId)?.driveLink;

  // ─── Upload de arquivo direto (PNG/JPG/PDF/MP4) ───
  const handleFileUpload = async (file: File) => {
    setError("");
    if (file.size === 0) { setError("Arquivo vazio."); return; }
    if (file.size > 25 * 1024 * 1024) {
      setError(`Arquivo muito grande (${(file.size / 1024 / 1024).toFixed(1)}MB). Máximo: 25MB`);
      return;
    }
    const allowed = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif", "application/pdf", "video/mp4", "video/webm"];
    if (!allowed.includes(file.type)) {
      setError(`Tipo não suportado (${file.type}). Use PNG, JPEG, WebP, GIF, PDF ou MP4.`);
      return;
    }

    setUploading(true);
    setUploadProgress("Enviando arquivo...");
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("cardId", card.id);

      const { authedFetch } = await import("@/lib/supabase/authed-fetch");
      const res = await authedFetch("/api/upload-art", { method: "POST", body: formData });
      const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));

      if (!res.ok) {
        setError(data.error || `Falha no upload: HTTP ${res.status}`);
        console.error("[UploadArt] upload failed:", { status: res.status, data });
        return;
      }

      setArtLink(data.url);
      setUploadProgress("Upload concluído. Clique em \"Entregar Arte\" para finalizar.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro de conexão";
      console.error("[UploadArt] upload exception:", err);
      setError(`Erro no upload: ${msg}`);
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    setError("");
    const link = artLink.trim();
    if (!link) { setError("Faça upload do arquivo OU cole um link da arte."); return; }
    try {
      const url = new URL(link);
      if (!url.protocol.startsWith("http")) {
        setError("URL inválida — deve começar com https://"); return;
      }
    } catch {
      setError("URL inválida — verifique o formato."); return;
    }

    setSaving(true);
    try {
      updateContentCard(card.id, {
        imageUrl: link,
        designerDeliveredAt: new Date().toISOString(),
        designerDeliveredBy: currentUser,
      }, { bypassWorkflow: true });

      if (card.designRequestId) {
        updateDesignRequest(card.designRequestId, { status: "done" });
      }
      pushNotification("content", "Arte entregue pelo Designer", `"${card.title}" (${card.clientName}) — arte pronta para confirmacao. Clique no card para confirmar.`, card.clientId);
      import("@/lib/audio").then((m) => m.playNotificationSound()).catch(() => {});
      setSaved(true);
      setTimeout(() => { setSaved(false); onClose(); }, 800);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      console.error("[UploadArt] save failed:", err);
      setError(`Não foi possível salvar: ${msg}`);
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-black border border-[#1a1a1a] rounded-2xl w-full max-w-md mx-4 shadow-[0_0_60px_rgba(10,52,245,0.08)] animate-fade-in" onClick={(e) => e.stopPropagation()}>
        <div className="h-px w-full bg-gradient-to-r from-transparent via-[#0d4af5]/40 to-transparent" />
        <div className="flex items-center justify-between p-5 border-b border-[#1a1a1a]">
          <div>
            <h3 className="font-semibold text-foreground text-sm flex items-center gap-2">
              <Upload size={14} className="text-[#0d4af5]" /> Entregar Arte
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
              className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-[#0d4af5]/[0.04] border border-[#0d4af5]/20 hover:border-[#0d4af5]/40 hover:shadow-[0_0_15px_rgba(10,52,245,0.1)] transition-all"
            >
              <FolderOpen size={14} className="text-[#0d4af5] drop-shadow-[0_0_4px_rgba(10,52,245,0.6)]" />
              <div className="flex-1">
                <p className="text-xs text-foreground font-medium">Pasta do cliente no Drive</p>
                <p className="text-[9px] text-muted-foreground">Abrir para fazer upload da arte</p>
              </div>
              <ExternalLink size={12} className="text-[#0d4af5]" />
            </a>
          )}

          {/* File upload — direto do computador */}
          <div className="space-y-1.5">
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Upload do arquivo</label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,application/pdf,video/mp4,video/webm"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || saving}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-dashed border-[#0d4af5]/40 bg-[#0d4af5]/[0.04] hover:bg-[#0d4af5]/[0.08] hover:border-[#0d4af5]/60 transition-all text-sm text-foreground disabled:opacity-50 disabled:cursor-wait"
            >
              <Upload size={14} className="text-[#0d4af5]" />
              {uploading ? "Enviando..." : "Selecionar arquivo (PNG, JPG, PDF, MP4 — até 25MB)"}
            </button>
            {uploadProgress && (
              <p className="text-[10px] text-emerald-400 mt-1">{uploadProgress}</p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="flex-1 h-px bg-[#1a1a1a]" />
            <span className="text-[9px] text-zinc-700 uppercase tracking-wider">ou</span>
            <div className="flex-1 h-px bg-[#1a1a1a]" />
          </div>

          {/* Art link input — fallback */}
          <div className="space-y-1.5">
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Link da Arte (Google Drive)</label>
            <input
              value={artLink}
              onChange={(e) => { setArtLink(e.target.value); setError(""); }}
              placeholder="https://drive.google.com/file/d/..."
              className="w-full bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-zinc-700 focus:border-[#0d4af5]/50 focus:shadow-[0_0_0_3px_rgba(10,52,245,0.08)] outline-none transition-all"
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
              className="flex items-center gap-2 text-xs text-[#0d4af5] hover:underline"
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
                <p className="text-muted-foreground leading-relaxed line-clamp-3">{markdownPlainText(card.briefing)}</p>
              </div>
            )}
          </div>
        </div>

        <div className="p-5 border-t border-[#1a1a1a] flex gap-2">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl text-xs text-zinc-500 hover:text-foreground hover:bg-white/5 transition-all">Cancelar</button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!artLink.trim() || saved || saving}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#0d4af5] text-white text-xs font-medium hover:bg-[#0d4af5]/80 transition-all shadow-[0_0_15px_rgba(10,52,245,0.3)] disabled:opacity-30 disabled:shadow-none"
          >
            {saved ? (
              <><CheckCircle size={14} /> Entregue!</>
            ) : saving ? (
              <><Upload size={14} className="animate-pulse" /> Salvando...</>
            ) : (
              <><Upload size={14} /> Entregar Arte</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Download Button with feedback ────────────────────────────────────────────

function DownloadButton({ url, title }: { url: string; title: string }) {
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setState("loading");

    // Convert Google Drive view link to direct download
    let downloadUrl = url;
    if (url.includes("drive.google.com/file/d/")) {
      const fileId = url.match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1];
      if (fileId) downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
    }

    // Open in new tab (safest cross-browser approach for Drive files)
    window.open(downloadUrl, "_blank");

    setState("done");
    setTimeout(() => setState("idle"), 2000);
  };

  return (
    <button
      onClick={handleDownload}
      className="text-[11px] px-3 py-1.5 rounded-lg bg-white/[0.06] text-zinc-300 font-medium hover:text-white hover:bg-white/[0.1] transition-all flex items-center gap-1.5 border border-white/[0.06]"
    >
      {state === "loading" ? (
        <Loader size={11} className="animate-spin" />
      ) : state === "done" ? (
        <CheckCircle size={11} className="text-emerald-400" />
      ) : (
        <Download size={11} />
      )}
      {state === "done" ? "Aberto!" : "Baixar"}
    </button>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function DesignPage() {
  const { clients, contentCards, designRequests, updateDesignRequest, updateContentCard, pushNotification, addDesignRequest, updateClientData } = useAppState();
  const { role, currentUser } = useRole();
  const [tab, setTab] = useState<TabView>("kanbans");
  const { pendingTab, setPendingTab, setCurrentTab } = useNav();

  // NavContext wiring — sidebar tab switching
  useEffect(() => {
    if (pendingTab && ["kanbans", "requests", "performance", "history", "clientes"].includes(pendingTab)) {
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
  const [blockingCard, setBlockingCard] = useState<ContentCard | null>(null);
  const [blockReason, setBlockReason] = useState("");

  // Self-initiated task + client drawer
  const [newTaskClient, setNewTaskClient] = useState<Client | null>(null);
  const [newTaskOpen, setNewTaskOpen] = useState(false);

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
        {/* Banner de feriados/datas comemorativas do mês — pra planejamento criativo */}
        <MonthObservancesAlert title="Datas e feriados deste mês" />

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
              <LayoutList size={13} /> Quadro de Tarefas
            </button>
            <button
              onClick={() => setTab("clientes")}
              className={`text-xs px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 ${
                tab === "clientes" ? "bg-card text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Users size={13} /> Meus Clientes
            </button>
            <button
              onClick={() => setTab("performance")}
              className={`text-xs px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 ${
                tab === "performance" ? "bg-card text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <BarChart2 size={13} /> Performance
            </button>
            <button
              onClick={() => setTab("history")}
              className={`text-xs px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 ${
                tab === "history" ? "bg-card text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Clock size={13} /> Historico
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
            <div className="w-10 h-10 rounded-xl bg-[#0d4af5]/15 flex items-center justify-center">
              <CheckCircle size={18} className="text-[#0d4af5]" />
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

        {/* ═══ KANBANS TAB ═══ */}
        {tab === "kanbans" && (
          <div className="space-y-8">
            {/* Action bar: designer pode criar tarefa propria */}
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Gerencie as artes em produção e crie tarefas próprias.</p>
              <button
                onClick={() => setNewTaskOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0d4af5] hover:bg-[#1a56ff] text-white text-xs font-medium transition-colors"
              >
                <Plus size={12} /> Nova Tarefa
              </button>
            </div>

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
                            isOverdue ? "bg-red-500/5 border-red-500/20" : isToday ? "bg-[#0d4af5]/5 border-[#0d4af5]/15" : "bg-muted/50 border-border"
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
                  <KanbanErrorBoundary context={`Kanban Designer · ${person}`}>
                  <KanbanBoard
                    columns={DESIGNER_COLUMNS.map((col) => ({
                      id: col.id,
                      title: col.title,
                      color: col.color,
                      items: cards
                        .filter((c) => col.statuses.includes(c.status))
                        .sort((a, b) => {
                          // at_risk clients first, then by deadline
                          const aClient = clients.find((cl) => cl.id === a.clientId);
                          const bClient = clients.find((cl) => cl.id === b.clientId);
                          const aRisk = aClient?.status === "at_risk" ? 0 : 1;
                          const bRisk = bClient?.status === "at_risk" ? 0 : 1;
                          if (aRisk !== bRisk) return aRisk - bRisk;
                          // Then by budget (high first)
                          const aBudget = aClient?.monthlyBudget ?? 0;
                          const bBudget = bClient?.monthlyBudget ?? 0;
                          if (aBudget !== bBudget) return bBudget - aBudget;
                          // Then by deadline
                          if (!a.dueDate && !b.dueDate) return 0;
                          if (!a.dueDate) return 1;
                          if (!b.dueDate) return -1;
                          return a.dueDate.localeCompare(b.dueDate);
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
                      const client = clients.find((c) => c.id === (item._card as ContentCard).clientId);
                      const isAtRisk = client?.status === "at_risk";
                      const budgetTier = (client?.monthlyBudget ?? 0) >= 8000 ? "high" : (client?.monthlyBudget ?? 0) >= 4000 ? "med" : "low";

                      const fullCard = item._card as ContentCard;
                      return (
                        <div
                          onClick={() => setDetailCard(fullCard)}
                          className={`bg-card border rounded-lg p-3 space-y-2 transition-colors cursor-pointer ${
                          isAtRisk
                            ? "border-red-500/30 bg-red-500/[0.03]"
                            : fullCard.status === "blocked"
                            ? "border-red-500/40 bg-red-500/[0.05]"
                            : !hasArt && ["in_production", "approval", "client_approval"].includes(fullCard.status)
                              ? "border-yellow-500/30 bg-[#0d4af5]/5"
                              : "border-border hover:border-primary/30"
                        }`}>
                          {/* Client risk + budget indicator */}
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {isAtRisk && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 border border-red-500/20 font-bold">RISCO</span>
                            )}
                            {budgetTier === "high" && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#0d4af5]/10 text-[#0d4af5] border border-[#0d4af5]/20 font-bold">$$$$</span>
                            )}
                            {item.requestedByTraffic && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#3b6ff5]/10 text-[#3b6ff5] border border-[#3b6ff5]/20 font-medium flex items-center gap-0.5">
                                <Zap size={8} /> TRAFEGO
                              </span>
                            )}
                          </div>

                          {/* Blocked reason banner */}
                          {fullCard.status === "blocked" && fullCard.blockedReason && (
                            <div className="px-2 py-1.5 rounded-md bg-red-500/10 border border-red-500/20 text-[10px] text-red-400 font-medium">
                              Bloqueado: {fullCard.blockedReason}
                            </div>
                          )}

                          {/* Art thumbnail */}
                          {hasArt && (
                            <div className="w-full h-20 rounded-md overflow-hidden bg-muted">
                              <img src={item.imageUrl} alt="" className="w-full h-full object-cover" />
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
                              <span className="text-[10px] text-[#0d4af5] flex items-center gap-0.5">
                                <CheckCircle size={9} /> Arte
                              </span>
                            ) : (
                              <span className="text-[10px] text-[#3b6ff5] flex items-center gap-0.5">
                                <ImageIcon size={9} /> Sem arte
                              </span>
                            )}
                          </div>

                          {/* Drive quick access */}
                          {client?.driveLink && (
                            <a
                              href={client.driveLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/[0.04] border border-white/[0.06] text-[10px] text-zinc-400 hover:text-[#0d4af5] hover:border-[#0d4af5]/30 transition-all w-full"
                            >
                              <FolderOpen size={10} className="shrink-0" />
                              <span className="truncate">Abrir Drive — {item.clientName}</span>
                            </a>
                          )}

                          {/* Handoff status */}
                          {(() => {
                            return (
                              <>
                                {fullCard.designerDeliveredAt && (
                                  <div className="flex items-center gap-1 text-[10px]">
                                    <CheckCircle size={9} className="text-[#0d4af5]" />
                                    <span className="text-[#0d4af5]">Entregue</span>
                                    {fullCard.socialConfirmedAt ? (
                                      <span className="text-[#0d4af5] ml-1">· Confirmado</span>
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
                          <div className="flex items-center gap-1.5 pt-2 border-t border-border flex-wrap">
                            <button
                              onClick={(e) => { e.stopPropagation(); setUploadCard(fullCard); }}
                              className="text-[11px] px-3 py-1.5 rounded-lg bg-[#0d4af5] text-white font-medium hover:bg-[#0d4af5]/80 transition-all flex items-center gap-1.5"
                            >
                              <Upload size={11} />
                              {hasArt ? "Trocar Arte" : "Enviar Arte"}
                            </button>
                            {hasArt && (
                              <DownloadButton url={item.imageUrl!} title={item.title} />
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
                      const card = contentCards.find((c) => c.id === itemId);
                      if (!card) return;

                      // If moving to "blocked" column, open block reason modal
                      if (to === "blocked") {
                        setBlockingCard(card);
                        return;
                      }

                      // Map designer column to actual status
                      const newStatus = DESIGNER_COL_TO_STATUS[to] ?? to;
                      const now = new Date().toISOString();
                      // Designer/admin podem mover livremente — bypassWorkflow ignora
                      // o state-machine VALID_TRANSITIONS pra evitar bloqueios desnecessários
                      updateContentCard(itemId, {
                        status: newStatus as ContentCard["status"],
                        statusChangedAt: now,
                        columnEnteredAt: {
                          ...(card.columnEnteredAt ?? {}),
                          [newStatus]: now,
                        },
                        // Clear block fields if unblocking
                        ...(card.status === "blocked" ? { blockedReason: undefined, blockedBy: undefined, blockedAt: undefined } : {}),
                      }, { bypassWorkflow: true });
                    }}
                  />
                  </KanbanErrorBoundary>
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
            currentUser={currentUser}
          />
        )}

        {/* ═══ MEUS CLIENTES TAB ═══ */}
        {tab === "clientes" && (
          <ClientesView
            clients={clients.filter((c) => !myClientIds || myClientIds.has(c.id))}
            myContentCards={myContentCards}
            myDesignRequests={myDesignRequests}
            onCreateTask={(c) => setNewTaskClient(c)}
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
              <p className="text-2xl font-bold text-[#0d4af5]">
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
                        className="h-full bg-[#0d4af5] rounded-full transition-all duration-500"
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
                        <span className={`w-2 h-2 rounded-full shrink-0 ${onTime ? "bg-[#0d4af5]" : "bg-red-400"}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-foreground truncate">{c.title}</p>
                          <p className="text-[10px] text-muted-foreground">{c.clientName} · {c.socialMedia}</p>
                        </div>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${onTime ? "bg-[#0d4af5]/10 text-[#0d4af5] border border-[#0d4af5]/20" : "bg-red-500/10 text-red-400 border border-red-500/20"}`}>
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

      {/* ═══ HISTORY TAB ═══ */}
      {tab === "history" && (
        <div className="space-y-4 animate-fade-in">
          <p className="text-xs text-zinc-400">Cards entregues e aprovados — historico completo de producao.</p>
          <div className="space-y-2">
            {myContentCards
              .filter((c) => c.designerDeliveredAt || c.status === "published" || c.status === "scheduled")
              .sort((a, b) => (b.designerDeliveredAt ?? b.statusChangedAt ?? "").localeCompare(a.designerDeliveredAt ?? a.statusChangedAt ?? ""))
              .map((card) => {
                const client = clients.find((cl) => cl.id === card.clientId);
                const onTime = card.dueDate && card.designerDeliveredAt && card.designerDeliveredAt.slice(0, 10) <= card.dueDate;
                return (
                  <div key={card.id} onClick={() => setDetailCard(card)}
                    className="card p-4 flex items-center gap-4 cursor-pointer hover:border-[#0d4af5]/20 transition-all">
                    {card.imageUrl ? (
                      <div className="w-12 h-12 rounded-lg overflow-hidden bg-muted shrink-0">
                        <img src={card.imageUrl} alt="" className="w-full h-full object-cover" />
                      </div>
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center shrink-0">
                        <ImageIcon size={16} className="text-zinc-600" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{card.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-zinc-400">{card.clientName}</span>
                        <span className="text-[10px] text-zinc-600">·</span>
                        <span className="text-[10px] text-zinc-400">{card.format}</span>
                        {card.designerDeliveredAt && (
                          <>
                            <span className="text-[10px] text-zinc-600">·</span>
                            <span className="text-[10px] text-zinc-500">Entregue {card.designerDeliveredAt.slice(0, 10)}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${
                        card.status === "published" ? "text-[#0d4af5] bg-[#0d4af5]/10 border-[#0d4af5]/20" :
                        card.status === "scheduled" ? "text-zinc-400 bg-zinc-500/10 border-zinc-500/20" :
                        "text-zinc-400 bg-zinc-500/10 border-zinc-500/20"
                      }`}>
                        {card.status === "published" ? "Publicado" : card.status === "scheduled" ? "Agendado" : "Entregue"}
                      </span>
                      {card.designerDeliveredAt && (
                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${
                          onTime ? "text-emerald-400 bg-emerald-500/10" : "text-red-400 bg-red-500/10"
                        }`}>
                          {onTime ? "No prazo" : "Atrasado"}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            {myContentCards.filter((c) => c.designerDeliveredAt || c.status === "published").length === 0 && (
              <div className="text-center py-12">
                <Clock size={24} className="text-zinc-800 mx-auto mb-3" />
                <p className="text-xs text-zinc-600">Nenhuma entrega no historico ainda.</p>
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
      {/* Block Reason Modal — Designer's Panic Button */}
      {blockingCard && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => { setBlockingCard(null); setBlockReason(""); }}>
          <div className="bg-card border border-red-500/20 rounded-2xl w-full max-w-md mx-4 shadow-2xl animate-fade-in" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-border">
              <h3 className="font-semibold text-red-400 text-sm flex items-center gap-2">
                <AlertTriangle size={15} /> Devolver Card — Motivo do Bloqueio
              </h3>
              <p className="text-xs text-zinc-400 mt-1">{blockingCard.title} — {blockingCard.clientName}</p>
            </div>
            <div className="p-5 space-y-2">
              {BLOCK_REASONS.map((reason) => (
                <button
                  key={reason}
                  onClick={() => setBlockReason(reason)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg text-xs transition-all ${
                    blockReason === reason
                      ? "bg-red-500/10 text-red-400 border border-red-500/30"
                      : "bg-white/[0.02] text-zinc-400 border border-transparent hover:bg-white/[0.04]"
                  }`}
                >
                  {reason}
                </button>
              ))}
            </div>
            <div className="p-5 border-t border-border flex gap-2">
              <button onClick={() => { setBlockingCard(null); setBlockReason(""); }} className="btn-ghost flex-1 text-sm">Cancelar</button>
              <button
                onClick={() => {
                  if (!blockReason) return;
                  const now = new Date().toISOString();
                  updateContentCard(blockingCard.id, {
                    status: "blocked",
                    blockedReason: blockReason,
                    blockedBy: currentUser,
                    blockedAt: now,
                    statusChangedAt: now,
                    columnEnteredAt: {
                      ...(blockingCard.columnEnteredAt ?? {}),
                      blocked: now,
                    },
                  });
                  // Notify Social Media
                  pushNotification(
                    "sla",
                    "Arte Devolvida pelo Designer",
                    `"${blockingCard.title}" (${blockingCard.clientName}) — Motivo: ${blockReason}. Ajuste necessario.`,
                    blockingCard.clientId
                  );
                  // Audio ping
                  import("@/lib/audio").then((m) => m.playNotificationSound()).catch(() => {});
                  setBlockingCard(null);
                  setBlockReason("");
                }}
                disabled={!blockReason}
                className="flex-1 px-4 py-2 rounded-xl bg-red-500/15 text-red-400 text-sm font-medium border border-red-500/30 hover:bg-red-500/25 transition-all disabled:opacity-30"
              >
                Devolver Card
              </button>
            </div>
          </div>
        </div>
      )}

      {nonDeliveryCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => { setNonDeliveryCard(null); setNonDeliveryReason(""); }}>
          <div className="bg-card border border-border rounded-2xl w-full max-w-md mx-4 shadow-2xl animate-fade-in" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-border">
              <h3 className="font-semibold text-foreground text-sm">Reportar Não Entrega</h3>
              <p className="text-xs text-primary mt-0.5">{nonDeliveryCard.title} — {nonDeliveryCard.clientName}</p>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-xs text-muted-foreground">Selecione o motivo:</p>
              <div className="space-y-1.5">
                {[
                  "Briefing incompleto",
                  "Aguardando assets do cliente",
                  "Fila sobrecarregada",
                  "Refacao pendente (aguardando feedback)",
                  "Problema tecnico",
                  "Outro",
                ].map((reason) => (
                  <button
                    key={reason}
                    onClick={() => setNonDeliveryReason(reason)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-all ${
                      nonDeliveryReason === reason
                        ? "bg-[#0d4af5]/10 text-[#0d4af5] border border-[#0d4af5]/30"
                        : "bg-muted/50 text-zinc-400 border border-transparent hover:bg-muted"
                    }`}
                  >
                    {reason}
                  </button>
                ))}
              </div>
              {nonDeliveryReason === "Outro" && (
                <input
                  value={nonDeliveryReason === "Outro" ? "" : nonDeliveryReason}
                  onChange={(e) => setNonDeliveryReason(e.target.value || "Outro")}
                  placeholder="Descreva o motivo..."
                  className="w-full bg-muted rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary"
                />
              )}
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
            <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* Briefing Health Score */}
              {(() => {
                const client = clients.find((c) => c.id === briefingReq.clientId);
                const checks = [
                  { label: "Briefing preenchido", ok: !!(briefingReq.briefing && briefingReq.briefing.length > 10) },
                  { label: "Formato definido", ok: !!briefingReq.format },
                  { label: "Prazo definido", ok: !!briefingReq.deadline },
                  { label: "Guidelines do cliente", ok: !!client?.fixedBriefing },
                ];
                const score = Math.round((checks.filter((c) => c.ok).length / checks.length) * 100);
                return (
                  <div className={`p-3 rounded-lg border ${score >= 75 ? "bg-emerald-500/[0.04] border-emerald-500/[0.1]" : score >= 50 ? "bg-amber-500/[0.04] border-amber-500/[0.1]" : "bg-red-500/[0.04] border-red-500/[0.1]"}`}>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[10px] uppercase tracking-wider font-semibold text-zinc-400">Saude do Briefing</p>
                      <span className={`text-xs font-bold ${score >= 75 ? "text-emerald-400" : score >= 50 ? "text-amber-400" : "text-red-400"}`}>{score}%</span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {checks.map((c) => (
                        <span key={c.label} className={`text-[9px] px-2 py-0.5 rounded-full border ${c.ok ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" : "text-red-400 bg-red-500/10 border-red-500/20"}`}>
                          {c.ok ? "✓" : "✗"} {c.label}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })()}

              <div>
                <p className="text-xs text-muted-foreground font-medium mb-1.5">Briefing Completo</p>
                {briefingReq.briefing ? (
                  <div className="bg-muted border border-border rounded-lg p-4">
                    <MarkdownView source={briefingReq.briefing} />
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground leading-relaxed bg-muted border border-border rounded-lg p-4">Sem briefing detalhado.</p>
                )}
              </div>

              {/* Client brand guidelines */}
              {(() => {
                const client = clients.find((c) => c.id === briefingReq.clientId);
                return (
                  <>
                    {client?.fixedBriefing && (
                      <div>
                        <p className="text-xs text-[#0d4af5]/70 font-medium mb-1.5 uppercase tracking-wider">Guidelines do Cliente</p>
                        <div className="bg-[#0d4af5]/[0.03] border border-[#0d4af5]/[0.08] rounded-lg p-3">
                          <MarkdownView source={client.fixedBriefing} />
                        </div>
                      </div>
                    )}
                    {client?.driveLink && (
                      <a href={client.driveLink} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06] hover:border-[#0d4af5]/30 transition-all text-xs text-zinc-400 hover:text-[#0d4af5]">
                        <FolderOpen size={13} /> Abrir pasta Drive do cliente →
                      </a>
                    )}
                  </>
                );
              })()}
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
                  briefingReq.status === "done" ? "text-[#0d4af5] bg-[#0d4af5]/10 border-[#0d4af5]/20" :
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
                  className="bg-[#0d4af5] hover:bg-[#0d4af5]/80 text-white px-3 py-2 rounded-lg font-medium text-sm transition-colors flex-1 flex items-center justify-center gap-1.5"
                >
                  <CheckCircle size={13} /> Marcar Concluído
                </button>
              )}
              <button onClick={() => setBriefingReq(null)} className="btn-ghost flex-1 text-sm">Fechar</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ DRAWER CLIENTE (Meus Clientes) ═══ */}
      {newTaskClient && !newTaskOpen && (
        <ClientDrawer
          client={newTaskClient}
          contentCards={myContentCards.filter((c) => c.clientId === newTaskClient.id)}
          designRequests={myDesignRequests.filter((r) => r.clientId === newTaskClient.id)}
          onClose={() => setNewTaskClient(null)}
          onCreateTask={() => setNewTaskOpen(true)}
          updateClientData={updateClientData}
        />
      )}

      {/* ═══ MODAL NOVA TAREFA ═══ */}
      {newTaskOpen && (
        <NewTaskModal
          clients={clients.filter((c) => !myClientIds || myClientIds.has(c.id))}
          preselectedClient={newTaskClient}
          requestedBy={currentUser}
          addDesignRequest={addDesignRequest}
          pushNotification={pushNotification}
          onClose={() => { setNewTaskOpen(false); setNewTaskClient(null); }}
        />
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
  currentUser,
}: {
  designRequests: DesignRequest[];
  contentCards: ContentCard[];
  updateDesignRequest: (id: string, updates: Partial<DesignRequest>) => void;
  onBriefing: (req: DesignRequest) => void;
  currentUser?: string;
}) {
  const [viewMode, setViewMode] = useState<"list" | "kanban">("kanban");
  const [statusFilter, setStatusFilter] = useState<"all" | "queued" | "in_progress" | "done">("all");
  const [priorityFilter, setPriorityFilter] = useState<"all" | "critical" | "high" | "medium" | "low">("all");
  const [clientFilter, setClientFilter] = useState("all");

  const uniqueClients = [...new Set(designRequests.map((r) => r.clientName))].sort();

  const filtered = designRequests.filter((r) => {
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (priorityFilter !== "all" && r.priority !== priorityFilter) return false;
    if (clientFilter !== "all" && r.clientName !== clientFilter) return false;
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
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value as typeof priorityFilter)}
            className="bg-card border border-border text-sm text-[#c0c0cc] rounded-lg px-3 py-1.5 outline-none focus:border-primary"
          >
            <option value="all">Prioridade: Todas</option>
            <option value="critical">Critica</option>
            <option value="high">Alta</option>
            <option value="medium">Media</option>
            <option value="low">Baixa</option>
          </select>
          <select
            value={clientFilter}
            onChange={(e) => setClientFilter(e.target.value)}
            className="bg-card border border-border text-sm text-[#c0c0cc] rounded-lg px-3 py-1.5 outline-none focus:border-primary"
          >
            <option value="all">Cliente: Todos</option>
            {uniqueClients.map((c) => <option key={c} value={c}>{c}</option>)}
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
        <KanbanErrorBoundary context="Kanban Design Requests">
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
            <div
              onClick={() => onBriefing(item._req as DesignRequest)}
              className="bg-card border border-border rounded-lg p-3 space-y-2 hover:border-primary/30 transition-colors cursor-pointer">
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
                {currentUser && item.requestedBy === currentUser ? (
                  <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-[#0d4af5]/10 text-[#3b6ff5] border border-[#0d4af5]/20 font-medium flex-1 text-center">
                    ⚡ Auto-iniciada
                  </span>
                ) : (
                  <p className="text-[10px] text-muted-foreground flex-1">por {item.requestedBy}</p>
                )}
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
        </KanbanErrorBoundary>
      )}

      {viewMode === "list" && (
        <div className="space-y-2">
          {filtered.length === 0 && (
            <div className="card text-center py-10 text-muted-foreground">Nenhuma solicitação encontrada.</div>
          )}
          {filtered.map((req) => {
            const linked = getLinkedCard(req);
            return (
              <div key={req.id} onClick={() => onBriefing(req)} className="card border border-border hover:border-primary/30 transition-colors cursor-pointer">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h4 className="font-semibold text-foreground text-sm">{req.title}</h4>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-xs text-primary">{req.clientName}</span>
                      <span className="text-muted-foreground/50">·</span>
                      <span className="text-xs text-muted-foreground">{req.format}</span>
                      <span className="text-muted-foreground/50">·</span>
                      {currentUser && req.requestedBy === currentUser ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-[#0d4af5]/10 text-[#3b6ff5] border border-[#0d4af5]/20 font-medium">⚡ Auto-iniciada</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">por {req.requestedBy}</span>
                      )}
                    </div>
                    {req.briefing && <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">{markdownPlainText(req.briefing)}</p>}
                    {linked && (
                      <span className="text-[10px] text-zinc-400 bg-[#111118] border border-[#1e1e2a] px-2 py-0.5 rounded-full mt-1.5 inline-block">
                        Card: {linked.title}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`badge border text-xs ${getPriorityColor(req.priority)}`}>{getPriorityLabel(req.priority)}</span>
                    <span className={`badge border text-xs ${
                      req.status === "done" ? "text-[#0d4af5] bg-[#0d4af5]/10 border-[#0d4af5]/20" :
                      req.status === "in_progress" ? "text-primary bg-primary/10 border-primary/20" :
                      "text-zinc-400 bg-[#0e0e14] border-[#1e1e2a]"
                    }`}>
                      {req.status === "queued" ? "Na Fila" : req.status === "in_progress" ? "Em Produção" : "Concluído"}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-3 pt-2 border-t border-border">
                  {req.status === "queued" && (
                    <button onClick={(e) => { e.stopPropagation(); updateDesignRequest(req.id, { status: "in_progress" }); }} className="btn-primary text-xs py-1.5">
                      Iniciar Produção
                    </button>
                  )}
                  {req.status === "in_progress" && (
                    <button onClick={(e) => { e.stopPropagation(); updateDesignRequest(req.id, { status: "done" }); }} className="bg-[#0d4af5] hover:bg-[#0d4af5]/80 text-white px-3 py-1.5 rounded-lg font-medium text-xs transition-colors">
                      Marcar Concluído
                    </button>
                  )}
                  {req.status === "done" && (
                    <span className="text-xs text-[#0d4af5] flex items-center gap-1"><CheckCircle size={12} /> Concluído</span>
                  )}
                  <button onClick={(e) => { e.stopPropagation(); onBriefing(req); }} className="btn-ghost text-xs flex items-center gap-1">
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

// ── Meus Clientes — grid da carteira do designer ──────────────────────

function ClientesView({
  clients,
  myContentCards,
  myDesignRequests,
  onCreateTask,
}: {
  clients: Client[];
  myContentCards: ContentCard[];
  myDesignRequests: DesignRequest[];
  onCreateTask: (client: Client) => void;
}) {
  if (clients.length === 0) {
    return (
      <div className="card text-center py-16 animate-fade-in">
        <Users size={32} className="mx-auto text-muted-foreground/50 mb-3" />
        <p className="text-sm font-medium text-foreground">Nenhum cliente na sua carteira ainda</p>
        <p className="text-xs text-muted-foreground mt-1">
          Quando clientes forem atribuídos a você como designer, eles aparecem aqui.
        </p>
      </div>
    );
  }

  const statusColor = (s: string) => {
    if (s === "good")       return { dot: "bg-emerald-500", label: "On Fire" };
    if (s === "average")    return { dot: "bg-amber-400",   label: "Atenção" };
    if (s === "at_risk")    return { dot: "bg-red-500",     label: "Crítico" };
    if (s === "onboarding") return { dot: "bg-[#0d4af5]",   label: "Onboarding" };
    return { dot: "bg-zinc-500", label: s };
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Minha Carteira ({clients.length} clientes)</h2>
        <p className="text-xs text-muted-foreground mt-0.5">Clique em um cliente para ver briefing e criar tarefa</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {clients.map((c) => {
          const cards = myContentCards.filter((cc) => cc.clientId === c.id);
          const openRequests = myDesignRequests.filter((r) => r.clientId === c.id && r.status !== "done").length;
          const lastDelivery = cards
            .filter((cc) => cc.designerDeliveredAt)
            .map((cc) => cc.designerDeliveredAt!)
            .sort((a, b) => b.localeCompare(a))[0];
          const daysSinceDelivery = lastDelivery
            ? Math.floor((Date.now() - new Date(lastDelivery).getTime()) / 86400000)
            : null;
          const st = statusColor(c.status);

          return (
            <button
              key={c.id}
              onClick={() => onCreateTask(c)}
              className="card text-left hover:border-primary/30 transition-colors group"
            >
              <div className="flex items-start gap-3">
                {c.docLogo ? (
                  <img src={c.docLogo} alt="" className="w-11 h-11 rounded-lg border border-border object-contain bg-muted shrink-0" />
                ) : (
                  <div className="w-11 h-11 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                    <span className="text-sm font-bold text-primary">
                      {(c.nomeFantasia || c.name).charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{c.nomeFantasia || c.name}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{c.industry || "—"}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="flex items-center gap-1 text-[10px]">
                      <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                      <span className="text-muted-foreground">{st.label}</span>
                    </span>
                    {openRequests > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        {openRequests} pedido{openRequests > 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                </div>
                <ArrowRight size={14} className="text-muted-foreground/40 group-hover:text-primary transition-colors shrink-0 mt-1" />
              </div>
              <div className="mt-3 pt-3 border-t border-border/50 flex items-center justify-between text-[10px] text-muted-foreground">
                <span>{cards.length} cards · {cards.filter((cc) => cc.designerDeliveredAt).length} entregues</span>
                <span>
                  {daysSinceDelivery === null ? "sem entrega" :
                   daysSinceDelivery === 0 ? "entregou hoje" :
                   daysSinceDelivery === 1 ? "há 1 dia" :
                   `há ${daysSinceDelivery} dias`}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Client Drawer — perfil + briefing + CTA nova tarefa ──────────────

function ClientDrawer({
  client,
  contentCards,
  designRequests,
  onClose,
  onCreateTask,
  updateClientData,
}: {
  client: Client;
  contentCards: ContentCard[];
  designRequests: DesignRequest[];
  onClose: () => void;
  onCreateTask: () => void;
  updateClientData: (id: string, data: Partial<Client>) => void;
}) {
  const openRequests = designRequests.filter((r) => r.status !== "done");
  const delivered = contentCards.filter((c) => c.designerDeliveredAt).length;

  const [editingBriefing, setEditingBriefing] = useState(false);
  const [briefingForm, setBriefingForm] = useState({
    toneOfVoice: client.toneOfVoice || "",
    fixedBriefing: client.fixedBriefing || "",
    campaignBriefing: client.campaignBriefing || "",
  });
  const [savingBriefing, setSavingBriefing] = useState(false);
  const [briefingSaved, setBriefingSaved] = useState(false);

  const handleSaveBriefing = async () => {
    setSavingBriefing(true);
    const toneValue = briefingForm.toneOfVoice.trim();
    const validTones = ["formal", "funny", "authoritative", "casual"] as const;
    updateClientData(client.id, {
      toneOfVoice: (validTones as readonly string[]).includes(toneValue) ? (toneValue as typeof validTones[number]) : undefined,
      fixedBriefing: briefingForm.fixedBriefing.trim() || undefined,
      campaignBriefing: briefingForm.campaignBriefing.trim() || undefined,
    });
    setTimeout(() => {
      setSavingBriefing(false);
      setBriefingSaved(true);
      setEditingBriefing(false);
      setTimeout(() => setBriefingSaved(false), 2000);
    }, 400);
  };

  const hasBriefing = client.toneOfVoice || client.fixedBriefing || client.campaignBriefing;

  return (
    <div className="fixed inset-0 z-50 flex justify-end animate-fade-in" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative bg-card border-l border-border w-full max-w-md h-full overflow-y-auto animate-slide-in-right"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-card border-b border-border px-6 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-3 min-w-0">
            {client.docLogo ? (
              <img src={client.docLogo} alt="" className="w-9 h-9 rounded-lg border border-border object-contain bg-muted shrink-0" />
            ) : (
              <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
                <span className="text-xs font-bold text-primary">{(client.nomeFantasia || client.name).charAt(0).toUpperCase()}</span>
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{client.nomeFantasia || client.name}</p>
              <p className="text-[10px] text-muted-foreground truncate">{client.industry || "—"}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors shrink-0">
            <X size={16} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Stats rápidas */}
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg bg-muted/40 border border-border p-3 text-center">
              <p className="text-xl font-bold text-foreground">{delivered}</p>
              <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Entregues</p>
            </div>
            <div className="rounded-lg bg-muted/40 border border-border p-3 text-center">
              <p className="text-xl font-bold text-amber-400">{openRequests.length}</p>
              <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Pendentes</p>
            </div>
            <div className="rounded-lg bg-muted/40 border border-border p-3 text-center">
              <p className="text-xl font-bold text-foreground">{contentCards.length}</p>
              <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Total</p>
            </div>
          </div>

          {/* Briefing (editavel por qualquer role) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <FileText size={11} /> Briefing de Marca
              </p>
              {!editingBriefing ? (
                <button
                  onClick={() => setEditingBriefing(true)}
                  className="text-[10px] px-2 py-0.5 rounded-md bg-[#0d4af5]/10 text-[#3b6ff5] border border-[#0d4af5]/20 hover:bg-[#0d4af5]/20 transition-colors"
                >
                  {hasBriefing ? "Editar" : "+ Adicionar"}
                </button>
              ) : (
                <div className="flex items-center gap-1">
                  {briefingSaved && <span className="text-[10px] text-emerald-400">✓ Salvo</span>}
                  <button
                    onClick={() => {
                      setEditingBriefing(false);
                      setBriefingForm({
                        toneOfVoice: client.toneOfVoice || "",
                        fixedBriefing: client.fixedBriefing || "",
                        campaignBriefing: client.campaignBriefing || "",
                      });
                    }}
                    className="text-[10px] px-2 py-0.5 rounded-md text-muted-foreground hover:text-foreground"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleSaveBriefing}
                    disabled={savingBriefing}
                    className="text-[10px] px-2 py-0.5 rounded-md bg-[#0d4af5] text-white hover:bg-[#1a56ff] disabled:opacity-50"
                  >
                    {savingBriefing ? "Salvando..." : "Salvar"}
                  </button>
                </div>
              )}
            </div>

            <div className="rounded-lg bg-muted/40 border border-border p-4 space-y-3">
              {editingBriefing ? (
                <>
                  <div>
                    <label className="text-[10px] text-muted-foreground mb-1 block">Tom de voz</label>
                    <select
                      value={briefingForm.toneOfVoice}
                      onChange={(e) => setBriefingForm((p) => ({ ...p, toneOfVoice: e.target.value }))}
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground outline-none focus:border-primary/50"
                    >
                      <option value="">— Não definido —</option>
                      <option value="casual">Casual (descontraído)</option>
                      <option value="formal">Formal (corporativo)</option>
                      <option value="funny">Divertido (humor)</option>
                      <option value="authoritative">Autoritário (especialista)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground mb-1 block">Briefing fixo (info permanente da marca)</label>
                    <textarea
                      value={briefingForm.fixedBriefing}
                      onChange={(e) => setBriefingForm((p) => ({ ...p, fixedBriefing: e.target.value }))}
                      rows={4}
                      placeholder="Missao, valores, publico-alvo, cores, o que NAO fazer..."
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground outline-none focus:border-primary/50 resize-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground mb-1 block">Briefing da campanha (temporario)</label>
                    <textarea
                      value={briefingForm.campaignBriefing}
                      onChange={(e) => setBriefingForm((p) => ({ ...p, campaignBriefing: e.target.value }))}
                      rows={3}
                      placeholder="Campanha atual, promocao, foco do mes..."
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground outline-none focus:border-primary/50 resize-none"
                    />
                  </div>
                </>
              ) : (
                <>
                  {client.toneOfVoice && (
                    <div>
                      <p className="text-[10px] text-muted-foreground mb-0.5">Tom de voz</p>
                      <p className="text-xs text-foreground">{client.toneOfVoice}</p>
                    </div>
                  )}
                  {client.fixedBriefing && (
                    <div>
                      <p className="text-[10px] text-muted-foreground mb-0.5">Briefing fixo</p>
                      <p className="text-xs text-foreground whitespace-pre-wrap">{client.fixedBriefing}</p>
                    </div>
                  )}
                  {client.campaignBriefing && (
                    <div>
                      <p className="text-[10px] text-muted-foreground mb-0.5">Briefing da campanha</p>
                      <p className="text-xs text-foreground whitespace-pre-wrap">{client.campaignBriefing}</p>
                    </div>
                  )}
                  {!hasBriefing && (
                    <div className="text-center py-3">
                      <p className="text-xs text-muted-foreground italic mb-2">Nenhum briefing preenchido ainda.</p>
                      <button
                        onClick={() => setEditingBriefing(true)}
                        className="text-[11px] text-primary hover:underline"
                      >
                        + Adicionar briefing agora
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Links úteis */}
          <div className="space-y-2">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <ExternalLink size={11} /> Assets & Links
            </p>
            <div className="space-y-1.5">
              {client.driveLink && (
                <a href={client.driveLink} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/40 border border-border text-xs text-foreground hover:border-primary/30 transition-colors">
                  <FolderOpen size={12} className="text-primary" />
                  <span className="flex-1 truncate">Pasta do Drive</span>
                  <ExternalLink size={10} className="text-muted-foreground" />
                </a>
              )}
              {client.instagramUser && (
                <a href={`https://instagram.com/${client.instagramUser.replace(/^@/, "")}`} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/40 border border-border text-xs text-foreground hover:border-primary/30 transition-colors">
                  <span className="text-primary">📷</span>
                  <span className="flex-1 truncate">@{client.instagramUser.replace(/^@/, "")}</span>
                  <ExternalLink size={10} className="text-muted-foreground" />
                </a>
              )}
              {!client.driveLink && !client.instagramUser && (
                <p className="text-xs text-muted-foreground italic">Sem links cadastrados.</p>
              )}
            </div>
          </div>

          {/* CTAs */}
          <div className="space-y-2 pt-2">
            <button
              onClick={onCreateTask}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#0d4af5] hover:bg-[#1a56ff] text-white text-sm font-medium transition-colors"
            >
              <Plus size={14} /> Criar Tarefa para este Cliente
            </button>
            <a
              href={`/clients/${client.id}`}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-muted text-foreground border border-border hover:border-primary/30 text-sm font-medium transition-colors"
            >
              <ExternalLink size={13} /> Abrir Perfil Completo
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Modal Nova Tarefa (designer cria pra si mesmo) ──────────────────

function NewTaskModal({
  clients,
  preselectedClient,
  requestedBy,
  addDesignRequest,
  pushNotification,
  onClose,
}: {
  clients: Client[];
  preselectedClient: Client | null;
  requestedBy: string;
  addDesignRequest: (req: Omit<DesignRequest, "id">) => DesignRequest;
  pushNotification: (type: "sla" | "status" | "content" | "checkin" | "system", title: string, body: string, clientId?: string) => void;
  onClose: () => void;
}) {
  const [clientId, setClientId] = useState(preselectedClient?.id ?? "");
  const [title, setTitle] = useState("");
  const [briefing, setBriefing] = useState("");
  const [format, setFormat] = useState("Post");
  const [priority, setPriority] = useState<"low" | "medium" | "high" | "critical">("medium");
  const [deadline, setDeadline] = useState("");
  const [saving, setSaving] = useState(false);

  const client = clients.find((c) => c.id === clientId);
  const canSubmit = !!clientId && title.trim().length > 0;

  const handleSubmit = () => {
    if (!canSubmit || !client) return;
    setSaving(true);
    addDesignRequest({
      title: title.trim(),
      clientId: client.id,
      clientName: client.nomeFantasia || client.name,
      requestedBy,
      priority,
      status: "queued",
      format,
      briefing: briefing.trim(),
      deadline: deadline || undefined,
    });
    // Toast de confirmacao visivel na aba de notificacoes (sino)
    pushNotification(
      "content",
      "Tarefa auto-iniciada criada",
      `"${title.trim()}" — ${client.nomeFantasia || client.name}. Veja no Quadro de Tarefas.`,
      client.id,
    );
    setTimeout(() => {
      setSaving(false);
      onClose();
    }, 400);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-card border border-border rounded-2xl overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#0d4af5]/15 flex items-center justify-center">
              <Plus size={14} className="text-[#0d4af5]" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">Nova Tarefa</h2>
              <p className="text-[10px] text-muted-foreground">Tarefa auto-iniciada pelo designer</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Cliente */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Cliente *</label>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
            >
              <option value="">Selecione um cliente...</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.nomeFantasia || c.name}</option>
              ))}
            </select>
          </div>

          {/* Título */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Título *</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Rebranding de capa Instagram"
              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
            />
          </div>

          {/* Formato + Prioridade */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Formato</label>
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value)}
                className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
              >
                <option>Post</option>
                <option>Story</option>
                <option>Reels</option>
                <option>Carrossel</option>
                <option>Banner</option>
                <option>Outro</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Prioridade</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as typeof priority)}
                className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
              >
                <option value="low">Baixa</option>
                <option value="medium">Média</option>
                <option value="high">Alta</option>
                <option value="critical">Crítica</option>
              </select>
            </div>
          </div>

          {/* Prazo */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <Calendar size={10} /> Prazo (opcional)
            </label>
            <input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
            />
          </div>

          {/* Briefing */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Descrição / Briefing</label>
            <textarea
              value={briefing}
              onChange={(e) => setBriefing(e.target.value)}
              rows={3}
              placeholder="O que precisa ser feito, detalhes, referências..."
              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 resize-none"
            />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-border flex items-center justify-end gap-2">
          <button onClick={onClose} className="btn-ghost text-sm">Cancelar</button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || saving}
            className="flex items-center gap-2 px-5 py-2 rounded-lg bg-[#0d4af5] hover:bg-[#1a56ff] text-white text-sm font-medium transition-colors disabled:opacity-50"
          >
            {saving ? <Loader size={13} className="animate-spin" /> : <Plus size={13} />}
            {saving ? "Criando..." : "Criar Tarefa"}
          </button>
        </div>
      </div>
    </div>
  );
}
