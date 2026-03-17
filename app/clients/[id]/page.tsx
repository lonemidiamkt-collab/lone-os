"use client";

import { useParams } from "next/navigation";
import Header from "@/components/Header";
import { useAppState } from "@/lib/context/AppStateContext";
import { useRole } from "@/lib/context/RoleContext";
import { mockTasks, mockQuinzReports } from "@/lib/mockData";
import {
  formatCurrency,
  getAttentionColor,
  getAttentionLabel,
  getStatusColor,
  getStatusLabel,
  getPriorityColor,
  getPriorityLabel,
  daysSince,
} from "@/lib/utils";
import type { TimelineEntryType, ClientStatus, CreativeAsset } from "@/lib/types";
import {
  ArrowLeft, MessageSquare, FileText, TrendingUp,
  Instagram, Calendar, DollarSign, AlertTriangle,
  CheckCircle, Clock, User, Send, Activity,
  CheckSquare, GitCommitHorizontal, MessageCircle,
  BarChart2, PenLine, Star, Upload, Image as ImageIcon,
  Link as LinkIcon, Mic, Palette,
} from "lucide-react";
import Link from "next/link";
import { useState, useRef, useEffect } from "react";

// ── Timeline helpers ─────────────────────────────────────────────────────────
const TIMELINE_ICONS: Record<TimelineEntryType, { icon: React.ElementType; color: string; bg: string }> = {
  chat:       { icon: MessageCircle,       color: "text-purple-400",  bg: "bg-purple-500/20" },
  task:       { icon: CheckSquare,         color: "text-green-400",   bg: "bg-green-500/20" },
  status:     { icon: Activity,            color: "text-orange-400",  bg: "bg-orange-500/20" },
  content:    { icon: Instagram,           color: "text-pink-400",    bg: "bg-pink-500/20" },
  design:     { icon: Star,               color: "text-yellow-400",  bg: "bg-yellow-500/20" },
  report:     { icon: BarChart2,           color: "text-blue-400",    bg: "bg-blue-500/20" },
  manual:     { icon: PenLine,             color: "text-gray-400",    bg: "bg-gray-500/20" },
  onboarding: { icon: GitCommitHorizontal, color: "text-teal-400",    bg: "bg-teal-500/20" },
  meeting:    { icon: User,               color: "text-indigo-400",  bg: "bg-indigo-500/20" },
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
  reference:  { label: "Referência", color: "text-blue-400",   icon: ImageIcon },
  palette:    { label: "Paleta",     color: "text-pink-400",   icon: Palette },
  typography: { label: "Tipografia", color: "text-yellow-400", icon: Mic },
  logo:       { label: "Logo",       color: "text-green-400",  icon: Star },
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
  const { clients, contentCards, timeline, clientChats, onboarding, creativeAssets, addCreativeAsset, sendClientMessage, addTimelineEntry, toggleOnboardingItem, updateClientStatus } = useAppState();

  const client = clients.find((c) => c.id === clientId);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [chatInput, setChatInput] = useState("");
  const [manualNote, setManualNote] = useState("");
  const [showNoteInput, setShowNoteInput] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const chats = clientChats[clientId] ?? [];
  const entries = timeline[clientId] ?? [];
  const obItems = onboarding[clientId] ?? [];
  const clientTasks = mockTasks.filter((t) => t.clientId === clientId);
  const clientContent = contentCards.filter((c) => c.clientId === clientId);
  const clientReports = mockQuinzReports.filter((r) => r.clientId === clientId);
  const clientAssets = creativeAssets[clientId] ?? [];
  const walletFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chats.length]);

  if (!client) {
    return (
      <div className="flex flex-col flex-1 overflow-auto">
        <Header title="Cliente não encontrado" />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-3">
            <p className="text-gray-400">Cliente não encontrado.</p>
            <Link href="/clients" className="btn-primary">Voltar</Link>
          </div>
        </div>
      </div>
    );
  }

  const health = calcHealth(client);
  const healthColor = health >= 70 ? "text-green-400" : health >= 45 ? "text-yellow-400" : "text-red-400";
  const healthBar = health >= 70 ? "bg-green-400" : health >= 45 ? "bg-yellow-400" : "bg-red-400";

  const daysWithUs = Math.floor((Date.now() - new Date(client.joinDate).getTime()) / 86400000);
  const ltv = client.monthlyBudget * Math.max(1, Math.floor(daysWithUs / 30));

  const obCompleted = obItems.filter((i) => i.completed).length;
  const obProgress = obItems.length > 0 ? Math.round((obCompleted / obItems.length) * 100) : 0;

  const visibleTabs = TABS.filter((tab) => {
    if (tab === "reports") return role === "admin" || role === "manager";
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
          <Link href="/clients" className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors">
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
              <select
                value={client.status}
                onChange={(e) => updateClientStatus(clientId, e.target.value as ClientStatus, currentUser)}
                className="bg-surface-card border border-surface-border text-xs text-gray-300 rounded-lg px-2 py-1.5 outline-none focus:border-brand"
              >
                {statusOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
          <div className="card flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center shrink-0">
              <DollarSign size={18} className="text-green-400" />
            </div>
            <div>
              <p className="text-xs text-gray-400">Investimento/mês</p>
              <p className="text-lg font-bold text-green-400">{formatCurrency(client.monthlyBudget)}</p>
            </div>
          </div>
          <div className="card flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center shrink-0">
              <Calendar size={18} className="text-blue-400" />
            </div>
            <div>
              <p className="text-xs text-gray-400">Dias conosco</p>
              <p className="text-lg font-bold text-blue-400">{daysWithUs}d</p>
            </div>
          </div>
          <div className="card flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center shrink-0">
              <TrendingUp size={18} className="text-purple-400" />
            </div>
            <div>
              <p className="text-xs text-gray-400">LTV Acumulado</p>
              <p className="text-lg font-bold text-purple-400">{formatCurrency(ltv)}</p>
            </div>
          </div>
          <div className="card flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${client.status === "at_risk" ? "bg-red-500/20" : "bg-teal-500/20"}`}>
              {client.status === "at_risk"
                ? <AlertTriangle size={18} className="text-red-400" />
                : <CheckCircle size={18} className="text-teal-400" />}
            </div>
            <div>
              <p className="text-xs text-gray-400">Último post</p>
              <p className={`text-lg font-bold ${client.lastPostDate && daysSince(client.lastPostDate) > 7 ? "text-red-400" : "text-teal-400"}`}>
                {client.lastPostDate ? `${daysSince(client.lastPostDate)}d atrás` : "—"}
              </p>
            </div>
          </div>
          {/* Health Score */}
          <div className="card">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-gray-400">Health Score</p>
              <span className={`text-lg font-bold ${healthColor}`}>{health}</span>
            </div>
            <div className="h-2 bg-surface-border rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${healthBar}`} style={{ width: `${health}%` }} />
            </div>
            <p className="text-xs text-gray-500 mt-1.5">
              {health >= 70 ? "Saudável" : health >= 45 ? "Atenção necessária" : "Risco de churn"}
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div>
          <div className="flex gap-0.5 mb-5 border-b border-surface-border overflow-x-auto">
            {visibleTabs.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap ${
                  activeTab === tab
                    ? "border-brand text-brand-light"
                    : "border-transparent text-gray-400 hover:text-white"
                }`}
              >
                {TAB_LABELS[tab]}
                {tab === "historico" && entries.length > 0 && (
                  <span className="ml-1.5 text-xs bg-brand/20 text-brand-light px-1.5 py-0.5 rounded-full">
                    {entries.length}
                  </span>
                )}
                {tab === "onboarding" && client.status === "onboarding" && obItems.length > 0 && (
                  <span className="ml-1.5 text-xs bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded-full">
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
                <div className="bg-brand/10 border border-brand/20 rounded-xl p-4 flex flex-wrap gap-4 items-start">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Dossiê da Marca</p>
                    <div className="flex flex-wrap gap-2">
                      <span className="text-xs bg-surface-border text-gray-300 px-2 py-1 rounded-lg font-medium">
                        📌 Nicho: {client.industry}
                      </span>
                      {client.toneOfVoice && (
                        <span className="text-xs bg-surface-border text-gray-300 px-2 py-1 rounded-lg font-medium">
                          🗣 Tom: {TONE_LABELS[client.toneOfVoice]}
                        </span>
                      )}
                      {client.instagramUser && (
                        <span className="text-xs bg-pink-500/15 text-pink-300 px-2 py-1 rounded-lg font-medium border border-pink-500/20">
                          <Instagram size={10} className="inline mr-1" />
                          {client.instagramUser}
                        </span>
                      )}
                      {client.driveLink && (
                        <a href={client.driveLink} target="_blank" rel="noreferrer"
                          className="text-xs bg-blue-500/15 text-blue-300 px-2 py-1 rounded-lg font-medium border border-blue-500/20 flex items-center gap-1 hover:bg-blue-500/25 transition-colors">
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
                <h3 className="font-semibold text-white mb-4">Dados Cadastrais</h3>
                {[
                  { label: "Segmento", value: client.industry },
                  { label: "Investimento mensal", value: formatCurrency(client.monthlyBudget) },
                  { label: "Forma de pagamento", value: client.paymentMethod },
                  { label: "Gestor de tráfego", value: client.assignedTraffic },
                  { label: "Social Media", value: client.assignedSocial },
                  { label: "Cliente desde", value: client.joinDate },
                  { label: "Último post", value: client.lastPostDate ?? "—" },
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-center justify-between py-2.5 border-b border-surface-border/50 last:border-0">
                    <span className="text-sm text-gray-400">{label}</span>
                    <span className="text-sm text-white font-medium">{value}</span>
                  </div>
                ))}
                {client.notes && (
                  <div className="mt-3 pt-3 border-t border-surface-border">
                    <p className="text-xs text-gray-500 mb-1">Observações</p>
                    <p className="text-sm text-gray-300 bg-surface-border rounded-lg p-3 border-l-2 border-yellow-500/50">{client.notes}</p>
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <div className="card">
                  <h3 className="font-semibold text-white mb-4">Equipe Responsável</h3>
                  <div className="space-y-3">
                    {[
                      { role: "Tráfego Pago", name: client.assignedTraffic, color: "text-green-400", bg: "bg-green-500/20", Icon: TrendingUp },
                      { role: "Social Media", name: client.assignedSocial, color: "text-pink-400", bg: "bg-pink-500/20", Icon: Instagram },
                    ].map(({ role: r, name, color, bg, Icon }) => (
                      <div key={r} className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${bg} shrink-0`}>
                          <Icon size={16} className={color} />
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">{r}</p>
                          <p className="text-sm font-medium text-white">{name}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="card">
                  <h3 className="font-semibold text-white mb-3">Resumo de Atividade</h3>
                  <div className="grid grid-cols-4 gap-2 text-center">
                    {[
                      { label: "Tarefas", value: clientTasks.length },
                      { label: "Conteúdos", value: clientContent.length },
                      { label: "No histórico", value: entries.length },
                      { label: "Relatórios", value: clientReports.length },
                    ].map(({ label, value }) => (
                      <div key={label}>
                        <p className="text-xl font-bold text-white">{value}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            </div>
          )}

          {/* ── CHAT ─────────────────────────────────────────────────────────── */}
          {activeTab === "chat" && (
            <div className="animate-fade-in max-w-2xl">
              <div className="card flex flex-col" style={{ height: "500px" }}>
                <div className="flex items-center gap-2 mb-4 pb-4 border-b border-surface-border">
                  <MessageSquare size={16} className="text-brand-light" />
                  <h3 className="font-semibold text-white">Chat Interno — {client.name}</h3>
                  <span className="ml-auto text-xs text-gray-500 bg-surface-border px-2 py-1 rounded-lg">
                    Cada mensagem é salva no histórico operacional
                  </span>
                </div>

                <div className="flex-1 overflow-auto space-y-4 pr-1">
                  {chats.length === 0 && (
                    <p className="text-gray-600 text-sm text-center pt-8">Nenhuma mensagem ainda.</p>
                  )}
                  {chats.map((msg) => (
                    <div key={msg.id} className={`flex flex-col ${msg.user === currentUser ? "items-end" : "items-start"}`}>
                      <span className="text-xs text-gray-500 mb-1">{msg.user} · {msg.timestamp}</span>
                      <div className={`rounded-xl px-4 py-2.5 text-sm max-w-[80%] ${
                        msg.user === currentUser
                          ? "bg-brand/30 text-brand-light"
                          : "bg-surface-border text-gray-200"
                      }`}>
                        {msg.text}
                      </div>
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>

                <div className="flex gap-2 mt-4 pt-4 border-t border-surface-border">
                  <input
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSendChat()}
                    placeholder="Escreva para a equipe... (salvo automaticamente no histórico)"
                    className="flex-1 bg-surface-border rounded-lg px-4 py-2.5 text-sm text-gray-200 placeholder-gray-600 outline-none focus:ring-1 focus:ring-brand"
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
                <p className="text-sm text-gray-400">
                  Registro automático de tudo que acontece com este cliente.
                </p>
                <button
                  onClick={() => setShowNoteInput(!showNoteInput)}
                  className="btn-ghost flex items-center gap-1.5 text-xs"
                >
                  <PenLine size={13} />
                  Adicionar nota manual
                </button>
              </div>

              {showNoteInput && (
                <div className="card border border-brand/20 animate-fade-in">
                  <p className="text-xs text-gray-400 mb-2">Nova nota manual no histórico</p>
                  <textarea
                    value={manualNote}
                    onChange={(e) => setManualNote(e.target.value)}
                    rows={2}
                    placeholder="Ex: Reunião com cliente — satisfeito com resultados, pediu ampliar budget..."
                    className="w-full bg-surface-border rounded-lg px-3 py-2.5 text-sm text-gray-200 placeholder-gray-600 outline-none focus:ring-1 focus:ring-brand resize-none mb-3"
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
                <div className="card text-center py-10 text-gray-500">
                  Nenhum registro ainda. Envie uma mensagem no chat ou atualize o status.
                </div>
              )}

              {/* Vertical timeline */}
              <div className="relative">
                <div className="absolute left-5 top-0 bottom-0 w-px bg-surface-border" />
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
                            <p className="text-sm text-gray-200 leading-relaxed">{entry.description}</p>
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
                            <span className="text-gray-600">·</span>
                            <span className="text-xs text-gray-500">{entry.actor}</span>
                            <span className="text-gray-600">·</span>
                            <span className="text-xs text-gray-600">{entry.timestamp}</span>
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
                <div className="card text-center py-10 text-gray-500">Nenhuma tarefa para este cliente.</div>
              )}
              {clientTasks.map((task) => (
                <div key={task.id} className="card flex items-start gap-4">
                  <div className={`w-1 self-stretch rounded-full shrink-0 ${
                    task.priority === "critical" ? "bg-red-400" :
                    task.priority === "high" ? "bg-orange-400" :
                    task.priority === "medium" ? "bg-blue-400" : "bg-gray-500"
                  }`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-medium text-white">{task.title}</p>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`badge border text-xs ${getPriorityColor(task.priority)}`}>{getPriorityLabel(task.priority)}</span>
                        <span className={`badge text-xs ${
                          task.status === "done" ? "bg-green-500/20 text-green-400" :
                          task.status === "in_progress" ? "bg-blue-500/20 text-blue-400" :
                          task.status === "review" ? "bg-yellow-500/20 text-yellow-400" :
                          "bg-gray-500/20 text-gray-400"
                        }`}>
                          {task.status === "done" ? "Concluído" : task.status === "in_progress" ? "Em Execução" : task.status === "review" ? "Validação" : "Pendente"}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-400">
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
                <div className="card text-center py-10 text-gray-500">Nenhum conteúdo para este cliente.</div>
              )}
              {clientContent.map((card) => (
                <div key={card.id} className="card flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <p className="font-medium text-white">{card.title}</p>
                      <span className={`badge border text-xs shrink-0 ${getPriorityColor(card.priority)}`}>{getPriorityLabel(card.priority)}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
                      <span className="bg-surface-border px-2 py-0.5 rounded-full">{card.format}</span>
                      <span>SM: {card.socialMedia}</span>
                      {card.dueDate && <span className="flex items-center gap-1"><Calendar size={11} /> {card.dueDate}</span>}
                      <span className={`badge text-xs ${
                        card.status === "published" ? "bg-green-500/20 text-green-400" :
                        card.status === "scheduled" ? "bg-teal-500/20 text-teal-400" :
                        card.status === "approval" ? "bg-yellow-500/20 text-yellow-400" :
                        card.status === "in_production" ? "bg-blue-500/20 text-blue-400" :
                        card.status === "script" ? "bg-purple-500/20 text-purple-400" :
                        "bg-gray-500/20 text-gray-400"
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
                <div className="card text-center py-10 text-gray-500">
                  {client.status === "onboarding"
                    ? "Checklist de onboarding não iniciado."
                    : "Este cliente já concluiu o onboarding."}
                </div>
              )}

              {obItems.length > 0 && (
                <div className="card">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-white">Checklist de Onboarding</h3>
                    <span className="text-sm font-bold text-brand-light">{obProgress}%</span>
                  </div>

                  <div className="h-2 bg-surface-border rounded-full overflow-hidden mb-5">
                    <div
                      className="h-full bg-brand rounded-full transition-all duration-500"
                      style={{ width: `${obProgress}%` }}
                    />
                  </div>

                  <div className="space-y-2">
                    {obItems.map((item) => (
                      <label
                        key={item.id}
                        className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                          item.completed ? "bg-green-500/5 border border-green-500/20" : "hover:bg-surface-hover"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={item.completed}
                          onChange={() => toggleOnboardingItem(clientId, item.id, currentUser)}
                          className="mt-0.5 w-4 h-4 rounded accent-brand"
                        />
                        <div className="flex-1 min-w-0">
                          <span className={`text-sm ${item.completed ? "text-gray-500 line-through" : "text-gray-200"}`}>
                            {item.label}
                          </span>
                          {item.completed && item.completedBy && (
                            <p className="text-xs text-gray-600 mt-0.5">
                              por {item.completedBy} · {item.completedAt}
                            </p>
                          )}
                        </div>
                        {item.completed && <CheckCircle size={15} className="text-green-400 shrink-0 mt-0.5" />}
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
                  <h3 className="font-semibold text-white">Creative Wallet</h3>
                  <p className="text-xs text-gray-500 mt-0.5">Banco de referências visuais, paleta de cores e tipografia da marca.</p>
                </div>
                <div className="flex gap-2">
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
                <div className="card text-center py-16 text-gray-600 border-2 border-dashed border-surface-border">
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
                      <span className="text-xs text-gray-600">({assets.length})</span>
                    </div>
                    <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
                      {assets.map((asset) => (
                        <div key={asset.id} className="group relative rounded-xl overflow-hidden border border-surface-border hover:border-brand/30 transition-colors bg-surface-raised">
                          <div className="aspect-video w-full overflow-hidden bg-surface-border">
                            <img src={asset.url} alt={asset.label ?? type}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                          </div>
                          <div className="p-2.5">
                            <p className="text-xs text-gray-300 font-medium truncate">{asset.label ?? cfg.label}</p>
                            <p className="text-xs text-gray-600 mt-0.5">{asset.uploadedBy} · {asset.uploadedAt}</p>
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
              <p className="text-gray-400 text-sm">Relatórios quinzenais da equipe. Visão exclusiva para gestores.</p>

              {clientReports.length === 0 && (
                <div className="card text-center py-8 text-gray-500">Nenhum relatório quinzenal ainda.</div>
              )}

              {clientReports.map((report) => {
                const isGood = report.communicationHealth >= 4;
                const isBad = report.communicationHealth <= 2;
                return (
                  <div key={report.id} className={`card border ${isBad ? "border-red-500/30" : isGood ? "border-green-500/20" : "border-surface-border"}`}>
                    <div className="flex items-start justify-between gap-4 mb-4">
                      <div>
                        <p className="font-semibold text-white">Período: {report.period}</p>
                        <p className="text-xs text-gray-400 mt-0.5">por {report.createdBy} · {report.createdAt}</p>
                      </div>
                      <div className="flex gap-5 text-center shrink-0">
                        {[
                          { label: "Comunicação", value: report.communicationHealth },
                          { label: "Engajamento", value: report.clientEngagement },
                        ].map(({ label, value }) => (
                          <div key={label}>
                            <div className="flex gap-1 justify-center">
                              {[1,2,3,4,5].map((s) => (
                                <span key={s} className={`w-4 h-4 rounded-sm ${s <= value ? (isBad ? "bg-red-400" : isGood ? "bg-green-400" : "bg-yellow-400") : "bg-surface-border"}`} />
                              ))}
                            </div>
                            <p className="text-xs text-gray-500 mt-1">{label}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <p className="text-xs text-green-400 font-medium mb-1">Destaques</p>
                        <p className="text-gray-300 leading-relaxed">{report.highlights}</p>
                      </div>
                      <div>
                        <p className="text-xs text-red-400 font-medium mb-1">Desafios</p>
                        <p className="text-gray-300 leading-relaxed">{report.challenges}</p>
                      </div>
                      <div>
                        <p className="text-xs text-blue-400 font-medium mb-1">Próximos Passos</p>
                        <p className="text-gray-300 leading-relaxed">{report.nextSteps}</p>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* New report form */}
              <div className="card border border-brand/20">
                <h4 className="font-semibold text-white mb-4 flex items-center gap-2">
                  <FileText size={16} className="text-brand-light" />
                  Novo Relatório Quinzenal
                </h4>
                <div className="space-y-4">
                  <input type="text" placeholder="Período (ex: 16–31 Mar/2026)" className="w-full bg-surface-border rounded-lg px-3 py-2.5 text-sm text-gray-200 placeholder-gray-600 outline-none focus:ring-1 focus:ring-brand" />
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-gray-400 block mb-1.5">Saúde da Comunicação (1–5)</label>
                      <select className="w-full bg-surface-border rounded-lg px-3 py-2.5 text-sm text-gray-200 outline-none focus:ring-1 focus:ring-brand border border-surface-border">
                        {[1,2,3,4,5].map((n) => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-gray-400 block mb-1.5">Engajamento do Cliente (1–5)</label>
                      <select className="w-full bg-surface-border rounded-lg px-3 py-2.5 text-sm text-gray-200 outline-none focus:ring-1 focus:ring-brand border border-surface-border">
                        {[1,2,3,4,5].map((n) => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </div>
                  </div>
                  <textarea rows={2} placeholder="Destaques do período..." className="w-full bg-surface-border rounded-lg px-3 py-2.5 text-sm text-gray-200 placeholder-gray-600 outline-none focus:ring-1 focus:ring-brand resize-none" />
                  <textarea rows={2} placeholder="Desafios encontrados..." className="w-full bg-surface-border rounded-lg px-3 py-2.5 text-sm text-gray-200 placeholder-gray-600 outline-none focus:ring-1 focus:ring-brand resize-none" />
                  <textarea rows={2} placeholder="Próximos passos..." className="w-full bg-surface-border rounded-lg px-3 py-2.5 text-sm text-gray-200 placeholder-gray-600 outline-none focus:ring-1 focus:ring-brand resize-none" />
                  <button className="btn-primary flex items-center gap-2"><FileText size={14} /> Salvar Relatório</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
