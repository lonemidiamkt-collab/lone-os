import { create } from "zustand";
import { toast } from "sonner";
import { devtools, subscribeWithSelector } from "zustand/middleware";
import type { ContentCard, DesignRequest, ContentApproval, SocialMonthlyReport, CardComment, Role } from "@/lib/types";
import { supabase, REALTIME_ENABLED } from "@/lib/supabase/client";
import { authedFetch } from "@/lib/supabase/authed-fetch";

interface ContentState {
  contentCards: ContentCard[];
  designRequests: DesignRequest[];
  contentApprovals: ContentApproval[];
  socialReports: SocialMonthlyReport[];
  loading: boolean;
  initialized: boolean;
  versao?: string;

  init: (filter?: { socialMedia?: string }) => Promise<void>;
  refresh: (filter?: { socialMedia?: string }) => Promise<void>;
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

// CRIAÇÕES EM VOO (16/09): duplo clique criava 2 cards/demandas (27+28 em 30 dias). Trava síncrona por
// chave — estado React no botão não segura, o closure ainda vê o valor antigo.
const criacoesEmVoo = new Map<string, Promise<unknown>>();

// A CORRIDA QUE FAZIA "REFAZER 3 VEZES" (17/09). O board refaz a busca a cada 20 s E toda vez que a
// janela ganha foco — e a equipe vive alternando com o WhatsApp/Finder/Photoshop para copiar
// referência. A busca (800 KB, 1–3 s na internet de casa) ainda estava em voo quando a pessoa clicava
// em Criar/Anexar/Entregar: a resposta VELHA chegava depois da escrita otimista e a substituía
// inteira; o card/anexo sumia da tela (o servidor tinha gravado) e só voltava 20 s depois — ou no
// reload. A pessoa criava de novo. Regra agora: escrita local carimba `mutadoEm`; resposta de busca
// disparada ANTES da última escrita é descartada (e uma nova busca sai em seguida).
let mutadoEm = 0;
export function marcarMutacao(): void { mutadoEm = Date.now(); }
let refreshEmVoo = false;
let ultimoRefresh = 0;

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
          const { contentCards, designRequests, contentApprovals, socialReports, versao } = await res.json();
          set({ contentCards, designRequests, contentApprovals, socialReports, versao, loading: false, initialized: true }, false, "content/init/done");
        } catch {
          set({ loading: false }, false, "content/init/error");
        }
      },

      refresh: async (filter) => {
        // Refetch silencioso p/ polling do board: SEM flag de loading (não pisca a tela) e
        // sem o guard de init (serve justamente pra atualizar depois de já inicializado).
        if (!get().initialized) return;            // antes do init, o init é quem carrega
        if (refreshEmVoo) return;                  // uma busca por vez
        if (Date.now() - ultimoRefresh < 3000) return; // foco + tick no mesmo segundo = uma busca só
        if (criacoesEmVoo.size > 0) return;        // alguém está criando: não atropela
        refreshEmVoo = true;
        const disparadoEm = Date.now();
        try {
          const q = new URLSearchParams();
          if (filter?.socialMedia) q.set("socialMedia", filter.socialMedia);
          const v = get().versao;
          if (v) q.set("v", v);
          const res = await authedFetch(`/api/data/content${q.toString() ? `?${q}` : ""}`);
          ultimoRefresh = Date.now();
          if (res.status === 204) return; // nada mudou desde o último tick — zero bytes, zero re-render
          if (!res.ok) return;
          const { contentCards, designRequests, contentApprovals, socialReports, versao } = await res.json();
          // Escrita local depois que esta busca saiu? A resposta é velha: descarta e busca de novo.
          if (mutadoEm > disparadoEm || criacoesEmVoo.size > 0) {
            refreshEmVoo = false; ultimoRefresh = 0;
            setTimeout(() => { void get().refresh(filter); }, 1500);
            return;
          }
          // Otimistas ainda em voo (id temp-*) não existem no servidor: preserva até confirmar.
          const cards = get().contentCards, reqs = get().designRequests;
          const cardsTemp = cards.filter((c) => c.id.startsWith("temp-"));
          const reqsTemp = reqs.filter((r) => r.id.startsWith("temp-"));
          set({ contentCards: [...contentCards, ...cardsTemp], designRequests: [...reqsTemp, ...designRequests], contentApprovals, socialReports, versao }, false, "content/refresh");
        } catch {} finally { refreshEmVoo = false; }
      },

      subscribeRealtime: (socialMediaFilter) => {
        // Realtime desligado no servidor (RAM) — não tenta o WebSocket pra não spammar o console.
        if (!REALTIME_ENABLED) return () => {};
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
        // Em voo: segundo clique no mesmo cliente+título devolve a criação que já está rodando.
        const chave = `card|${card.clientId}|${card.title.trim().toLowerCase()}`;
        const emVoo = criacoesEmVoo.get(chave) as Promise<ContentCard> | undefined;
        if (emVoo) return emVoo;
        const p = (async () => {
        const tempId = `temp-cc-${Date.now()}`;
        const optimistic: ContentCard = { ...card, id: tempId };
        marcarMutacao();
        set((s) => ({ contentCards: [...s.contentCards, optimistic] }), false, "content/card/add/optimistic");
        try {
          const r = await authedFetch("/api/content-cards/create", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(card) });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          const { id } = await r.json();
          const confirmed = { ...optimistic, id };
          marcarMutacao();
          set((s) => ({
            contentCards: s.contentCards.map((c) => c.id === tempId ? confirmed : c),
          }), false, "content/card/add/confirmed");
          return confirmed;
        } catch (err) {
          set((s) => ({ contentCards: s.contentCards.filter((c) => c.id !== tempId) }), false, "content/card/add/rollback");
          throw err;
        }
        })();
        criacoesEmVoo.set(chave, p);
        p.finally(() => criacoesEmVoo.delete(chave)).catch(() => {});
        return p;
      },

      updateContentCard: async (id, updates) => {
        const prev = get().contentCards.find((c) => c.id === id);
        marcarMutacao();
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
        marcarMutacao();
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
        const prevCard = card;                            // snapshot p/ rollback se o save falhar
        const prevApprovals = get().contentApprovals;
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
        // O save NÃO pode falhar em silêncio: antes era .catch(() => {}), então uma falha no
        // servidor deixava a UI mostrando "aprovado" sem ter gravado nada. Agora desfaz o
        // update otimista e avisa o social via notificação.
        authedFetch("/api/content-cards/update", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: cardId, status: "scheduled", contentApproval: { status: "approved", reviewedBy: reviewer, reviewedAt: new Date().toISOString() } }) })
          .then((res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            if (card) {
              import("@/stores/useNotificationsStore").then(({ useNotificationsStore }) => {
                useNotificationsStore.getState().push("content", "Conteúdo aprovado", `"${card.title}" de ${card.clientName} foi aprovado por ${reviewer}. Pronto para agendamento.`, card.clientId, card.id);
              });
            }
          })
          .catch(() => {
            set((s) => ({
              contentApprovals: prevApprovals,
              contentCards: prevCard ? s.contentCards.map((c) => c.id === cardId ? prevCard : c) : s.contentCards,
            }), false, "content/approve/rollback");
            import("@/stores/useNotificationsStore").then(({ useNotificationsStore }) => {
              useNotificationsStore.getState().push("system", "Falha ao confirmar a arte", `Não deu pra salvar a aprovação${card ? ` de "${card.title}"` : ""}. Verifique a conexão e tente de novo.`, card?.clientId);
            });
          });
      },

      rejectContent: (cardId, reviewer, reason) => {
        const card = get().contentCards.find((c) => c.id === cardId);
        const prevCard = card;
        const prevApprovals = get().contentApprovals;
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
        // Mesma lógica do approveContent: não falhar em silêncio — desfaz e avisa.
        authedFetch("/api/content-cards/update", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: cardId, status: "in_production", contentApproval: { status: "rejected", reviewedBy: reviewer, reviewedAt: new Date().toISOString(), reason } }) })
          .then((res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            // Reabre a SOLICITAÇÃO de design → o designer vê que precisa refazer. Sem isso, a
            // demanda ficava "Concluído" no board dele e o pedido de alteração passava batido.
            const drId = card?.designRequestId;
            if (drId) {
              set((s) => ({ designRequests: s.designRequests.map((r) => r.id === drId ? { ...r, status: "in_progress" as const } : r) }), false, "content/reject/reopen-dr");
              authedFetch("/api/design-requests/update", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: drId, status: "in_progress" }) }).catch(() => {});
            }
            if (card) {
              import("@/stores/useNotificationsStore").then(({ useNotificationsStore }) => {
                // COM O CARD: o designer clica na reprova e cai NA ARTE que precisa refazer.
                // Sem isso ele caía no cadastro do cliente e tinha que garimpar o card no board —
                // parte do "as alterações não estão chegando" que o time reportou.
                useNotificationsStore.getState().push("content", "Conteúdo reprovado", `"${card.title}" de ${card.clientName} foi reprovado: ${reason}`, card.clientId, card.id);
              });
            }
          })
          .catch(() => {
            set((s) => ({
              contentApprovals: prevApprovals,
              contentCards: prevCard ? s.contentCards.map((c) => c.id === cardId ? prevCard : c) : s.contentCards,
            }), false, "content/reject/rollback");
            import("@/stores/useNotificationsStore").then(({ useNotificationsStore }) => {
              useNotificationsStore.getState().push("system", "Falha ao reprovar a arte", `Não deu pra salvar a reprovação${card ? ` de "${card.title}"` : ""}. Verifique a conexão e tente de novo.`, card?.clientId);
            });
          });
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
        const chave = `demanda|${req.contentCardId ?? `${req.clientId}|${req.title.trim().toLowerCase()}`}`;
        const emVoo = criacoesEmVoo.get(chave) as Promise<DesignRequest> | undefined;
        if (emVoo) return emVoo;
        const p = (async () => {
        const tempId = `temp-dr-${Date.now()}`;
        const optimistic: DesignRequest = { ...req, id: tempId } as DesignRequest;
        marcarMutacao();
        set((s) => ({ designRequests: [optimistic, ...s.designRequests] }), false, "content/design/add/optimistic");
        try {
          const r = await authedFetch("/api/design-requests/create", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(req) });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          const { id, semDesigner } = await r.json() as { id: string; semDesigner?: boolean };
          // Cliente sem designer no cadastro: a demanda existe, mas cai em "(sem designer)" — avisa quem criou.
          if (semDesigner) toast.warning(`"${req.title}" foi criada, mas ${req.clientName} não tem designer no cadastro — caiu em "(sem designer)". Defina o designer na ficha do cliente pra cair no quadro certo.`, { duration: 9000 });
          const confirmed = { ...optimistic, id };
          marcarMutacao();
          set((s) => ({
            designRequests: s.designRequests.map((r) => r.id === tempId ? confirmed : r),
          }), false, "content/design/add/confirmed");
          return confirmed;
        } catch (err) {
          set((s) => ({ designRequests: s.designRequests.filter((r) => r.id !== tempId) }), false, "content/design/add/rollback");
          throw err;
        }
        })();
        criacoesEmVoo.set(chave, p);
        p.finally(() => criacoesEmVoo.delete(chave)).catch(() => {});
        return p;
      },

      updateDesignRequest: async (id, updates) => {
        const prev = get().designRequests.find((r) => r.id === id);
        marcarMutacao();
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
        const card = get().contentCards.find((c) => c.id === cardId);
        // Comentário não pode sumir em silêncio: notifica só em sucesso; em falha, desfaz e avisa.
        authedFetch("/api/data/content/mutations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "addCardComment", cardId, author, role, text }) })
          .then((res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            if (card) {
              import("@/stores/useNotificationsStore").then(({ useNotificationsStore }) => {
                useNotificationsStore.getState().push("content", "Novo comentário", `${author} comentou em "${card.title}" — ${card.clientName}: "${text.slice(0, 60)}${text.length > 60 ? "..." : ""}"`, card.clientId);
              });
            }
          })
          .catch(() => {
            set((s) => ({
              contentCards: s.contentCards.map((c) =>
                c.id === cardId ? { ...c, comments: (c.comments ?? []).filter((cm) => cm.id !== comment.id) } : c
              ),
            }), false, "content/card/comment/rollback");
            import("@/stores/useNotificationsStore").then(({ useNotificationsStore }) => {
              useNotificationsStore.getState().push("system", "Falha ao enviar comentário", `Não deu pra salvar seu comentário${card ? ` em "${card.title}"` : ""}. Tente de novo.`, card?.clientId);
            });
          });
      },

      deleteDesignRequest: async (id) => {
        const prev = get().designRequests.find((r) => r.id === id);
        marcarMutacao();
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
