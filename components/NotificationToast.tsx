"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useAppState } from "@/lib/context/AppStateContext";
import { X, Bell, AlertTriangle, FileText, Activity, Settings, CheckCircle, Zap } from "lucide-react";
import type { AppNotification } from "@/lib/types";

const TYPE_CONFIG: Record<string, { icon: typeof Bell; color: string; accent: string }> = {
  sla:     { icon: AlertTriangle, color: "text-red-400",    accent: "border-l-red-500" },
  status:  { icon: Activity,      color: "text-[#3b6ff5]",  accent: "border-l-[#0d4af5]" },
  content: { icon: FileText,      color: "text-[#0d4af5]",  accent: "border-l-[#0d4af5]" },
  checkin: { icon: Bell,          color: "text-[#0d4af5]",  accent: "border-l-[#0d4af5]" },
  system:  { icon: Settings,      color: "text-zinc-400",   accent: "border-l-zinc-600" },
};

const CRITICAL_TYPES = new Set(["sla"]);

interface ToastItem {
  id: string;
  title: string;
  body: string;
  type: string;
  count: number;
  dismissing: boolean;
  isCritical: boolean;
  timestamp: number;
}

// Play premium ping for critical notifications only
function playPremiumPing() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(1320, ctx.currentTime + 0.06);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.2);
    osc.onended = () => ctx.close();
  } catch {}
}

export default function NotificationToast() {
  const { notifications, markNotificationRead } = useAppState();
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const seenRef = useRef<Set<string>>(new Set());
  const initialLoadRef = useRef(true);

  // Mark existing notifications as seen on first render
  useEffect(() => {
    if (initialLoadRef.current) {
      notifications.forEach((n) => seenRef.current.add(n.id));
      initialLoadRef.current = false;
    }
  }, [notifications]);

  // Watch for new notifications — GROUP by type
  useEffect(() => {
    if (initialLoadRef.current) return;

    const newOnes = notifications.filter((n) => !n.read && !seenRef.current.has(n.id));
    if (newOnes.length === 0) return;

    newOnes.forEach((n) => seenRef.current.add(n.id));

    // Group by type — if multiple of same type arrive together, merge
    const grouped = new Map<string, AppNotification[]>();
    newOnes.forEach((n) => {
      const key = n.type;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(n);
    });

    const newToasts: ToastItem[] = [];
    grouped.forEach((items, type) => {
      const isCritical = CRITICAL_TYPES.has(type) || items.some((i) => i.title.includes("[Urgente]") || i.title.includes("[Auto]"));

      if (items.length === 1) {
        newToasts.push({
          id: items[0].id,
          title: items[0].title,
          body: items[0].body,
          type,
          count: 1,
          dismissing: false,
          isCritical,
          timestamp: Date.now(),
        });
      } else {
        // Grouped notification
        newToasts.push({
          id: `group-${type}-${Date.now()}`,
          title: `${items.length} novas notificacoes`,
          body: items.map((i) => i.title).slice(0, 3).join(" · ") + (items.length > 3 ? ` +${items.length - 3}` : ""),
          type,
          count: items.length,
          dismissing: false,
          isCritical,
          timestamp: Date.now(),
        });
      }
    });

    // Play sound only for critical
    if (newToasts.some((t) => t.isCritical)) {
      playPremiumPing();
    }

    setToasts((prev) => [...newToasts, ...prev].slice(0, 4));
  }, [notifications]);

  // Auto-dismiss: 4s for normal, critical stays until clicked
  useEffect(() => {
    if (toasts.length === 0) return;

    const timer = setInterval(() => {
      const now = Date.now();
      setToasts((prev) => {
        const updated = prev.map((t) => {
          if (t.dismissing) return t;
          const age = now - t.timestamp;
          // Auto-dismiss non-critical after 4s
          if (!t.isCritical && age > 4000) return { ...t, dismissing: true };
          return t;
        });
        return updated;
      });
    }, 500);

    return () => clearInterval(timer);
  }, [toasts.length]);

  // Remove dismissed toasts after animation
  useEffect(() => {
    const dismissing = toasts.filter((t) => t.dismissing);
    if (dismissing.length === 0) return;
    const timer = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => !t.dismissing));
    }, 300);
    return () => clearTimeout(timer);
  }, [toasts]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.map((t) => t.id === id ? { ...t, dismissing: true } : t));
    // Mark as read if it's a real notification ID
    if (!id.startsWith("group-")) markNotificationRead(id);
  }, [markNotificationRead]);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col-reverse gap-2 pointer-events-none" style={{ maxWidth: 360 }}>
      {toasts.map((toast, i) => {
        const config = TYPE_CONFIG[toast.type] ?? TYPE_CONFIG.system;
        const Icon = toast.count > 1 ? Zap : config.icon;

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-3 p-4 rounded-xl border-l-2 ${config.accent} transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
              toast.dismissing
                ? "opacity-0 translate-x-12 scale-95"
                : "opacity-100 translate-x-0 scale-100 animate-slide-up"
            }`}
            style={{
              transitionDelay: `${i * 50}ms`,
              background: "rgba(0, 0, 0, 0.85)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              border: "0.5px solid rgba(255,255,255,0.06)",
              borderLeftWidth: "2px",
            }}
          >
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
              toast.isCritical ? "bg-red-500/10" : "bg-white/[0.04]"
            }`}>
              <Icon size={14} className={toast.isCritical ? "text-red-400" : config.color} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-semibold text-foreground leading-tight">
                {toast.title}
                {toast.count > 1 && (
                  <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-white/[0.06] text-zinc-400 font-medium">
                    {toast.count}x
                  </span>
                )}
              </p>
              <p className="text-[11px] text-zinc-500 mt-0.5 leading-snug line-clamp-2">{toast.body}</p>
            </div>
            <button
              onClick={() => dismiss(toast.id)}
              className="text-zinc-700 hover:text-foreground transition-colors p-0.5 shrink-0"
            >
              <X size={12} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
