"use client";

import { Bell, ChevronDown, Plus, X, UserPlus, FileText, Smile, Search, ChevronRight, LogIn } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useRole } from "@/lib/context/RoleContext";
import MedievalAvatar, { getUserAvatar } from "@/components/MedievalAvatars";
import { useClientsStore } from "@/stores/useClientsStore";
import { useContentStore } from "@/stores/useContentStore";
import { useOperationalStore } from "@/stores/useOperationalStore";
import { useNotificationsStore } from "@/stores/useNotificationsStore";
import Link from "next/link";
import type { AppNotification } from "@/lib/types";

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "agora";
  if (diff < 3600) return `${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

interface HeaderProps {
  title: string;
  subtitle?: string;
}

export default function Header({ title, subtitle }: HeaderProps) {
  const { currentProfile, roleLabel, logout } = useRole();
  const clients = useClientsStore((s) => s.clients);
  const contentCards = useContentStore((s) => s.contentCards);
  const tasks = useOperationalStore((s) => s.tasks);
  const notifications = useNotificationsStore((s) => s.notifications);
  const markNotificationRead = useNotificationsStore((s) => s.markRead);
  const markAllNotificationsRead = useNotificationsStore((s) => s.markAllRead);
  const [showMenu, setShowMenu] = useState(false);
  const [showNotif, setShowNotif] = useState(false);
  const [showQuick, setShowQuick] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const unreadCount = notifications.filter((n) => !n.read).length;

  const notifRef = useRef<HTMLDivElement>(null);
  const quickRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setShowNotif(false);
      if (quickRef.current && !quickRef.current.contains(e.target as Node)) setShowQuick(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const q = searchQuery.toLowerCase();
  const clientResults = searchQuery.length >= 2
    ? clients.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 3)
    : [];
  const cardResults = searchQuery.length >= 2
    ? contentCards.filter((c) => c.title.toLowerCase().includes(q) || c.clientName.toLowerCase().includes(q)).slice(0, 3)
    : [];
  const taskResults = searchQuery.length >= 2
    ? tasks.filter((t) => t.title.toLowerCase().includes(q) || t.clientName.toLowerCase().includes(q)).slice(0, 3)
    : [];
  const hasResults = clientResults.length > 0 || cardResults.length > 0 || taskResults.length > 0;

  return (
    <header className="h-16 border-b border-border bg-background flex items-center px-4 pl-16 lg:pl-6 lg:px-6 gap-3 lg:gap-4 shrink-0 relative z-[100]">
      {/* Breadcrumb + Welcome */}
      <div className="flex-1 flex items-center gap-2">
        <div>
          <p className="text-[10px] text-muted-foreground leading-none mb-1">Olá, {currentProfile.name}</p>
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-foreground text-sm leading-none tracking-tight">{title}</h2>
            {subtitle && (
              <>
                <ChevronRight size={12} className="text-muted-foreground" />
                <p className="text-muted-foreground text-xs">{subtitle}</p>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <div className="flex items-center gap-2 bg-card rounded-xl px-3 py-2 w-52 border border-border focus-within:border-primary transition-all">
          <Search size={13} className="text-muted-foreground shrink-0" />
          <input
            className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none w-full"
            placeholder="Buscar cliente..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="text-muted-foreground hover:text-foreground">
              <X size={12} />
            </button>
          )}
        </div>
        {hasResults && (
          <div className="absolute top-full mt-1 left-0 w-72 bg-card border border-border rounded-2xl shadow-[0_8px_40px_rgba(0,0,0,0.8)] z-[200] py-1 animate-fade-in max-h-80 overflow-y-auto">
            {clientResults.length > 0 && (
              <>
                <p className="text-[10px] text-muted-foreground uppercase tracking-[0.15em] px-3 pt-2 pb-1 font-medium">Clientes</p>
                {clientResults.map((c) => (
                  <Link key={c.id} href={`/clients/${c.id}`} onClick={() => setSearchQuery("")} className="flex items-center gap-2.5 px-3 py-2 hover:bg-primary/5 transition-colors">
                    <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">{c.name[0]}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{c.name}</p>
                      <p className="text-[10px] text-muted-foreground">{c.industry}</p>
                    </div>
                  </Link>
                ))}
              </>
            )}
            {cardResults.length > 0 && (
              <>
                <p className="text-[10px] text-muted-foreground uppercase tracking-[0.15em] px-3 pt-2 pb-1 font-medium border-t border-border mt-1">Conteudos</p>
                {cardResults.map((c) => (
                  <Link key={c.id} href="/social" onClick={() => setSearchQuery("")} className="flex items-center gap-2.5 px-3 py-2 hover:bg-primary/5 transition-colors">
                    <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">C</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{c.title}</p>
                      <p className="text-[10px] text-muted-foreground">{c.clientName} · {c.status}</p>
                    </div>
                  </Link>
                ))}
              </>
            )}
            {taskResults.length > 0 && (
              <>
                <p className="text-[10px] text-muted-foreground uppercase tracking-[0.15em] px-3 pt-2 pb-1 font-medium border-t border-border mt-1">Tarefas</p>
                {taskResults.map((t) => (
                  <Link key={t.id} href={t.role === "social" ? "/social" : t.role === "designer" ? "/design" : "/traffic"} onClick={() => setSearchQuery("")} className="flex items-center gap-2.5 px-3 py-2 hover:bg-primary/5 transition-colors">
                    <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">T</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{t.title}</p>
                      <p className="text-[10px] text-muted-foreground">{t.clientName} · {t.status}</p>
                    </div>
                  </Link>
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="relative" ref={quickRef}>
        <button
          onClick={() => { setShowQuick(!showQuick); setShowNotif(false); }}
          className="w-8 h-8 rounded-xl bg-card border border-border flex items-center justify-center hover:border-lone-border-strong transition-all group"
          title="Ações rápidas"
        >
          <Plus size={15} className="text-muted-foreground group-hover:text-primary transition-colors" />
        </button>

        {showQuick && (
          <>
          <div className="fixed inset-0 z-[199]" onClick={() => setShowQuick(false)} />
          <div className="absolute right-0 top-full mt-2 w-52 bg-card border border-border rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.6)] z-[200] py-2 animate-fade-in">
            <p className="text-[10px] text-muted-foreground uppercase tracking-[0.15em] px-3 pb-2 mb-1 border-b border-border font-medium">
              Ações Rápidas
            </p>
            <Link href="/clients" onClick={() => setShowQuick(false)} className="flex items-center gap-2.5 px-3 py-2.5 hover:bg-primary/5 transition-colors text-sm text-foreground">
              <UserPlus size={14} className="text-primary" />Novo Cliente
            </Link>
            <Link href="/social?action=new-content" onClick={() => setShowQuick(false)} className="flex items-center gap-2.5 px-3 py-2.5 hover:bg-primary/5 transition-colors text-sm text-foreground">
              <FileText size={14} className="text-primary" />Novo Conteúdo
            </Link>
            <Link href="/communications" onClick={() => setShowQuick(false)} className="flex items-center gap-2.5 px-3 py-2.5 hover:bg-primary/5 transition-colors text-sm text-foreground">
              <Smile size={14} className="text-primary" />Chat da Equipe
            </Link>
          </div>
          </>
        )}
      </div>

      {/* Notifications */}
      {/* Notification bell — badge only, opens NotificationCenter drawer via AppShell */}
      <div className="relative">
        <span className="text-[9px] text-muted-foreground tabular-nums">
          {unreadCount > 0 && `${unreadCount} novo(s)`}
        </span>
      </div>

      {/* Profile */}
      <div className="relative">
        <button
          onClick={() => setShowMenu(!showMenu)}
          className="flex items-center gap-2 bg-card border border-border rounded-xl px-2.5 py-1.5 hover:border-lone-border-strong transition-all"
        >
          <MedievalAvatar type={getUserAvatar(currentProfile.id)} size={28} />
          <ChevronDown size={12} className="text-muted-foreground" />
        </button>

        {showMenu && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
            <div className="absolute right-0 top-full mt-2 w-52 bg-card border border-border rounded-2xl shadow-[0_8px_40px_rgba(0,0,0,0.8)] z-[200] py-2 animate-fade-in">
              <div className="flex items-center gap-2.5 px-3 py-2 border-b border-border mb-1">
                <MedievalAvatar type={getUserAvatar(currentProfile.id)} size={32} glow />
                <div>
                  <p className="text-sm font-medium text-foreground leading-none">{currentProfile.name}</p>
                  <p className="text-[10px] text-primary mt-0.5 uppercase tracking-wider font-medium">{roleLabel}</p>
                </div>
              </div>
              <button
                onClick={() => {
                  if (window.confirm("Tem certeza que deseja sair da conta?")) {
                    logout();
                    setShowMenu(false);
                  }
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition-colors"
              >
                <LogIn size={14} className="rotate-180" />
                Sair da conta
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  );
}

// ── Notification Center with filters and action links ──────────────────────

const NOTIF_TYPE_CONFIG: Record<string, { label: string; color: string; route?: string }> = {
  sla: { label: "SLA", color: "text-destructive", route: "/social" },
  status: { label: "Status", color: "text-primary", route: "/clients" },
  content: { label: "Conteúdo", color: "text-primary", route: "/social" },
  checkin: { label: "Check-in", color: "text-muted-foreground" },
  system: { label: "Sistema", color: "text-muted-foreground" },
};

function NotifFilterTabs({ notifications }: { notifications: AppNotification[] }) {
  const [filter, setFilter] = useState<string>("all");
  const filtered = filter === "all" ? notifications : notifications.filter((n) => n.type === filter);
  const types = ["all", "content", "status", "sla", "system"] as const;

  return (
    <>
      <div className="flex items-center gap-1 px-3 py-2 border-b border-border overflow-x-auto">
        {types.map((t) => {
          const count = t === "all" ? notifications.length : notifications.filter((n) => n.type === t).length;
          return (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={`text-[10px] px-2.5 py-1 rounded-md whitespace-nowrap transition-colors ${
                filter === t ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-muted-foreground"
              }`}
            >
              {t === "all" ? "Todas" : NOTIF_TYPE_CONFIG[t]?.label ?? t} ({count})
            </button>
          );
        })}
      </div>
      <div className="max-h-96 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">Nenhuma notificação</p>
        ) : (
          filtered.slice(0, 30).map((notif) => {
            const cfg = NOTIF_TYPE_CONFIG[notif.type] ?? NOTIF_TYPE_CONFIG.system;
            return (
              <div
                key={notif.id}
                className={`flex items-start gap-3 px-4 py-3 border-b border-border/50 transition-colors hover:bg-primary/5 ${
                  !notif.read ? "bg-primary/[0.03]" : ""
                }`}
              >
                <div className="mt-1.5">
                  <div className={`w-1.5 h-1.5 rounded-full ${!notif.read ? "bg-primary shadow-[0_0_6px_rgba(10,52,245,0.5)]" : "bg-muted"}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-[9px] font-medium uppercase tracking-wider ${cfg.color}`}>{cfg.label}</span>
                    <span className="text-[10px] text-muted-foreground">{timeAgo(notif.createdAt)}</span>
                  </div>
                  <p className={`text-xs font-medium leading-tight mt-0.5 ${!notif.read ? "text-foreground" : "text-muted-foreground"}`}>
                    {notif.title}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{notif.body}</p>
                  {/* Action link */}
                  {(notif.clientId || cfg.route) && (
                    <div className="flex items-center gap-2 mt-1.5">
                      {notif.clientId && (
                        <Link href={`/clients/${notif.clientId}`} className="text-[10px] text-primary hover:underline flex items-center gap-0.5">
                          <ChevronRight size={10} /> Ver cliente
                        </Link>
                      )}
                      {cfg.route && (
                        <Link href={cfg.route} className="text-[10px] text-muted-foreground hover:text-muted-foreground flex items-center gap-0.5">
                          <ChevronRight size={10} /> Ir para {cfg.label}
                        </Link>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </>
  );
}
