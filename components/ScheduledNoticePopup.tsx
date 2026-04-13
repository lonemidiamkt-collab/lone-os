"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useAppState } from "@/lib/context/AppStateContext";
import { X, Bell, Calendar, Clock, Megaphone, AlertTriangle } from "lucide-react";
import type { Notice } from "@/lib/types";

const CATEGORY_CONFIG: Record<string, { icon: typeof Bell; color: string; bg: string; label: string }> = {
  general:  { icon: Megaphone,      color: "text-[#0d4af5]", bg: "bg-[#0d4af5]/10", label: "Aviso" },
  meeting:  { icon: Calendar,       color: "text-[#0d4af5]",  bg: "bg-[#0d4af5]/10",  label: "Reunião" },
  deadline: { icon: AlertTriangle,  color: "text-red-500",   bg: "bg-red-500/10",   label: "Prazo" },
  reminder: { icon: Clock,          color: "text-[#3b6ff5]", bg: "bg-[#0d4af5]/10", label: "Lembrete" },
};

// Plays a notification sound using Web Audio API (no external file needed)
function playNotificationSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();

    // First tone — higher pitch
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(880, ctx.currentTime);
    osc1.frequency.setValueAtTime(1100, ctx.currentTime + 0.1);
    gain1.gain.setValueAtTime(0.15, ctx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(ctx.currentTime);
    osc1.stop(ctx.currentTime + 0.3);

    // Second tone — pleasant resolution
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(1320, ctx.currentTime + 0.15);
    gain2.gain.setValueAtTime(0.12, ctx.currentTime + 0.15);
    gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(ctx.currentTime + 0.15);
    osc2.stop(ctx.currentTime + 0.5);

    // Cleanup
    setTimeout(() => ctx.close(), 600);
  } catch {
    // Audio not available — silently fail
  }
}

interface PopupNotice {
  notice: Notice;
  dismissing: boolean;
}

export default function ScheduledNoticePopup() {
  const { notices } = useAppState();
  const [popups, setPopups] = useState<PopupNotice[]>([]);
  const triggeredRef = useRef<Set<string>>(new Set());
  const initialLoadRef = useRef(true);

  // Mark all existing notices as "already triggered" on first load
  useEffect(() => {
    if (initialLoadRef.current) {
      notices.forEach((n) => {
        if (n.scheduledAt) triggeredRef.current.add(n.id);
      });
      initialLoadRef.current = false;
    }
  }, [notices]);

  // Check scheduled notices every 30 seconds
  useEffect(() => {
    const checkScheduled = () => {
      if (initialLoadRef.current) return;

      const now = new Date();
      const MINUTES_BEFORE = 5; // Trigger 5 minutes before scheduled time

      notices.forEach((notice) => {
        if (!notice.scheduledAt || triggeredRef.current.has(notice.id)) return;

        const scheduledTime = new Date(notice.scheduledAt);
        const diffMinutes = (scheduledTime.getTime() - now.getTime()) / 60000;

        // Trigger if within 5 minutes before OR up to 1 minute after
        if (diffMinutes <= MINUTES_BEFORE && diffMinutes >= -1) {
          triggeredRef.current.add(notice.id);
          playNotificationSound();
          setPopups((prev) => [{ notice, dismissing: false }, ...prev].slice(0, 3));
        }
      });
    };

    // Check immediately
    checkScheduled();

    // Then check every 30 seconds
    const interval = setInterval(checkScheduled, 30000);
    return () => clearInterval(interval);
  }, [notices]);

  // Also play sound for new non-scheduled urgent notices
  useEffect(() => {
    if (initialLoadRef.current) return;

    notices.forEach((notice) => {
      if (triggeredRef.current.has(notice.id)) return;
      triggeredRef.current.add(notice.id);

      if (notice.urgent) {
        playNotificationSound();
        setPopups((prev) => [{ notice, dismissing: false }, ...prev].slice(0, 3));
      }
    });
  }, [notices]);

  // Auto-dismiss after 10 seconds
  useEffect(() => {
    if (popups.length === 0) return;

    const timer = setTimeout(() => {
      setPopups((prev) => {
        if (prev.length === 0) return prev;
        const oldest = prev[prev.length - 1];
        if (oldest.dismissing) {
          return prev.slice(0, -1);
        }
        return prev.map((p, i) =>
          i === prev.length - 1 ? { ...p, dismissing: true } : p
        );
      });
    }, 10000);

    return () => clearTimeout(timer);
  }, [popups]);

  // Remove after animation
  useEffect(() => {
    const dismissing = popups.filter((p) => p.dismissing);
    if (dismissing.length === 0) return;
    const timer = setTimeout(() => {
      setPopups((prev) => prev.filter((p) => !p.dismissing));
    }, 300);
    return () => clearTimeout(timer);
  }, [popups]);

  const dismiss = useCallback((id: string) => {
    setPopups((prev) =>
      prev.map((p) => (p.notice.id === id ? { ...p, dismissing: true } : p))
    );
    setTimeout(() => {
      setPopups((prev) => prev.filter((p) => p.notice.id !== id));
    }, 300);
  }, []);

  if (popups.length === 0) return null;

  return (
    <div className="fixed top-20 right-4 z-[110] flex flex-col gap-3 pointer-events-none" style={{ maxWidth: 420 }}>
      {popups.map((popup) => {
        const config = CATEGORY_CONFIG[popup.notice.category ?? "general"] ?? CATEGORY_CONFIG.general;
        const Icon = config.icon;
        const scheduledTime = popup.notice.scheduledAt
          ? new Date(popup.notice.scheduledAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
          : null;

        return (
          <div
            key={popup.notice.id}
            className={`pointer-events-auto flex items-start gap-3 p-4 rounded-2xl border shadow-2xl backdrop-blur-xl transition-all duration-300 ${
              popup.notice.urgent
                ? "bg-red-500/10 border-red-500/30"
                : "bg-card/95 border-border/50"
            } ${
              popup.dismissing
                ? "opacity-0 translate-x-8 scale-95"
                : "opacity-100 translate-x-0 scale-100 animate-slide-in-right"
            }`}
          >
            {/* Pulsing icon */}
            <div className={`w-10 h-10 rounded-xl ${config.bg} flex items-center justify-center shrink-0 relative`}>
              <Icon size={18} className={config.color} />
              <div className={`absolute -top-1 -right-1 w-3 h-3 rounded-full bg-[#0d4af5] animate-pulse`} />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className={`text-[10px] uppercase tracking-wider font-bold ${config.color}`}>
                  {config.label}
                </span>
                {scheduledTime && (
                  <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                    {scheduledTime}
                  </span>
                )}
              </div>
              <p className="text-sm font-semibold text-foreground leading-tight">
                {popup.notice.title}
              </p>
              {popup.notice.body && (
                <p className="text-xs text-muted-foreground mt-1 leading-snug line-clamp-2">
                  {popup.notice.body}
                </p>
              )}
              <p className="text-[10px] text-muted-foreground/50 mt-1.5">
                por {popup.notice.createdBy}
              </p>
            </div>

            <button
              onClick={() => dismiss(popup.notice.id)}
              className="text-muted-foreground hover:text-foreground transition-colors p-1 shrink-0"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

// Export the sound function so other components can use it
export { playNotificationSound };
