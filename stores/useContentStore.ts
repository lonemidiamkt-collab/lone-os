import { create } from "zustand";
import { devtools, subscribeWithSelector } from "zustand/middleware";
import type { ContentCard, DesignRequest, ContentApproval, SocialMonthlyReport, CardComment, Role } from "@/lib/types";
import { supabase } from "@/lib/supabase/client";
import { authedFetch } from "@/lib/supabase/authed-fetch";

interface ContentState {
  contentCards: ContentCard[];
  designRequests: DesignRequest[];
  contentApprovals: ContentApproval[];
  socialReports: SocialMonthlyReport[];
  loading: boolean;
  initialized: boolean;

  init: (filter?: { socialMedia?: string }) => Promise<void>;
  subscribeRealtime: (socialMediaFilter?: string) => () => void;

  addContentCard: (card: Omit<ContentCard, "id">) => Promise<ContentCard>;
  updateContentCard: (id: string, updates: Partial<ContentCard>, options?: { bypassWorkflow?: boolean }) => Promise<void>;
  deleteContentCard: (id: string) => Promise<void>;

  approveContent: (cardId: string, reviewer: string) => void;
  rejectContent: (cardId: string, reviewer: string, reason: string) => void;

  addDesignRequest: (req: Omit<DesignRequest, "id"> & { contentCardId?: string }) => Promise<DesignRequest>;
  updateDesignRequest: (id: string, updates: Partial<DesignRequest>) => Promise<void>;
  deleteDesignRequest: (id: string) => Promise<void>;

  addSocialReport: (report: Omit<SocialMonthlyReport, "id" | "createdAt">) => Promise<SocialMonthlyReport>;
  updateSocialReport: (id: string, updates: Partial<SocialMonthlyReport>) => Promise<void>;

  addCardComment: (cardId: string, author: string, role: Role, text: string) => void;
}

export const selectContentCards = (s: ContentState) => s.contentCards;
export const selectDesignRequests = (s: ContentState) => s.designRequests;
export const selectContentApprovals = (s: ContentState) => s.contentApprovals;
export const selectSocialReports = (s: ContentState) => s.socialReports;
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
      contentApprovals: [],
      socialReports: [],
      loading: false,
      initialized: false,

      init: async (filter) => {
        if (get().initialized || get().loading) return;
        set({ loading: true }, false, "content/init/start");
        try {
          const params = filter?.socialMedia ? `?socialMedia=${encodeURIComponent(filter.socialMedia)}` : "";
          const res = await authedFetch(`/api/data/content${params}`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const { contentCards, designRequests, contentApprovals, socialReports } = await res.json();
          set({ contentCards, designRequests, contentApprovals, socialReports, loading: false, initialized: true }, false, "content/init/done");
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
              set((s) => {
                // Arquivada → remove do board ativo. Desarquivada → re-insere (respeitando o filtro de carteira).
                if (card.archivedAt) {
                  return { contentCards: s.contentCards.filter((c) => c.id !== card.id) };
                }
                const exists = s.contentCards.some((c) => c.id === card.id);
                if (exists) {
                  return { contentCards: s.contentCards.map((c) => c.id === card.id ? { ...c, ...card } : c) };
                }
                if (socialMediaFilter && card.socialMedia !== socialMediaFilter) return s;
                return { contentCards: [...s.contentCards, card] };
              }, false, "content/rt/card/update");
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
          const r = await authedFetch("/api/content-cards/create", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(card) });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          const { id } = await r.json();
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

      approveContent: (cardId, reviewer) => {
        const card = get().contentCards.find((c) => c.id === cardId);
        const approval: ContentApproval = {
          id: `ca-${Date.now()}`,
          cardId,
          status: "approved",
          reviewedBy: reviewer,
          reviewedAt: new Date().toISOString(),
        };
        set((s) => ({
          contentApprovals: [...s.contentApprovals.filter((a) => a.cardId !== cardId), approval],
          contentCards: s.contentCards.map((c) =>
            c.id === cardId ? { ...c, status: "scheduled" as const, statusChangedAt: new Date().toISOString() } : c
          ),
        }), false, "content/approve");
        authedFetch("/api/content-cards/update", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: cardId, status: "scheduled", contentApproval: { status: "approved", reviewedBy: reviewer, reviewedAt: new Date().toISOString() } }) }).catch(() => {});
        if (card) {
          import("@/stores/useNotificationsStore").then(({ useNotificationsStore }) => {
            useNotificationsStore.getState().push("content", "Conteúdo aprovado", `"${card.title}" de ${card.clientName} foi aprovado por ${reviewer}. Pronto para agendamento.`, card.clientId);
          });
        }
      },

      rejectContent: (cardId, reviewer, reason) => {
        const card = get().contentCards.find((c) => c.id === cardId);
        const approval: ContentApproval = {
          id: `ca-${Date.now()}`,
          cardId,
          status: "rejected",
          reviewedBy: reviewer,
          reviewedAt: new Date().toISOString(),
          reason,
        };
        set((s) => ({
          contentApprovals: [...s.contentApprovals.filter((a) => a.cardId !== cardId), approval],
          contentCards: s.contentCards.map((c) =>
            c.id === cardId ? { ...c, status: "in_production" as const, statusChangedAt: new Date().toISOString() } : c
          ),
        }), false, "content/reject");
        authedFetch("/api/content-cards/update", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: cardId, status: "in_production", contentApproval: { status: "rejected", reviewedBy: reviewer, reviewedAt: new Date().toISOString(), reason } }) }).catch(() => {});
        if (card) {
          import("@/stores/useNotificationsStore").then(({ useNotificationsStore }) => {
            useNotificationsStore.getState().push("content", "Conteúdo reprovado", `"${card.title}" de ${card.clientName} foi reprovado: ${reason}`, card.clientId);
          });
        }
      },

      addSocialReport: async (report) => {
        const tempId = `temp-sr-${Date.now()}`;
        const optimistic: SocialMonthlyReport = { ...report, id: tempId, createdAt: new Date().toISOString() } as SocialMonthlyReport;
        set((s) => ({ socialReports: [optimistic, ...s.socialReports] }), false, "content/socialReport/add/optimistic");
        try {
          const r = await authedFetch("/api/data/content/mutations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "insertSocialReport", report }) });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          const { socialReports: updated } = await r.json();
          set({ socialReports: updated }, false, "content/socialReport/add/confirmed");
          return updated.find((sr: SocialMonthlyReport) => sr.id !== tempId) ?? optimistic;
        } catch (err) {
          set((s) => ({ socialReports: s.socialReports.filter((r) => r.id !== tempId) }), false, "content/socialReport/add/rollback");
          throw err;
        }
      },

      updateSocialReport: async (id, updates) => {
        const prev = get().socialReports.find((r) => r.id === id);
        set((s) => ({
          socialReports: s.socialReports.map((r) => r.id === id ? { ...r, ...updates } : r),
        }), false, "content/socialReport/update/optimistic");
        try {
          const res = await authedFetch("/api/data/content/mutations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "updateSocialReport", id, updates }) });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
        } catch (err) {
          if (prev) set((s) => ({ socialReports: s.socialReports.map((r) => r.id === id ? prev : r) }), false, "content/socialReport/update/rollback");
          throw err;
        }
      },

      addDesignRequest: async (req) => {
        const tempId = `temp-dr-${Date.now()}`;
        const optimistic: DesignRequest = { ...req, id: tempId } as DesignRequest;
        set((s) => ({ designRequests: [optimistic, ...s.designRequests] }), false, "content/design/add/optimistic");
        try {
          const r = await authedFetch("/api/design-requests/create", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(req) });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          const { id } = await r.json();
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
          const res = await authedFetch("/api/design-requests/update", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...updates }) });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
        } catch (err) {
          if (prev) set((s) => ({ designRequests: s.designRequests.map((r) => r.id === id ? prev : r) }), false, "content/design/update/rollback");
          throw err;
        }
      },

      addCardComment: (cardId, author, role, text) => {
        const comment: CardComment = {
          id: `cmt-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          author,
          role,
          text,
          createdAt: new Date().toISOString(),
        };
        set((s) => ({
          contentCards: s.contentCards.map((c) =>
            c.id === cardId ? { ...c, comments: [...(c.comments ?? []), comment] } : c
          ),
        }), false, "content/card/comment/add");
        authedFetch("/api/data/content/mutations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "addCardComment", cardId, author, text }) }).catch(() => {});
        const card = get().contentCards.find((c) => c.id === cardId);
        if (card) {
          import("@/stores/useNotificationsStore").then(({ useNotificationsStore }) => {
            useNotificationsStore.getState().push("content", "Novo comentário", `${author} comentou em "${card.title}" — ${card.clientName}: "${text.slice(0, 60)}${text.length > 60 ? "..." : ""}"`, card.clientId);
          });
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
