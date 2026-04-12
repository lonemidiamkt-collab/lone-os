"use client";

import { useState } from "react";
import {
  Settings, User, Palette, Bell, Shield, LogOut,
  Sun, Moon, Check, ChevronRight, Mail, Key,
} from "lucide-react";
import { useRole } from "@/lib/context/RoleContext";
import { useTheme } from "@/lib/context/ThemeContext";
import { RestartTourButton } from "@/components/OnboardingTour";

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
  const [activeSection, setActiveSection] = useState<"profile" | "appearance" | "notifications" | "security">("profile");

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
  ];

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
          <Settings size={24} className="text-[#0a34f5]" />
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
                    ? "bg-[#0a34f5]/10 text-[#0a34f5]"
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
                <h3 className="font-semibold text-foreground text-sm mb-5">Informações do Perfil</h3>
                <div className="flex items-center gap-5 mb-6">
                  <div className="w-16 h-16 rounded-2xl bg-[#0a34f5]/15 flex items-center justify-center shadow-[0_0_20px_rgba(10,52,245,0.2)]">
                    <span className="text-xl font-bold text-[#0a34f5]">{currentProfile.initials}</span>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-foreground">{currentProfile.name}</p>
                    <p className="text-sm text-[#0a34f5]">{ROLE_LABELS[role] ?? role}</p>
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
                      {theme === "dark" ? <Moon size={18} className="text-[#0a34f5]" /> : <Sun size={18} className="text-amber-400" />}
                      <div>
                        <p className="text-sm font-medium text-foreground">Tema</p>
                        <p className="text-xs text-muted-foreground">{theme === "dark" ? "Modo escuro ativo" : "Modo claro ativo"}</p>
                      </div>
                    </div>
                    <button
                      onClick={toggleTheme}
                      className={`relative w-12 h-6 rounded-full transition-all ${
                        theme === "dark" ? "bg-[#0a34f5]" : "bg-zinc-600"
                      }`}
                    >
                      <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${
                        theme === "dark" ? "left-[26px]" : "left-0.5"
                      }`} />
                    </button>
                  </div>

                  <div className="p-4 rounded-xl border border-border bg-muted/30">
                    <p className="text-sm font-medium text-foreground mb-1">Cor de Destaque</p>
                    <p className="text-xs text-muted-foreground mb-3">Azul #0a34f5 — padrao do Lone OS</p>
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-[#0a34f5] shadow-[0_0_12px_rgba(10,52,245,0.4)]" />
                      <div className="w-8 h-8 rounded-lg bg-[#3b6ff5]" />
                      <div className="w-8 h-8 rounded-lg bg-[#0a34f5]/50" />
                      <span className="text-[10px] text-muted-foreground ml-2">Palette fixa</span>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl border border-border bg-muted/30">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-foreground">Tour do Sistema</p>
                        <p className="text-xs text-muted-foreground">Refaca o tour interativo para conhecer o Lone OS</p>
                      </div>
                      <RestartTourButton className="px-3 py-1.5 rounded-lg text-xs text-[#0a34f5] bg-[#0a34f5]/10 border border-[#0a34f5]/20 hover:bg-[#0a34f5]/20 transition-all" />
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
                          notifPrefs[key] ? "bg-[#0a34f5]" : "bg-zinc-700"
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
                      <Key size={16} className="text-[#0a34f5]" />
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
        </div>
      </div>
    </div>
  );
}
