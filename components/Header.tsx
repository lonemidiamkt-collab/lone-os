"use client";

import { Bell, ChevronDown, Plus, X, UserPlus, FileText, Smile, Search, ChevronRight, LogIn } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useRole } from "@/lib/context/RoleContext";
import MedievalAvatar, { getUserAvatar } from "@/components/MedievalAvatars";
import { useAppState } from "@/lib/context/AppStateContext";
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
  const { notifications, markNotificationRead, markAllNotificationsRead, clients, contentCards, tasks } = useAppState();
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
          <p className="text-[10px] text-zinc-600 leading-none mb-1">Olá, {currentProfile.name}</p>
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-foreground text-sm leading-none tracking-tight">{title}</h2>
            {subtitle && (
              <>
                <ChevronRight size={12} className="text-zinc-700" />
                <p className="text-zinc-500 text-xs">{subtitle}</p>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <div className="flex items-center gap-2 bg-[#0e0e0e] rounded-xl px-3 py-2 w-52 border border-[#1a1a1a] focus-within:border-[#0d4af5]/50 focus-within:shadow-[0_0_20px_rgba(10,52,245,0.1)] transition-all">
          <Search size={13} className="text-zinc-700 shrink-0" />
          <input
            className="bg-transparent text-sm text-foreground placeholder:text-zinc-700 outline-none w-full"
            placeholder="Buscar cliente..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="text-zinc-600 hover:text-foreground">
              <X size={12} />
            </button>
          )}
        </div>
        {hasResults && (
          <div className="absolute top-full mt-1 left-0 w-72 bg-[#0a0a0e] border border-white/[0.08] rounded-2xl shadow-[0_8px_40px_rgba(0,0,0,0.8)] z-[200] py-1 animate-fade-in max-h-80 overflow-y-auto">
            {clientResults.length > 0 && (
              <>
                <p className="text-[10px] text-zinc-600 uppercase tracking-[0.15em] px-3 pt-2 pb-1 font-medium">Clientes</p>
                {clientResults.map((c) => (
                  <Link key={c.id} href={`/clients/${c.id}`} onClick={() => setSearchQuery("")} className="flex items-center gap-2.5 px-3 py-2 hover:bg-[#0d4af5]/5 transition-colors">
                    <div className="w-6 h-6 rounded-lg bg-[#0d4af5]/10 flex items-center justify-center text-[10px] font-bold text-[#0d4af5]">{c.name[0]}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{c.name}</p>
                      <p className="text-[10px] text-zinc-600">{c.industry}</p>
                    </div>
                  </Link>
                ))}
              </>
            )}
            {cardResults.length > 0 && (
              <>
                <p className="text-[10px] text-zinc-600 uppercase tracking-[0.15em] px-3 pt-2 pb-1 font-medium border-t border-[#1a1a1a] mt-1">Conteudos</p>
                {cardResults.map((c) => (
                  <Link key={c.id} href="/social" onClick={() => setSearchQuery("")} className="flex items-center gap-2.5 px-3 py-2 hover:bg-[#0d4af5]/5 transition-colors">
                    <div className="w-6 h-6 rounded-lg bg-[#0d4af5]/10 flex items-center justify-center text-[10px] font-bold text-[#0d4af5]">C</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{c.title}</p>
                      <p className="text-[10px] text-zinc-600">{c.clientName} · {c.status}</p>
                    </div>
                  </Link>
                ))}
              </>
            )}
            {taskResults.length > 0 && (
              <>
                <p className="text-[10px] text-zinc-600 uppercase tracking-[0.15em] px-3 pt-2 pb-1 font-medium border-t border-[#1a1a1a] mt-1">Tarefas</p>
                {taskResults.map((t) => (
                  <Link key={t.id} href={t.role === "social" ? "/social" : t.role === "designer" ? "/design" : "/traffic"} onClick={() => setSearchQuery("")} className="flex items-center gap-2.5 px-3 py-2 hover:bg-[#0d4af5]/5 transition-colors">
                    <div className="w-6 h-6 rounded-lg bg-[#0d4af5]/10 flex items-center justify-center text-[10px] font-bold text-[#0d4af5]">T</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{t.title}</p>
                      <p className="text-[10px] text-zinc-600">{t.clientName} · {t.status}</p>
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
          className="w-8 h-8 rounded-xl bg-[#0e0e0e] border border-zinc-800 flex items-center justify-center hover:border-zinc-600 transition-all group"
          title="Ações rápidas"
        >
          <Plus size={15} className="text-zinc-600 group-hover:text-[#0d4af5] transition-colors" />
        </button>

        {showQuick && (
          <>
          <div className="fixed inset-0 z-[199]" onClick={() => setShowQuick(false)} />
          <div className="absolute right-0 top-full mt-2 w-52 bg-[#111113] border border-white/[0.08] rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.6)] z-[200] py-2 animate-fade-in">
            <p className="text-[10px] text-zinc-600 uppercase tracking-[0.15em] px-3 pb-2 mb-1 border-b border-[#1a1a1a] font-medium">
              Ações Rápidas
            </p>
            <Link href="/clients" onClick={() => setShowQuick(false)} className="flex items-center gap-2.5 px-3 py-2.5 hover:bg-[#0d4af5]/5 transition-colors text-sm text-foreground">
              <UserPlus size={14} className="text-[#0d4af5]" />Novo Cliente
            </Link>
            <Link href="/social" onClick={() => setShowQuick(false)} className="flex items-center gap-2.5 px-3 py-2.5 hover:bg-[#0d4af5]/5 transition-colors text-sm text-foreground">
              <FileText size={14} className="text-[#0d4af5]" />Novo Conteúdo
            </Link>
            <Link href="/communications" onClick={() => setShowQuick(false)} className="flex items-center gap-2.5 px-3 py-2.5 hover:bg-[#0d4af5]/5 transition-colors text-sm text-foreground">
              <Smile size={14} className="text-[#0d4af5]" />Chat da Equipe
            </Link>
          </div>
          </>
        )}
      </div>

      {/* Notifications */}
      {/* Notification bell — badge only, opens NotificationCenter drawer via AppShell */}
      <div className="relative">
        <span className="text-[9px] text-zinc-700 tabular-nums">
          {unreadCount > 0 && `${unreadCount} novo(s)`}
        </span>
      </div>

      {/* Profile */}
      <div className="relative">
        <button
          onClick={() => setShowMenu(!showMenu)}
          className="flex items-center gap-2 bg-[#0e0e0e] border border-[#1a1a1a] rounded-xl px-2.5 py-1.5 hover:border-zinc-600 transition-all"
        >
          <MedievalAvatar type={getUserAvatar(currentProfile.id)} size={28} />
          <ChevronDown size={12} className="text-zinc-700" />
        </button>

        {showMenu && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
            <div className="absolute right-0 top-full mt-2 w-52 bg-[#0a0a0e] border border-white/[0.08] rounded-2xl shadow-[0_8px_40px_rgba(0,0,0,0.8)] z-[200] py-2 animate-fade-in">
              <div className="flex items-center gap-2.5 px-3 py-2 border-b border-[#1a1a1a] mb-1">
                <MedievalAvatar type={getUserAvatar(currentProfile.id)} size={32} glow />
                <div>
                  <p className="text-sm font-medium text-foreground leading-none">{currentProfile.name}</p>
                  <p className="text-[10px] text-[#0d4af5] mt-0.5 uppercase tracking-wider font-medium">{roleLabel}</p>
                </div>
              </div>
              <button
                onClick={() => {
                  if (window.confirm("Tem certeza que deseja sair da conta?")) {
                    logout();
                    setShowMenu(false);
                  }
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-600 hover:text-red-400 hover:bg-red-500/5 transition-colors"
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
  sla: { label: "SLA", color: "text-red-400", route: "/social" },
  status: { label: "Status", color: "text-[#3b6ff5]", route: "/clients" },
  content: { label: "Conteúdo", color: "text-primary", route: "/social" },
  checkin: { label: "Check-in", color: "text-zinc-400" },
  system: { label: "Sistema", color: "text-zinc-500" },
};

function NotifFilterTabs({ notifications }: { notifications: AppNotification[] }) {
  const [filter, setFilter] = useState<string>("all");
  const filtered = filter === "all" ? notifications : notifications.filter((n) => n.type === filter);
  const types = ["all", "content", "status", "sla", "system"] as const;

  return (
    <>
      <div className="flex items-center gap-1 px-3 py-2 border-b border-[#1a1a1a] overflow-x-auto">
        {types.map((t) => {
          const count = t === "all" ? notifications.length : notifications.filter((n) => n.type === t).length;
          return (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={`text-[10px] px-2.5 py-1 rounded-md whitespace-nowrap transition-colors ${
                filter === t ? "bg-[#0d4af5]/15 text-[#0d4af5]" : "text-zinc-600 hover:text-zinc-400"
              }`}
            >
              {t === "all" ? "Todas" : NOTIF_TYPE_CONFIG[t]?.label ?? t} ({count})
            </button>
          );
        })}
      </div>
      <div className="max-h-96 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="text-sm text-zinc-700 text-center py-8">Nenhuma notificação</p>
        ) : (
          filtered.slice(0, 30).map((notif) => {
            const cfg = NOTIF_TYPE_CONFIG[notif.type] ?? NOTIF_TYPE_CONFIG.system;
            return (
              <div
                key={notif.id}
                className={`flex items-start gap-3 px-4 py-3 border-b border-[#1a1a1a]/50 transition-colors hover:bg-[#0d4af5]/5 ${
                  !notif.read ? "bg-[#0d4af5]/[0.03]" : ""
                }`}
              >
                <div className="mt-1.5">
                  <div className={`w-1.5 h-1.5 rounded-full ${!notif.read ? "bg-[#0d4af5] shadow-[0_0_6px_rgba(10,52,245,0.5)]" : "bg-zinc-800"}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-[9px] font-medium uppercase tracking-wider ${cfg.color}`}>{cfg.label}</span>
                    <span className="text-[10px] text-zinc-700">{timeAgo(notif.createdAt)}</span>
                  </div>
                  <p className={`text-xs font-medium leading-tight mt-0.5 ${!notif.read ? "text-foreground" : "text-zinc-500"}`}>
                    {notif.title}
                  </p>
                  <p className="text-[11px] text-zinc-600 mt-0.5 leading-snug">{notif.body}</p>
                  {/* Action link */}
                  {(notif.clientId || cfg.route) && (
                    <div className="flex items-center gap-2 mt-1.5">
                      {notif.clientId && (
                        <Link href={`/clients/${notif.clientId}`} className="text-[10px] text-[#0d4af5] hover:underline flex items-center gap-0.5">
                          <ChevronRight size={10} /> Ver cliente
                        </Link>
                      )}
                      {cfg.route && (
                        <Link href={cfg.route} className="text-[10px] text-zinc-500 hover:text-zinc-300 flex items-center gap-0.5">
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
