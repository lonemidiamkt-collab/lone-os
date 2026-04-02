"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useAppState } from "@/lib/context/AppStateContext";
import { X, Bell, AlertTriangle, FileText, Activity, Settings } from "lucide-react";
import type { AppNotification } from "@/lib/types";
import { playNotificationSound } from "@/components/ScheduledNoticePopup";

const TYPE_CONFIG: Record<string, { icon: typeof Bell; color: string; bg: string; border: string }> = {
  sla:     { icon: AlertTriangle, color: "text-red-500",    bg: "bg-red-500/10",    border: "border-red-500/30" },
  status:  { icon: Activity,      color: "text-[#3b6ff5]", bg: "bg-[#0a34f5]/10", border: "border-yellow-500/30" },
  content: { icon: FileText,      color: "text-primary",    bg: "bg-primary/10",    border: "border-primary/30" },
  checkin: { icon: Bell,           color: "text-[#0a34f5]",   bg: "bg-[#0a34f5]/10",   border: "border-[#0a34f5]/20" },
  system:  { icon: Settings,      color: "text-zinc-400",   bg: "bg-[#111118]",      border: "border-[#1e1e2a]" },
};

interface ToastItem {
  notification: AppNotification;
  dismissing: boolean;
}

export default function NotificationToast() {
  const { notifications, markNotificationRead } = useAppState();
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const seenRef = useRef<Set<string>>(new Set());
  const initialLoadRef = useRef(true);

  // On first render, mark all existing notifications as "seen" so they don't popup
  useEffect(() => {
    if (initialLoadRef.current) {
      notifications.forEach((n) => seenRef.current.add(n.id));
      initialLoadRef.current = false;
    }
  }, [notifications]);

  // Watch for new notifications
  useEffect(() => {
    if (initialLoadRef.current) return;

    const newOnes = notifications.filter((n) => !n.read && !seenRef.current.has(n.id));
    if (newOnes.length === 0) return;

    newOnes.forEach((n) => seenRef.current.add(n.id));

    // Play sound for new notifications
    playNotificationSound();

    setToasts((prev) => [
      ...newOnes.map((n) => ({ notification: n, dismissing: false })),
      ...prev,
    ].slice(0, 5)); // max 5 visible toasts
  }, [notifications]);

  // Auto-dismiss after 6 seconds
  useEffect(() => {
    if (toasts.length === 0) return;

    const timer = setTimeout(() => {
      setToasts((prev) => {
        if (prev.length === 0) return prev;
        // Start dismissing the oldest toast
        const oldest = prev[prev.length - 1];
        if (oldest.dismissing) {
          return prev.slice(0, -1); // remove it
        }
        return prev.map((t, i) =>
          i === prev.length - 1 ? { ...t, dismissing: true } : t
        );
      });
    }, 5000);

    return () => clearTimeout(timer);
  }, [toasts]);

  // Remove dismissing toasts after animation
  useEffect(() => {
    const dismissing = toasts.filter((t) => t.dismissing);
    if (dismissing.length === 0) return;

    const timer = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => !t.dismissing));
    }, 300);

    return () => clearTimeout(timer);
  }, [toasts]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) =>
      prev.map((t) => t.notification.id === id ? { ...t, dismissing: true } : t)
    );
    markNotificationRead(id);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.notification.id !== id));
    }, 300);
  }, [markNotificationRead]);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none" style={{ maxWidth: 380 }}>
      {toasts.map((toast) => {
        const config = TYPE_CONFIG[toast.notification.type] ?? TYPE_CONFIG.system;
        const Icon = config.icon;

        return (
          <div
            key={toast.notification.id}
            className={`pointer-events-auto flex items-start gap-3 p-4 rounded-xl border shadow-2xl backdrop-blur-md transition-all duration-300 ${config.bg} ${config.border} ${
              toast.dismissing
                ? "opacity-0 translate-x-8 scale-95"
                : "opacity-100 translate-x-0 scale-100 animate-slide-in-right"
            }`}
            style={{ backgroundColor: "var(--card, #1A1A24)" }}
          >
            <div className={`w-8 h-8 rounded-lg ${config.bg} flex items-center justify-center shrink-0`}>
              <Icon size={16} className={config.color} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground leading-tight">
                {toast.notification.title}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-snug line-clamp-2">
                {toast.notification.body}
              </p>
            </div>
            <button
              onClick={() => dismiss(toast.notification.id)}
              className="text-muted-foreground hover:text-foreground transition-colors p-0.5 shrink-0"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
