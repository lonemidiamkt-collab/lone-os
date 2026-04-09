"use client";

import { useParams } from "next/navigation";
import Header from "@/components/Header";
import { useAppState } from "@/lib/context/AppStateContext";
import { useRole } from "@/lib/context/RoleContext";
import { mockTasks, mockAdAccounts } from "@/lib/mockData";
import { useMetaConnection, fetchAdAccounts } from "@/lib/meta/useMetaAds";
import {
  getAttentionColor,
  getAttentionLabel,
  getStatusColor,
  getStatusLabel,
  getPriorityColor,
  getPriorityLabel,
  daysSince,
} from "@/lib/utils";
import type { TimelineEntryType, ClientStatus, CreativeAsset, SocialProofEntry } from "@/lib/types";
import {
  ArrowLeft, MessageSquare, FileText, TrendingUp,
  Instagram, Calendar, AlertTriangle,
  CheckCircle, Clock, User, Send, Activity,
  CheckSquare, GitCommitHorizontal, MessageCircle,
  BarChart2, PenLine, Star, Upload, Image as ImageIcon,
  Link as LinkIcon, Mic, Palette, Award, ShieldAlert, Plus, Download, Pencil,
  Facebook, Settings, Link2, Unlink, ChevronDown, Check, Loader2, Target,
} from "lucide-react";
import EditClientModal from "@/components/EditClientModal";
import Link from "next/link";
import { useState, useRef, useEffect } from "react";
import { exportReportAsPdf } from "@/lib/exportPdf";

// ── Timeline helpers ─────────────────────────────────────────────────────────
const TIMELINE_ICONS: Record<TimelineEntryType, { icon: React.ElementType; color: string; bg: string }> = {
  chat:       { icon: MessageCircle,       color: "text-primary",  bg: "bg-primary/15" },
  task:       { icon: CheckSquare,         color: "text-primary",   bg: "bg-primary/15" },
  status:     { icon: Activity,            color: "text-zinc-400",  bg: "bg-[#111118]" },
  content:    { icon: Instagram,           color: "text-zinc-400",    bg: "bg-[#111118]" },
  design:     { icon: Star,               color: "text-zinc-400",  bg: "bg-[#111118]" },
  report:     { icon: BarChart2,           color: "text-primary",    bg: "bg-primary/15" },
  manual:     { icon: PenLine,             color: "text-muted-foreground",    bg: "bg-zinc-600/20" },
  onboarding: { icon: GitCommitHorizontal, color: "text-primary",    bg: "bg-primary/15" },
  meeting:    { icon: User,               color: "text-zinc-400",  bg: "bg-[#111118]" },
};

// ── Health score ─────────────────────────────────────────────────────────────
function calcHealth(client: ReturnType<typeof useAppState>["clients"][0]): number {
  let s = 50;
  if (client.status === "good") s += 20;
  else if (client.status === "at_risk") s -= 30;
  if (client.attentionLevel === "low") s += 10;
  else if (client.attentionLevel === "critical") s -= 25;
  if (client.lastPostDate) {
    const d = daysSince(client.lastPostDate);
    if (d <= 3) s += 10; else if (d > 7) s -= 15;
  }
  return Math.max(0, Math.min(100, s));
}

const TONE_LABELS: Record<string, string> = {
  formal: "Formal", funny: "Engraçado", authoritative: "Autoritário", casual: "Casual",
};

const ASSET_TYPE_CONFIG: Record<CreativeAsset["type"], { label: string; color: string; icon: React.ElementType }> = {
  reference:  { label: "Referência", color: "text-primary",   icon: ImageIcon },
  palette:    { label: "Paleta",     color: "text-zinc-400",   icon: Palette },
  typography: { label: "Tipografia", color: "text-zinc-400", icon: Mic },
  logo:       { label: "Logo",       color: "text-primary",  icon: Star },
};

const TABS = ["overview", "chat", "historico", "tasks", "content", "onboarding", "wallet", "reports"] as const;
type Tab = (typeof TABS)[number];

const TAB_LABELS: Record<Tab, string> = {
  overview: "Visão Geral",
  chat: "Chat",
  historico: "Histórico Operacional",
  tasks: "Tarefas",
  content: "Conteúdo",
  onboarding: "Onboarding",
  wallet: "Creative Wallet",
  reports: "Relatórios",
};

export default function ClientDetailPage() {
  const params = useParams();
  const clientId = params.id as string;
  const { role, currentUser } = useRole();
  const { clients, contentCards, tasks, timeline, clientChats, onboarding, creativeAssets, socialProofs, crisisNotes, quinzReports, designRequests, addCreativeAsset, sendClientMessage, addTimelineEntry, toggleOnboardingItem, updateClientStatus, updateClientData, addSocialProof, addCrisisNote, addQuinzReport, addDesignRequest } = useAppState();

  const client = clients.find((c) => c.id === clientId);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [chatInput, setChatInput] = useState("");
  const [manualNote, setManualNote] = useState("");
  const [showNoteInput, setShowNoteInput] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [showProofForm, setShowProofForm] = useState(false);
  const [proofForm, setProofForm] = useState({ m1l: "Novos Seguidores", m1v: "", m2l: "Leads no Direct", m2v: "", m3l: "Engajamento", m3v: "", period: "" });
  const [crisisInput, setCrisisInput] = useState("");
  const [showDesignReqForm, setShowDesignReqForm] = useState(false);
  const [designReqForm, setDesignReqForm] = useState({ title: "", format: "Post Feed", briefing: "", priority: "medium" as "low" | "medium" | "high" | "critical", deadline: "" });
  const [showEditModal, setShowEditModal] = useState(false);

  // Inline Meta Ads account picker
  const meta = useMetaConnection();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [adAccounts, setAdAccounts] = useState<any[]>([]);
  const [showMetaPicker, setShowMetaPicker] = useState(false);
  const [metaSearch, setMetaSearch] = useState("");

  useEffect(() => {
    if (meta.connected && meta.token) {
      fetchAdAccounts(meta.token)
        .then((accounts: any[]) => setAdAccounts(accounts ?? []))
        .catch(() => setAdAccounts([]));
    } else {
      setAdAccounts(mockAdAccounts.map((a) => ({
        id: a.id,
        name: a.accountName,
        account_id: a.accountId,
        currency: a.currency,
      })));
    }
  }, [meta.connected, meta.token]);

  const filteredAdAccounts = metaSearch
    ? adAccounts.filter((a: any) =>
        a.name?.toLowerCase().includes(metaSearch.toLowerCase()) ||
        a.account_id?.includes(metaSearch)
      )
    : adAccounts;

  const chats = clientChats[clientId] ?? [];
  const entries = timeline[clientId] ?? [];
  const obItems = onboarding[clientId] ?? [];
  const clientTasks = mockTasks.filter((t) => t.clientId === clientId);
  const clientContent = contentCards.filter((c) => c.clientId === clientId);
  const clientReports = quinzReports.filter((r) => r.clientId === clientId);
  const clientAssets = creativeAssets[clientId] ?? [];

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chats.length]);

  if (!client) {
    return (
      <div className="flex flex-col flex-1 overflow-auto">
        <Header title="Cliente não encontrado" />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-3">
            <p className="text-muted-foreground">Cliente não encontrado.</p>
            <Link href="/clients" className="btn-primary">Voltar</Link>
          </div>
        </div>
      </div>
    );
  }

  const health = calcHealth(client);
  const healthColor = health >= 70 ? "text-primary" : health >= 45 ? "text-zinc-400" : "text-red-500";
  const healthBar = health >= 70 ? "bg-primary" : health >= 45 ? "bg-zinc-500" : "bg-red-500";

  const daysWithUs = Math.floor((Date.now() - new Date(client.joinDate).getTime()) / 86400000);

  const obCompleted = obItems.filter((i) => i.completed).length;
  const obProgress = obItems.length > 0 ? Math.round((obCompleted / obItems.length) * 100) : 0;

  const visibleTabs = TABS.filter((tab) => {
    if (tab === "reports" || tab === "wallet") return role === "admin" || role === "manager";
    return true;
  });

  const handleWalletUpload = (e: React.ChangeEvent<HTMLInputElement>, type: CreativeAsset["type"]) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    addCreativeAsset({ clientId, type, url, label: file.name.replace(/\.[^.]+$/, ""), uploadedBy: currentUser, uploadedAt: new Date().toISOString().split("T")[0] });
    e.target.value = "";
  };

  const handleSendChat = () => {
    if (!chatInput.trim()) return;
    sendClientMessage(clientId, currentUser, chatInput.trim());
    setChatInput("");
  };

  const handleAddNote = () => {
    if (!manualNote.trim()) return;
    addTimelineEntry({
      clientId,
      type: "manual",
      actor: currentUser,
      description: manualNote.trim(),
      timestamp: new Date().toLocaleString("pt-BR"),
    });
    setManualNote("");
    setShowNoteInput(false);
  };

  const handleExportTimeline = () => {
    if (entries.length === 0) return;
    const TYPE_LABELS: Record<string, string> = {
      chat: "Chat", task: "Tarefa", status: "Status", content: "Conteúdo",
      design: "Design", report: "Relatório", onboarding: "Onboarding",
      meeting: "Reunião", manual: "Nota",
    };
    const header = "Data/Hora,Tipo,Responsável,Descrição";
    const rows = entries.map((e) => {
      const desc = e.description.replace(/"/g, '""');
      return `"${e.timestamp}","${TYPE_LABELS[e.type] ?? e.type}","${e.actor}","${desc}"`;
    });
    const csv = [header, ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `historico-${client.name.replace(/\s+/g, "-").toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const statusOptions: { value: ClientStatus; label: string }[] = [
    { value: "onboarding", label: "Onboarding" },
    { value: "good", label: "Bons Resultados" },
    { value: "average", label: "Resultados Médios" },
    { value: "at_risk", label: "Em Risco" },
  ];

  return (
    <div className="flex flex-col flex-1 overflow-auto">
      <Header title={client.name} subtitle={`${client.industry} · Cliente desde ${client.joinDate}`} />

      <div className="p-6 space-y-5 animate-fade-in">
        {/* Top bar */}
        <div className="flex items-center gap-3 flex-wrap">
          <Link href="/clients" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft size={15} /> Clientes
          </Link>
          <span className={`badge border ${getStatusColor(client.status)}`}>{getStatusLabel(client.status)}</span>
          <span className={`badge border ${getAttentionColor(client.attentionLevel)}`}>
            Atenção: {getAttentionLabel(client.attentionLevel)}
          </span>
          {client.tags.map((tag) => (
            <span key={tag} className={`badge border text-xs ${tag === "Premium" ? "tag-premium" : tag === "Risco de Churn" ? "tag-risk" : "tag-matcon"}`}>
              {tag}
            </span>
          ))}
          <div className="ml-auto flex items-center gap-2">
            {(role === "admin" || role === "manager") && (
              <>
                <button
                  onClick={() => setShowEditModal(true)}
                  className="btn-ghost text-xs flex items-center gap-1.5 border border-border hover:border-primary/30 hover:text-primary"
                >
                  <Pencil size={12} />
                  Editar
                </button>
                <select
                  value={client.status}
                  onChange={(e) => updateClientStatus(clientId, e.target.value as ClientStatus, currentUser)}
                  className="bg-card border border-border text-xs text-[#c0c0cc] rounded-lg px-2 py-1.5 outline-none focus:border-primary"
                >
                  {statusOptions.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </>
            )}
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
          <div className="card flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
              <Calendar size={18} className="text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Dias conosco</p>
              <p className="text-lg font-bold text-primary">{daysWithUs}d</p>
            </div>
          </div>
          <div className="card flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${client.status === "at_risk" ? "bg-red-500/10" : "bg-primary/15"}`}>
              {client.status === "at_risk"
                ? <AlertTriangle size={18} className="text-red-500" />
                : <CheckCircle size={18} className="text-primary" />}
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Último post</p>
              <p className={`text-lg font-bold ${client.lastPostDate && daysSince(client.lastPostDate) > 7 ? "text-red-500" : "text-primary"}`}>
                {client.lastPostDate ? `${daysSince(client.lastPostDate)}d atrás` : "—"}
              </p>
            </div>
          </div>
          {/* Health Score */}
          <div className="card">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-muted-foreground">Health Score</p>
              <span className={`text-lg font-bold ${healthColor}`}>{health}</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${healthBar}`} style={{ width: `${health}%` }} />
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
              {health >= 70 ? "Saudável" : health >= 45 ? "Atenção necessária" : "Risco de churn"}
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div>
          <div className="flex gap-0.5 mb-5 border-b border-border overflow-x-auto">
            {visibleTabs.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap ${
                  activeTab === tab
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {TAB_LABELS[tab]}
                {tab === "historico" && entries.length > 0 && (
                  <span className="ml-1.5 text-xs bg-primary/20 text-primary px-1.5 py-0.5 rounded-full">
                    {entries.length}
                  </span>
                )}
                {tab === "onboarding" && client.status === "onboarding" && obItems.length > 0 && (
                  <span className="ml-1.5 text-xs bg-primary/15 text-primary px-1.5 py-0.5 rounded-full">
                    {obProgress}%
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* ── OVERVIEW ─────────────────────────────────────────────────────── */}
          {activeTab === "overview" && (
            <div className="space-y-5 animate-fade-in">
              {/* Dossier banner — always visible */}
              {(client.toneOfVoice || client.driveLink || client.instagramUser) && (
                <div className="bg-primary/10 border border-primary/20 rounded-xl p-4 flex flex-wrap gap-4 items-start">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Dossiê da Marca</p>
                    <div className="flex flex-wrap gap-2">
                      <span className="text-xs bg-muted text-[#c0c0cc] px-2 py-1 rounded-lg font-medium">
                        📌 Nicho: {client.industry}
                      </span>
                      {client.toneOfVoice && (
                        <span className="text-xs bg-muted text-[#c0c0cc] px-2 py-1 rounded-lg font-medium">
                          🗣 Tom: {TONE_LABELS[client.toneOfVoice]}
                        </span>
                      )}
                      {client.instagramUser && (
                        <span className="text-xs bg-[#111118] text-zinc-400 px-2 py-1 rounded-lg font-medium border border-[#1e1e2a]">
                          <Instagram size={10} className="inline mr-1" />
                          {client.instagramUser}
                        </span>
                      )}
                      {client.driveLink && (
                        <a href={client.driveLink} target="_blank" rel="noreferrer"
                          className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-lg font-medium border border-primary/20 flex items-center gap-1 hover:bg-primary/20 transition-colors">
                          <LinkIcon size={10} />
                          Drive / Canva
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <div className="card space-y-0">
                <h3 className="font-semibold text-foreground mb-4">Dados Cadastrais</h3>
                {[
                  { label: "Segmento", value: client.industry },
                  { label: "Forma de pagamento", value: client.paymentMethod },
                  { label: "Gestor de tráfego", value: client.assignedTraffic },
                  { label: "Social Media", value: client.assignedSocial },
                  { label: "Cliente desde", value: client.joinDate },
                  { label: "Último post", value: client.lastPostDate ?? "—" },
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-center justify-between py-2.5 border-b border-border/50 last:border-0">
                    <span className="text-sm text-muted-foreground">{label}</span>
                    <span className="text-sm text-foreground font-medium">{value}</span>
                  </div>
                ))}

                {/* Meta Ads Account — special row with inline edit */}
                <div className="relative flex items-center justify-between py-2.5">
                  <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                    <Facebook size={12} className="text-[#1877F2]" />
                    Conta Meta Ads
                  </span>
                  <div className="flex items-center gap-2">
                    {client.metaAdAccountName ? (
                      <span className="text-sm text-foreground font-medium flex items-center gap-1.5">
                        <Link2 size={12} className="text-[#0a34f5]" />
                        {client.metaAdAccountName}
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground italic">Nenhuma vinculada</span>
                    )}
                    <button
                      onClick={() => setShowMetaPicker(!showMetaPicker)}
                      className="w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      title="Alterar conta de anúncio"
                    >
                      <Settings size={13} />
                    </button>
                  </div>

                  {/* Inline popover */}
                  {showMetaPicker && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => { setShowMetaPicker(false); setMetaSearch(""); }} />
                      <div className="absolute right-0 top-full mt-1 w-72 bg-card border border-border rounded-xl shadow-[0_12px_40px_rgba(0,0,0,0.6)] z-50 animate-fade-in overflow-hidden">
                        <div className="px-3 py-2.5 border-b border-border flex items-center justify-between">
                          <span className="text-xs font-semibold text-foreground">Vincular Conta de Anúncio</span>
                          {client.metaAdAccountId && (
                            <button
                              onClick={() => {
                                updateClientData(clientId, { metaAdAccountId: undefined, metaAdAccountName: undefined });
                                setShowMetaPicker(false);
                                setMetaSearch("");
                              }}
                              className="text-[10px] text-red-400 hover:text-red-300 flex items-center gap-1 transition-colors"
                            >
                              <Unlink size={10} />
                              Desvincular
                            </button>
                          )}
                        </div>
                        {adAccounts.length > 4 && (
                          <div className="px-2 py-2 border-b border-border">
                            <input
                              type="text"
                              value={metaSearch}
                              onChange={(e) => setMetaSearch(e.target.value)}
                              placeholder="Buscar conta..."
                              className="w-full bg-muted border border-border rounded-lg px-3 py-1.5 text-xs text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/50"
                              autoFocus
                            />
                          </div>
                        )}
                        <div className="max-h-48 overflow-y-auto py-1">
                          {filteredAdAccounts.map((account: any) => {
                            const isSelected = client.metaAdAccountId === account.id;
                            return (
                              <button
                                key={account.id}
                                onClick={() => {
                                  updateClientData(clientId, {
                                    metaAdAccountId: account.id,
                                    metaAdAccountName: account.name,
                                  });
                                  setShowMetaPicker(false);
                                  setMetaSearch("");
                                }}
                                className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-all hover:bg-primary/5 ${isSelected ? "bg-primary/10" : ""}`}
                              >
                                <div className="w-6 h-6 rounded-md bg-[#1877F2]/10 flex items-center justify-center shrink-0">
                                  <Facebook size={11} className="text-[#1877F2]" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium text-foreground truncate">{account.name}</p>
                                  <p className="text-[10px] text-muted-foreground">{account.account_id} {account.currency && `· ${account.currency}`}</p>
                                </div>
                                {isSelected && <Check size={13} className="text-primary shrink-0" />}
                              </button>
                            );
                          })}
                          {filteredAdAccounts.length === 0 && (
                            <p className="text-xs text-muted-foreground text-center py-4">Nenhuma conta encontrada</p>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
                {client.notes && (
                  <div className="mt-3 pt-3 border-t border-border">
                    <p className="text-xs text-muted-foreground mb-1">Observações</p>
                    <p className="text-sm text-[#c0c0cc] bg-muted rounded-lg p-3 border-l-2 border-zinc-600">{client.notes}</p>
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <div className="card">
                  <h3 className="font-semibold text-foreground mb-4">Equipe Responsável</h3>
                  <div className="space-y-3">
                    {[
                      { role: "Tráfego Pago", name: client.assignedTraffic, color: "text-primary", bg: "bg-primary/15", Icon: TrendingUp },
                      { role: "Social Media", name: client.assignedSocial, color: "text-zinc-400", bg: "bg-[#111118]", Icon: Instagram },
                    ].map(({ role: r, name, color, bg, Icon }) => (
                      <div key={r} className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${bg} shrink-0`}>
                          <Icon size={16} className={color} />
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">{r}</p>
                          <p className="text-sm font-medium text-foreground">{name}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="card">
                  <h3 className="font-semibold text-foreground mb-3">Resumo de Atividade</h3>
                  <div className="grid grid-cols-4 gap-2 text-center">
                    {[
                      { label: "Tarefas", value: clientTasks.length },
                      { label: "Conteúdos", value: clientContent.length },
                      { label: "No histórico", value: entries.length },
                      { label: "Relatórios", value: clientReports.length },
                    ].map(({ label, value }) => (
                      <div key={label}>
                        <p className="text-xl font-bold text-foreground">{value}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

              {/* Metas / OKRs */}
              <div className="card">
                <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
                  <Target size={14} className="text-[#0a34f5]" />
                  Metas do Mês
                </h3>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  {(() => {
                    const postsPublished = contentCards.filter((c) => c.clientId === clientId && c.status === "published").length;
                    const postsGoal = client.postsGoal ?? 12;
                    const postsPct = Math.min(100, Math.round((postsPublished / postsGoal) * 100));

                    const cardsInPipeline = contentCards.filter((c) => c.clientId === clientId && c.status !== "published").length;
                    const tasksCompleted = tasks.filter((t) => t.clientId === clientId && t.status === "done").length;
                    const totalTasks = tasks.filter((t) => t.clientId === clientId).length;
                    const taskPct = totalTasks > 0 ? Math.round((tasksCompleted / totalTasks) * 100) : 0;

                    return [
                      { label: "Posts Publicados", value: `${postsPublished}/${postsGoal}`, pct: postsPct, color: postsPct >= 80 ? "bg-[#0a34f5]" : postsPct >= 50 ? "bg-amber-500" : "bg-red-500" },
                      { label: "Pipeline Ativo", value: `${cardsInPipeline}`, pct: Math.min(100, cardsInPipeline * 10), color: "bg-[#3b6ff5]" },
                      { label: "Tarefas Concluídas", value: `${tasksCompleted}/${totalTasks}`, pct: taskPct, color: taskPct >= 80 ? "bg-[#0a34f5]" : "bg-amber-500" },
                      { label: "Engajamento", value: client.postsThisMonth ? `${client.postsThisMonth} posts` : "—", pct: Math.min(100, (client.postsThisMonth ?? 0) * 8), color: "bg-[#0a34f5]" },
                    ].map(({ label, value, pct, color }) => (
                      <div key={label} className="p-3 rounded-xl bg-muted/30 border border-border/50">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
                        <p className="text-lg font-bold text-foreground">{value}</p>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden mt-2">
                          <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              </div>

              {/* Observação de Crise — only for at_risk clients */}
              {client.status === "at_risk" && (
                <div className="card border border-red-500/20">
                  <div className="flex items-center gap-2 mb-3">
                    <ShieldAlert size={16} className="text-red-500" />
                    <h3 className="font-semibold text-foreground text-sm">Observação de Crise</h3>
                    <span className="text-xs text-red-500 bg-red-500/10 px-2 py-0.5 rounded-full border border-red-500/20">Obrigatório</span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">Por que este cliente está em status crítico? Registre para ter histórico antes de reuniões de retenção.</p>
                  {(crisisNotes[clientId] ?? []).length > 0 && (
                    <div className="space-y-2 mb-3 max-h-40 overflow-auto">
                      {(crisisNotes[clientId] ?? []).map((cn) => (
                        <div key={cn.id} className="bg-red-500/5 border border-red-500/10 rounded-lg p-3">
                          <p className="text-sm text-foreground">{cn.note}</p>
                          <p className="text-xs text-muted-foreground mt-1">por {cn.createdBy} · {cn.createdAt}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <input
                      value={crisisInput}
                      onChange={(e) => setCrisisInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && crisisInput.trim()) {
                          addCrisisNote(clientId, crisisInput.trim(), currentUser);
                          setCrisisInput("");
                        }
                      }}
                      placeholder="Ex: Cliente insatisfeito com resultados do último mês..."
                      className="flex-1 bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-red-500/50"
                    />
                    <button
                      onClick={() => {
                        if (!crisisInput.trim()) return;
                        addCrisisNote(clientId, crisisInput.trim(), currentUser);
                        setCrisisInput("");
                      }}
                      className="px-4 py-2 bg-red-500/10 text-red-500 rounded-lg text-sm font-medium hover:bg-red-500/30 transition-colors"
                    >
                      Registrar
                    </button>
                  </div>
                </div>
              )}

              {/* Módulo Prova Social */}
              <div className="card">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Award size={16} className="text-primary" />
                    <h3 className="font-semibold text-foreground text-sm">Prova Social</h3>
                  </div>
                  <button
                    onClick={() => setShowProofForm(!showProofForm)}
                    className="text-xs text-primary hover:text-foreground transition-colors flex items-center gap-1"
                  >
                    <Plus size={12} />
                    Extrair Resultado
                  </button>
                </div>
                <p className="text-xs text-muted-foreground mb-3">Registre métricas rápidas para enviar ao cliente como prova de valor.</p>

                {showProofForm && (
                  <div className="mb-4 p-4 bg-primary/5 border border-primary/15 rounded-xl space-y-3">
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { lKey: "m1l", vKey: "m1v" },
                        { lKey: "m2l", vKey: "m2v" },
                        { lKey: "m3l", vKey: "m3v" },
                      ].map(({ lKey, vKey }) => (
                        <div key={lKey}>
                          <input
                            value={proofForm[lKey as keyof typeof proofForm]}
                            onChange={(e) => setProofForm((p) => ({ ...p, [lKey]: e.target.value }))}
                            placeholder="Métrica"
                            className="w-full bg-muted border border-border rounded-lg px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none mb-1"
                          />
                          <input
                            value={proofForm[vKey as keyof typeof proofForm]}
                            onChange={(e) => setProofForm((p) => ({ ...p, [vKey]: e.target.value }))}
                            placeholder="Valor (ex: +500)"
                            className="w-full bg-muted border border-border rounded-lg px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none font-bold"
                          />
                        </div>
                      ))}
                    </div>
                    <input
                      value={proofForm.period}
                      onChange={(e) => setProofForm((p) => ({ ...p, period: e.target.value }))}
                      placeholder="Período (ex: Março 2026)"
                      className="w-full bg-muted border border-border rounded-lg px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none"
                    />
                    <div className="flex justify-end gap-2">
                      <button onClick={() => setShowProofForm(false)} className="text-xs text-muted-foreground hover:text-foreground">Cancelar</button>
                      <button
                        onClick={() => {
                          if (!proofForm.m1v && !proofForm.m2v && !proofForm.m3v) return;
                          addSocialProof({
                            clientId,
                            metric1Label: proofForm.m1l,
                            metric1Value: proofForm.m1v,
                            metric2Label: proofForm.m2l,
                            metric2Value: proofForm.m2v,
                            metric3Label: proofForm.m3l,
                            metric3Value: proofForm.m3v,
                            period: proofForm.period || "—",
                            createdBy: currentUser,
                          });
                          setProofForm({ m1l: "Novos Seguidores", m1v: "", m2l: "Leads no Direct", m2v: "", m3l: "Engajamento", m3v: "", period: "" });
                          setShowProofForm(false);
                        }}
                        className="btn-primary text-xs"
                      >
                        Salvar Resultado
                      </button>
                    </div>
                  </div>
                )}

                {(socialProofs[clientId] ?? []).length === 0 && !showProofForm && (
                  <p className="text-xs text-muted-foreground/50 text-center py-4">Nenhum resultado registrado ainda.</p>
                )}

                <div className="space-y-3">
                  {(socialProofs[clientId] ?? []).map((sp) => (
                    <div key={sp.id} className="bg-primary/5 border border-primary/15 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-medium text-primary">{sp.period}</span>
                        <span className="text-xs text-muted-foreground">por {sp.createdBy} · {sp.createdAt}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-3 text-center">
                        {[
                          { label: sp.metric1Label, value: sp.metric1Value },
                          { label: sp.metric2Label, value: sp.metric2Value },
                          { label: sp.metric3Label, value: sp.metric3Value },
                        ].filter((m) => m.value).map((m) => (
                          <div key={m.label} className="bg-card rounded-lg p-3 border border-border">
                            <p className="text-lg font-bold text-primary">{m.value}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{m.label}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── CHAT ─────────────────────────────────────────────────────────── */}
          {activeTab === "chat" && (
            <div className="animate-fade-in max-w-2xl">
              <div className="card flex flex-col" style={{ height: "500px" }}>
                <div className="flex items-center gap-2 mb-4 pb-4 border-b border-border">
                  <MessageSquare size={16} className="text-primary" />
                  <h3 className="font-semibold text-foreground">Chat Interno — {client.name}</h3>
                  <span className="ml-auto text-xs text-muted-foreground bg-muted px-2 py-1 rounded-lg">
                    Cada mensagem é salva no histórico operacional
                  </span>
                </div>

                <div className="flex-1 overflow-auto space-y-4 pr-1">
                  {chats.length === 0 && (
                    <p className="text-muted-foreground/50 text-sm text-center pt-8">Nenhuma mensagem ainda.</p>
                  )}
                  {chats.map((msg) => (
                    <div key={msg.id} className={`flex flex-col ${msg.user === currentUser ? "items-end" : "items-start"}`}>
                      <span className="text-xs text-muted-foreground mb-1">{msg.user} · {msg.timestamp}</span>
                      <div className={`rounded-xl px-4 py-2.5 text-sm max-w-[80%] ${
                        msg.user === currentUser
                          ? "bg-primary/30 text-primary"
                          : "bg-muted text-foreground"
                      }`}>
                        {msg.text}
                      </div>
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>

                <div className="flex gap-2 mt-4 pt-4 border-t border-border">
                  <input
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSendChat()}
                    placeholder="Escreva para a equipe... (salvo automaticamente no histórico)"
                    className="flex-1 bg-muted rounded-lg px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary"
                  />
                  <button onClick={handleSendChat} className="btn-primary px-4 flex items-center gap-2">
                    <Send size={14} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── HISTÓRICO OPERACIONAL ─────────────────────────────────────────── */}
          {activeTab === "historico" && (
            <div className="animate-fade-in max-w-2xl space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Registro automático de tudo que acontece com este cliente.
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleExportTimeline}
                    disabled={entries.length === 0}
                    className="btn-ghost flex items-center gap-1.5 text-xs disabled:opacity-40"
                  >
                    <Download size={13} />
                    Exportar CSV
                  </button>
                  <button
                    onClick={() => setShowNoteInput(!showNoteInput)}
                    className="btn-ghost flex items-center gap-1.5 text-xs"
                  >
                    <PenLine size={13} />
                    Adicionar nota manual
                  </button>
                </div>
              </div>

              {showNoteInput && (
                <div className="card border border-primary/20 animate-fade-in">
                  <p className="text-xs text-muted-foreground mb-2">Nova nota manual no histórico</p>
                  <textarea
                    value={manualNote}
                    onChange={(e) => setManualNote(e.target.value)}
                    rows={2}
                    placeholder="Ex: Reunião com cliente — satisfeito com resultados, pediu ampliar budget..."
                    className="w-full bg-muted rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary resize-none mb-3"
                  />
                  <div className="flex gap-2">
                    <button onClick={handleAddNote} className="btn-primary text-xs flex items-center gap-1.5">
                      <PenLine size={12} /> Salvar nota
                    </button>
                    <button onClick={() => { setShowNoteInput(false); setManualNote(""); }} className="btn-ghost text-xs">
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              {entries.length === 0 && (
                <div className="card text-center py-10 text-muted-foreground">
                  Nenhum registro ainda. Envie uma mensagem no chat ou atualize o status.
                </div>
              )}

              {/* Vertical timeline */}
              <div className="relative">
                <div className="absolute left-5 top-0 bottom-0 w-px bg-muted" />
                <div className="space-y-4">
                  {entries.map((entry) => {
                    const cfg = TIMELINE_ICONS[entry.type] ?? TIMELINE_ICONS.manual;
                    const Icon = cfg.icon;
                    return (
                      <div key={entry.id} className="relative pl-14">
                        <div className={`absolute left-2 top-1 w-6 h-6 rounded-full flex items-center justify-center ${cfg.bg}`}>
                          <Icon size={12} className={cfg.color} />
                        </div>
                        <div className="card py-3 px-4">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm text-foreground leading-relaxed">{entry.description}</p>
                          </div>
                          <div className="flex items-center gap-2 mt-2">
                            <span className={`text-xs font-medium ${cfg.color}`}>
                              {entry.type === "chat" ? "Chat" :
                               entry.type === "task" ? "Tarefa" :
                               entry.type === "status" ? "Status" :
                               entry.type === "content" ? "Conteúdo" :
                               entry.type === "design" ? "Design" :
                               entry.type === "report" ? "Relatório" :
                               entry.type === "onboarding" ? "Onboarding" :
                               entry.type === "meeting" ? "Reunião" : "Nota"}
                            </span>
                            <span className="text-muted-foreground/50">·</span>
                            <span className="text-xs text-muted-foreground">{entry.actor}</span>
                            <span className="text-muted-foreground/50">·</span>
                            <span className="text-xs text-muted-foreground/50">{entry.timestamp}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ── TASKS ────────────────────────────────────────────────────────── */}
          {activeTab === "tasks" && (
            <div className="animate-fade-in space-y-3">
              {clientTasks.length === 0 && (
                <div className="card text-center py-10 text-muted-foreground">Nenhuma tarefa para este cliente.</div>
              )}
              {clientTasks.map((task) => (
                <div key={task.id} className="card flex items-start gap-4">
                  <div className={`w-1 self-stretch rounded-full shrink-0 ${
                    task.priority === "critical" ? "bg-red-500" :
                    task.priority === "high" ? "bg-zinc-500" :
                    task.priority === "medium" ? "bg-primary" : "bg-zinc-600"
                  }`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-medium text-foreground">{task.title}</p>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`badge border text-xs ${getPriorityColor(task.priority)}`}>{getPriorityLabel(task.priority)}</span>
                        <span className={`badge text-xs ${
                          task.status === "done" ? "bg-primary/15 text-primary" :
                          task.status === "in_progress" ? "bg-primary/15 text-primary" :
                          task.status === "review" ? "bg-[#111118] text-zinc-400" :
                          "bg-zinc-600/20 text-muted-foreground"
                        }`}>
                          {task.status === "done" ? "Concluído" : task.status === "in_progress" ? "Em Execução" : task.status === "review" ? "Validação" : "Pendente"}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><User size={11} /> {task.assignedTo}</span>
                      {task.dueDate && <span className="flex items-center gap-1"><Clock size={11} /> {task.dueDate}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── CONTENT ──────────────────────────────────────────────────────── */}
          {activeTab === "content" && (
            <div className="animate-fade-in space-y-3">
              {clientContent.length === 0 && (
                <div className="card text-center py-10 text-muted-foreground">Nenhum conteúdo para este cliente.</div>
              )}
              {clientContent.map((card) => (
                <div key={card.id} className="card flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <p className="font-medium text-foreground">{card.title}</p>
                      <span className={`badge border text-xs shrink-0 ${getPriorityColor(card.priority)}`}>{getPriorityLabel(card.priority)}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="bg-muted px-2 py-0.5 rounded-full">{card.format}</span>
                      <span>SM: {card.socialMedia}</span>
                      {card.dueDate && <span className="flex items-center gap-1"><Calendar size={11} /> {card.dueDate}</span>}
                      <span className={`badge text-xs ${
                        card.status === "published" ? "bg-primary/15 text-primary" :
                        card.status === "scheduled" ? "bg-primary/15 text-primary" :
                        card.status === "approval" ? "bg-[#111118] text-zinc-400" :
                        card.status === "in_production" ? "bg-primary/15 text-primary" :
                        card.status === "script" ? "bg-primary/15 text-primary" :
                        "bg-zinc-600/20 text-muted-foreground"
                      }`}>
                        {card.status === "published" ? "Publicado" : card.status === "scheduled" ? "Agendado" : card.status === "approval" ? "Aprovação" : card.status === "in_production" ? "Em Produção" : card.status === "script" ? "Roteiro" : "Ideia"}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── ONBOARDING ───────────────────────────────────────────────────── */}
          {activeTab === "onboarding" && (
            <div className="animate-fade-in max-w-xl space-y-4">
              {obItems.length === 0 && (
                <div className="card text-center py-10 text-muted-foreground">
                  {client.status === "onboarding"
                    ? "Checklist de onboarding não iniciado."
                    : "Este cliente já concluiu o onboarding."}
                </div>
              )}

              {obItems.length > 0 && (
                <div className="card">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-foreground">Checklist de Onboarding</h3>
                    <span className="text-sm font-bold text-primary">{obProgress}%</span>
                  </div>

                  <div className="h-2 bg-muted rounded-full overflow-hidden mb-5">
                    <div
                      className="h-full bg-primary rounded-full transition-all duration-500"
                      style={{ width: `${obProgress}%` }}
                    />
                  </div>

                  <div className="space-y-2">
                    {obItems.map((item) => (
                      <label
                        key={item.id}
                        className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                          item.completed ? "bg-primary/5 border border-primary/20" : "hover:bg-muted"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={item.completed}
                          onChange={() => toggleOnboardingItem(clientId, item.id, currentUser)}
                          className="mt-0.5 w-4 h-4 rounded accent-brand"
                        />
                        <div className="flex-1 min-w-0">
                          <span className={`text-sm ${item.completed ? "text-muted-foreground line-through" : "text-foreground"}`}>
                            {item.label}
                          </span>
                          {item.completed && item.completedBy && (
                            <div className="flex items-center gap-2 mt-1.5">
                              <div className="w-5 h-5 rounded-full bg-[#0a34f5]/15 flex items-center justify-center shrink-0">
                                <span className="text-[8px] font-bold text-[#0a34f5]">
                                  {item.completedBy.split(" ").map((w) => w[0]).join("").slice(0, 2)}
                                </span>
                              </div>
                              <span className="text-[11px] text-muted-foreground">
                                {item.completedBy}
                              </span>
                              <span className="text-[10px] text-zinc-600">
                                · {item.completedAt}
                              </span>
                            </div>
                          )}
                        </div>
                        {item.completed && <CheckCircle size={15} className="text-[#0a34f5] shrink-0 mt-0.5 drop-shadow-[0_0_4px_rgba(10,52,245,0.5)]" />}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── CREATIVE WALLET ──────────────────────────────────────────────── */}
          {activeTab === "wallet" && (
            <div className="animate-fade-in space-y-5 max-w-3xl">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-foreground">Creative Wallet</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Banco de referências visuais, paleta de cores e tipografia da marca.</p>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => setShowDesignReqForm(true)}
                    className="btn-primary text-xs flex items-center gap-1.5"
                  >
                    <Palette size={12} /> Solicitar Design
                  </button>
                  {(["reference", "palette", "typography", "logo"] as CreativeAsset["type"][]).map((type) => {
                    const cfg = ASSET_TYPE_CONFIG[type];
                    return (
                      <label key={type} className={`btn-ghost text-xs flex items-center gap-1.5 cursor-pointer ${cfg.color}`}>
                        <Upload size={12} />
                        {cfg.label}
                        <input type="file" accept="image/*" className="hidden"
                          onChange={(e) => handleWalletUpload(e, type)} />
                      </label>
                    );
                  })}
                </div>
              </div>

              {clientAssets.length === 0 && (
                <div className="card text-center py-16 text-muted-foreground/50 border-2 border-dashed border-border">
                  <ImageIcon size={32} className="mx-auto mb-3 text-gray-700" />
                  <p className="text-sm">Nenhuma referência visual adicionada ainda.</p>
                  <p className="text-xs mt-1">Use os botões acima para fazer upload de imagens de inspiração, paletas e tipografias.</p>
                </div>
              )}

              {/* Group by type */}
              {(["reference", "palette", "typography", "logo"] as CreativeAsset["type"][]).map((type) => {
                const assets = clientAssets.filter((a) => a.type === type);
                if (assets.length === 0) return null;
                const cfg = ASSET_TYPE_CONFIG[type];
                const Icon = cfg.icon;
                return (
                  <div key={type}>
                    <div className="flex items-center gap-2 mb-3">
                      <Icon size={14} className={cfg.color} />
                      <span className={`text-sm font-medium ${cfg.color}`}>{cfg.label}s</span>
                      <span className="text-xs text-muted-foreground/50">({assets.length})</span>
                    </div>
                    <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
                      {assets.map((asset) => (
                        <div key={asset.id} className="group relative rounded-xl overflow-hidden border border-border hover:border-primary/30 transition-colors bg-card">
                          <div className="aspect-video w-full overflow-hidden bg-muted">
                            <img src={asset.url} alt={asset.label ?? type}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                          </div>
                          <div className="p-2.5">
                            <p className="text-xs text-[#c0c0cc] font-medium truncate">{asset.label ?? cfg.label}</p>
                            <p className="text-xs text-muted-foreground/50 mt-0.5">{asset.uploadedBy} · {asset.uploadedAt}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── REPORTS ──────────────────────────────────────────────────────── */}
          {activeTab === "reports" && (role === "admin" || role === "manager") && (
            <div className="animate-fade-in space-y-4">
              <p className="text-muted-foreground text-sm">Relatórios quinzenais da equipe. Visão exclusiva para gestores.</p>

              {clientReports.length === 0 && (
                <div className="card text-center py-8 text-muted-foreground">Nenhum relatório quinzenal ainda.</div>
              )}

              {clientReports.map((report) => {
                const isGood = report.communicationHealth >= 4;
                const isBad = report.communicationHealth <= 2;
                return (
                  <div key={report.id} className={`card border ${isBad ? "border-red-500/20" : isGood ? "border-primary/20" : "border-border"}`}>
                    <div className="flex items-start justify-between gap-4 mb-4">
                      <div>
                        <p className="font-semibold text-foreground">Período: {report.period}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">por {report.createdBy} · {report.createdAt}</p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <button
                          onClick={() => exportReportAsPdf({
                            title: "Relatório Quinzenal",
                            clientName: client.name,
                            period: report.period,
                            createdBy: report.createdBy,
                            createdAt: report.createdAt,
                            sections: [
                              { label: "Saúde da Comunicação", value: report.communicationHealth, type: "score" },
                              { label: "Engajamento do Cliente", value: report.clientEngagement, type: "score" },
                              { label: "Destaques", value: report.highlights, type: "text" },
                              { label: "Desafios", value: report.challenges, type: "text" },
                              { label: "Próximos Passos", value: report.nextSteps, type: "text" },
                            ],
                          })}
                          className="btn-ghost text-xs flex items-center gap-1"
                          title="Exportar PDF"
                        >
                          <FileText size={12} /> PDF
                        </button>
                      </div>
                      <div className="flex gap-5 text-center shrink-0">
                        {[
                          { label: "Comunicação", value: report.communicationHealth },
                          { label: "Engajamento", value: report.clientEngagement },
                        ].map(({ label, value }) => (
                          <div key={label}>
                            <div className="flex gap-1 justify-center">
                              {[1,2,3,4,5].map((s) => (
                                <span key={s} className={`w-4 h-4 rounded-sm ${s <= value ? (isBad ? "bg-red-500" : isGood ? "bg-primary" : "bg-zinc-500") : "bg-muted"}`} />
                              ))}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">{label}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <p className="text-xs text-primary font-medium mb-1">Destaques</p>
                        <p className="text-[#c0c0cc] leading-relaxed">{report.highlights}</p>
                      </div>
                      <div>
                        <p className="text-xs text-red-500 font-medium mb-1">Desafios</p>
                        <p className="text-[#c0c0cc] leading-relaxed">{report.challenges}</p>
                      </div>
                      <div>
                        <p className="text-xs text-primary font-medium mb-1">Próximos Passos</p>
                        <p className="text-[#c0c0cc] leading-relaxed">{report.nextSteps}</p>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* New report form */}
              <div className="card border border-primary/20">
                <h4 className="font-semibold text-foreground mb-4 flex items-center gap-2">
                  <FileText size={16} className="text-primary" />
                  Novo Relatório Quinzenal
                </h4>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const fd = new FormData(e.currentTarget);
                    const period = fd.get("period") as string;
                    const commHealth = Number(fd.get("commHealth"));
                    const engagement = Number(fd.get("engagement"));
                    const highlights = fd.get("highlights") as string;
                    const challenges = fd.get("challenges") as string;
                    const nextSteps = fd.get("nextSteps") as string;
                    if (!period || !highlights) return;
                    addQuinzReport({
                      clientId: client.id,
                      clientName: client.name,
                      period,
                      createdBy: currentUser,
                      communicationHealth: commHealth,
                      clientEngagement: engagement,
                      highlights,
                      challenges,
                      nextSteps,
                    });
                    e.currentTarget.reset();
                  }}
                  className="space-y-4"
                >
                  <input name="period" type="text" required placeholder="Período (ex: 16–31 Mar/2026)" className="w-full bg-muted rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary" />
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1.5">Saúde da Comunicação (1–5)</label>
                      <select name="commHealth" defaultValue={3} className="w-full bg-muted rounded-lg px-3 py-2.5 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary border border-border">
                        {[1,2,3,4,5].map((n) => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1.5">Engajamento do Cliente (1–5)</label>
                      <select name="engagement" defaultValue={3} className="w-full bg-muted rounded-lg px-3 py-2.5 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary border border-border">
                        {[1,2,3,4,5].map((n) => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </div>
                  </div>
                  <textarea name="highlights" rows={2} required placeholder="Destaques do período..." className="w-full bg-muted rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary resize-none" />
                  <textarea name="challenges" rows={2} placeholder="Desafios encontrados..." className="w-full bg-muted rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary resize-none" />
                  <textarea name="nextSteps" rows={2} placeholder="Próximos passos..." className="w-full bg-muted rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary resize-none" />
                  <button type="submit" className="btn-primary flex items-center gap-2"><FileText size={14} /> Salvar Relatório</button>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── SOLICITAR DESIGN MODAL ─────────────────────────────────────── */}
      {showDesignReqForm && client && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowDesignReqForm(false)}>
          <div className="bg-card border border-border rounded-2xl w-full max-w-md mx-4 shadow-2xl animate-fade-in" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-border">
              <h3 className="font-semibold text-foreground text-sm">Solicitar Design</h3>
              <p className="text-xs text-primary mt-0.5">{client.name}</p>
            </div>
            <div className="p-5 space-y-3">
              <input
                value={designReqForm.title}
                onChange={(e) => setDesignReqForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Título (ex: Banner promoção de verão)"
                className="w-full bg-muted rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary"
              />
              <div className="grid grid-cols-2 gap-3">
                <select
                  value={designReqForm.format}
                  onChange={(e) => setDesignReqForm((f) => ({ ...f, format: e.target.value }))}
                  className="bg-muted rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary"
                >
                  <option>Post Feed</option>
                  <option>Story</option>
                  <option>Reels</option>
                  <option>Carrossel</option>
                  <option>Banner</option>
                  <option>Thumbnail</option>
                </select>
                <select
                  value={designReqForm.priority}
                  onChange={(e) => setDesignReqForm((f) => ({ ...f, priority: e.target.value as typeof designReqForm.priority }))}
                  className="bg-muted rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="low">Baixa</option>
                  <option value="medium">Média</option>
                  <option value="high">Alta</option>
                  <option value="critical">Urgente</option>
                </select>
              </div>
              <input
                type="date"
                value={designReqForm.deadline}
                onChange={(e) => setDesignReqForm((f) => ({ ...f, deadline: e.target.value }))}
                className="w-full bg-muted rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary"
              />
              <textarea
                value={designReqForm.briefing}
                onChange={(e) => setDesignReqForm((f) => ({ ...f, briefing: e.target.value }))}
                rows={3}
                placeholder="Briefing detalhado para o designer..."
                className="w-full bg-muted rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary resize-none"
              />
            </div>
            <div className="p-5 border-t border-border flex gap-2">
              <button onClick={() => setShowDesignReqForm(false)} className="btn-ghost flex-1 text-sm">Cancelar</button>
              <button
                onClick={() => {
                  if (!designReqForm.title.trim() || !designReqForm.briefing.trim()) return;
                  addDesignRequest({
                    title: designReqForm.title.trim(),
                    clientId: client.id,
                    clientName: client.name,
                    requestedBy: currentUser,
                    priority: designReqForm.priority,
                    status: "queued",
                    format: designReqForm.format,
                    briefing: designReqForm.briefing.trim(),
                    deadline: designReqForm.deadline || undefined,
                  });
                  setDesignReqForm({ title: "", format: "Post Feed", briefing: "", priority: "medium", deadline: "" });
                  setShowDesignReqForm(false);
                }}
                disabled={!designReqForm.title.trim() || !designReqForm.briefing.trim()}
                className="btn-primary flex-1 text-sm disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                <Palette size={13} /> Enviar Solicitação
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Client Modal */}
      {showEditModal && (
        <EditClientModal client={client} onClose={() => setShowEditModal(false)} />
      )}
    </div>
  );
}
