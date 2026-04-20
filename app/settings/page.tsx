"use client";

import { useState } from "react";
import {
  Settings, User, Palette, Bell, Shield, LogOut,
  Sun, Moon, Check, ChevronRight, Mail, Key,
  Building2, FileText, Loader2, Save,
} from "lucide-react";
import { useRole } from "@/lib/context/RoleContext";
import { useTheme } from "@/lib/context/ThemeContext";
import { RestartTourButton } from "@/components/OnboardingTour";
import { supabase } from "@/lib/supabase/client";
import { useEffect } from "react";

const ROLE_LABELS: Record<string, string> = {
  admin: "CEO / Administrador",
  manager: "Gerente de Operações",
  traffic: "Gestor de Tráfego Pago",
  social: "Social Media Manager",
  designer: "Designer Criativo",
};

export default function SettingsPage() {
  const { currentProfile, role, logout } = useRole();
  const { theme, toggleTheme } = useTheme();
  const [activeSection, setActiveSection] = useState<"profile" | "appearance" | "notifications" | "security" | "juridico">("profile");
  const isAdmin = role === "admin" || role === "manager";

  // Juridico state
  const [agencyForm, setAgencyForm] = useState({
    razaoSocial: "", nomeFantasia: "", cnpj: "", endereco: "", email: "", telefone: "",
    signatarioNome: "", signatarioCpf: "", signatarioEmail: "",
    d4signToken: "", d4signCryptKey: "",
  });
  const [templates, setTemplates] = useState<{ id: string; name: string; serviceType: string; d4signTemplateId: string; d4signSafeId: string; durationMonths: number; clauses: { id: string; title: string; body: string }[]; conditionalClauses: { id: string; title: string; body: string; enabled: boolean }[] }[]>([]);
  const [editingClauses, setEditingClauses] = useState<string | null>(null);
  const [agencySaving, setAgencySaving] = useState(false);
  const [agencySaved, setAgencySaved] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    supabase.from("agency_settings").select("*").eq("key", "main").maybeSingle().then(({ data }) => {
      if (data) setAgencyForm({
        razaoSocial: data.razao_social || "", nomeFantasia: data.nome_fantasia || "",
        cnpj: data.cnpj || "", endereco: data.endereco || "", email: data.email || "",
        telefone: data.telefone || "", signatarioNome: data.signatario_nome || "",
        signatarioCpf: data.signatario_cpf || "", signatarioEmail: data.signatario_email || "",
        d4signToken: data.d4sign_token || "", d4signCryptKey: data.d4sign_crypt_key || "",
      });
    });
    supabase.from("contract_templates").select("*").order("name").then(({ data }) => {
      if (data) setTemplates(data.map((r) => ({
        id: r.id, name: r.name, serviceType: r.service_type,
        d4signTemplateId: r.d4sign_template_id || "", d4signSafeId: r.d4sign_safe_id || "",
        durationMonths: r.duration_months,
        clauses: (r.clauses as { id: string; title: string; body: string }[]) || [],
        conditionalClauses: (r.conditional_clauses as { id: string; title: string; body: string; enabled: boolean }[]) || [],
      })));
    });
  }, [isAdmin]);

  const handleAgencySave = async () => {
    setAgencySaving(true);
    await supabase.from("agency_settings").update({
      razao_social: agencyForm.razaoSocial, nome_fantasia: agencyForm.nomeFantasia,
      cnpj: agencyForm.cnpj, endereco: agencyForm.endereco, email: agencyForm.email,
      telefone: agencyForm.telefone, signatario_nome: agencyForm.signatarioNome,
      signatario_cpf: agencyForm.signatarioCpf, signatario_email: agencyForm.signatarioEmail,
      d4sign_token: agencyForm.d4signToken, d4sign_crypt_key: agencyForm.d4signCryptKey,
      updated_at: new Date().toISOString(),
    }).eq("key", "main");
    for (const t of templates) {
      await supabase.from("contract_templates").update({
        d4sign_template_id: t.d4signTemplateId || null,
        d4sign_safe_id: t.d4signSafeId || null,
        duration_months: t.durationMonths,
        clauses: t.clauses,
        conditional_clauses: t.conditionalClauses,
        updated_at: new Date().toISOString(),
      }).eq("id", t.id);
    }
    setAgencySaving(false);
    setAgencySaved(true);
    setTimeout(() => setAgencySaved(false), 2000);
  };

  // Notification preferences (local state — would persist to DB in production)
  const [notifPrefs, setNotifPrefs] = useState({
    taskAssigned: true,
    cardStatusChange: true,
    designDelivered: true,
    slaWarnings: true,
    chatMentions: true,
    systemUpdates: false,
  });

  const togglePref = (key: keyof typeof notifPrefs) => {
    setNotifPrefs((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const sections = [
    { key: "profile" as const, label: "Perfil", icon: User },
    { key: "appearance" as const, label: "Aparência", icon: Palette },
    { key: "notifications" as const, label: "Notificações", icon: Bell },
    { key: "security" as const, label: "Segurança", icon: Shield },
    ...(isAdmin ? [{ key: "juridico" as const, label: "Jurídico & Contratos", icon: FileText }] : []),
  ];

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
          <Settings size={24} className="text-[#0d4af5]" />
          Configurações
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Gerencie seu perfil e preferências
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-6">
        {/* Nav */}
        <div className="card p-2 h-fit">
          {sections.map((s) => {
            const Icon = s.icon;
            const active = activeSection === s.key;
            return (
              <button
                key={s.key}
                onClick={() => setActiveSection(s.key)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium transition-all ${
                  active
                    ? "bg-[#0d4af5]/10 text-[#0d4af5]"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                <Icon size={14} />
                {s.label}
                {active && <ChevronRight size={12} className="ml-auto" />}
              </button>
            );
          })}
          <div className="border-t border-border my-2" />
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium text-red-400 hover:bg-red-500/10 transition-all"
          >
            <LogOut size={14} />
            Sair da conta
          </button>
        </div>

        {/* Content */}
        <div className="space-y-6">
          {/* Profile */}
          {activeSection === "profile" && (
            <div className="space-y-6 animate-fade-in">
              <div className="card">
                <h3 className="font-semibold text-foreground text-sm mb-5">Informacoes do Perfil</h3>

                {/* Staff lockdown warning */}
                {role !== "admin" && (
                  <div className="mb-4 px-4 py-3 rounded-xl bg-amber-500/[0.05] border border-amber-500/[0.12] text-[11px] text-amber-400">
                    Alteracoes de perfil sao gerenciadas exclusivamente pela Diretoria (Admins).
                  </div>
                )}

                <div className="flex items-center gap-5 mb-6">
                  <div className="w-16 h-16 rounded-2xl bg-[#0d4af5]/15 flex items-center justify-center shadow-[0_0_20px_rgba(10,52,245,0.2)]">
                    <span className="text-xl font-bold text-[#0d4af5]">{currentProfile.initials}</span>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-foreground">{currentProfile.name}</p>
                    <p className="text-sm text-[#0d4af5]">{ROLE_LABELS[role] ?? role}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                      <User size={10} /> Nome Completo
                    </label>
                    <input
                      value={currentProfile.name}
                      readOnly
                      className="w-full bg-muted border border-border rounded-xl px-4 py-2.5 text-sm text-foreground"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                      <Mail size={10} /> Email
                    </label>
                    <input
                      value={currentProfile.email}
                      readOnly
                      className="w-full bg-muted border border-border rounded-xl px-4 py-2.5 text-sm text-foreground"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                      <Shield size={10} /> Cargo / Role
                    </label>
                    <input
                      value={ROLE_LABELS[role] ?? role}
                      readOnly
                      className="w-full bg-muted border border-border rounded-xl px-4 py-2.5 text-sm text-foreground"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                      <Key size={10} /> ID do Perfil
                    </label>
                    <input
                      value={currentProfile.id}
                      readOnly
                      className="w-full bg-muted border border-border rounded-xl px-4 py-2.5 text-sm text-zinc-600 font-mono"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Appearance */}
          {activeSection === "appearance" && (
            <div className="space-y-6 animate-fade-in">
              <div className="card">
                <h3 className="font-semibold text-foreground text-sm mb-5">Aparência</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-muted/30">
                    <div className="flex items-center gap-3">
                      {theme === "dark" ? <Moon size={18} className="text-[#0d4af5]" /> : <Sun size={18} className="text-amber-400" />}
                      <div>
                        <p className="text-sm font-medium text-foreground">Tema</p>
                        <p className="text-xs text-muted-foreground">{theme === "dark" ? "Modo escuro ativo" : "Modo claro ativo"}</p>
                      </div>
                    </div>
                    <button
                      onClick={toggleTheme}
                      className={`relative w-12 h-6 rounded-full transition-all ${
                        theme === "dark" ? "bg-[#0d4af5]" : "bg-zinc-600"
                      }`}
                    >
                      <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${
                        theme === "dark" ? "left-[26px]" : "left-0.5"
                      }`} />
                    </button>
                  </div>

                  <div className="p-4 rounded-xl border border-border bg-muted/30">
                    <p className="text-sm font-medium text-foreground mb-1">Cor de Destaque</p>
                    <p className="text-xs text-muted-foreground mb-3">Azul #0d4af5 — padrao do Lone OS</p>
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-[#0d4af5] shadow-[0_0_12px_rgba(10,52,245,0.4)]" />
                      <div className="w-8 h-8 rounded-lg bg-[#3b6ff5]" />
                      <div className="w-8 h-8 rounded-lg bg-[#0d4af5]/50" />
                      <span className="text-[10px] text-muted-foreground ml-2">Palette fixa</span>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl border border-border bg-muted/30">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-foreground">Tour do Sistema</p>
                        <p className="text-xs text-muted-foreground">Refaca o tour interativo para conhecer o Lone OS</p>
                      </div>
                      <RestartTourButton className="px-3 py-1.5 rounded-lg text-xs text-[#0d4af5] bg-[#0d4af5]/10 border border-[#0d4af5]/20 hover:bg-[#0d4af5]/20 transition-all" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Notifications */}
          {activeSection === "notifications" && (
            <div className="space-y-6 animate-fade-in">
              <div className="card">
                <h3 className="font-semibold text-foreground text-sm mb-5">Preferências de Notificação</h3>
                <div className="space-y-1">
                  {([
                    { key: "taskAssigned" as const, label: "Tarefa atribuída a mim", desc: "Quando uma nova tarefa for designada para você" },
                    { key: "cardStatusChange" as const, label: "Mudança de status de card", desc: "Quando um card de conteúdo mudar de coluna" },
                    { key: "designDelivered" as const, label: "Arte entregue pelo designer", desc: "Quando o designer finalizar uma arte" },
                    { key: "slaWarnings" as const, label: "Alertas de SLA", desc: "Quando um card estiver parado por muito tempo" },
                    { key: "chatMentions" as const, label: "Menções no chat", desc: "Quando alguém mencionar você em uma conversa" },
                    { key: "systemUpdates" as const, label: "Atualizações do sistema", desc: "Notificações sobre manutenções e atualizações" },
                  ]).map(({ key, label, desc }) => (
                    <div key={key} className="flex items-center justify-between p-3.5 rounded-xl hover:bg-muted/30 transition-all">
                      <div>
                        <p className="text-sm text-foreground">{label}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{desc}</p>
                      </div>
                      <button
                        onClick={() => togglePref(key)}
                        className={`relative w-10 h-5 rounded-full transition-all ${
                          notifPrefs[key] ? "bg-[#0d4af5]" : "bg-zinc-700"
                        }`}
                      >
                        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${
                          notifPrefs[key] ? "left-[22px]" : "left-0.5"
                        }`} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Security */}
          {activeSection === "security" && (
            <div className="space-y-6 animate-fade-in">
              <div className="card">
                <h3 className="font-semibold text-foreground text-sm mb-5">Segurança</h3>
                <div className="space-y-4">
                  <div className="p-4 rounded-xl border border-border bg-muted/30">
                    <div className="flex items-center gap-3 mb-2">
                      <Key size={16} className="text-[#0d4af5]" />
                      <p className="text-sm font-medium text-foreground">Sessão Ativa</p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Logado como <span className="text-foreground font-medium">{currentProfile.name}</span> ({currentProfile.email})
                    </p>
                    <p className="text-[10px] text-zinc-600 mt-1">
                      Autenticação: client-side (demo mode)
                    </p>
                  </div>

                  <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/5">
                    <div className="flex items-center gap-2 mb-1">
                      <Shield size={14} className="text-amber-400" />
                      <p className="text-xs font-medium text-amber-400">Ambiente de Demonstração</p>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Este sistema está em modo demo com autenticação client-side. Em produção, será usado Supabase Auth com row-level security.
                    </p>
                  </div>

                  <button
                    onClick={logout}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-red-500/10 text-red-400 text-sm font-medium border border-red-500/20 hover:bg-red-500/20 transition-all"
                  >
                    <LogOut size={16} /> Encerrar sessão
                  </button>
                </div>
              </div>
            </div>
          )}
          {/* Juridico & Contratos */}
          {activeSection === "juridico" && isAdmin && (
            <div className="space-y-6 animate-fade-in">
              {/* Agency Data */}
              <div className="card">
                <div className="flex items-center justify-between mb-5">
                  <h3 className="font-semibold text-foreground text-sm flex items-center gap-2">
                    <Building2 size={14} className="text-[#0d4af5]" /> Dados da Agencia
                  </h3>
                  <button onClick={handleAgencySave} disabled={agencySaving}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0d4af5] hover:bg-[#0d4af5]/80 text-white text-xs font-medium transition-colors disabled:opacity-50">
                    {agencySaving ? <Loader2 size={12} className="animate-spin" /> : agencySaved ? <Check size={12} /> : <Save size={12} />}
                    {agencySaved ? "Salvo!" : "Salvar Tudo"}
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {([
                    { key: "razaoSocial", label: "Razao Social" },
                    { key: "nomeFantasia", label: "Nome Fantasia" },
                    { key: "cnpj", label: "CNPJ" },
                    { key: "endereco", label: "Endereco" },
                    { key: "email", label: "E-mail" },
                    { key: "telefone", label: "Telefone" },
                  ] as { key: keyof typeof agencyForm; label: string }[]).map(({ key, label }) => (
                    <div key={key} className="space-y-1.5">
                      <label className="text-[10px] text-zinc-500 uppercase tracking-wider">{label}</label>
                      <input value={agencyForm[key]} onChange={(e) => setAgencyForm((p) => ({ ...p, [key]: e.target.value }))}
                        className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-[#0d4af5]/50" />
                    </div>
                  ))}
                </div>
              </div>

              {/* Signatario */}
              <div className="card">
                <h3 className="font-semibold text-foreground text-sm mb-5 flex items-center gap-2">
                  <User size={14} className="text-[#0d4af5]" /> Signatario (Contratada)
                </h3>
                <div className="grid grid-cols-3 gap-4">
                  {([
                    { key: "signatarioNome", label: "Nome Completo" },
                    { key: "signatarioCpf", label: "CPF" },
                    { key: "signatarioEmail", label: "E-mail para Assinatura" },
                  ] as { key: keyof typeof agencyForm; label: string }[]).map(({ key, label }) => (
                    <div key={key} className="space-y-1.5">
                      <label className="text-[10px] text-zinc-500 uppercase tracking-wider">{label}</label>
                      <input value={agencyForm[key]} onChange={(e) => setAgencyForm((p) => ({ ...p, [key]: e.target.value }))}
                        className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-[#0d4af5]/50" />
                    </div>
                  ))}
                </div>
              </div>

              {/* D4Sign Config */}
              <div className="card">
                <h3 className="font-semibold text-foreground text-sm mb-2 flex items-center gap-2">
                  <Shield size={14} className="text-[#0d4af5]" /> Integracao D4Sign
                </h3>
                <p className="text-[10px] text-muted-foreground mb-5">Credenciais de API para assinatura digital de contratos</p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-zinc-500 uppercase tracking-wider">Token API</label>
                    <input type="password" value={agencyForm.d4signToken}
                      onChange={(e) => setAgencyForm((p) => ({ ...p, d4signToken: e.target.value }))}
                      placeholder="live-xxxxxxxx..."
                      className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-[#0d4af5]/50 font-mono" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-zinc-500 uppercase tracking-wider">Crypt Key</label>
                    <input type="password" value={agencyForm.d4signCryptKey}
                      onChange={(e) => setAgencyForm((p) => ({ ...p, d4signCryptKey: e.target.value }))}
                      placeholder="live-crypt-xxxxxxxx..."
                      className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-[#0d4af5]/50 font-mono" />
                  </div>
                </div>
              </div>

              {/* Templates & Clausulas */}
              <div className="card">
                <h3 className="font-semibold text-foreground text-sm mb-2 flex items-center gap-2">
                  <FileText size={14} className="text-[#0d4af5]" /> Templates de Contrato
                </h3>
                <p className="text-[10px] text-muted-foreground mb-5">Configure IDs D4Sign e edite clausulas de cada servico</p>
                <div className="space-y-4">
                  {templates.map((t, idx) => (
                    <div key={t.id} className="rounded-xl border border-border bg-surface p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-foreground">{t.name}</p>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-zinc-500 font-mono">{t.serviceType}</span>
                          <button onClick={() => setEditingClauses(editingClauses === t.id ? null : t.id)}
                            className={`text-[10px] px-2 py-0.5 rounded border transition-all ${editingClauses === t.id ? "bg-[#0d4af5]/10 text-[#0d4af5] border-[#0d4af5]/20" : "border-border text-zinc-500 hover:text-white"}`}>
                            {editingClauses === t.id ? "Fechar" : "Editar Clausulas"}
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="space-y-1">
                          <label className="text-[10px] text-zinc-500">Template ID (D4Sign)</label>
                          <input value={t.d4signTemplateId} placeholder="UUID" onChange={(e) => {
                            const u = [...templates]; u[idx] = { ...u[idx], d4signTemplateId: e.target.value }; setTemplates(u);
                          }} className="w-full bg-card border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-[#0d4af5]/50 font-mono" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] text-zinc-500">Safe ID (Pasta)</label>
                          <input value={t.d4signSafeId} placeholder="UUID" onChange={(e) => {
                            const u = [...templates]; u[idx] = { ...u[idx], d4signSafeId: e.target.value }; setTemplates(u);
                          }} className="w-full bg-card border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-[#0d4af5]/50 font-mono" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] text-zinc-500">Duracao (meses)</label>
                          <input type="number" value={t.durationMonths} onChange={(e) => {
                            const u = [...templates]; u[idx] = { ...u[idx], durationMonths: Number(e.target.value) || 3 }; setTemplates(u);
                          }} className="w-full bg-card border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-[#0d4af5]/50" />
                        </div>
                      </div>

                      {/* Clause editor */}
                      {editingClauses === t.id && (
                        <div className="space-y-4 pt-3 border-t border-border">
                          <p className="text-[10px] text-zinc-500 font-medium uppercase tracking-wider">Clausulas do Contrato</p>
                          {t.clauses.map((clause, ci) => (
                            <div key={clause.id} className="space-y-1.5">
                              <input value={clause.title} onChange={(e) => {
                                const u = [...templates]; const c = [...u[idx].clauses]; c[ci] = { ...c[ci], title: e.target.value };
                                u[idx] = { ...u[idx], clauses: c }; setTemplates(u);
                              }} className="w-full bg-card border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground font-medium outline-none focus:border-[#0d4af5]/50" />
                              <textarea value={clause.body} rows={4} onChange={(e) => {
                                const u = [...templates]; const c = [...u[idx].clauses]; c[ci] = { ...c[ci], body: e.target.value };
                                u[idx] = { ...u[idx], clauses: c }; setTemplates(u);
                              }} className="w-full bg-card border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-[#0d4af5]/50 resize-none" />
                            </div>
                          ))}

                          <p className="text-[10px] text-zinc-500 font-medium uppercase tracking-wider pt-2">Clausulas Condicionais (Opcionais)</p>
                          {t.conditionalClauses.map((cc, cci) => (
                            <div key={cc.id} className={`rounded-lg border p-3 space-y-2 transition-all ${cc.enabled ? "border-[#0d4af5]/30 bg-[#0d4af5]/[0.03]" : "border-border"}`}>
                              <div className="flex items-center justify-between">
                                <input value={cc.title} onChange={(e) => {
                                  const u = [...templates]; const c = [...u[idx].conditionalClauses]; c[cci] = { ...c[cci], title: e.target.value };
                                  u[idx] = { ...u[idx], conditionalClauses: c }; setTemplates(u);
                                }} className="bg-transparent text-xs text-foreground font-medium outline-none flex-1" />
                                <button onClick={() => {
                                  const u = [...templates]; const c = [...u[idx].conditionalClauses]; c[cci] = { ...c[cci], enabled: !c[cci].enabled };
                                  u[idx] = { ...u[idx], conditionalClauses: c }; setTemplates(u);
                                }} className={`relative w-9 h-5 rounded-full transition-all ${cc.enabled ? "bg-[#0d4af5]" : "bg-zinc-700"}`}>
                                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${cc.enabled ? "left-[18px]" : "left-0.5"}`} />
                                </button>
                              </div>
                              <textarea value={cc.body} rows={2} onChange={(e) => {
                                const u = [...templates]; const c = [...u[idx].conditionalClauses]; c[cci] = { ...c[cci], body: e.target.value };
                                u[idx] = { ...u[idx], conditionalClauses: c }; setTemplates(u);
                              }} className="w-full bg-card border border-border rounded-lg px-2.5 py-1.5 text-[11px] text-foreground outline-none focus:border-[#0d4af5]/50 resize-none" />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
