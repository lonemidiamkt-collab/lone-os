"use client";

import { useState } from "react";
import { Bell, X, CheckCheck, AlertTriangle, Activity, FileText, Settings, Clock, Trash2 } from "lucide-react";
import { useAppState } from "@/lib/context/AppStateContext";

const TYPE_CONFIG: Record<string, { icon: typeof Bell; color: string; bg: string }> = {
  sla:     { icon: AlertTriangle, color: "text-red-400",   bg: "bg-red-500/[0.08]" },
  status:  { icon: Activity,      color: "text-[#3b6ff5]", bg: "bg-[#0d4af5]/[0.08]" },
  content: { icon: FileText,      color: "text-[#0d4af5]", bg: "bg-[#0d4af5]/[0.08]" },
  checkin: { icon: Clock,         color: "text-[#0d4af5]", bg: "bg-[#0d4af5]/[0.08]" },
  system:  { icon: Settings,      color: "text-zinc-400",  bg: "bg-white/[0.03]" },
};

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "agora";
  if (diff < 3600) return `${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

export default function NotificationCenter() {
  const { notifications, markNotificationRead, markAllNotificationsRead } = useAppState();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "unread">("all");

  const unreadCount = notifications.filter((n) => !n.read).length;
  const filtered = filter === "unread" ? notifications.filter((n) => !n.read) : notifications;

  return (
    <>
      {/* Bell trigger */}
      <button
        onClick={() => setOpen(!open)}
        className="relative w-9 h-9 rounded-xl flex items-center justify-center text-zinc-500 hover:text-foreground hover:bg-white/[0.04] transition-all"
        title="Notificacoes"
      >
        <Bell size={17} strokeWidth={1.8} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-[#0d4af5] text-[9px] font-bold text-white flex items-center justify-center shadow-[0_0_6px_rgba(13,74,245,0.5)] animate-pulse">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Drawer */}
      {open && (
        <>
          <div className="fixed inset-0 z-[150]" onClick={() => setOpen(false)} />
          <div
            className="fixed top-0 right-0 bottom-0 z-[151] w-[380px] max-w-[90vw] flex flex-col animate-slide-in-right"
            style={{
              background: "rgba(0, 0, 0, 0.92)",
              backdropFilter: "blur(24px)",
              WebkitBackdropFilter: "blur(24px)",
              borderLeft: "0.5px solid rgba(255,255,255,0.04)",
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.04]">
              <div className="flex items-center gap-2.5">
                <Bell size={15} className="text-[#0d4af5]" />
                <h2 className="text-sm font-semibold text-foreground">Notificacoes</h2>
                {unreadCount > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-[#0d4af5]/10 text-[#0d4af5] font-bold tabular-nums">
                    {unreadCount}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {unreadCount > 0 && (
                  <button onClick={markAllNotificationsRead}
                    className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg text-zinc-500 hover:text-[#0d4af5] hover:bg-[#0d4af5]/[0.05] transition-all"
                    title="Marcar todas como lidas">
                    <CheckCheck size={12} /> Lidas
                  </button>
                )}
                <button onClick={() => setOpen(false)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-zinc-600 hover:text-foreground hover:bg-white/[0.04] transition-all">
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* Filter tabs */}
            <div className="flex gap-1 px-5 py-2.5 border-b border-white/[0.04]">
              {(["all", "unread"] as const).map((f) => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`text-[11px] px-3 py-1.5 rounded-lg font-medium transition-all ${
                    filter === f
                      ? "bg-white/[0.06] text-foreground"
                      : "text-zinc-600 hover:text-zinc-400"
                  }`}>
                  {f === "all" ? "Todas" : `Nao lidas (${unreadCount})`}
                </button>
              ))}
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center px-6">
                  <div className="w-12 h-12 rounded-2xl bg-white/[0.03] flex items-center justify-center mb-3">
                    <Bell size={20} strokeWidth={1.2} className="text-zinc-800" />
                  </div>
                  <p className="text-xs text-zinc-600">
                    {filter === "unread" ? "Nenhuma notificacao nao lida" : "Nenhuma notificacao"}
                  </p>
                  <p className="text-[10px] text-zinc-700 mt-0.5">Tudo sob controle.</p>
                </div>
              ) : (
                <div className="py-1">
                  {filtered.slice(0, 50).map((notif) => {
                    const config = TYPE_CONFIG[notif.type] ?? TYPE_CONFIG.system;
                    const Icon = config.icon;
                    return (
                      <button
                        key={notif.id}
                        onClick={() => { if (!notif.read) markNotificationRead(notif.id); }}
                        className={`w-full text-left px-5 py-3 transition-all hover:bg-white/[0.02] ${
                          !notif.read ? "bg-[#0d4af5]/[0.015]" : ""
                        }`}
                      >
                        <div className="flex gap-3">
                          <div className={`w-7 h-7 rounded-lg ${config.bg} flex items-center justify-center shrink-0 mt-0.5`}>
                            <Icon size={13} className={config.color} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <p className={`text-[12px] font-medium leading-tight truncate ${!notif.read ? "text-foreground" : "text-zinc-500"}`}>
                                {notif.title}
                              </p>
                              {!notif.read && (
                                <span className="w-1.5 h-1.5 rounded-full bg-[#0d4af5] shrink-0 shadow-[0_0_4px_rgba(13,74,245,0.5)]" />
                              )}
                            </div>
                            <p className="text-[11px] text-zinc-600 leading-snug line-clamp-2">{notif.body}</p>
                            <p className="text-[10px] text-zinc-700 mt-1 tabular-nums">{timeAgo(notif.createdAt)}</p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            {notifications.length > 0 && (
              <div className="px-5 py-3 border-t border-white/[0.04]">
                <p className="text-[10px] text-zinc-700 text-center">
                  {notifications.length} notificacao(es) total
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
