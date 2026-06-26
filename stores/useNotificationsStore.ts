import { create } from "zustand";
import { devtools, subscribeWithSelector } from "zustand/middleware";
import type { AppNotification, NotificationType } from "@/lib/types";
import { authedFetch } from "@/lib/supabase/authed-fetch";
import { supabase, REALTIME_ENABLED } from "@/lib/supabase/client";

interface NotificationsState {
  notifications: AppNotification[];
  initialized: boolean;

  init: () => Promise<void>;
  subscribeRealtime: () => () => void;

  push: (type: NotificationType, title: string, body: string, clientId?: string) => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
}

export const selectNotifications = (s: NotificationsState) => s.notifications;
export const selectUnreadCount = (s: NotificationsState) =>
  s.notifications.filter((n) => !n.read).length;
export const selectUnreadNotifications = (s: NotificationsState) =>
  s.notifications.filter((n) => !n.read);

export const useNotificationsStore = create<NotificationsState>()(
  devtools(
    subscribeWithSelector((set, get) => ({
      notifications: [],
      initialized: false,

      init: async () => {
        if (get().initialized) return;
        try {
          const res = await authedFetch("/api/data/notifications");
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const { notifications } = await res.json();
          set({ notifications, initialized: true }, false, "notifs/init/done");
        } catch {}
      },

      subscribeRealtime: () => {
        // Realtime desligado no servidor (RAM) — não tenta o WebSocket pra não spammar o console.
        if (!REALTIME_ENABLED) return () => {};
        const channel = supabase
          .channel("store:notifications")
          .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications" }, (p) => {
            if (!p.new) return;
            const row = p.new as Record<string, unknown>;
            const notif: AppNotification = {
              id: row.id as string,
              type: row.type as NotificationType,
              title: row.title as string,
              body: (row.body as string) ?? "",
              clientId: row.client_id as string | undefined,
              read: Boolean(row.read),
              createdAt: row.created_at as string,
            };
            set((s) => ({
              notifications: s.notifications.some((n) => n.id === notif.id)
                ? s.notifications
                : [notif, ...s.notifications],
            }), false, "notifs/rt/insert");
          })
          .on("postgres_changes", { event: "UPDATE", schema: "public", table: "notifications" }, (p) => {
            if (!p.new) return;
            const row = p.new as Record<string, unknown>;
            set((s) => ({
              notifications: s.notifications.map((n) =>
                n.id === (row.id as string) ? { ...n, read: Boolean(row.read) } : n
              ),
            }), false, "notifs/rt/update");
          })
          .subscribe();
        return () => { supabase.removeChannel(channel); };
      },

      push: async (type, title, body, clientId) => {
        const tempId = `temp-notif-${Date.now()}`;
        const optimistic: AppNotification = {
          id: tempId,
          type,
          title,
          body,
          clientId,
          read: false,
          createdAt: new Date().toISOString(),
        };
        set((s) => ({ notifications: [optimistic, ...s.notifications] }), false, "notifs/push/optimistic");
        try {
          const res = await authedFetch("/api/data/notifications", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type, title, body, clientId }),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
        } catch {
          set((s) => ({ notifications: s.notifications.filter((n) => n.id !== tempId) }), false, "notifs/push/rollback");
        }
      },

      markRead: async (id) => {
        set((s) => ({
          notifications: s.notifications.map((n) => n.id === id ? { ...n, read: true } : n),
        }), false, "notifs/markRead");
        authedFetch("/api/data/notifications", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "markRead", id }),
        }).catch(() => {});
      },

      markAllRead: async () => {
        set((s) => ({
          notifications: s.notifications.map((n) => ({ ...n, read: true })),
        }), false, "notifs/markAllRead");
        authedFetch("/api/data/notifications", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "markAllRead" }),
        }).catch(() => {});
      },
    })),
    { name: "NotificationsStore" }
  )
);
