import { create } from "zustand";
import { devtools, subscribeWithSelector } from "zustand/middleware";
import type { ContentCard, DesignRequest } from "@/lib/types";
import * as db from "@/lib/supabase/queries";
import { supabase } from "@/lib/supabase/client";
import { authedFetch } from "@/lib/supabase/authed-fetch";

interface ContentState {
  contentCards: ContentCard[];
  designRequests: DesignRequest[];
  loading: boolean;
  initialized: boolean;

  init: (filter?: { socialMedia?: string }) => Promise<void>;
  subscribeRealtime: (socialMediaFilter?: string) => () => void;

  addContentCard: (card: Omit<ContentCard, "id">) => Promise<ContentCard>;
  updateContentCard: (id: string, updates: Partial<ContentCard>, options?: { bypassWorkflow?: boolean }) => Promise<void>;
  deleteContentCard: (id: string) => Promise<void>;

  addDesignRequest: (req: Omit<DesignRequest, "id"> & { contentCardId?: string }) => Promise<DesignRequest>;
  updateDesignRequest: (id: string, updates: Partial<DesignRequest>) => Promise<void>;
  deleteDesignRequest: (id: string) => Promise<void>;
}

export const selectContentCards = (s: ContentState) => s.contentCards;
export const selectDesignRequests = (s: ContentState) => s.designRequests;
export const selectContentLoading = (s: ContentState) => s.loading;
export const selectCardsByClient = (clientId: string) => (s: ContentState) =>
  s.contentCards.filter((c) => c.clientId === clientId);
export const selectDesignByClient = (clientId: string) => (s: ContentState) =>
  s.designRequests.filter((r) => r.clientId === clientId);

export const useContentStore = create<ContentState>()(
  devtools(
    subscribeWithSelector((set, get) => ({
      contentCards: [],
      designRequests: [],
      loading: false,
      initialized: false,

      init: async (filter) => {
        if (get().initialized || get().loading) return;
        set({ loading: true }, false, "content/init/start");
        try {
          const [contentCards, designRequests] = await Promise.all([
            db.fetchContentCards(filter),
            db.fetchDesignRequests(),
          ]);
          set({ contentCards, designRequests, loading: false, initialized: true }, false, "content/init/done");
        } catch {
          set({ loading: false }, false, "content/init/error");
        }
      },

      subscribeRealtime: (socialMediaFilter) => {
        const channel = supabase
          .channel("store:content")
          .on("postgres_changes", { event: "INSERT", schema: "public", table: "content_cards" }, async (p) => {
            if (!p.new) return;
            const { snakeToContentCard } = await import("@/lib/supabase/queries");
            try {
              const card = snakeToContentCard(p.new as Record<string, unknown>);
              if (socialMediaFilter && card.socialMedia !== socialMediaFilter) return;
              set((s) => ({
                contentCards: s.contentCards.some((c) => c.id === card.id) ? s.contentCards : [...s.contentCards, card],
              }), false, "content/rt/card/insert");
            } catch {}
          })
          .on("postgres_changes", { event: "UPDATE", schema: "public", table: "content_cards" }, async (p) => {
            if (!p.new) return;
            const { snakeToContentCard } = await import("@/lib/supabase/queries");
            try {
              const card = snakeToContentCard(p.new as Record<string, unknown>);
              set((s) => ({
                contentCards: s.contentCards.map((c) => c.id === card.id ? { ...c, ...card } : c),
              }), false, "content/rt/card/update");
            } catch {}
          })
          .on("postgres_changes", { event: "DELETE", schema: "public", table: "content_cards" }, (p) => {
            const id = (p.old as { id?: string })?.id;
            if (id) set((s) => ({ contentCards: s.contentCards.filter((c) => c.id !== id) }), false, "content/rt/card/delete");
          })
          .on("postgres_changes", { event: "INSERT", schema: "public", table: "design_requests" }, async (p) => {
            if (!p.new) return;
            const { snakeToDesignRequest } = await import("@/lib/supabase/queries");
            try {
              const req = snakeToDesignRequest(p.new as Record<string, unknown>);
              set((s) => ({
                designRequests: s.designRequests.some((r) => r.id === req.id) ? s.designRequests : [req, ...s.designRequests],
              }), false, "content/rt/design/insert");
            } catch {}
          })
          .on("postgres_changes", { event: "UPDATE", schema: "public", table: "design_requests" }, async (p) => {
            if (!p.new) return;
            const { snakeToDesignRequest } = await import("@/lib/supabase/queries");
            try {
              const req = snakeToDesignRequest(p.new as Record<string, unknown>);
              set((s) => ({
                designRequests: s.designRequests.map((r) => r.id === req.id ? { ...r, ...req } : r),
              }), false, "content/rt/design/update");
            } catch {}
          })
          .subscribe();
        return () => { supabase.removeChannel(channel); };
      },

      addContentCard: async (card) => {
        const tempId = `temp-cc-${Date.now()}`;
        const optimistic: ContentCard = { ...card, id: tempId };
        set((s) => ({ contentCards: [...s.contentCards, optimistic] }), false, "content/card/add/optimistic");
        try {
          const { id } = await db.insertContentCard(card);
          const confirmed = { ...optimistic, id };
          set((s) => ({
            contentCards: s.contentCards.map((c) => c.id === tempId ? confirmed : c),
          }), false, "content/card/add/confirmed");
          return confirmed;
        } catch (err) {
          set((s) => ({ contentCards: s.contentCards.filter((c) => c.id !== tempId) }), false, "content/card/add/rollback");
          throw err;
        }
      },

      updateContentCard: async (id, updates) => {
        const prev = get().contentCards.find((c) => c.id === id);
        set((s) => ({
          contentCards: s.contentCards.map((c) => c.id === id ? { ...c, ...updates } : c),
        }), false, "content/card/update/optimistic");
        try {
          const res = await authedFetch("/api/content-cards/update", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, ...updates }),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
        } catch (err) {
          if (prev) set((s) => ({ contentCards: s.contentCards.map((c) => c.id === id ? prev : c) }), false, "content/card/update/rollback");
          throw err;
        }
      },

      deleteContentCard: async (id) => {
        const prev = get().contentCards.find((c) => c.id === id);
        set((s) => ({ contentCards: s.contentCards.filter((c) => c.id !== id) }), false, "content/card/delete/optimistic");
        try {
          const res = await authedFetch("/api/content-cards/delete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id }),
          });
          if (!res.ok) {
            if (prev) set((s) => ({ contentCards: s.contentCards.some((c) => c.id === id) ? s.contentCards : [...s.contentCards, prev] }), false, "content/card/delete/rollback");
            throw new Error(`HTTP ${res.status}`);
          }
        } catch (err) {
          if (prev) set((s) => ({ contentCards: s.contentCards.some((c) => c.id === id) ? s.contentCards : [...s.contentCards, prev] }), false, "content/card/delete/rollback");
          throw err;
        }
      },

      addDesignRequest: async (req) => {
        const tempId = `temp-dr-${Date.now()}`;
        const optimistic: DesignRequest = { ...req, id: tempId } as DesignRequest;
        set((s) => ({ designRequests: [optimistic, ...s.designRequests] }), false, "content/design/add/optimistic");
        try {
          const { id } = await db.insertDesignRequest(req as Omit<DesignRequest, "id">);
          const confirmed = { ...optimistic, id };
          set((s) => ({
            designRequests: s.designRequests.map((r) => r.id === tempId ? confirmed : r),
          }), false, "content/design/add/confirmed");
          return confirmed;
        } catch (err) {
          set((s) => ({ designRequests: s.designRequests.filter((r) => r.id !== tempId) }), false, "content/design/add/rollback");
          throw err;
        }
      },

      updateDesignRequest: async (id, updates) => {
        const prev = get().designRequests.find((r) => r.id === id);
        set((s) => ({
          designRequests: s.designRequests.map((r) => r.id === id ? { ...r, ...updates } : r),
        }), false, "content/design/update/optimistic");
        try {
          await db.updateDesignRequestDb(id, updates);
        } catch (err) {
          if (prev) set((s) => ({ designRequests: s.designRequests.map((r) => r.id === id ? prev : r) }), false, "content/design/update/rollback");
          throw err;
        }
      },

      deleteDesignRequest: async (id) => {
        const prev = get().designRequests.find((r) => r.id === id);
        set((s) => ({ designRequests: s.designRequests.filter((r) => r.id !== id) }), false, "content/design/delete/optimistic");
        try {
          const res = await authedFetch("/api/design-requests/delete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id }),
          });
          if (!res.ok) {
            if (prev) set((s) => ({ designRequests: s.designRequests.some((r) => r.id === id) ? s.designRequests : [...s.designRequests, prev] }), false, "content/design/delete/rollback");
            throw new Error(`HTTP ${res.status}`);
          }
        } catch (err) {
          if (prev) set((s) => ({ designRequests: s.designRequests.some((r) => r.id === id) ? s.designRequests : [...s.designRequests, prev] }), false, "content/design/delete/rollback");
          throw err;
        }
      },
    })),
    { name: "ContentStore" }
  )
);
