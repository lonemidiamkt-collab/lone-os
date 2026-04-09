"use client";

import { useState } from "react";
import { Bell, X, Check, CheckCheck, AlertTriangle, Activity, FileText, Settings, Clock } from "lucide-react";
import { useAppState } from "@/lib/context/AppStateContext";
import type { AppNotification } from "@/lib/types";

const TYPE_CONFIG: Record<string, { icon: typeof Bell; color: string; bg: string }> = {
  sla:     { icon: AlertTriangle, color: "text-red-400",    bg: "bg-red-500/10" },
  status:  { icon: Activity,      color: "text-[#3b6ff5]",  bg: "bg-[#0a34f5]/10" },
  content: { icon: FileText,      color: "text-[#0a34f5]",  bg: "bg-[#0a34f5]/10" },
  checkin: { icon: Clock,         color: "text-[#0a34f5]",  bg: "bg-[#0a34f5]/10" },
  system:  { icon: Settings,      color: "text-zinc-400",   bg: "bg-zinc-500/10" },
};

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "agora";
  if (diff < 3600) return `${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

export default function NotificationCenter() {
  const { notifications, markNotificationRead } = useAppState();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "unread">("all");

  const unreadCount = notifications.filter((n) => !n.read).length;
  const filtered = filter === "unread" ? notifications.filter((n) => !n.read) : notifications;

  const markAllRead = () => {
    notifications.filter((n) => !n.read).forEach((n) => markNotificationRead(n.id));
  };

  return (
    <>
      {/* Bell trigger */}
      <button
        onClick={() => setOpen(!open)}
        className="relative w-9 h-9 rounded-xl flex items-center justify-center text-zinc-500 hover:text-foreground hover:bg-white/5 transition-all"
        title="Notificações"
      >
        <Bell size={17} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4.5 h-4.5 min-w-[18px] px-1 rounded-full bg-[#0a34f5] text-[9px] font-bold text-white flex items-center justify-center shadow-[0_0_8px_rgba(10,52,245,0.6)]">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Drawer */}
      {open && (
        <>
          <div className="fixed inset-0 z-[150]" onClick={() => setOpen(false)} />
          <div className="fixed top-0 right-0 bottom-0 z-[151] w-[380px] max-w-[90vw] bg-black border-l border-[#1a1a1a] shadow-[0_0_60px_rgba(0,0,0,0.8)] animate-slide-in-right flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#1a1a1a]">
              <div className="flex items-center gap-2">
                <Bell size={16} className="text-[#0a34f5]" />
                <h2 className="text-sm font-bold text-foreground">Notificações</h2>
                {unreadCount > 0 && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#0a34f5]/15 text-[#0a34f5] border border-[#0a34f5]/20 font-bold">
                    {unreadCount}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {unreadCount > 0 && (
                  <button
                    onClick={markAllRead}
                    className="text-[10px] px-2 py-1 rounded-lg text-[#0a34f5] hover:bg-[#0a34f5]/10 transition-all"
                    title="Marcar todas como lidas"
                  >
                    <CheckCheck size={14} />
                  </button>
                )}
                <button
                  onClick={() => setOpen(false)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-zinc-600 hover:text-foreground hover:bg-white/5 transition-all"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* Filter tabs */}
            <div className="flex gap-1 px-5 py-2 border-b border-[#1a1a1a]">
              {(["all", "unread"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`text-[11px] px-3 py-1 rounded-lg font-medium transition-all ${
                    filter === f
                      ? "bg-white/5 text-foreground border border-white/10"
                      : "text-zinc-600 hover:text-zinc-400"
                  }`}
                >
                  {f === "all" ? "Todas" : `Não lidas (${unreadCount})`}
                </button>
              ))}
            </div>

            {/* Notification list */}
            <div className="flex-1 overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center px-6">
                  <Bell size={32} className="text-zinc-800 mb-3" />
                  <p className="text-sm text-zinc-600">
                    {filter === "unread" ? "Nenhuma notificação não lida" : "Nenhuma notificação"}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-[#111]">
                  {filtered.slice(0, 50).map((notif) => {
                    const config = TYPE_CONFIG[notif.type] ?? TYPE_CONFIG.system;
                    const Icon = config.icon;
                    return (
                      <button
                        key={notif.id}
                        onClick={() => { if (!notif.read) markNotificationRead(notif.id); }}
                        className={`w-full text-left px-5 py-3.5 transition-all hover:bg-white/[0.02] ${
                          !notif.read ? "bg-[#0a34f5]/[0.02]" : ""
                        }`}
                      >
                        <div className="flex gap-3">
                          <div className={`w-8 h-8 rounded-lg ${config.bg} flex items-center justify-center shrink-0 mt-0.5`}>
                            <Icon size={14} className={config.color} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <p className={`text-xs font-medium leading-tight ${!notif.read ? "text-foreground" : "text-zinc-500"}`}>
                                {notif.title}
                              </p>
                              {!notif.read && (
                                <span className="w-1.5 h-1.5 rounded-full bg-[#0a34f5] shrink-0 shadow-[0_0_4px_rgba(10,52,245,0.6)]" />
                              )}
                            </div>
                            <p className="text-[11px] text-zinc-600 leading-snug line-clamp-2">{notif.body}</p>
                            <p className="text-[10px] text-zinc-700 mt-1">{timeAgo(notif.createdAt)}</p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
