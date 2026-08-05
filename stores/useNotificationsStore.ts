import { create } from "zustand";
import { devtools, subscribeWithSelector } from "zustand/middleware";
import type { AppNotification, NotificationType } from "@/lib/types";
import { authedFetch } from "@/lib/supabase/authed-fetch";
import { supabase, REALTIME_ENABLED } from "@/lib/supabase/client";

interface NotificationsState {
  notifications: AppNotification[];
  initialized: boolean;

  init: () => Promise<void>;
  refresh: () => Promise<void>;
  subscribeRealtime: () => () => void;

  push: (type: NotificationType, title: string, body: string, clientId?: string, cardId?: string) => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
}

export const selectNotifications = (s: NotificationsState) => s.notifications;
export const selectUnreadCount = (s: NotificationsState) =>
  s.notifications.filter((n) => !n.read).length;
export const selectUnreadNotifications = (s: NotificationsState) =>
  s.notifications.filter((n) => !n.read);

/** Mais novo primeiro, pelo createdAt. Empate desempata por id pra a lista não dançar. */
function ordenar(l: AppNotification[]): AppNotification[] {
  return [...l].sort((a, b) => {
    const d = Date.parse(b.createdAt) - Date.parse(a.createdAt);
    return d !== 0 ? d : (a.id < b.id ? 1 : -1);
  });
}

export const useNotificationsStore = create<NotificationsState>()(
  devtools(
    subscribeWithSelector((set, get) => ({
      notifications: [],
      initialized: false,

      // ORDEM É PELO HORÁRIO DO SERVIDOR, SEMPRE. Concatenar listas sem reordenar deixava o item
      // otimista preso no topo (relógio do navegador) acima de avisos mais novos — foi o "ordem
      // errada depois das entregas". Mais novo primeiro; empate desempata por id pra a ordem não
      // dançar entre renders.
      init: async () => {
        if (get().initialized) return;
        try {
          const res = await authedFetch("/api/data/notifications");
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const { notifications } = await res.json();
          set({ notifications: ordenar(notifications), initialized: true }, false, "notifs/init/done");
        } catch {}
      },

      // Recarrega do banco (o init tem guard e só roda 1x). Usado no poll do AppShell pra que
      // notificações de OUTROS usuários (ex: "Conteúdo reprovado" pelo social) cheguem sem F5.
      refresh: async () => {
        try {
          const res = await authedFetch("/api/data/notifications");
          if (!res.ok) return;
          const { notifications } = await res.json();
          set((s) => {
            // Banco é a verdade; preserva locais recém-empurrados que ainda não voltaram dele.
            const dbIds = new Set((notifications as AppNotification[]).map((n) => n.id));
            // Só sobrevive o local que AINDA está subindo. O temporário que já virou linha no banco
            // não é reconhecido pelo id (o banco gera outro), então some por idade — senão ele
            // duplicaria o aviso real e ficaria colado no topo pra sempre.
            const localOnly = s.notifications.filter(
              (n) => !dbIds.has(n.id) && (!n.id.startsWith("temp-") || Date.now() - Date.parse(n.createdAt) < 30_000),
            );
            return { notifications: ordenar([...localOnly, ...notifications]), initialized: true };
          }, false, "notifs/refresh");
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
              cardId: row.card_id as string | undefined,
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

      push: async (type, title, body, clientId, cardId) => {
        const tempId = `temp-notif-${Date.now()}`;
        const optimistic: AppNotification = {
          id: tempId,
          type,
          title,
          body,
          clientId,
          cardId,
          read: false,
          createdAt: new Date().toISOString(),
        };
        set((s) => ({ notifications: [optimistic, ...s.notifications] }), false, "notifs/push/optimistic");
        try {
          const res = await authedFetch("/api/data/notifications", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type, title, body, clientId, cardId }),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          // TROCA o otimista pela linha do banco: id e horário reais. Sem isso o temp nunca casa
          // com o registro que volta na próxima leitura e o aviso aparece duas vezes.
          const j = await res.json().catch(() => ({}));
          const real = j?.notification as AppNotification | undefined;
          set((s) => ({
            notifications: ordenar(
              real
                ? [real, ...s.notifications.filter((n) => n.id !== tempId)]
                : s.notifications.filter((n) => n.id !== tempId),
            ),
          }), false, "notifs/push/confirmado");
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
