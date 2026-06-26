import { create } from "zustand";
import { devtools, subscribeWithSelector } from "zustand/middleware";
import type { Client, ClientStatus, ChatMessage } from "@/lib/types";
import { supabase, REALTIME_ENABLED } from "@/lib/supabase/client";
import { authedFetch } from "@/lib/supabase/authed-fetch";

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

interface ClientsState {
  clients: Client[];
  clientChats: Record<string, ChatMessage[]>;
  loading: boolean;
  initialized: boolean;

  // Actions
  init: () => Promise<void>;
  subscribeRealtime: () => () => void;

  addClient: (data: Omit<Client, "id" | "status" | "attentionLevel" | "tags" | "joinDate" | "lastPostDate"> & Partial<Pick<Client, "status" | "attentionLevel" | "tags" | "joinDate" | "lastPostDate">>) => Promise<Client>;
  updateClient: (id: string, updates: Partial<Client>) => Promise<void>;
  updateClientStatus: (id: string, status: ClientStatus, actor: string) => Promise<void>;
  sendClientMessage: (clientId: string, user: string, text: string) => void;
}

// ──────────────────────────────────────────────────────────────────────────────
// Selectors (memoized outside the store — stable references)
// ──────────────────────────────────────────────────────────────────────────────

export const selectClients = (s: ClientsState) => s.clients;
export const selectClientChats = (s: ClientsState) => s.clientChats;
export const selectClientsLoading = (s: ClientsState) => s.loading;
export const selectClientById = (id: string) => (s: ClientsState) =>
  s.clients.find((c) => c.id === id);
export const selectChatsByClientId = (clientId: string) => (s: ClientsState) =>
  s.clientChats[clientId] ?? [];

// ──────────────────────────────────────────────────────────────────────────────
// Store
// ──────────────────────────────────────────────────────────────────────────────

export const useClientsStore = create<ClientsState>()(
  devtools(
    subscribeWithSelector((set, get) => ({
      clients: [],
      clientChats: {},
      loading: false,
      initialized: false,

      // ── Fetch all clients + chats from Supabase ──────────────────────────
      init: async () => {
        if (get().initialized || get().loading) return;
        set({ loading: true }, false, "clients/init/start");
        try {
          const res = await authedFetch("/api/data/clients");
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const { clients, clientChats } = await res.json();
          set({ clients, clientChats, loading: false, initialized: true }, false, "clients/init/done");
        } catch {
          set({ loading: false }, false, "clients/init/error");
        }
      },

      // ── Supabase Realtime subscription ───────────────────────────────────
      subscribeRealtime: () => {
        // Realtime desligado no servidor (RAM) — não tenta o WebSocket pra não spammar o console.
        if (!REALTIME_ENABLED) return () => {};
        const channel = supabase
          .channel("store:clients")
          .on("postgres_changes", { event: "INSERT", schema: "public", table: "clients" }, (p) => {
            if (!p.new) return;
            const c = p.new as Client;
            set((s) => ({
              clients: s.clients.some((x) => x.id === c.id) ? s.clients : [...s.clients, c],
            }), false, "clients/rt/insert");
          })
          .on("postgres_changes", { event: "UPDATE", schema: "public", table: "clients" }, (p) => {
            if (!p.new) return;
            const updated = p.new as Client;
            set((s) => ({
              clients: s.clients.map((c) => c.id === updated.id ? { ...c, ...updated } : c),
            }), false, "clients/rt/update");
          })
          .on("postgres_changes", { event: "DELETE", schema: "public", table: "clients" }, (p) => {
            const id = (p.old as { id?: string })?.id;
            if (!id) return;
            set((s) => ({ clients: s.clients.filter((c) => c.id !== id) }), false, "clients/rt/delete");
          })
          .on("postgres_changes", { event: "INSERT", schema: "public", table: "client_timeline_messages" }, (p) => {
            if (!p.new) return;
            const row = p.new as { client_id: string; id: string; user: string; text: string; created_at: string };
            const msg: ChatMessage = { id: row.id, user: row.user, text: row.text, timestamp: row.created_at };
            set((s) => ({
              clientChats: {
                ...s.clientChats,
                [row.client_id]: [...(s.clientChats[row.client_id] ?? []), msg],
              },
            }), false, "clients/rt/chat");
          })
          .subscribe();
        return () => { supabase.removeChannel(channel); };
      },

      // ── addClient ─────────────────────────────────────────────────────────
      addClient: async (data) => {
        const tempId = `temp-${Date.now()}`;
        const optimistic: Client = {
          ...data,
          id: tempId,
          status: "onboarding",
          attentionLevel: "low",
          tags: [],
          joinDate: new Date().toISOString().slice(0, 10),
          lastPostDate: undefined,
        };
        set((s) => ({ clients: [...s.clients, optimistic] }), false, "clients/add/optimistic");
        try {
          const res = await authedFetch("/api/data/clients", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const { id } = await res.json();
          const confirmed: Client = { ...optimistic, id };
          set((s) => ({
            clients: s.clients.map((c) => c.id === tempId ? confirmed : c),
          }), false, "clients/add/confirmed");
          return confirmed;
        } catch (err) {
          set((s) => ({ clients: s.clients.filter((c) => c.id !== tempId) }), false, "clients/add/rollback");
          throw err;
        }
      },

      // ── updateClient ──────────────────────────────────────────────────────
      updateClient: async (id, updates) => {
        const prev = get().clients.find((c) => c.id === id);
        set((s) => ({
          clients: s.clients.map((c) => c.id === id ? { ...c, ...updates } : c),
        }), false, "clients/update/optimistic");
        try {
          const res = await authedFetch("/api/clients/update", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, ...updates }),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
        } catch (err) {
          if (prev) {
            set((s) => ({
              clients: s.clients.map((c) => c.id === id ? prev : c),
            }), false, "clients/update/rollback");
          }
          throw err;
        }
      },

      // ── updateClientStatus ────────────────────────────────────────────────
      updateClientStatus: async (id, status, actor) => {
        const prev = get().clients.find((c) => c.id === id);
        set((s) => ({
          clients: s.clients.map((c) => c.id === id ? { ...c, status } : c),
        }), false, "clients/status/optimistic");
        try {
          await authedFetch("/api/clients/update", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, status }),
          });
          await authedFetch("/api/data/operational/mutations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "insertTimeline", entry: { clientId: id, type: "status", actor, description: `Status atualizado para ${status}`, timestamp: new Date().toISOString() } }),
          });
        } catch (err) {
          if (prev) {
            set((s) => ({
              clients: s.clients.map((c) => c.id === id ? prev : c),
            }), false, "clients/status/rollback");
          }
          throw err;
        }
      },

      // ── sendClientMessage ─────────────────────────────────────────────────
      sendClientMessage: (clientId, user, text) => {
        const tempMsg: ChatMessage = {
          id: `temp-msg-${Date.now()}`,
          user,
          text,
          timestamp: new Date().toISOString(),
        };
        set((s) => ({
          clientChats: {
            ...s.clientChats,
            [clientId]: [...(s.clientChats[clientId] ?? []), tempMsg],
          },
        }), false, "clients/chat/optimistic");
        authedFetch("/api/data/clients/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId, text }),
        }).catch(() => {
          set((s) => ({
            clientChats: {
              ...s.clientChats,
              [clientId]: (s.clientChats[clientId] ?? []).filter((m) => m.id !== tempMsg.id),
            },
          }), false, "clients/chat/rollback");
        });
      },
    })),
    { name: "ClientsStore" }
  )
);
