"use client";

import Header from "@/components/Header";
import { ETAPAS, ETAPAS_COMPROMETIDAS, ETAPAS_FINAIS, statusNaEtapa } from "@/lib/conteudo/etapas";
import { useClientsStore } from "@/stores/useClientsStore";
import { useContentStore } from "@/stores/useContentStore";
import { OperationalKpisPanel } from "@/components/ceo/OperationalKpisPanel";
import CoberturaReunioes from "@/components/CoberturaReunioes";
import { useOperationalStore } from "@/stores/useOperationalStore";
import { useTrafficStore } from "@/stores/useTrafficStore";
import { getAttentionColor, getAttentionLabel, getStatusColor, getStatusLabel, todaySP, spDateStr } from "@/lib/utils";
import {
  Lock, BarChart2, TrendingUp, AlertTriangle,
  Eye, EyeOff, Users, CheckCircle, Target,
  Instagram, Palette, Zap, UserPlus, Trash2, Edit3, Save, X,
  KeyRound, Mail, UserCog, ShieldCheck, Smartphone,
} from "lucide-react";
import { useState, useMemo, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useRole } from "@/lib/context/RoleContext";

import { authedFetch } from "@/lib/supabase/authed-fetch";
import MedievalAvatar, { AVATAR_OPTIONS, getUserAvatar, setUserAvatar, type AvatarType } from "@/components/MedievalAvatars";
import type { Role, Client } from "@/lib/types";
import { emRisco, scoreDoCliente } from "@/lib/saude/carteira";

// Mês corrente em SP ("YYYY-MM") — "este mês" é o mês de verdade, não o acumulado.
const mesSP = () => todaySP().slice(0, 7);
const noMesSP = (iso?: string | null) => !!iso && spDateStr(iso).slice(0, 7) === mesSP();

// Risco de churn = saúde em risco (lib/saude/carteira.ts). A pontuação local que morava aqui (status do
// anúncio + kanban + posts) era a 9ª resposta diferente para "este cliente está em risco?".

export default function CEOPage() {
  const { profiles, role, hydrated } = useRole();   // equipe do banco, não lista em arquivo
  const router = useRouter();
  const clients = useClientsStore((s) => s.clients);
  const contentCards = useContentStore((s) => s.contentCards);
  const designRequests = useContentStore((s) => s.designRequests);
  const tasks = useOperationalStore((s) => s.tasks);
  const trafficRoutineChecks = useTrafficStore((s) => s.trafficRoutineChecks);


  // O acesso vem do papel da sessão (o PIN antigo estava escrito no bundle e não protegia nada).
  const permitido = hydrated && (role === "admin" || role === "manager");
  const [activeSection, setActiveSection] = useState<"overview" | "operacao" | "team" | "manage" | "workload">("overview");

  // Cockpit: anomalias de Meta abertas. (Sem financeiro da agência — regra da casa.)
  const [openAnomalies, setOpenAnomalies] = useState<number | null>(null);
  useEffect(() => {
    if (!permitido) return;
    authedFetch("/api/defense/alerts").then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (d?.summary) setOpenAnomalies(d.summary.open ?? d.summary.total ?? (Array.isArray(d.alerts) ? d.alerts.length : 0));
      else if (Array.isArray(d?.alerts)) setOpenAnomalies(d.alerts.length);
    }).catch(() => {});
  }, [permitido]);

  const novosNoMes = useMemo(() => clients.filter((c) => noMesSP(c.createdAt)).length, [clients]);

  // Employee delivery metrics
  const teamMetrics = useMemo(() => {
    const employees = profiles.filter((p) => p.role !== "admin");

    return employees.map((profile) => {
      const memberTasks = tasks.filter((t) => t.assignedTo === profile.name);
      const totalTasks = memberTasks.length;
      const doneTasks = memberTasks.filter((t) => t.status === "done").length;
      const pendingTasks = memberTasks.filter((t) => t.status === "pending").length;
      const inProgressTasks = memberTasks.filter((t) => t.status === "in_progress").length;
      // Sem tarefa atribuída não é 0%: é "sem dado" — ninguém fica vermelho por lacuna do sistema.
      const taskRate: number | null = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : null;

      let published = 0;
      let totalCards = 0;
      let designDone = 0;
      let designTotal = 0;
      let supportDone = 0;
      let supportTotal = 0;

      if (profile.role === "social") {
        const memberCards = contentCards.filter((c) => c.socialMedia === profile.name);
        totalCards = memberCards.length;
        published = memberCards.filter((c) => statusNaEtapa(c.status, "no_ar")).length;
      }

      if (profile.role === "designer") {
        const myClientIds = new Set(clients.filter((c) => c.assignedDesigner === profile.name).map((c) => c.id));
        const myReqs = designRequests.filter((r) => myClientIds.has(r.clientId));
        designTotal = myReqs.length;
        designDone = myReqs.filter((r) => r.status === "done").length;
      }

      if (profile.role === "traffic") {
        const today = todaySP();
        const memberClients = clients.filter((c) => c.assignedTraffic === profile.name && c.status !== "onboarding");
        supportTotal = memberClients.length;
        supportDone = trafficRoutineChecks.filter((c) => c.date === today && c.completedBy === profile.name && c.type === "support").length;
      }

      // Nota = média só do que existe. "Publicado" no board não entra: o board não registra a
      // maioria dos posts reais, então puniria quem postou sem arrastar o card.
      const partes: number[] = [];
      if (taskRate !== null) partes.push(taskRate);
      if (profile.role === "traffic" && supportTotal > 0) partes.push(Math.round((supportDone / supportTotal) * 100));
      const overallScore: number | null = partes.length ? Math.round(partes.reduce((a, b) => a + b, 0) / partes.length) : null;

      const level = overallScore === null ? "none" : overallScore >= 80 ? "excellent" : overallScore >= 60 ? "good" : overallScore >= 40 ? "warning" : "critical";

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
    { value: "comercial", label: "Comercial (SDR)" },
  ];

  interface TeamMember {
    /** UUID de team_members — é o que /api/team (PATCH) espera. */
    id: string;
    /** id legível derivado do e-mail ("julio"): chave do avatar e do perfil de login. */
    slug: string;
    name: string;
    email: string;
    role: Role;
    initials: string;
    password: string;
    active: boolean;
    createdAt: string;
    /** Últimos 4 do WhatsApp cadastrado; null = mudo para o agente (nenhum comando dele executa). */
    whatsappFinal?: string | null;
  }

  // ID CERTO PARA O SERVIDOR. A lista usava p.id (o slug do e-mail, "julio") e mandava isso ao
  // PATCH /api/team, que filtra por UUID — editar nome/função ou desativar alguém carregado do
  // banco dava "invalid input syntax for type uuid" e "NÃO salvos". Só membro recém-criado na
  // mesma sessão (que vinha com UUID) salvava.
  const perfilParaMembro = useCallback((p: (typeof profiles)[number]): TeamMember => ({
    id: p.teamMemberId ?? p.id,
    slug: p.id,
    name: p.name,
    email: p.email,
    role: p.role,
    initials: p.initials,
    password: "1234",
    active: true,
    createdAt: "2026-01-01",
    whatsappFinal: p.whatsappFinal ?? null,
  }), []);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>(() => profiles.map(perfilParaMembro));
  // A equipe de verdade chega depois do primeiro render (roster). Quando chega, substitui a lista
  // de reserva — mantendo quem foi adicionado/desativado nesta sessão e não está no roster.
  useEffect(() => {
    if (!profiles.some((p) => p.teamMemberId)) return;
    setTeamMembers((prev) => {
      const doRoster = profiles.map(perfilParaMembro);
      const emails = new Set(doRoster.map((m) => m.email));
      return [...doRoster.map((m) => ({ ...m, active: prev.find((x) => x.email === m.email)?.active ?? true })), ...prev.filter((m) => !emails.has(m.email))];
    });
  }, [profiles, perfilParaMembro]);

  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // New member form
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<Role>("social");
  const [newPassword, setNewPassword] = useState("1234");
  const [newWhatsapp, setNewWhatsapp] = useState("");

  // Edit form
  const [editName, setEditName] = useState("");
  // WhatsApp da pessoa = credencial dela perante o agente. Vazio = mantém o que está.
  const [editWhatsapp, setEditWhatsapp] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editRole, setEditRole] = useState<Role>("social");
  const [editAvatar, setEditAvatar] = useState<AvatarType>("shield");
  const [editPassword, setEditPassword] = useState("");

  const generateInitials = (name: string) => {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  };

  // CRIAR MEMBRO GRAVA DE VERDADE (10/08). Antes isto só empilhava um objeto no estado: a tela
  // mostrava a pessoa, o banco não sabia dela, e ao definir a senha vinha "Usuário não encontrado
  // no Auth". A rota cria a linha em team_members E o login, ou não cria nada.
  const [erroEquipe, setErroEquipe] = useState<string | null>(null);
  const [salvandoEquipe, setSalvandoEquipe] = useState(false);

  const handleAddMember = useCallback(async () => {
    if (!newName.trim() || !newEmail.trim()) return;
    setSalvandoEquipe(true); setErroEquipe(null);
    try {
      const { authedFetch } = await import("@/lib/supabase/authed-fetch");
      const r = await authedFetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(), email: newEmail.trim().toLowerCase(),
          role: newRole, password: newPassword,
          whatsapp_phone: newWhatsapp.trim() || null,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErroEquipe(d?.error ?? `Falha (HTTP ${r.status})`); return; }
      setTeamMembers((prev) => [...prev, {
        id: d.member.id, slug: String(d.member.email).split("@")[0].toLowerCase().replace(/[^a-z0-9]/g, ""),
        name: d.member.name, email: d.member.email, role: d.member.role,
        initials: d.member.initials, password: "", active: true,
        createdAt: new Date().toISOString().slice(0, 10),
        whatsappFinal: d.member.whatsapp_phone ? String(d.member.whatsapp_phone).slice(-4) : null,
      } as TeamMember]);
      setNewName(""); setNewEmail(""); setNewRole("social"); setNewPassword(""); setNewWhatsapp("");
      setShowAddForm(false);
    } catch {
      setErroEquipe("Não consegui falar com o servidor. Tenta de novo.");
    } finally {
      setSalvandoEquipe(false);
    }
  }, [newName, newEmail, newRole, newPassword, newWhatsapp]);

  const handleStartEdit = useCallback((member: TeamMember) => {
    setEditingId(member.id);
    setEditName(member.name);
    setEditEmail(member.email);
    setEditRole(member.role);
    setEditPassword(""); // começa VAZIO — "deixe vazio para manter". Pré-preencher confundia e quebrava a troca.
    setEditWhatsapp("");
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!editingId || !editName.trim() || !editEmail.trim()) return;
    const emailNorm = editEmail.trim().toLowerCase();
    setTeamMembers((prev) =>
      prev.map((m) =>
        m.id === editingId
          ? {
              ...m,
              name: editName.trim(),
              email: emailNorm,
              role: editRole,
              initials: generateInitials(editName),
              password: editPassword || m.password,
            }
          : m
      )
    );
    // Save avatar (chave = slug do perfil, o mesmo que o Header usa para mostrar)
    setUserAvatar(teamMembers.find((m) => m.id === editingId)?.slug ?? editingId, editAvatar);

    // NOME E PAPEL AGORA PERSISTEM. Antes só a senha ia pro servidor: trocar o papel de alguém
    // parecia funcionar, e voltava ao recarregar — com a pessoa seguindo com o acesso antigo.
    {
      const r = await authedFetch("/api/team", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingId, name: editName.trim(), role: editRole,
          ...(editWhatsapp.trim() ? { whatsapp_phone: editWhatsapp.trim() } : {}),
        }),
      }).catch(() => null);
      const d = r ? await r.json().catch(() => ({})) : {};
      if (!r?.ok) {
        setErroEquipe(`Nome/função NÃO salvos: ${d?.error ?? "falha no servidor"}`);
      } else if (d?.member) {
        const wa = d.member.whatsapp_phone ? String(d.member.whatsapp_phone).slice(-4) : null;
        setTeamMembers((prev) => prev.map((m) => (m.id === editingId ? { ...m, whatsappFinal: wa } : m)));
      }
    }
    // Senha nova → atualiza DE VERDADE no Supabase Auth (o campo antes só mexia no estado local
    // da lista e a troca "não pegava" no login).
    if (editPassword.trim()) {
      if (editPassword.trim().length < 6) {
        alert("A senha precisa ter no mínimo 6 caracteres. Nada foi alterado.");
        return;
      }
      try {
        const r = await authedFetch("/api/auth/set-password", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: emailNorm, password: editPassword }),
        });
        const d = await r.json().catch(() => ({}));
        alert(r.ok ? "Senha atualizada no login ✓" : `Senha NÃO atualizada: ${d.error || `HTTP ${r.status}`}`);
      } catch {
        alert("Falha de conexão ao atualizar a senha.");
      }
    }
    setEditingId(null);
  }, [editingId, editName, editEmail, editRole, editPassword, editAvatar, editWhatsapp, teamMembers]);

  const handleToggleActive = useCallback(async (id: string) => {
    const atual = teamMembers.find((m) => m.id === id);
    if (!atual) return;
    const novo = !atual.active;
    setTeamMembers((prev) => prev.map((m) => (m.id === id ? { ...m, active: novo } : m)));
    const { authedFetch } = await import("@/lib/supabase/authed-fetch");
    const r = await authedFetch("/api/team", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, is_active: novo }),
    }).catch(() => null);
    // Reverte o que a tela mostrou se o banco recusou — mostrar "desativado" sem ter desativado é
    // pior que o erro, porque ninguém confere depois.
    if (!r?.ok) {
      setTeamMembers((prev) => prev.map((m) => (m.id === id ? { ...m, active: atual.active } : m)));
      setErroEquipe("Não consegui salvar a mudança de status.");
    }
  }, [teamMembers]);

  // REMOVER DESLIGA DE VERDADE (14/09). Antes só tirava da lista desta sessão — o login do
  // ex-funcionário continuava entrando e o número dele continuava valendo para o agente.
  const handleDeleteMember = useCallback(async (id: string) => {
    setSalvandoEquipe(true); setErroEquipe(null);
    try {
      const { authedFetch } = await import("@/lib/supabase/authed-fetch");
      const r = await authedFetch("/api/team", {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErroEquipe(`Não removi: ${d?.error ?? `falha no servidor (HTTP ${r.status})`}`); return; }
      setTeamMembers((prev) => prev.filter((m) => m.id !== id));
      setConfirmDeleteId(null);
    } catch {
      setErroEquipe("Não consegui falar com o servidor. Tenta de novo.");
    } finally {
      setSalvandoEquipe(false);
    }
  }, []);

  if (!hydrated) {
    return (
      <div className="flex flex-col flex-1 overflow-auto">
        <Header title="Área CEO" subtitle="Carregando…" />
      </div>
    );
  }
  if (!permitido) {
    return (
      <div className="flex flex-col flex-1 overflow-auto">
        <Header title="Área CEO" subtitle="Acesso restrito" />
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-xs w-full text-center">
            <Lock size={20} className="text-muted-foreground mx-auto mb-3" />
            <h2 className="text-lone-h2 text-foreground">Área da diretoria</h2>
            <p className="text-lone-caption text-muted-foreground mt-1">Disponível para CEO e gerência.</p>
          </div>
        </div>
      </div>
    );
  }

  const LEVEL_CONFIG: Record<string, { color: string; badge: string; ring: string; label: string }> = {
    excellent: { color: "text-lone-success", badge: "bg-lone-success-bg border-lone-success-border", ring: "var(--lone-success)", label: "Excelente" },
    good:      { color: "text-primary",      badge: "bg-primary/10 border-primary/20",               ring: "var(--primary)",      label: "Bom" },
    warning:   { color: "text-lone-warning", badge: "bg-lone-warning-bg border-lone-warning-border", ring: "var(--lone-warning)", label: "Atenção" },
    critical:  { color: "text-lone-danger",  badge: "bg-lone-danger-bg border-lone-danger-border",   ring: "var(--lone-danger)",  label: "Crítico" },
    none:      { color: "text-muted-foreground", badge: "bg-muted border-border",                    ring: "var(--muted)",        label: "Sem tarefas" },
  };

  const ROLE_ICON: Record<string, typeof Users> = {
    manager: Users,
    traffic: TrendingUp,
    social: Instagram,
    designer: Palette,
  };

  return (
    <div className="flex flex-col flex-1 overflow-auto">
      <Header title="Área CEO" subtitle="Visão confidencial da operação" />

      <div className="p-6 space-y-6 animate-fade-in">
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
            <p className="text-2xl font-bold text-destructive mt-1">
              {clients.filter((c) => c.active !== false && emRisco(c)).length} clientes
            </p>
            <p className="text-xs text-muted-foreground mt-1">precisam de atenção</p>
          </div>
        </div>

        {/* Tabs */}
        <div>
          <div className="flex gap-1 mb-5 border-b border-border overflow-x-auto">
            {(["overview", "operacao", "team", "manage", "workload"] as const).map((tab) => (
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
                {tab === "workload" && <BarChart2 size={14} />}
                {tab === "overview" ? "Visão Geral" : tab === "operacao" ? "Operação" : tab === "team" ? "Desempenho" : tab === "manage" ? "Gestão da Equipe" : "Carga de Trabalho"}
              </button>
            ))}
          </div>

          {activeSection === "operacao" && (
            <div className="space-y-4 animate-fade-in">
              {/* Reunião com cliente é entrega operacional, não agenda — por isso fica aqui, ao
                  lado dos KPIs de entrega, e não numa tela própria que ninguém abriria. */}
              <CoberturaReunioes />
              <OperationalKpisPanel cards={contentCards} />
            </div>
          )}

          {activeSection === "overview" && (
            <div className="space-y-4 animate-fade-in">
              {/* ── COCKPIT: resumo do dia (dinheiro + sinais críticos, tudo num lugar) ── */}
              {(() => {
                const stuckCount = contentCards.filter((c) => {
                  if (statusNaEtapa(c.status, ...ETAPAS_FINAIS)) return false;
                  const enteredAt = c.columnEnteredAt?.[c.status] ?? c.statusChangedAt;
                  if (!enteredAt) return false;
                  return (Date.now() - new Date(enteredAt).getTime()) / 86400000 >= 3;
                }).length;
                // Os 3 piores em saúde (100 = saudável), pela mesma régua da Saúde da carteira.
                const topRisk = clients
                  .filter((c) => c.active !== false && emRisco(c))
                  .map((c) => ({ c, score: scoreDoCliente(c) }))
                  .sort((a, b) => (a.score ?? 101) - (b.score ?? 101))
                  .slice(0, 3);
                return (
                  <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-base font-semibold text-foreground">Resumo do dia</h3>
                      <span className="text-[11px] text-muted-foreground">Atualizado agora</span>
                    </div>
                    {/* Tiles da carteira (sem financeiro da agência — removido a pedido) */}
                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="rounded-xl border border-border bg-background p-3">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Novos no mês</p>
                        <p className="text-lg font-bold text-primary tabular-nums mt-0.5">{novosNoMes}</p>
                      </div>
                      <button onClick={() => router.push("/defesa")} className="rounded-xl border border-border bg-background p-3 text-left transition-colors hover:border-primary/40">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Anomalias Meta</p>
                        <p className={`text-lg font-bold tabular-nums mt-0.5 ${openAnomalies ? "text-destructive" : "text-foreground"}`}>{openAnomalies ?? "—"}</p>
                      </button>
                    </div>
                    {/* Ação: quem está em risco agora */}
                    {topRisk.length > 0 && (
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Precisa de atenção agora</p>
                        <div className="flex flex-wrap gap-2">
                          {topRisk.map(({ c, score }) => (
                            <button
                              key={c.id}
                              onClick={() => router.push(`/clients/${c.id}`)}
                              className="flex items-center gap-2 rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-1.5 text-xs transition-colors hover:border-destructive/50"
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-destructive" />
                              <span className="font-medium text-foreground">{c.name}</span>
                              {score !== null && <span className="text-destructive font-semibold tabular-nums">{Math.round(score)}/100</span>}
                            </button>
                          ))}
                          {stuckCount > 0 && (
                            <span className="flex items-center gap-2 rounded-lg border border-lone-warning-border bg-lone-warning-bg px-3 py-1.5 text-xs text-lone-warning">
                              {stuckCount} card(s) parado(s) +3 dias
                            </span>
                          )}
                          <button
                            onClick={() => router.push("/saude?nivel=risco&resp=all")}
                            className="px-2 py-1.5 text-xs font-medium text-primary hover:underline"
                          >
                            Ver na Saúde da carteira
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
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
                      <tr
                        key={client.id}
                        onClick={() => router.push(`/clients/${client.id}`)}
                        className="border-b border-border/50 hover:bg-muted/50 transition-colors cursor-pointer"
                      >
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
                  // As seis etapas do quadro de produção (lib/conteudo/etapas.ts).
                  const pipeline = ETAPAS.map((e) => ({
                    key: e.id, label: e.rotulo, count: contentCards.filter((c) => statusNaEtapa(c.status, e.id)).length,
                  }));
                  const maxCount = Math.max(...pipeline.map((p) => p.count), 1);
                  const bottleneck = pipeline.filter((p) => !(ETAPAS_FINAIS as readonly string[]).includes(p.key)).sort((a, b) => b.count - a.count)[0];

                  const designPending = designRequests.filter((r) => r.status !== "done").length;
                  const designDone = designRequests.filter((r) => r.status === "done").length;
                  const cardsWithoutArt = contentCards.filter((c) => !c.imageUrl && statusNaEtapa(c.status, ...ETAPAS_COMPROMETIDAS)).length;

                  // SLA: cards stuck > 3 days
                  const stuckCards = contentCards.filter((c) => {
                    if (statusNaEtapa(c.status, ...ETAPAS_FINAIS)) return false;
                    const enteredAt = c.columnEnteredAt?.[c.status] ?? c.statusChangedAt;
                    if (!enteredAt) return false;
                    const daysInColumn = (Date.now() - new Date(enteredAt).getTime()) / 86400000;
                    return daysInColumn > 3;
                  });

                  // Workload per person
                  const workload = [...new Set(contentCards.map((c) => c.socialMedia))].map((person) => {
                    const cards = contentCards.filter((c) => c.socialMedia === person);
                    const active = cards.filter((c) => !statusNaEtapa(c.status, "no_ar")).length;
                    const published = cards.filter((c) => statusNaEtapa(c.status, "no_ar")).length;
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
                                  stage.key === bottleneck?.key ? "bg-destructive" : "bg-primary"
                                }`}
                                style={{ width: `${(stage.count / maxCount) * 100}%` }}
                              />
                            </div>
                            <span className={`text-xs font-bold w-8 ${stage.key === bottleneck?.key ? "text-destructive" : "text-foreground"}`}>
                              {stage.count}
                            </span>
                          </div>
                        ))}
                        {bottleneck && bottleneck.count > 0 && (
                          <p className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2 mt-2">
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
                            <p className="text-2xl font-bold text-primary">{designDone}</p>
                            <p className="text-[10px] text-muted-foreground">Designs concluídos</p>
                          </div>
                          <div className="bg-muted rounded-lg p-3 text-center">
                            <p className="text-2xl font-bold text-primary">{cardsWithoutArt}</p>
                            <p className="text-[10px] text-muted-foreground">Cards sem arte</p>
                          </div>
                          <div className="bg-muted rounded-lg p-3 text-center">
                            <p className={`text-2xl font-bold ${stuckCards.length > 0 ? "text-destructive" : "text-foreground"}`}>{stuckCards.length}</p>
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
                                isOverloaded ? "border-destructive/30" : isIdle ? "border-primary/30" : "border-border"
                              }`}>
                                <div className="flex items-center justify-between">
                                  <span className="text-sm font-medium text-foreground">{w.person}</span>
                                  {isOverloaded && <span className="text-[10px] text-destructive bg-destructive/10 px-2 py-0.5 rounded">Sobrecarregado</span>}
                                  {isIdle && <span className="text-[10px] text-primary bg-primary/10 px-2 py-0.5 rounded">Ocioso</span>}
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
                        const monthStr = new Date().toLocaleString("pt-BR", { month: "long", timeZone: "America/Sao_Paulo" });
                        // Só o mês corrente (SP). Calendário por dia saiu: pintava de vermelho todo dia
                        // sem card "publicado" no board, e o board não registra a maioria dos posts reais.
                        const publishedCards = contentCards.filter((c) => statusNaEtapa(c.status, "no_ar") && noMesSP(c.publishVerifiedAt ?? c.statusChangedAt));
                        const scheduledCards = contentCards.filter((c) => statusNaEtapa(c.status, "agendado"));
                        const scheduledNoMes = scheduledCards.filter((c) => noMesSP(c.dueDate));
                        const unverifiedScheduled = scheduledCards.filter((c) => !c.publishVerifiedAt);
                        const verifiedCount = publishedCards.filter((c) => c.publishVerifiedAt).length;
                        const publishedWithoutVerify = publishedCards.filter((c) => !c.publishVerifiedAt).length;

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
                                  <p className="text-2xl font-bold text-primary">{verifiedCount}</p>
                                  <p className="text-[10px] text-muted-foreground">Verificados ✓</p>
                                </div>
                                <div className={`bg-muted rounded-lg p-3 text-center ${publishedWithoutVerify > 0 ? "border border-lone-warning-border" : ""}`}>
                                  <p className={`text-2xl font-bold ${publishedWithoutVerify > 0 ? "text-lone-warning" : "text-foreground"}`}>{publishedWithoutVerify}</p>
                                  <p className="text-[10px] text-muted-foreground">Sem verificação</p>
                                </div>
                                <div className={`bg-muted rounded-lg p-3 text-center ${unverifiedScheduled.length > 0 ? "border border-destructive/30" : ""}`}>
                                  <p className={`text-2xl font-bold ${unverifiedScheduled.length > 0 ? "text-destructive" : "text-foreground"}`}>{unverifiedScheduled.length}</p>
                                  <p className="text-[10px] text-muted-foreground">Agendados pendentes</p>
                                </div>
                                <div className="bg-muted rounded-lg p-3 text-center">
                                  <p className="text-2xl font-bold text-foreground">{publishedCards.length + scheduledNoMes.length}</p>
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
                                      const pubCards = publishedCards.filter((c) => c.socialMedia === name);
                                      const pub = pubCards.length;
                                      const verified = pubCards.filter((c) => c.publishVerifiedAt).length;
                                      const sched = unverifiedScheduled.filter((c) => c.socialMedia === name).length;
                                      const rate = pub > 0 ? Math.round((verified / pub) * 100) : 100;
                                      return (
                                        <div key={name} className="flex items-center gap-3 bg-muted/50 rounded-lg p-2.5">
                                          <span className="text-xs font-medium text-foreground w-32 shrink-0">{name}</span>
                                          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                                            <div className={`h-full rounded-full ${rate >= 80 ? "bg-primary" : rate >= 50 ? "bg-lone-warning" : "bg-destructive"}`} style={{ width: `${rate}%` }} />
                                          </div>
                                          <span className={`text-xs font-bold w-10 text-right ${rate >= 80 ? "text-primary" : rate >= 50 ? "text-lone-warning" : "text-destructive"}`}>{rate}%</span>
                                          <span className="text-[10px] text-muted-foreground w-20 text-right">{pub} pub · {sched} pend</span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                );
                              })()}
                            </div>

                          </>
                        );
                      })()}

                      {/* Stuck cards detail */}
                      {stuckCards.length > 0 && (
                        <div className="card space-y-3 lg:col-span-2">
                          <p className="text-xs text-destructive font-medium uppercase tracking-wider">Cards Parados (+3 dias no mesmo status)</p>
                          <div className="space-y-2">
                            {stuckCards.slice(0, 8).map((card) => {
                              const enteredAt = card.columnEnteredAt?.[card.status] ?? card.statusChangedAt!;
                              const days = Math.round((Date.now() - new Date(enteredAt).getTime()) / 86400000);
                              return (
                                <div
                                  key={card.id}
                                  onClick={() => router.push(`/social?card=${card.id}`)}
                                  className="flex items-center gap-3 bg-muted rounded-lg p-2.5 cursor-pointer transition-colors hover:bg-muted/70"
                                >
                                  <div className="w-2 h-2 rounded-full bg-destructive shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-medium text-foreground truncate">{card.title}</p>
                                    <p className="text-[10px] text-muted-foreground">{card.clientName} · {card.socialMedia}</p>
                                  </div>
                                  <span className="text-xs text-destructive font-medium shrink-0">{days}d em &ldquo;{card.status}&rdquo;</span>
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
                  <p className="text-2xl font-bold text-primary mt-1">{contentCards.filter((c) => statusNaEtapa(c.status, "no_ar") && noMesSP(c.publishVerifiedAt ?? c.statusChangedAt)).length}</p>
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
                                stroke={levelConfig.ring}
                                strokeWidth="6"
                                strokeLinecap="round"
                                strokeDasharray={`${(member.overallScore ?? 0) * 2.64} 264`}
                              />
                            </svg>
                            <div className="absolute inset-0 flex items-center justify-center">
                              <span className={`text-lg font-semibold ${levelConfig.color}`}>{member.overallScore ?? "—"}</span>
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
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${levelConfig.color} ${levelConfig.badge}`}>
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
                                  {member.taskRate === null ? "sem tarefas atribuídas" : `${member.doneTasks}/${member.totalTasks} concluídas (${member.taskRate}%)`}
                                </span>
                              </div>
                              <div className="h-2 bg-muted rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${
                                    (member.taskRate ?? 100) >= 50 ? "bg-primary" : "bg-destructive"
                                  }`}
                                  style={{ width: `${member.taskRate ?? 0}%` }}
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
                                    className="h-full rounded-full bg-primary transition-all"
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
                                      member.supportDone >= member.supportTotal ? "bg-primary" : "bg-primary"
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
                                    className="h-full rounded-full bg-primary transition-all"
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
                  {/* O erro do servidor precisa APARECER. O bug que trouxe isto aqui foi um
                      cadastro que pareceu dar certo e não existia em lugar nenhum. */}
                  {erroEquipe && (
                    <div className="mb-3 rounded-lg border border-lone-danger-border bg-lone-danger-bg px-3 py-2 text-xs text-lone-danger">
                      {erroEquipe}
                    </div>
                  )}
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
                      <label className="text-xs text-muted-foreground font-medium block mb-1.5">WhatsApp</label>
                      <input
                        id="novo-membro-whatsapp"
                        value={newWhatsapp}
                        onChange={(e) => setNewWhatsapp(e.target.value)}
                        placeholder="(22) 99999-9999"
                        inputMode="tel"
                        className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary"
                      />
                      <p className="text-[10px] text-muted-foreground mt-1">É por ele que o agente reconhece a pessoa. Sem WhatsApp, os comandos dela não executam.</p>
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
                          <div>
                            <label className="text-xs text-muted-foreground font-medium block mb-1.5">
                              WhatsApp {member.whatsappFinal ? <span className="text-muted-foreground/70">(cadastrado: …{member.whatsappFinal})</span> : <span className="text-lone-warning">(sem número — mudo para o agente)</span>}
                            </label>
                            <input
                              id={`editar-whatsapp-${member.id}`}
                              value={editWhatsapp}
                              onChange={(e) => setEditWhatsapp(e.target.value)}
                              placeholder={member.whatsappFinal ? "deixe vazio para manter" : "(22) 99999-9999"}
                              inputMode="tel"
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
                                      ? "border-primary/50 bg-primary/[0.06]"
                                      : "border-transparent hover:bg-muted"
                                  }`}
                                >
                                  <MedievalAvatar type={opt.type} size={36} />
                                  <span className="text-[9px] text-muted-foreground">{opt.label}</span>
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
                              type="password"
                              value={editPassword}
                              onChange={(e) => setEditPassword(e.target.value)}
                              placeholder="deixe vazio para manter a atual"
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
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-destructive/10 text-destructive border border-destructive/20 font-bold uppercase">Desativado</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                          <span className="flex items-center gap-1"><Mail size={10} /> {member.email}</span>
                          {member.whatsappFinal
                            ? <span className="flex items-center gap-1"><Smartphone size={10} /> …{member.whatsappFinal}</span>
                            : <span className="flex items-center gap-1 text-lone-warning" title="Sem WhatsApp cadastrado: o agente não reconhece esta pessoa — nenhum comando dela executa."><Smartphone size={10} /> sem WhatsApp — mudo para o agente</span>}
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
                              ? "text-muted-foreground hover:text-primary hover:bg-primary/10"
                              : "text-primary hover:bg-primary/10"
                          }`}
                          title={member.active ? "Desativar acesso" : "Reativar acesso"}
                        >
                          {member.active ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>

                        {isConfirmingDelete ? (
                          <div className="flex items-center gap-1 animate-fade-in">
                            <span className="text-xs text-destructive mr-1">Confirmar?</span>
                            <button
                              onClick={() => handleDeleteMember(member.id)}
                              className="p-1.5 rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors text-xs font-medium"
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
                            className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
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

              {/* Aviso honesto: só a senha persiste hoje. Adicionar/remover/editar é só nesta sessão. */}
              <div className="flex items-start gap-3 bg-lone-warning-bg border border-lone-warning-border rounded-xl px-4 py-3">
                <AlertTriangle size={16} className="text-lone-warning mt-0.5 shrink-0" />
                <div className="text-xs text-muted-foreground space-y-1">
                  <p><strong className="text-foreground">Adicionar cria o login junto.</strong> Ao cadastrar alguém aqui, o sistema grava na equipe <em>e</em> cria o acesso com a senha informada — as duas coisas, ou nenhuma. Nome, função e ativo/inativo também são salvos no banco.</p>
                  <p><strong className="text-foreground">Remover</strong> desliga de verdade: apaga o login, tira da equipe e zera o WhatsApp (o número deixa de valer para o agente). O histórico de quem fez o quê fica. <strong>Desativar</strong> é para afastamento temporário: bloqueia o acesso e mantém o cadastro.</p>
                </div>
              </div>
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
                      const memberCards = contentCards.filter((c) => c.socialMedia === name && !statusNaEtapa(c.status, "no_ar"));
                      const memberDesign = designRequests.filter((r) => clients.some((c) => c.assignedDesigner === name && c.id === r.clientId) && r.status !== "done");
                      const totalActive = memberTasks.length + memberCards.length + memberDesign.length;
                      const utilPct = Math.round((totalActive / CAPACITY_PER_WEEK) * 100);
                      const isOverloaded = utilPct > 120;
                      const isHigh = utilPct > 80;

                      const memberClients = [...new Set([
                        ...clients.filter((c) => c.assignedSocial === name || c.assignedTraffic === name || c.assignedDesigner === name).map((c) => c.name)
                      ])];

                      return (
                        <div key={name} className={`card border ${isOverloaded ? "border-destructive/30" : isHigh ? "border-lone-warning-border" : "border-border"}`}>
                          <div className="flex items-center gap-4 mb-3">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold ${
                              isOverloaded ? "bg-destructive/15 text-destructive" : isHigh ? "bg-lone-warning-bg text-lone-warning" : "bg-primary/15 text-primary"
                            }`}>
                              {name.split(" ").map((w) => w[0]).join("").slice(0, 2)}
                            </div>
                            <div className="flex-1">
                              <p className="font-semibold text-foreground text-sm">{name}</p>
                              <p className="text-[10px] text-muted-foreground">{memberClients.slice(0, 3).join(", ")}{memberClients.length > 3 ? ` +${memberClients.length - 3}` : ""}</p>
                            </div>
                            <div className="text-right">
                              <p className={`text-lg font-bold ${isOverloaded ? "text-destructive" : isHigh ? "text-lone-warning" : "text-foreground"}`}>
                                {utilPct}%
                              </p>
                              <p className="text-[10px] text-muted-foreground">{totalActive}/{CAPACITY_PER_WEEK} itens</p>
                            </div>
                          </div>

                          {/* Capacity bar */}
                          <div className="h-2.5 bg-muted rounded-full overflow-hidden mb-3">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${
                                isOverloaded ? "bg-destructive" : isHigh ? "bg-lone-warning" : "bg-primary"
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
                            <div className="flex items-center gap-2 mt-3 px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/20">
                              <AlertTriangle size={12} className="text-destructive shrink-0" />
                              <span className="text-[10px] text-destructive font-medium">Sobrecarregado — considere redistribuir tarefas</span>
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

        </div>
      </div>
    </div>
  );
}
