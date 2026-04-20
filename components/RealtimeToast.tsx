"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import { X, Bell, ExternalLink } from "lucide-react";
import Link from "next/link";

interface ToastItem {
  id: string;
  type: string;
  title: string;
  body: string;
  clientId?: string;
  createdAt: string;
}

export default function RealtimeToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const lastCheckRef = useRef<string>(new Date().toISOString());

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    // Poll for new notifications every 15 seconds
    const interval = setInterval(async () => {
      const { data } = await supabase
        .from("notifications")
        .select("id, type, title, body, client_id, created_at")
        .eq("read", false)
        .gt("created_at", lastCheckRef.current)
        .order("created_at", { ascending: false })
        .limit(3);

      if (data && data.length > 0) {
        lastCheckRef.current = new Date().toISOString();
        const newToasts: ToastItem[] = data.map((n) => ({
          id: n.id as string,
          type: n.type as string,
          title: n.title as string,
          body: (n.body as string) ?? "",
          clientId: (n.client_id as string) ?? undefined,
          createdAt: n.created_at as string,
        }));
        setToasts((prev) => [...newToasts, ...prev].slice(0, 5));

        // Auto-dismiss after 8 seconds
        for (const t of newToasts) {
          setTimeout(() => dismissToast(t.id), 8000);
        }
      }
    }, 15000);

    return () => clearInterval(interval);
  }, [dismissToast]);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[999] space-y-2 max-w-sm">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="bg-[#121214] border border-[#1e1e2a] rounded-xl p-4 shadow-2xl animate-slide-up"
        >
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#0d4af5]/10 flex items-center justify-center shrink-0 mt-0.5">
              <Bell size={14} className="text-[#0d4af5]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-foreground">{toast.title}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{toast.body}</p>
              {toast.clientId && (
                <Link
                  href={`/clients/${toast.clientId}`}
                  onClick={() => dismissToast(toast.id)}
                  className="text-[10px] text-[#0d4af5] hover:underline mt-1.5 flex items-center gap-1"
                >
                  Ver agora <ExternalLink size={8} />
                </Link>
              )}
            </div>
            <button onClick={() => dismissToast(toast.id)} className="text-zinc-600 hover:text-zinc-400 shrink-0">
              <X size={14} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
