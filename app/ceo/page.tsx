"use client";

import Header from "@/components/Header";
import { useAppState } from "@/lib/context/AppStateContext";
import { getAttentionColor, getAttentionLabel, getStatusColor, getStatusLabel, formatTimeSpent, getLiveTimeSpentMs, OVERTIME_THRESHOLD_MS } from "@/lib/utils";
import { exportReportAsPdf } from "@/lib/exportPdf";
import {
  Lock, Unlock, BarChart2, TrendingUp, TrendingDown, FileText, Clock, AlertTriangle,
  Eye, EyeOff, Shield, Download, Users, CheckCircle, Target,
  Instagram, Palette, Zap, UserPlus, Trash2, Edit3, Save, X,
  KeyRound, Mail, UserCog, AlertCircle, ChevronRight, ZapOff,
  Calendar as CalendarIcon, ShieldCheck,
} from "lucide-react";
import { useState, useMemo, useCallback } from "react";
import { USER_PROFILES } from "@/lib/context/RoleContext";
import MedievalAvatar, { AVATAR_OPTIONS, getUserAvatar, setUserAvatar, type AvatarType } from "@/components/MedievalAvatars";
import type { Role } from "@/lib/types";
import { mockAdCampaigns } from "@/lib/mockData";

const CORRECT_PIN = "8822";
const PIN_SESSION_KEY = "lone-os-ceo-unlocked";

export default function CEOPage() {
  const {
    clients, tasks, contentCards, designRequests, trafficRoutineChecks, quinzReports,
  } = useAppState();

  const [pin, setPin] = useState("");
  const [unlocked, setUnlocked] = useState(() => {
    if (typeof window !== "undefined") return sessionStorage.getItem(PIN_SESSION_KEY) === "true";
    return false;
  });
  const [pinError, setPinError] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [activeSection, setActiveSection] = useState<"overview" | "team" | "reports" | "ltv" | "manage" | "timesheet" | "workload" | "churn">("overview");

  const handleUnlock = () => {
    if (pin === CORRECT_PIN) {
      setUnlocked(true);
      setPinError(false);
      try { sessionStorage.setItem(PIN_SESSION_KEY, "true"); } catch {}
    } else {
      setPinError(true);
      setPin("");
    }
  };

  // Employee delivery metrics
  const teamMetrics = useMemo(() => {
    const employees = USER_PROFILES.filter((p) => p.role !== "admin");

    return employees.map((profile) => {
      const memberTasks = tasks.filter((t) => t.assignedTo === profile.name);
      const totalTasks = memberTasks.length;
      const doneTasks = memberTasks.filter((t) => t.status === "done").length;
      const pendingTasks = memberTasks.filter((t) => t.status === "pending").length;
      const inProgressTasks = memberTasks.filter((t) => t.status === "in_progress").length;
      const taskRate = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

      let published = 0;
      let totalCards = 0;
      let designDone = 0;
      let designTotal = 0;
      let supportDone = 0;
      let supportTotal = 0;

      if (profile.role === "social") {
        const memberCards = contentCards.filter((c) => c.socialMedia === profile.name);
        totalCards = memberCards.length;
        published = memberCards.filter((c) => c.status === "published").length;
      }

      if (profile.role === "designer") {
        designTotal = designRequests.length;
        designDone = designRequests.filter((r) => r.status === "done").length;
      }

      if (profile.role === "traffic") {
        const today = new Date().toISOString().slice(0, 10);
        const memberClients = clients.filter((c) => c.assignedTraffic === profile.name && c.status !== "onboarding");
        supportTotal = memberClients.length;
        supportDone = trafficRoutineChecks.filter((c) => c.date === today && c.completedBy === profile.name && c.type === "support").length;
      }

      // Overall score: weighted average of task completion + role-specific
      let overallScore = taskRate;
      if (profile.role === "social" && totalCards > 0) {
        const publishRate = Math.round((published / totalCards) * 100);
        overallScore = Math.round((taskRate * 0.5) + (publishRate * 0.5));
      }
      if (profile.role === "traffic" && supportTotal > 0) {
        const supportRate = Math.round((supportDone / supportTotal) * 100);
        overallScore = Math.round((taskRate * 0.5) + (supportRate * 0.5));
      }

      const level = overallScore >= 80 ? "excellent" : overallScore >= 60 ? "good" : overallScore >= 40 ? "warning" : "critical";

      return {
        ...profile,
        totalTasks,
        doneTasks,
        pendingTasks,
        inProgressTasks,
        taskRate,
        published,
        totalCards,
        designDone,
        designTotal,
        supportDone,
        supportTotal,
        overallScore,
        level,
      };
    });
  }, [tasks, contentCards, designRequests, trafficRoutineChecks, clients]);

  // ═══ TEAM MANAGEMENT STATE ═══
  const ROLE_OPTIONS: { value: Role; label: string }[] = [
    { value: "admin", label: "CEO / Admin" },
    { value: "manager", label: "Gerente de Operações" },
    { value: "traffic", label: "Gestor de Tráfego" },
    { value: "social", label: "Social Media" },
    { value: "designer", label: "Designer" },
  ];

  interface TeamMember {
    id: string;
    name: string;
    email: string;
    role: Role;
    initials: string;
    password: string;
    active: boolean;
    createdAt: string;
  }

  const [teamMembers, setTeamMembers] = useState<TeamMember[]>(() =>
    USER_PROFILES.map((p) => ({
      id: p.id,
      name: p.name,
      email: p.email,
      role: p.role,
      initials: p.initials,
      password: "1234",
      active: true,
      createdAt: "2026-01-01",
    }))
  );

  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // New member form
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<Role>("social");
  const [newPassword, setNewPassword] = useState("1234");

  // Edit form
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editRole, setEditRole] = useState<Role>("social");
  const [editAvatar, setEditAvatar] = useState<AvatarType>("shield");
  const [editPassword, setEditPassword] = useState("");

  const generateInitials = (name: string) => {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  };

  const handleAddMember = useCallback(() => {
    if (!newName.trim() || !newEmail.trim()) return;
    const member: TeamMember = {
      id: `member-${Date.now()}`,
      name: newName.trim(),
      email: newEmail.trim().toLowerCase(),
      role: newRole,
      initials: generateInitials(newName),
      password: newPassword || "1234",
      active: true,
      createdAt: new Date().toISOString().slice(0, 10),
    };
    setTeamMembers((prev) => [...prev, member]);
    setNewName("");
    setNewEmail("");
    setNewRole("social");
    setNewPassword("1234");
    setShowAddForm(false);
  }, [newName, newEmail, newRole, newPassword]);

  const handleStartEdit = useCallback((member: TeamMember) => {
    setEditingId(member.id);
    setEditName(member.name);
    setEditEmail(member.email);
    setEditRole(member.role);
    setEditPassword(member.password);
  }, []);

  const handleSaveEdit = useCallback(() => {
    if (!editingId || !editName.trim() || !editEmail.trim()) return;
    setTeamMembers((prev) =>
      prev.map((m) =>
        m.id === editingId
          ? {
              ...m,
              name: editName.trim(),
              email: editEmail.trim().toLowerCase(),
              role: editRole,
              initials: generateInitials(editName),
              password: editPassword || m.password,
            }
          : m
      )
    );
    // Save avatar
    setUserAvatar(editingId, editAvatar);
    setEditingId(null);
  }, [editingId, editName, editEmail, editRole, editPassword, editAvatar]);

  const handleToggleActive = useCallback((id: string) => {
    setTeamMembers((prev) =>
      prev.map((m) => (m.id === id ? { ...m, active: !m.active } : m))
    );
  }, []);

  const handleDeleteMember = useCallback((id: string) => {
    setTeamMembers((prev) => prev.filter((m) => m.id !== id));
    setConfirmDeleteId(null);
  }, []);

  // Auto-submit when 4 digits entered
  const handlePinChange = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 4);
    setPin(digits);
    setPinError(false);
    if (digits.length === 4) {
      if (digits === CORRECT_PIN) {
        setUnlocked(true);
        try { sessionStorage.setItem(PIN_SESSION_KEY, "true"); } catch {}
      } else {
        setPinError(true);
        setTimeout(() => setPin(""), 600);
      }
    }
  };

  if (!unlocked) {
    return (
      <div className="flex flex-col flex-1 overflow-auto">
        <Header title="Diretoria" subtitle="Acesso restrito" />
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-xs w-full text-center space-y-8">
            <div>
              <Lock size={24} className="text-zinc-500 mx-auto mb-4" />
              <h2 className="text-lg font-semibold text-foreground">Cofre Executivo</h2>
              <p className="text-sm text-zinc-500 mt-1">Insira o PIN de 4 digitos</p>
            </div>

            {/* 4-digit PIN boxes */}
            <div className="flex items-center justify-center gap-3">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className={`w-12 h-14 rounded-lg border flex items-center justify-center text-xl font-bold transition-all ${
                    pinError
                      ? "border-red-500/50 bg-red-500/[0.04]"
                      : pin.length > i
                      ? "border-[#0d4af5]/40 bg-[#0d4af5]/[0.04] text-foreground"
                      : "border-zinc-800 bg-zinc-900/50 text-zinc-700"
                  }`}
                >
                  {pin.length > i ? "•" : ""}
                </div>
              ))}
            </div>

            {/* Hidden input for actual typing */}
            <input
              type="tel"
              inputMode="numeric"
              pattern="[0-9]*"
              value={pin}
              onChange={(e) => handlePinChange(e.target.value)}
              maxLength={4}
              autoFocus
              className="sr-only"
              aria-label="PIN"
            />

            {/* Click anywhere to focus the hidden input */}
            <button
              onClick={() => {
                const input = document.querySelector('input[aria-label="PIN"]') as HTMLInputElement;
                input?.focus();
              }}
              className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
            >
              {pinError ? "PIN incorreto. Tente novamente." : "Clique aqui e digite o PIN"}
            </button>

            <div className="flex items-center justify-center gap-2 text-zinc-700 text-[10px]">
              <Shield size={10} />
              <span>Acesso monitorado</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const LEVEL_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
    excellent: { color: "text-[#0d4af5]", bg: "bg-[#0d4af5]", label: "Excelente" },
    good:      { color: "text-primary",     bg: "bg-primary",     label: "Bom" },
    warning:   { color: "text-[#3b6ff5]",  bg: "bg-[#3b6ff5]",  label: "Atenção" },
    critical:  { color: "text-red-500",     bg: "bg-red-500",     label: "Crítico" },
  };

  const ROLE_ICON: Record<string, typeof Users> = {
    manager: Users,
    traffic: TrendingUp,
    social: Instagram,
    designer: Palette,
  };

  return (
    <div className="flex flex-col flex-1 overflow-auto">
      <Header title="Área da Diretoria" subtitle="Visão confidencial da operação" />

      <div className="p-6 space-y-6 animate-fade-in">
        {/* Unlock banner */}
        <div className="bg-primary/10 border border-primary/30 rounded-xl px-4 py-3 flex items-center gap-3">
          <Unlock size={16} className="text-primary" />
          <span className="text-sm text-primary font-medium">Acesso CEO ativo</span>
          <button
            onClick={() => { setUnlocked(false); setPin(""); }}
            className="ml-auto text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Sair da área restrita
          </button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="card">
            <p className="text-xs text-muted-foreground">Total de Clientes</p>
            <p className="text-2xl font-bold text-primary mt-1">{clients.length}</p>
            <p className="text-xs text-muted-foreground mt-1">na carteira</p>
          </div>
          <div className="card">
            <p className="text-xs text-muted-foreground">Clientes Ativos</p>
            <p className="text-2xl font-bold text-primary mt-1">{clients.filter((c) => c.status !== "onboarding").length}</p>
            <p className="text-xs text-muted-foreground mt-1">em operação</p>
          </div>
          <div className="card">
            <p className="text-xs text-muted-foreground">Bons Resultados</p>
            <p className="text-2xl font-bold text-primary mt-1">{clients.filter((c) => c.status === "good").length}</p>
            <p className="text-xs text-muted-foreground mt-1">clientes satisfeitos</p>
          </div>
          <div className="card">
            <p className="text-xs text-muted-foreground">Risco de Churn</p>
            <p className="text-2xl font-bold text-red-500 mt-1">
              {clients.filter((c) => c.status === "at_risk").length} clientes
            </p>
            <p className="text-xs text-muted-foreground mt-1">precisam de atenção</p>
          </div>
        </div>

        {/* Tabs */}
        <div>
          <div className="flex gap-1 mb-5 border-b border-border">
            {(["overview", "team", "manage", "timesheet", "workload", "churn", "reports", "ltv"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveSection(tab)}
                className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px flex items-center gap-1.5 ${
                  activeSection === tab
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab === "manage" && <UserCog size={14} />}
                {tab === "timesheet" && <Clock size={14} />}
                {tab === "workload" && <BarChart2 size={14} />}
                {tab === "overview" ? "Visão Geral" : tab === "team" ? "Desempenho" : tab === "manage" ? "Gestão da Equipe" : tab === "timesheet" ? "Timesheet" : tab === "workload" ? "Carga de Trabalho" : tab === "churn" ? "Risco de Churn" : tab === "reports" ? "Relatórios" : "Retenção"}
              </button>
            ))}
          </div>

          {activeSection === "overview" && (
            <div className="space-y-4 animate-fade-in">
              {/* Ad Rejection Alert */}
              {mockAdCampaigns.filter((c) => c.status === "error").length > 0 && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 kpi-danger animate-fade-in">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg bg-red-500/15 flex items-center justify-center shrink-0">
                      <AlertCircle size={18} className="text-red-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="text-sm font-bold text-red-400">Anúncios com Erro / Rejeitados</h4>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/20 font-bold">
                          {mockAdCampaigns.filter((c) => c.status === "error").length}
                        </span>
                      </div>
                      <div className="space-y-1.5">
                        {mockAdCampaigns.filter((c) => c.status === "error").map((camp) => (
                          <div key={camp.id} className="flex items-center gap-2 text-xs">
                            <ZapOff size={12} className="text-red-400 shrink-0" />
                            <span className="text-foreground font-medium">{camp.name}</span>
                            <span className="text-muted-foreground">·</span>
                            <span className="text-muted-foreground">{camp.clientName}</span>
                            <span className="text-muted-foreground">· Gasto: R$ {camp.spend.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      {["Cliente", "Segmento", "Status", "Atenção", "Tags", "Tráfego", "Social"].map((h) => (
                        <th key={h} className="text-left py-2.5 px-3 text-muted-foreground font-medium text-xs">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {clients.map((client) => (
                      <tr key={client.id} className="border-b border-border/50 hover:bg-muted/50 transition-colors">
                        <td className="py-3 px-3 font-medium text-foreground">{client.name}</td>
                        <td className="py-3 px-3 text-muted-foreground text-xs">{client.industry}</td>
                        <td className="py-3 px-3">
                          <span className={`badge border text-xs ${getStatusColor(client.status)}`}>
                            {getStatusLabel(client.status)}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <span className={`badge border text-xs ${getAttentionColor(client.attentionLevel)}`}>
                            {getAttentionLabel(client.attentionLevel)}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <div className="flex gap-1 flex-wrap">
                            {client.tags.map((tag) => (
                              <span key={tag} className={`badge border text-xs ${tag === "Premium" ? "tag-premium" : tag === "Risco de Churn" ? "tag-risk" : "tag-matcon"}`}>
                                {tag}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-muted-foreground text-xs">{client.assignedTraffic}</td>
                        <td className="py-3 px-3 text-muted-foreground text-xs">{client.assignedSocial}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* ── BOTTLENECK ANALYZER ── */}
              <div className="space-y-4 mt-6">
                <h3 className="font-semibold text-foreground flex items-center gap-2">
                  <Target size={16} className="text-primary" /> Análise de Gargalos
                </h3>

                {/* Pipeline funnel */}
                {(() => {
                  const pipeline = [
                    { key: "ideas", label: "Ideias", count: contentCards.filter((c) => c.status === "ideas").length },
                    { key: "script", label: "Roteiro", count: contentCards.filter((c) => c.status === "script").length },
                    { key: "in_production", label: "Produção", count: contentCards.filter((c) => c.status === "in_production").length },
                    { key: "approval", label: "Aprovação", count: contentCards.filter((c) => c.status === "approval").length },
                    { key: "client_approval", label: "Aprov. Cliente", count: contentCards.filter((c) => c.status === "client_approval").length },
                    { key: "scheduled", label: "Agendado", count: contentCards.filter((c) => c.status === "scheduled").length },
                    { key: "published", label: "Publicado", count: contentCards.filter((c) => c.status === "published").length },
                  ];
                  const maxCount = Math.max(...pipeline.map((p) => p.count), 1);
                  const bottleneck = pipeline.filter((p) => p.key !== "published" && p.key !== "scheduled").sort((a, b) => b.count - a.count)[0];

                  const designPending = designRequests.filter((r) => r.status !== "done").length;
                  const designDone = designRequests.filter((r) => r.status === "done").length;
                  const cardsWithoutArt = contentCards.filter((c) => !c.imageUrl && ["in_production", "approval", "client_approval"].includes(c.status)).length;

                  // SLA: cards stuck > 3 days
                  const stuckCards = contentCards.filter((c) => {
                    if (c.status === "published" || c.status === "scheduled") return false;
                    const enteredAt = c.columnEnteredAt?.[c.status] ?? c.statusChangedAt;
                    if (!enteredAt) return false;
                    const daysInColumn = (Date.now() - new Date(enteredAt).getTime()) / 86400000;
                    return daysInColumn > 3;
                  });

                  // Workload per person
                  const workload = [...new Set(contentCards.map((c) => c.socialMedia))].map((person) => {
                    const cards = contentCards.filter((c) => c.socialMedia === person);
                    const active = cards.filter((c) => c.status !== "published").length;
                    const published = cards.filter((c) => c.status === "published").length;
                    return { person, active, published, total: cards.length };
                  }).sort((a, b) => b.active - a.active);

                  return (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {/* Pipeline funnel */}
                      <div className="card space-y-3">
                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Pipeline de Conteúdo</p>
                        {pipeline.map((stage) => (
                          <div key={stage.key} className="flex items-center gap-3">
                            <span className="text-xs text-muted-foreground w-24 text-right shrink-0">{stage.label}</span>
                            <div className="flex-1 h-5 bg-muted rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  stage.key === bottleneck?.key ? "bg-red-500" : stage.key === "published" ? "bg-[#0d4af5]" : "bg-primary"
                                }`}
                                style={{ width: `${(stage.count / maxCount) * 100}%` }}
                              />
                            </div>
                            <span className={`text-xs font-bold w-8 ${stage.key === bottleneck?.key ? "text-red-500" : "text-foreground"}`}>
                              {stage.count}
                            </span>
                          </div>
                        ))}
                        {bottleneck && bottleneck.count > 0 && (
                          <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mt-2">
                            Gargalo: <strong>{bottleneck.count} cards</strong> acumulados em &ldquo;{bottleneck.label}&rdquo;
                          </p>
                        )}
                      </div>

                      {/* Design vs. Content stats */}
                      <div className="card space-y-3">
                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Design vs. Demanda</p>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="bg-muted rounded-lg p-3 text-center">
                            <p className="text-2xl font-bold text-foreground">{designPending}</p>
                            <p className="text-[10px] text-muted-foreground">Designs pendentes</p>
                          </div>
                          <div className="bg-muted rounded-lg p-3 text-center">
                            <p className="text-2xl font-bold text-[#0d4af5]">{designDone}</p>
                            <p className="text-[10px] text-muted-foreground">Designs concluídos</p>
                          </div>
                          <div className="bg-muted rounded-lg p-3 text-center">
                            <p className="text-2xl font-bold text-[#3b6ff5]">{cardsWithoutArt}</p>
                            <p className="text-[10px] text-muted-foreground">Cards sem arte</p>
                          </div>
                          <div className="bg-muted rounded-lg p-3 text-center">
                            <p className={`text-2xl font-bold ${stuckCards.length > 0 ? "text-red-500" : "text-foreground"}`}>{stuckCards.length}</p>
                            <p className="text-[10px] text-muted-foreground">Cards parados +3 dias</p>
                          </div>
                        </div>
                      </div>

                      {/* Workload distribution */}
                      <div className="card space-y-3 lg:col-span-2">
                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Carga de Trabalho — Social Media</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                          {workload.map((w) => {
                            const isOverloaded = w.active >= 6;
                            const isIdle = w.active === 0;
                            return (
                              <div key={w.person} className={`bg-muted rounded-lg p-3 border ${
                                isOverloaded ? "border-red-500/30" : isIdle ? "border-[#3b6ff5]/30" : "border-border"
                              }`}>
                                <div className="flex items-center justify-between">
                                  <span className="text-sm font-medium text-foreground">{w.person}</span>
                                  {isOverloaded && <span className="text-[10px] text-red-400 bg-red-500/10 px-2 py-0.5 rounded">Sobrecarregado</span>}
                                  {isIdle && <span className="text-[10px] text-[#3b6ff5] bg-[#0d4af5]/10 px-2 py-0.5 rounded">Ocioso</span>}
                                </div>
                                <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                                  <span>{w.active} ativos</span>
                                  <span>{w.published} publicados</span>
                                  <span>{w.total} total</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* ── POST VERIFICATION METRICS + CALENDAR ── */}
                      {(() => {
                        const now = new Date();
                        const year = now.getFullYear();
                        const month = now.getMonth();
                        const daysInMonth = new Date(year, month + 1, 0).getDate();
                        const firstDayOfWeek = new Date(year, month, 1).getDay(); // 0=Sun
                        const today = now.getDate();
                        const monthStr = now.toLocaleString("pt-BR", { month: "long" });

                        // Build per-client per-day map
                        const publishedCards = contentCards.filter((c) => c.status === "published");
                        const scheduledCards = contentCards.filter((c) => c.status === "scheduled");
                        const unverifiedScheduled = scheduledCards.filter((c) => !c.publishVerifiedAt);
                        const verifiedCount = publishedCards.filter((c) => c.publishVerifiedAt).length;
                        const publishedWithoutVerify = publishedCards.filter((c) => !c.publishVerifiedAt).length;

                        // Per-client daily post map
                        const clientPostDays = new Map<string, Set<number>>();
                        clients.filter((c) => c.status !== "onboarding").forEach((client) => {
                          const days = new Set<number>();
                          const cards = publishedCards.filter((c) => c.clientId === client.id);
                          cards.forEach((card) => {
                            if (card.statusChangedAt) {
                              const d = new Date(card.statusChangedAt);
                              if (d.getMonth() === month && d.getFullYear() === year) {
                                days.add(d.getDate());
                              }
                            }
                          });
                          // Also count scheduled
                          scheduledCards.filter((c) => c.clientId === client.id).forEach((card) => {
                            if (card.dueDate) {
                              const d = new Date(card.dueDate);
                              if (d.getMonth() === month && d.getFullYear() === year) {
                                days.add(d.getDate());
                              }
                            }
                          });
                          clientPostDays.set(client.id, days);
                        });

                        // Global day map: any client posted
                        const globalPostDays = new Set<number>();
                        for (const days of clientPostDays.values()) {
                          days.forEach((d) => globalPostDays.add(d));
                        }

                        const weekDays = ["D", "S", "T", "Q", "Q", "S", "S"];

                        return (
                          <>
                            {/* Verification KPIs */}
                            <div className="card space-y-3 lg:col-span-2">
                              <div className="flex items-center gap-2 mb-1">
                                <ShieldCheck size={14} className="text-primary" />
                                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Verificação de Publicações — {monthStr}</p>
                              </div>
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                <div className="bg-muted rounded-lg p-3 text-center">
                                  <p className="text-2xl font-bold text-[#0d4af5]">{verifiedCount}</p>
                                  <p className="text-[10px] text-muted-foreground">Verificados ✓</p>
                                </div>
                                <div className={`bg-muted rounded-lg p-3 text-center ${publishedWithoutVerify > 0 ? "border border-amber-500/30" : ""}`}>
                                  <p className={`text-2xl font-bold ${publishedWithoutVerify > 0 ? "text-amber-400" : "text-foreground"}`}>{publishedWithoutVerify}</p>
                                  <p className="text-[10px] text-muted-foreground">Sem verificação</p>
                                </div>
                                <div className={`bg-muted rounded-lg p-3 text-center ${unverifiedScheduled.length > 0 ? "border border-red-500/30" : ""}`}>
                                  <p className={`text-2xl font-bold ${unverifiedScheduled.length > 0 ? "text-red-400" : "text-foreground"}`}>{unverifiedScheduled.length}</p>
                                  <p className="text-[10px] text-muted-foreground">Agendados pendentes</p>
                                </div>
                                <div className="bg-muted rounded-lg p-3 text-center">
                                  <p className="text-2xl font-bold text-foreground">{publishedCards.length + scheduledCards.length}</p>
                                  <p className="text-[10px] text-muted-foreground">Total posts mês</p>
                                </div>
                              </div>

                              {/* Per-member verification */}
                              {(() => {
                                const members = [...new Set(contentCards.map((c) => c.socialMedia))];
                                return (
                                  <div className="space-y-1.5 mt-2">
                                    <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Por membro</p>
                                    {members.map((name) => {
                                      const cards = contentCards.filter((c) => c.socialMedia === name);
                                      const pub = cards.filter((c) => c.status === "published").length;
                                      const verified = cards.filter((c) => c.publishVerifiedAt).length;
                                      const sched = cards.filter((c) => c.status === "scheduled" && !c.publishVerifiedAt).length;
                                      const rate = pub > 0 ? Math.round((verified / pub) * 100) : 100;
                                      return (
                                        <div key={name} className="flex items-center gap-3 bg-muted/50 rounded-lg p-2.5">
                                          <span className="text-xs font-medium text-foreground w-32 shrink-0">{name}</span>
                                          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                                            <div className={`h-full rounded-full ${rate >= 80 ? "bg-[#0d4af5]" : rate >= 50 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${rate}%` }} />
                                          </div>
                                          <span className={`text-xs font-bold w-10 text-right ${rate >= 80 ? "text-[#0d4af5]" : rate >= 50 ? "text-amber-400" : "text-red-400"}`}>{rate}%</span>
                                          <span className="text-[10px] text-muted-foreground w-20 text-right">{pub} pub · {sched} pend</span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                );
                              })()}
                            </div>

                            {/* Post Calendar Grid — per client */}
                            <div className="card space-y-3 lg:col-span-2">
                              <div className="flex items-center gap-2 mb-1">
                                <CalendarIcon size={14} className="text-primary" />
                                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Calendário de Posts — {monthStr} {year}</p>
                              </div>
                              <div className="space-y-3">
                                {clients.filter((c) => c.status !== "onboarding").map((client) => {
                                  const days = clientPostDays.get(client.id) ?? new Set();
                                  const totalDays = Math.min(today, daysInMonth);
                                  const daysWithPost = [...days].filter((d) => d <= today).length;
                                  const daysWithout = totalDays - daysWithPost;
                                  return (
                                    <div key={client.id}>
                                      <div className="flex items-center justify-between mb-1.5">
                                        <span className="text-xs font-medium text-foreground">{client.name}</span>
                                        <div className="flex items-center gap-2">
                                          <span className="text-[10px] text-[#0d4af5] font-semibold">{daysWithPost}d com post</span>
                                          <span className="text-[10px] text-red-400 font-semibold">{daysWithout}d sem post</span>
                                        </div>
                                      </div>
                                      {/* Week header */}
                                      <div className="grid grid-cols-7 gap-0.5 mb-0.5">
                                        {weekDays.map((d, i) => (
                                          <div key={i} className="text-[8px] text-muted-foreground text-center font-medium">{d}</div>
                                        ))}
                                      </div>
                                      {/* Calendar grid */}
                                      <div className="grid grid-cols-7 gap-0.5">
                                        {/* Empty cells for offset */}
                                        {Array.from({ length: firstDayOfWeek }).map((_, i) => (
                                          <div key={`empty-${i}`} className="w-full aspect-square" />
                                        ))}
                                        {Array.from({ length: daysInMonth }).map((_, i) => {
                                          const day = i + 1;
                                          const hasPost = days.has(day);
                                          const isFuture = day > today;
                                          const isToday = day === today;
                                          return (
                                            <div
                                              key={day}
                                              title={`Dia ${day}: ${isFuture ? "futuro" : hasPost ? "com post" : "sem post"}`}
                                              className={`w-full aspect-square rounded-sm flex items-center justify-center text-[8px] font-bold transition-all ${
                                                isFuture
                                                  ? "bg-muted/30 text-muted-foreground/30"
                                                  : hasPost
                                                    ? "bg-[#0d4af5]/20 text-[#0d4af5] border border-[#0d4af5]/30"
                                                    : "bg-red-500/10 text-red-400 border border-red-500/20"
                                              } ${isToday ? "ring-1 ring-foreground/30" : ""}`}
                                            >
                                              {day}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                              {/* Legend */}
                              <div className="flex items-center gap-4 pt-2 border-t border-border">
                                <div className="flex items-center gap-1.5">
                                  <div className="w-3 h-3 rounded-sm bg-[#0d4af5]/20 border border-[#0d4af5]/30" />
                                  <span className="text-[10px] text-muted-foreground">Com post</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <div className="w-3 h-3 rounded-sm bg-red-500/10 border border-red-500/20" />
                                  <span className="text-[10px] text-muted-foreground">Sem post</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <div className="w-3 h-3 rounded-sm bg-muted/30" />
                                  <span className="text-[10px] text-muted-foreground">Futuro</span>
                                </div>
                              </div>
                            </div>
                          </>
                        );
                      })()}

                      {/* Stuck cards detail */}
                      {stuckCards.length > 0 && (
                        <div className="card space-y-3 lg:col-span-2">
                          <p className="text-xs text-red-400 font-medium uppercase tracking-wider">Cards Parados (+3 dias no mesmo status)</p>
                          <div className="space-y-2">
                            {stuckCards.slice(0, 8).map((card) => {
                              const enteredAt = card.columnEnteredAt?.[card.status] ?? card.statusChangedAt!;
                              const days = Math.round((Date.now() - new Date(enteredAt).getTime()) / 86400000);
                              return (
                                <div key={card.id} className="flex items-center gap-3 bg-muted rounded-lg p-2.5">
                                  <div className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-medium text-foreground truncate">{card.title}</p>
                                    <p className="text-[10px] text-muted-foreground">{card.clientName} · {card.socialMedia}</p>
                                  </div>
                                  <span className="text-xs text-red-400 font-medium shrink-0">{days}d em &ldquo;{card.status}&rdquo;</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {/* ── TEAM PERFORMANCE TAB ── */}
          {activeSection === "team" && (
            <div className="space-y-6 animate-fade-in">
              <p className="text-muted-foreground text-sm">
                Medidor de entregas e desempenho de cada colaborador, baseado em tarefas concluídas e entregas específicas do cargo.
              </p>

              {/* Team overview cards */}
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
                <div className="bg-card border border-border rounded-xl p-4 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Tarefas</p>
                  <p className="text-2xl font-bold text-foreground mt-1">{tasks.length}</p>
                  <p className="text-xs text-muted-foreground">{tasks.filter((t) => t.status === "done").length} concluídas</p>
                </div>
                <div className="bg-card border border-border rounded-xl p-4 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Taxa Geral</p>
                  <p className="text-2xl font-bold text-primary mt-1">
                    {tasks.length > 0 ? Math.round((tasks.filter((t) => t.status === "done").length / tasks.length) * 100) : 0}%
                  </p>
                  <p className="text-xs text-muted-foreground">de conclusão</p>
                </div>
                <div className="bg-card border border-border rounded-xl p-4 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Posts Publicados</p>
                  <p className="text-2xl font-bold text-primary mt-1">{contentCards.filter((c) => c.status === "published").length}</p>
                  <p className="text-xs text-muted-foreground">este mês</p>
                </div>
                <div className="bg-card border border-border rounded-xl p-4 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Colaboradores</p>
                  <p className="text-2xl font-bold text-foreground mt-1">{teamMetrics.length}</p>
                  <p className="text-xs text-muted-foreground">ativos</p>
                </div>
              </div>

              {/* Individual employee cards */}
              <div className="space-y-4">
                {teamMetrics.map((member) => {
                  const levelConfig = LEVEL_CONFIG[member.level];
                  const RoleIcon = ROLE_ICON[member.role] ?? Users;
                  const roleLabel = member.role === "manager" ? "Gerente" : member.role === "traffic" ? "Tráfego" : member.role === "social" ? "Social" : "Designer";

                  return (
                    <div key={member.id} className="card border border-border">
                      <div className="flex items-start gap-4">
                        {/* Avatar + score ring */}
                        <div className="relative shrink-0">
                          <div className="w-16 h-16 relative">
                            <svg className="w-16 h-16 -rotate-90" viewBox="0 0 100 100">
                              <circle cx="50" cy="50" r="42" fill="none" stroke="var(--muted)" strokeWidth="6" />
                              <circle
                                cx="50" cy="50" r="42" fill="none"
                                stroke={levelConfig.bg === "bg-[#0d4af5]" ? "#0d4af5" : levelConfig.bg === "bg-primary" ? "var(--primary)" : levelConfig.bg === "bg-[#3b6ff5]" ? "#3b6ff5" : "#ef4444"}
                                strokeWidth="6"
                                strokeLinecap="round"
                                strokeDasharray={`${member.overallScore * 2.64} 264`}
                              />
                            </svg>
                            <div className="absolute inset-0 flex items-center justify-center">
                              <span className={`text-lg font-black ${levelConfig.color}`}>{member.overallScore}</span>
                            </div>
                          </div>
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-2">
                            <h4 className="font-bold text-foreground">{member.name}</h4>
                            <div className="flex items-center gap-1.5">
                              <RoleIcon size={12} className="text-muted-foreground" />
                              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{roleLabel}</span>
                            </div>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${levelConfig.color} ${levelConfig.bg}/15 border border-current/20`}>
                              {levelConfig.label}
                            </span>
                          </div>

                          {/* Progress bars */}
                          <div className="space-y-2.5">
                            {/* Tasks */}
                            <div>
                              <div className="flex items-center justify-between text-xs mb-1">
                                <span className="text-muted-foreground flex items-center gap-1.5">
                                  <CheckCircle size={11} />
                                  Tarefas
                                </span>
                                <span className="text-foreground font-medium">
                                  {member.doneTasks}/{member.totalTasks} concluídas ({member.taskRate}%)
                                </span>
                              </div>
                              <div className="h-2 bg-muted rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${
                                    member.taskRate >= 80 ? "bg-[#0d4af5]" : member.taskRate >= 50 ? "bg-[#3b6ff5]" : "bg-red-500"
                                  }`}
                                  style={{ width: `${member.taskRate}%` }}
                                />
                              </div>
                              <div className="flex gap-3 mt-1">
                                <span className="text-[10px] text-muted-foreground">{member.pendingTasks} pendentes</span>
                                <span className="text-[10px] text-primary">{member.inProgressTasks} em progresso</span>
                              </div>
                            </div>

                            {/* Role-specific metrics */}
                            {member.role === "social" && (
                              <div>
                                <div className="flex items-center justify-between text-xs mb-1">
                                  <span className="text-muted-foreground flex items-center gap-1.5">
                                    <Instagram size={11} />
                                    Conteúdo Publicado
                                  </span>
                                  <span className="text-foreground font-medium">
                                    {member.published}/{member.totalCards} ({member.totalCards > 0 ? Math.round((member.published / member.totalCards) * 100) : 0}%)
                                  </span>
                                </div>
                                <div className="h-2 bg-muted rounded-full overflow-hidden">
                                  <div
                                    className="h-full rounded-full bg-[#0d4af5] transition-all"
                                    style={{ width: `${member.totalCards > 0 ? Math.round((member.published / member.totalCards) * 100) : 0}%` }}
                                  />
                                </div>
                              </div>
                            )}

                            {member.role === "traffic" && (
                              <div>
                                <div className="flex items-center justify-between text-xs mb-1">
                                  <span className="text-muted-foreground flex items-center gap-1.5">
                                    <Zap size={11} />
                                    Suporte Diário
                                  </span>
                                  <span className="text-foreground font-medium">
                                    {member.supportDone}/{member.supportTotal} clientes atendidos
                                  </span>
                                </div>
                                <div className="h-2 bg-muted rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all ${
                                      member.supportDone >= member.supportTotal ? "bg-[#0d4af5]" : "bg-[#3b6ff5]"
                                    }`}
                                    style={{ width: `${member.supportTotal > 0 ? Math.round((member.supportDone / member.supportTotal) * 100) : 0}%` }}
                                  />
                                </div>
                              </div>
                            )}

                            {member.role === "designer" && (
                              <div>
                                <div className="flex items-center justify-between text-xs mb-1">
                                  <span className="text-muted-foreground flex items-center gap-1.5">
                                    <Palette size={11} />
                                    Design Entregues
                                  </span>
                                  <span className="text-foreground font-medium">
                                    {member.designDone}/{member.designTotal} pedidos
                                  </span>
                                </div>
                                <div className="h-2 bg-muted rounded-full overflow-hidden">
                                  <div
                                    className="h-full rounded-full bg-[#3b6ff5] transition-all"
                                    style={{ width: `${member.designTotal > 0 ? Math.round((member.designDone / member.designTotal) * 100) : 0}%` }}
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── TEAM MANAGEMENT TAB ── */}
          {activeSection === "manage" && (
            <div className="space-y-6 animate-fade-in">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-foreground">Gestão de Funcionários</h3>
                  <p className="text-muted-foreground text-sm mt-0.5">Cadastre, edite ou remova membros da equipe. Gerencie acessos e funções.</p>
                </div>
                <button
                  onClick={() => { setShowAddForm(true); setEditingId(null); }}
                  className="btn-primary flex items-center gap-2 text-sm"
                >
                  <UserPlus size={15} />
                  Novo Funcionário
                </button>
              </div>

              {/* Summary cards */}
              <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
                {ROLE_OPTIONS.map((r) => {
                  const count = teamMembers.filter((m) => m.role === r.value && m.active).length;
                  return (
                    <div key={r.value} className="bg-card border border-border rounded-xl p-3 text-center">
                      <p className="text-2xl font-bold text-foreground">{count}</p>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{r.label}</p>
                    </div>
                  );
                })}
              </div>

              {/* Add new member form */}
              {showAddForm && (
                <div className="card border-primary/30 space-y-4 animate-fade-in">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-foreground flex items-center gap-2">
                      <UserPlus size={16} className="text-primary" />
                      Cadastrar Novo Funcionário
                    </h4>
                    <button onClick={() => setShowAddForm(false)} className="text-muted-foreground hover:text-foreground">
                      <X size={16} />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-muted-foreground font-medium block mb-1.5">Nome completo *</label>
                      <input
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder="Ex: João Silva"
                        className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground font-medium block mb-1.5">E-mail *</label>
                      <input
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        placeholder="joao@loneos.com"
                        type="email"
                        className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground font-medium block mb-1.5">Função *</label>
                      <select
                        value={newRole}
                        onChange={(e) => setNewRole(e.target.value as Role)}
                        className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary"
                      >
                        {ROLE_OPTIONS.map((r) => (
                          <option key={r.value} value={r.value}>{r.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground font-medium block mb-1.5">Senha inicial</label>
                      <input
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Senha padrão: 1234"
                        className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setShowAddForm(false)} className="btn-ghost text-sm px-4 py-2">
                      Cancelar
                    </button>
                    <button
                      onClick={handleAddMember}
                      disabled={!newName.trim() || !newEmail.trim()}
                      className="btn-primary text-sm px-4 py-2 flex items-center gap-2 disabled:opacity-30"
                    >
                      <Save size={14} />
                      Cadastrar
                    </button>
                  </div>
                </div>
              )}

              {/* Members list */}
              <div className="space-y-2">
                {teamMembers.map((member) => {
                  const isEditing = editingId === member.id;
                  const isConfirmingDelete = confirmDeleteId === member.id;
                  const roleLabel = ROLE_OPTIONS.find((r) => r.value === member.role)?.label ?? member.role;
                  const RoleIcon = ROLE_ICON[member.role] ?? Users;

                  if (isEditing) {
                    return (
                      <div key={member.id} className="card border-primary/30 space-y-4 animate-fade-in">
                        <div className="flex items-center justify-between">
                          <h4 className="font-semibold text-foreground flex items-center gap-2">
                            <Edit3 size={14} className="text-primary" />
                            Editando: {member.name}
                          </h4>
                          <button onClick={() => setEditingId(null)} className="text-muted-foreground hover:text-foreground">
                            <X size={16} />
                          </button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="text-xs text-muted-foreground font-medium block mb-1.5">Nome</label>
                            <input
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-muted-foreground font-medium block mb-1.5">E-mail</label>
                            <input
                              value={editEmail}
                              onChange={(e) => setEditEmail(e.target.value)}
                              type="email"
                              className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary"
                            />
                          </div>
                          <div className="md:col-span-2">
                            <label className="text-xs text-muted-foreground font-medium block mb-2">Avatar Medieval</label>
                            <div className="flex items-center gap-3 flex-wrap">
                              {AVATAR_OPTIONS.map((opt) => (
                                <button
                                  key={opt.type}
                                  onClick={() => setEditAvatar(opt.type)}
                                  className={`flex flex-col items-center gap-1 p-2 rounded-xl border transition-all ${
                                    editAvatar === opt.type
                                      ? "border-[#0d4af5]/50 bg-[#0d4af5]/[0.06]"
                                      : "border-transparent hover:bg-white/[0.03]"
                                  }`}
                                >
                                  <MedievalAvatar type={opt.type} size={36} />
                                  <span className="text-[9px] text-zinc-500">{opt.label}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                          <div>
                            <label className="text-xs text-muted-foreground font-medium block mb-1.5">Função</label>
                            <select
                              value={editRole}
                              onChange={(e) => setEditRole(e.target.value as Role)}
                              className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary"
                            >
                              {ROLE_OPTIONS.map((r) => (
                                <option key={r.value} value={r.value}>{r.label}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="text-xs text-muted-foreground font-medium block mb-1.5">Nova senha (deixe vazio para manter)</label>
                            <input
                              value={editPassword}
                              onChange={(e) => setEditPassword(e.target.value)}
                              placeholder="••••"
                              className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary"
                            />
                          </div>
                        </div>
                        <div className="flex justify-end gap-2">
                          <button onClick={() => setEditingId(null)} className="btn-ghost text-sm px-4 py-2">Cancelar</button>
                          <button
                            onClick={handleSaveEdit}
                            disabled={!editName.trim() || !editEmail.trim()}
                            className="btn-primary text-sm px-4 py-2 flex items-center gap-2 disabled:opacity-30"
                          >
                            <Save size={14} />
                            Salvar Alterações
                          </button>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={member.id}
                      className={`card flex items-center gap-4 transition-opacity ${!member.active ? "opacity-50" : ""}`}
                    >
                      {/* Avatar */}
                      <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                        member.active ? "bg-primary/15 border border-primary/20" : "bg-muted border border-border"
                      }`}>
                        <span className={`text-sm font-bold ${member.active ? "text-primary" : "text-muted-foreground"}`}>
                          {member.initials}
                        </span>
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-foreground text-sm">{member.name}</p>
                          {!member.active && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20 font-bold uppercase">Desativado</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                          <span className="flex items-center gap-1"><Mail size={10} /> {member.email}</span>
                          <span className="flex items-center gap-1"><RoleIcon size={10} /> {roleLabel}</span>
                          <span className="flex items-center gap-1"><KeyRound size={10} /> ••••</span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => handleStartEdit(member)}
                          className="p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                          title="Editar"
                        >
                          <Edit3 size={14} />
                        </button>
                        <button
                          onClick={() => handleToggleActive(member.id)}
                          className={`p-2 rounded-lg transition-colors ${
                            member.active
                              ? "text-muted-foreground hover:text-[#3b6ff5] hover:bg-[#0d4af5]/10"
                              : "text-primary hover:bg-primary/10"
                          }`}
                          title={member.active ? "Desativar acesso" : "Reativar acesso"}
                        >
                          {member.active ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>

                        {isConfirmingDelete ? (
                          <div className="flex items-center gap-1 animate-fade-in">
                            <span className="text-xs text-red-400 mr-1">Confirmar?</span>
                            <button
                              onClick={() => handleDeleteMember(member.id)}
                              className="p-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors text-xs font-medium"
                            >
                              Sim
                            </button>
                            <button
                              onClick={() => setConfirmDeleteId(null)}
                              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground transition-colors text-xs"
                            >
                              Não
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmDeleteId(member.id)}
                            className="p-2 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
                            title="Remover"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Info note */}
              <div className="flex items-start gap-3 bg-[#0d4af5]/5 border border-[#0d4af5]/15 rounded-xl px-4 py-3">
                <Shield size={16} className="text-primary mt-0.5 shrink-0" />
                <div className="text-xs text-muted-foreground space-y-1">
                  <p><strong className="text-foreground">Nota sobre persistência:</strong> Alterações feitas aqui são salvas na sessão atual. Com Supabase ativo, os dados persistem no banco de dados.</p>
                  <p>Para alterar a senha de um funcionário no Supabase, use a aba de edição acima ou acesse o painel do Supabase diretamente.</p>
                </div>
              </div>
            </div>
          )}

          {activeSection === "reports" && (
            <div className="space-y-4 animate-fade-in">
              <p className="text-muted-foreground text-sm">Relatórios quinzenais preenchidos pela equipe. Visão exclusiva da diretoria.</p>
              {quinzReports.map((report) => {
                const isGood = report.communicationHealth >= 4;
                const isBad = report.communicationHealth <= 2;
                return (
                  <div key={report.id} className={`card border ${isBad ? "border-red-500/20" : isGood ? "border-primary/20" : "border-border"}`}>
                    <div className="flex items-start justify-between gap-4 mb-4">
                      <div>
                        <h4 className="font-semibold text-foreground">{report.clientName}</h4>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Período: {report.period} · por {report.createdBy}
                        </p>
                      </div>
                      <div className="flex items-start gap-4 text-center">
                        <button
                          onClick={() => exportReportAsPdf({
                            title: "Relatório Quinzenal",
                            subtitle: report.period,
                            clientName: report.clientName,
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
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                          title="Exportar PDF"
                        >
                          <Download size={14} />
                        </button>
                        <div>
                          <div className="flex gap-1 justify-center">
                            {[1,2,3,4,5].map((s) => (
                              <span key={s} className={`w-4 h-4 rounded-sm ${s <= report.communicationHealth ? (isBad ? "bg-red-500" : isGood ? "bg-primary" : "bg-zinc-500") : "bg-muted"}`} />
                            ))}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">Saúde da Comunicação</p>
                        </div>
                        <div>
                          <div className="flex gap-1 justify-center">
                            {[1,2,3,4,5].map((s) => (
                              <span key={s} className={`w-4 h-4 rounded-sm ${s <= report.clientEngagement ? "bg-primary" : "bg-muted"}`} />
                            ))}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">Engajamento do Cliente</p>
                        </div>
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
            </div>
          )}

          {activeSection === "workload" && (
            <div className="space-y-6 animate-fade-in">
              <p className="text-muted-foreground text-sm">Visão de capacidade e carga de trabalho por colaborador.</p>

              {(() => {
                const CAPACITY_PER_WEEK = 8; // max cards/tasks per week
                const members = [...new Set([
                  ...clients.map((c) => c.assignedSocial),
                  ...clients.map((c) => c.assignedTraffic),
                  ...clients.map((c) => c.assignedDesigner),
                ])].sort();

                return (
                  <div className="space-y-4">
                    {members.map((name) => {
                      const memberTasks = tasks.filter((t) => t.assignedTo === name && t.status !== "done");
                      const memberCards = contentCards.filter((c) => c.socialMedia === name && c.status !== "published");
                      const memberDesign = designRequests.filter((r) => clients.some((c) => c.assignedDesigner === name && c.id === r.clientId) && r.status !== "done");
                      const totalActive = memberTasks.length + memberCards.length + memberDesign.length;
                      const utilPct = Math.round((totalActive / CAPACITY_PER_WEEK) * 100);
                      const isOverloaded = utilPct > 120;
                      const isHigh = utilPct > 80;

                      const memberClients = [...new Set([
                        ...clients.filter((c) => c.assignedSocial === name || c.assignedTraffic === name || c.assignedDesigner === name).map((c) => c.name)
                      ])];

                      return (
                        <div key={name} className={`card border ${isOverloaded ? "border-red-500/30" : isHigh ? "border-amber-500/20" : "border-border"}`}>
                          <div className="flex items-center gap-4 mb-3">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold ${
                              isOverloaded ? "bg-red-500/15 text-red-400" : isHigh ? "bg-amber-500/15 text-amber-400" : "bg-[#0d4af5]/15 text-[#0d4af5]"
                            }`}>
                              {name.split(" ").map((w) => w[0]).join("").slice(0, 2)}
                            </div>
                            <div className="flex-1">
                              <p className="font-semibold text-foreground text-sm">{name}</p>
                              <p className="text-[10px] text-muted-foreground">{memberClients.slice(0, 3).join(", ")}{memberClients.length > 3 ? ` +${memberClients.length - 3}` : ""}</p>
                            </div>
                            <div className="text-right">
                              <p className={`text-lg font-bold ${isOverloaded ? "text-red-400" : isHigh ? "text-amber-400" : "text-foreground"}`}>
                                {utilPct}%
                              </p>
                              <p className="text-[10px] text-muted-foreground">{totalActive}/{CAPACITY_PER_WEEK} itens</p>
                            </div>
                          </div>

                          {/* Capacity bar */}
                          <div className="h-2.5 bg-muted rounded-full overflow-hidden mb-3">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${
                                isOverloaded ? "bg-red-500" : isHigh ? "bg-amber-500" : "bg-[#0d4af5]"
                              }`}
                              style={{ width: `${Math.min(utilPct, 100)}%` }}
                            />
                          </div>

                          {/* Breakdown */}
                          <div className="grid grid-cols-3 gap-2">
                            <div className="text-center p-2 rounded-lg bg-muted/30">
                              <p className="text-xs font-bold text-foreground">{memberTasks.length}</p>
                              <p className="text-[9px] text-muted-foreground">Tarefas</p>
                            </div>
                            <div className="text-center p-2 rounded-lg bg-muted/30">
                              <p className="text-xs font-bold text-foreground">{memberCards.length}</p>
                              <p className="text-[9px] text-muted-foreground">Cards</p>
                            </div>
                            <div className="text-center p-2 rounded-lg bg-muted/30">
                              <p className="text-xs font-bold text-foreground">{memberDesign.length}</p>
                              <p className="text-[9px] text-muted-foreground">Design</p>
                            </div>
                          </div>

                          {isOverloaded && (
                            <div className="flex items-center gap-2 mt-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20">
                              <AlertTriangle size={12} className="text-red-400 shrink-0" />
                              <span className="text-[10px] text-red-400 font-medium">Sobrecarregado — considere redistribuir tarefas</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          )}

          {activeSection === "churn" && (
            <div className="space-y-4 animate-fade-in">
              <p className="text-muted-foreground text-sm">Análise preditiva de risco de cancelamento baseada em atividade, comunicação e satisfação.</p>
              <div className="space-y-3">
                {clients.filter((c) => c.status !== "onboarding").map((client) => {
                  // Churn score: 0-100 (higher = more risk)
                  let score = 0;
                  // Status
                  if (client.status === "at_risk") score += 35;
                  else if (client.status === "average") score += 15;
                  // Kanban inactivity
                  const kanbanHoursAgo = client.lastKanbanActivity ? (Date.now() - new Date(client.lastKanbanActivity).getTime()) / 3600000 : 999;
                  if (kanbanHoursAgo > 168) score += 25; // 7 days
                  else if (kanbanHoursAgo > 72) score += 10; // 3 days
                  // Posts this month
                  const postRatio = client.postsGoal ? (client.postsThisMonth ?? 0) / client.postsGoal : 0.5;
                  if (postRatio < 0.3) score += 20;
                  else if (postRatio < 0.6) score += 8;
                  // No recent post
                  if (!client.lastPostDate) score += 10;
                  else {
                    const daysSincePost = (Date.now() - new Date(client.lastPostDate).getTime()) / 86400000;
                    if (daysSincePost > 14) score += 15;
                    else if (daysSincePost > 7) score += 5;
                  }
                  score = Math.min(100, score);

                  const riskLevel = score >= 60 ? "critical" : score >= 35 ? "warning" : "safe";
                  const riskConfig = {
                    critical: { label: "Alto Risco", color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/30", bar: "bg-red-500" },
                    warning: { label: "Atenção", color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20", bar: "bg-amber-500" },
                    safe: { label: "Estável", color: "text-[#0d4af5]", bg: "bg-[#0d4af5]/10", border: "border-[#0d4af5]/20", bar: "bg-[#0d4af5]" },
                  }[riskLevel];

                  const signals: string[] = [];
                  if (client.status === "at_risk") signals.push("Status em risco");
                  if (kanbanHoursAgo > 168) signals.push(`${Math.floor(kanbanHoursAgo / 24)}d sem atividade no board`);
                  if (postRatio < 0.3 && client.postsGoal) signals.push(`Apenas ${Math.round(postRatio * 100)}% da meta de posts`);
                  if (!client.lastPostDate) signals.push("Nenhum post registrado");

                  return (
                    <div key={client.id} className={`card border ${riskConfig.border}`}>
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold ${riskConfig.bg} ${riskConfig.color}`}>
                          {client.name[0]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-foreground text-sm">{client.name}</p>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${riskConfig.bg} ${riskConfig.color} border ${riskConfig.border}`}>
                              {riskConfig.label}
                            </span>
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-0.5">{client.industry} · R$ {client.monthlyBudget.toLocaleString("pt-BR")}/mês</p>
                        </div>
                        <div className="text-right">
                          <p className={`text-xl font-bold ${riskConfig.color}`}>{score}%</p>
                          <p className="text-[10px] text-muted-foreground">risco</p>
                        </div>
                      </div>
                      {/* Risk bar */}
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden mt-3 mb-2">
                        <div className={`h-full rounded-full transition-all ${riskConfig.bar}`} style={{ width: `${score}%` }} />
                      </div>
                      {/* Signals */}
                      {signals.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {signals.map((s, i) => (
                            <span key={i} className={`text-[9px] px-2 py-0.5 rounded-full ${riskConfig.bg} ${riskConfig.color} border ${riskConfig.border}`}>
                              {s}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                }).sort((a, b) => {
                  // This sort won't work on JSX directly, so we'll sort the data before mapping
                  return 0;
                })}
              </div>
            </div>
          )}

          {activeSection === "timesheet" && (
            <TimesheetTab clients={clients} contentCards={contentCards} tasks={tasks} />
          )}

          {activeSection === "ltv" && (
            <div className="space-y-4 animate-fade-in">
              <p className="text-muted-foreground text-sm">Tempo de retenção e saúde por cliente.</p>
              <div className="space-y-3">
                {clients
                  .sort((a, b) => new Date(a.joinDate).getTime() - new Date(b.joinDate).getTime())
                  .map((client) => {
                    const monthsActive = Math.max(1, Math.floor(
                      (new Date().getTime() - new Date(client.joinDate).getTime()) / (1000 * 60 * 60 * 24 * 30)
                    ));
                    const maxMonths = Math.max(...clients.map((c) => Math.floor((new Date().getTime() - new Date(c.joinDate).getTime()) / (1000 * 60 * 60 * 24 * 30))));
                    const barPct = Math.min(100, (monthsActive / maxMonths) * 100);

                    return (
                      <div key={client.id} className="card">
                        <div className="flex items-center gap-4 mb-3">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold ${
                            client.status === "at_risk" ? "bg-red-500/20 text-red-500" : "bg-primary/20 text-primary"
                          }`}>
                            {client.name[0]}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <span className="font-medium text-foreground">{client.name}</span>
                              <span className={`text-xs font-medium ${client.status === "at_risk" ? "text-red-500" : "text-primary"}`}>
                                {getStatusLabel(client.status)}
                              </span>
                            </div>
                            <div className="flex items-center gap-4 text-xs text-muted-foreground mt-0.5">
                              <span>{monthsActive} meses ativo</span>
                              <span>Desde {client.joinDate}</span>
                              <span>{client.industry}</span>
                            </div>
                          </div>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              client.status === "at_risk" ? "bg-red-500" : "bg-primary"
                            }`}
                            style={{ width: `${barPct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Timesheet / Performance Operacional ───────────────────────
function TimesheetTab({
  clients,
  contentCards,
  tasks,
}: {
  clients: import("@/lib/types").Client[];
  contentCards: import("@/lib/types").ContentCard[];
  tasks: import("@/lib/types").Task[];
}) {
  // Aggregate hours by client
  const hoursByClient = useMemo(() => {
    const map: Record<string, { name: string; ms: number }> = {};
    contentCards.forEach((c) => {
      const ms = getLiveTimeSpentMs(c.workStartedAt, c.totalTimeSpentMs);
      if (ms > 0) {
        if (!map[c.clientId]) map[c.clientId] = { name: c.clientName, ms: 0 };
        map[c.clientId].ms += ms;
      }
    });
    tasks.forEach((t) => {
      const ms = getLiveTimeSpentMs(t.workStartedAt, t.totalTimeSpentMs);
      if (ms > 0) {
        if (!map[t.clientId]) map[t.clientId] = { name: t.clientName, ms: 0 };
        map[t.clientId].ms += ms;
      }
    });
    return Object.values(map).sort((a, b) => b.ms - a.ms);
  }, [contentCards, tasks]);

  const maxClientMs = hoursByClient.length > 0 ? hoursByClient[0].ms : 1;

  // Average time by content format
  const avgByFormat = useMemo(() => {
    const map: Record<string, { total: number; count: number }> = {};
    contentCards.forEach((c) => {
      const ms = (c.totalTimeSpentMs ?? 0);
      if (ms > 0 && c.format) {
        if (!map[c.format]) map[c.format] = { total: 0, count: 0 };
        map[c.format].total += ms;
        map[c.format].count += 1;
      }
    });
    return Object.entries(map)
      .map(([format, { total, count }]) => ({ format, avgMs: Math.round(total / count), count }))
      .sort((a, b) => b.avgMs - a.avgMs);
  }, [contentCards]);

  // Ranking by team member (high priority hours)
  const teamRanking = useMemo(() => {
    const map: Record<string, { name: string; totalMs: number; highPriorityMs: number; taskCount: number }> = {};
    const addEntry = (assignedTo: string, ms: number, isHighPriority: boolean) => {
      if (ms <= 0) return;
      if (!map[assignedTo]) map[assignedTo] = { name: assignedTo, totalMs: 0, highPriorityMs: 0, taskCount: 0 };
      map[assignedTo].totalMs += ms;
      map[assignedTo].taskCount += 1;
      if (isHighPriority) map[assignedTo].highPriorityMs += ms;
    };
    contentCards.forEach((c) => {
      const ms = getLiveTimeSpentMs(c.workStartedAt, c.totalTimeSpentMs);
      addEntry(c.socialMedia, ms, c.priority === "high" || c.priority === "critical");
    });
    tasks.forEach((t) => {
      const ms = getLiveTimeSpentMs(t.workStartedAt, t.totalTimeSpentMs);
      addEntry(t.assignedTo, ms, t.priority === "high" || t.priority === "critical");
    });
    return Object.values(map).sort((a, b) => b.totalMs - a.totalMs);
  }, [contentCards, tasks]);

  // Over-time items
  const overtimeItems = useMemo(() => {
    const items: { title: string; clientName: string; assignedTo: string; ms: number; type: "card" | "task" }[] = [];
    contentCards.forEach((c) => {
      const ms = getLiveTimeSpentMs(c.workStartedAt, c.totalTimeSpentMs);
      if (ms >= OVERTIME_THRESHOLD_MS) items.push({ title: c.title, clientName: c.clientName, assignedTo: c.socialMedia, ms, type: "card" });
    });
    tasks.forEach((t) => {
      const ms = getLiveTimeSpentMs(t.workStartedAt, t.totalTimeSpentMs);
      if (ms >= OVERTIME_THRESHOLD_MS) items.push({ title: t.title, clientName: t.clientName, assignedTo: t.assignedTo, ms, type: "task" });
    });
    return items.sort((a, b) => b.ms - a.ms);
  }, [contentCards, tasks]);

  return (
    <div className="space-y-6 animate-fade-in">
      <p className="text-muted-foreground text-sm">Timesheet invisível — tempo de dedicação por cliente, formato e colaborador.</p>

      {/* Over-time alerts */}
      {overtimeItems.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-amber-400">⚠️</span>
            <h3 className="text-sm font-bold text-foreground">Alertas de Over-Time ({overtimeItems.length})</h3>
          </div>
          <div className="space-y-2">
            {overtimeItems.map((item, i) => (
              <div key={i} className="flex items-center gap-3 text-xs">
                <span className="text-amber-400 font-bold w-16 text-right">{formatTimeSpent(item.ms)}</span>
                <span className="text-foreground font-medium flex-1 truncate">{item.title}</span>
                <span className="text-muted-foreground">{item.clientName}</span>
                <span className="text-muted-foreground">· {item.assignedTo}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Hours by client */}
      <div className="card">
        <h3 className="font-semibold text-foreground text-sm mb-4 flex items-center gap-2">
          <BarChart2 size={14} className="text-[#0d4af5]" />
          Alocação por Cliente (horas)
        </h3>
        {hoursByClient.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhum tempo registrado ainda. O timesheet começa a contar quando cards entram em produção.</p>
        ) : (
          <div className="space-y-3">
            {hoursByClient.map((entry) => {
              const pct = Math.round((entry.ms / maxClientMs) * 100);
              return (
                <div key={entry.name}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-foreground font-medium">{entry.name}</span>
                    <span className="text-xs text-[#0d4af5] font-bold">{formatTimeSpent(entry.ms)}</span>
                  </div>
                  <div className="h-3 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#0d4af5] rounded-full transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Average by format */}
      <div className="card">
        <h3 className="font-semibold text-foreground text-sm mb-4 flex items-center gap-2">
          <Clock size={14} className="text-[#0d4af5]" />
          Tempo Médio por Formato de Conteúdo
        </h3>
        {avgByFormat.length === 0 ? (
          <p className="text-xs text-muted-foreground">Dados insuficientes. O sistema precisa de cards concluídos para calcular médias.</p>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            {avgByFormat.map(({ format, avgMs, count }) => (
              <div key={format} className="p-3 rounded-xl border border-border bg-muted/30">
                <p className="text-xs text-muted-foreground">{format}</p>
                <p className="text-lg font-bold text-foreground mt-1">{formatTimeSpent(avgMs)}</p>
                <p className="text-[10px] text-zinc-600">média · {count} {count === 1 ? "card" : "cards"}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Team ranking */}
      <div className="card">
        <h3 className="font-semibold text-foreground text-sm mb-4 flex items-center gap-2">
          <Users size={14} className="text-[#0d4af5]" />
          Ranking de Dedicação
        </h3>
        {teamRanking.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhum dado disponível.</p>
        ) : (
          <div className="space-y-2">
            {teamRanking.map((member, i) => (
              <div key={member.name} className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border/50">
                <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                  i === 0 ? "bg-[#0d4af5]/20 text-[#0d4af5]" : "bg-muted text-muted-foreground"
                }`}>
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground">{member.name}</p>
                  <p className="text-[10px] text-muted-foreground">{member.taskCount} tarefas/cards</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-foreground">{formatTimeSpent(member.totalMs)}</p>
                  {member.highPriorityMs > 0 && (
                    <p className="text-[10px] text-amber-400">{formatTimeSpent(member.highPriorityMs)} em alta prioridade</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
