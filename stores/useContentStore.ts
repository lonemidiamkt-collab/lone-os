import { create } from "zustand";
import { toast } from "sonner";
import { devtools, subscribeWithSelector } from "zustand/middleware";
import type { ContentCard, DesignRequest, ContentApproval, CardComment, Role } from "@/lib/types";
import { supabase, REALTIME_ENABLED } from "@/lib/supabase/client";
import { authedFetch } from "@/lib/supabase/authed-fetch";
import { chamar } from "@/lib/api/chamar";
import { trilha } from "@/lib/obs/trilha";
import { avisoDeAtribuicao, type MotivoEscolha } from "@/lib/design/atribuicao";
import type { AcaoDesign } from "@/lib/conteudo/producao";
import { statusDaEtapa } from "@/lib/conteudo/etapas";

/** O que as rotas da etapa de design devolvem: o card e o pedido como ficaram no banco. */
export interface EstadoDoServidor {
  card?: ContentCard | null;
  pedido?: DesignRequest | null;
  pedidoRemovido?: string | null;
}

interface ContentState {
  contentCards: ContentCard[];
  designRequests: DesignRequest[];
  contentApprovals: ContentApproval[];
  loading: boolean;
  initialized: boolean;
  /** A primeira carga falhou: a tela mostra erro (não "nenhum card") e o polling tenta de novo. */
  loadError: boolean;
  versao?: string;

  init: (filter?: { socialMedia?: string }) => Promise<void>;
  refresh: (filter?: { socialMedia?: string }) => Promise<void>;
  subscribeRealtime: (socialMediaFilter?: string) => () => void;

  addContentCard: (card: Omit<ContentCard, "id">, opcoes?: { chave?: string; criadoPor?: string }) => Promise<ContentCard>;
  updateContentCard: (id: string, updates: Partial<ContentCard>, options?: { bypassWorkflow?: boolean }) => Promise<void>;
  deleteContentCard: (id: string) => Promise<void>;

  approveContent: (cardId: string, reviewer: string) => void;
  rejectContent: (cardId: string, reviewer: string, reason: string) => void;

  addDesignRequest: (req: Omit<DesignRequest, "id"> & { contentCardId?: string }) => Promise<DesignRequest>;
  updateDesignRequest: (id: string, updates: Partial<DesignRequest>) => Promise<void>;
  deleteDesignRequest: (id: string) => Promise<void>;

  /**
   * A etapa de design do card (Leva 5b): pedir arte, iniciar, pedir alteração, devolver, cancelar.
   * Uma rota só (/api/conteudo/design); o store aplica o card e o pedido que o servidor devolveu.
   * Lança com a frase do servidor quando recusa.
   */
  transicaoDesign: (cardId: string, acao: AcaoDesign, extras?: { briefing?: string | null }) => Promise<EstadoDoServidor>;
  /** Aplica no store o estado que uma rota devolveu (card e pedido já gravados). */
  aplicarDoServidor: (estado: EstadoDoServidor) => void;


  addCardComment: (cardId: string, author: string, role: Role, text: string) => void;
}

export const selectContentCards = (s: ContentState) => s.contentCards;
export const selectDesignRequests = (s: ContentState) => s.designRequests;
export const selectContentApprovals = (s: ContentState) => s.contentApprovals;
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
      loading: false,
      initialized: false,
      loadError: false,

      init: async (filter) => {
        if (get().initialized || get().loading) return;
        set({ loading: true }, false, "content/init/start");
        const params = filter?.socialMedia ? `?socialMedia=${encodeURIComponent(filter.socialMedia)}` : "";
        const r = await chamar<{ contentCards?: ContentCard[]; designRequests?: DesignRequest[]; contentApprovals?: ContentApproval[]; versao?: string }>(`/api/data/content${params}`);
        if (!r.ok || !r.data || !Array.isArray(r.data.contentCards)) {
          trilha("init:erro", { status: r.status });
          set({ loading: false, loadError: true }, false, "content/init/error");
          return;
        }
        const { contentCards, designRequests = [], contentApprovals = [], versao } = r.data;
        trilha("init:ok", { cards: contentCards.length, demandas: designRequests.length });
        set({ contentCards, designRequests, contentApprovals, versao, loading: false, initialized: true, loadError: false }, false, "content/init/done");
      },

      refresh: async (filter) => {
        // Refetch silencioso p/ polling do board: SEM flag de loading (não pisca a tela) e
        // sem o guard de init (serve justamente pra atualizar depois de já inicializado).
        // Primeira carga falhou? O polling tenta o init de novo — antes o board ficava vazio até o F5.
        if (!get().initialized) { if (!get().loading) await get().init(filter); return; }
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
          if (!res.ok) { trilha("refresh:erro", { status: res.status }); return; }
          const { contentCards, designRequests, contentApprovals, versao } = await res.json();
          // Escrita local depois que esta busca saiu? A resposta é velha: descarta e busca de novo.
          if (mutadoEm > disparadoEm || criacoesEmVoo.size > 0) {
            trilha("refresh:descartado-por-escrita-local");
            refreshEmVoo = false; ultimoRefresh = 0;
            setTimeout(() => { void get().refresh(filter); }, 1500);
            return;
          }
          // Otimistas ainda em voo (id temp-*) não existem no servidor: preserva até confirmar.
          const cards = get().contentCards, reqs = get().designRequests;
          const cardsTemp = cards.filter((c) => c.id.startsWith("temp-"));
          const reqsTemp = reqs.filter((r) => r.id.startsWith("temp-"));
          set({ contentCards: [...contentCards, ...cardsTemp], designRequests: [...reqsTemp, ...designRequests], contentApprovals, versao }, false, "content/refresh");
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

      addContentCard: async (card, opcoes) => {
        // Em voo: segundo clique no mesmo cliente+título devolve a criação que já está rodando.
        // No lote cada linha traz a própria chave — títulos iguais são cards diferentes.
        const chave = opcoes?.chave ?? `card|${card.clientId}|${card.title.trim().toLowerCase()}`;
        const emVoo = criacoesEmVoo.get(chave) as Promise<ContentCard> | undefined;
        if (emVoo) return emVoo;
        const p = (async () => {
        trilha("card:criar:inicio", { titulo: card.title, clientId: card.clientId });
        const tempId = `temp-cc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const optimistic: ContentCard = { ...card, id: tempId };
        marcarMutacao();
        set((s) => ({ contentCards: [...s.contentCards, optimistic] }), false, "content/card/add/optimistic");
        try {
          const r = await chamar<{ id: string; dedupe?: boolean }>("/api/content-cards/create", {
            ...card,
            ...(opcoes?.chave ? { idempotencyKey: opcoes.chave } : {}),
            ...(opcoes?.criadoPor ? { createdBy: opcoes.criadoPor } : {}),
          });
          if (!r.ok || !r.data?.id) { trilha("card:criar:erro", { titulo: card.title, status: r.status }); throw new Error(r.erro ?? "Resposta sem id"); }
          const { id, dedupe } = r.data;
          trilha("card:criar:ok", { titulo: card.title, id, dedupe: !!dedupe });
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
        const r = await chamar("/api/content-cards/update", { id, ...updates });
        if (!r.ok) {
          trilha("card:update:erro", { id, campos: Object.keys(updates), status: r.status });
          if (prev) set((s) => ({ contentCards: s.contentCards.map((c) => c.id === id ? prev : c) }), false, "content/card/update/rollback");
          // O aviso mora AQUI: metade dos chamadores não tinha catch e a falha passava calada.
          toast.error(`Não salvei${prev ? ` "${prev.title}"` : " o card"}: ${r.erro} A tela voltou ao que estava.`);
          throw new Error(r.erro ?? `HTTP ${r.status}`);
        }
      },

      deleteContentCard: async (id) => {
        const prev = get().contentCards.find((c) => c.id === id);
        marcarMutacao();
        set((s) => ({ contentCards: s.contentCards.filter((c) => c.id !== id) }), false, "content/card/delete/optimistic");
        // O servidor ARQUIVA (archived_at) — recuperável em "Arquivadas".
        const r = await chamar("/api/content-cards/delete", { id });
        if (!r.ok) {
          if (prev) set((s) => ({ contentCards: s.contentCards.some((c) => c.id === id) ? s.contentCards : [...s.contentCards, prev] }), false, "content/card/delete/rollback");
          throw new Error(r.erro ?? `HTTP ${r.status}`);
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
            c.id === cardId ? { ...c, status: statusDaEtapa("agendado"), statusChangedAt: new Date().toISOString() } : c
          ),
        }), false, "content/approve");
        // O save NÃO pode falhar em silêncio: antes era .catch(() => {}), então uma falha no
        // servidor deixava a UI mostrando "aprovado" sem ter gravado nada. Agora desfaz o
        // update otimista e avisa o social via notificação.
        authedFetch("/api/content-cards/update", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: cardId, status: statusDaEtapa("agendado"), contentApproval: { status: "approved", reviewedBy: reviewer, reviewedAt: new Date().toISOString() } }) })
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
        const agora = new Date().toISOString();
        const approval: ContentApproval = {
          id: `ca-${Date.now()}`,
          cardId,
          status: "rejected",
          reviewedBy: reviewer,
          reviewedAt: agora,
          reason,
        };
        set((s) => ({
          contentApprovals: [...s.contentApprovals.filter((a) => a.cardId !== cardId), approval],
          contentCards: s.contentCards.map((c) =>
            c.id === cardId ? { ...c, status: statusDaEtapa("com_designer"), statusChangedAt: agora, alteracaoPendenteEm: agora, alteracaoMotivo: reason, designerDeliveredAt: undefined, socialConfirmedAt: undefined } : c
          ),
        }), false, "content/reject");
        // Leva 5b: reprovar = PEDIR ALTERAÇÃO — uma transição só no servidor (card volta pro designer,
        // entrega anterior deixa de valer, pedido reaberto, reprovação e retrabalho gravados). Antes
        // eram dois fetches daqui: o card e, se desse certo, a demanda — e o segundo falhava calado.
        get().transicaoDesign(cardId, { tipo: "pedir_alteracao", motivo: reason })
          .then(() => {
            if (card) {
              import("@/stores/useNotificationsStore").then(({ useNotificationsStore }) => {
                // COM O CARD: o designer clica na reprova e cai NA ARTE que precisa refazer.
                useNotificationsStore.getState().push("content", "Conteúdo reprovado", `"${card.title}" de ${card.clientName} foi reprovado: ${reason}`, card.clientId, card.id);
              });
            }
          })
          .catch((err: unknown) => {
            set((s) => ({
              contentApprovals: prevApprovals,
              contentCards: prevCard ? s.contentCards.map((c) => c.id === cardId ? prevCard : c) : s.contentCards,
            }), false, "content/reject/rollback");
            import("@/stores/useNotificationsStore").then(({ useNotificationsStore }) => {
              useNotificationsStore.getState().push("system", "Falha ao reprovar a arte", `Não deu pra salvar a reprovação${card ? ` de "${card.title}"` : ""}: ${err instanceof Error ? err.message : "erro"}. Tente de novo.`, card?.clientId);
            });
          });
      },

      transicaoDesign: async (cardId, acao, extras) => {
        marcarMutacao();
        const r = await chamar<EstadoDoServidor>("/api/conteudo/design", { cardId, acao, ...(extras?.briefing ? { briefing: extras.briefing } : {}) });
        if (!r.ok || !r.data) {
          trilha("design:transicao:erro", { cardId, acao: acao.tipo, status: r.status });
          // Recusa por concorrência: recarrega pra pessoa ver o estado de verdade.
          if (r.status === 409) void get().refresh();
          throw new Error(r.erro ?? "Não consegui mexer na arte.");
        }
        trilha("design:transicao:ok", { cardId, acao: acao.tipo });
        get().aplicarDoServidor(r.data);
        return r.data;
      },

      aplicarDoServidor: (estado) => {
        marcarMutacao();
        set((s) => {
          let contentCards = s.contentCards;
          let designRequests = s.designRequests;
          const card = estado.card;
          if (card) {
            if (card.archivedAt) contentCards = contentCards.filter((c) => c.id !== card.id);
            else if (contentCards.some((c) => c.id === card.id)) {
              // Preserva o que o servidor não manda nesta rota (comentários, anexos carregados).
              // A capa (imageUrl) do store vem dos anexos, calculada na carga — a rota manda só a coluna.
              contentCards = contentCards.map((c) => c.id === card.id
                ? { ...c, ...card, comments: c.comments, cardAttachments: c.cardAttachments, imageUrl: card.imageUrl || c.imageUrl }
                : c);
            } else contentCards = [...contentCards, card];
          }
          if (estado.pedidoRemovido) designRequests = designRequests.filter((r) => r.id !== estado.pedidoRemovido);
          const pedido = estado.pedido;
          if (pedido) {
            designRequests = designRequests.some((r) => r.id === pedido.id)
              ? designRequests.map((r) => r.id === pedido.id ? { ...r, ...pedido } : r)
              : [pedido, ...designRequests];
          }
          return { contentCards, designRequests };
        }, false, "content/servidor");
      },

      addDesignRequest: async (req) => {
        const chave = `demanda|${req.contentCardId ?? `${req.clientId}|${req.title.trim().toLowerCase()}`}`;
        const emVoo = criacoesEmVoo.get(chave) as Promise<DesignRequest> | undefined;
        if (emVoo) return emVoo;
        const p = (async () => {
        trilha("demanda:criar:inicio", { titulo: req.title, card: req.contentCardId ?? null, clientId: req.clientId });
        const tempId = `temp-dr-${Date.now()}`;
        const optimistic: DesignRequest = { ...req, id: tempId } as DesignRequest;
        marcarMutacao();
        set((s) => ({ designRequests: [optimistic, ...s.designRequests] }), false, "content/design/add/optimistic");
        try {
          const r = await authedFetch("/api/design-requests/create", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(req) });
          if (!r.ok) { trilha("demanda:criar:erro", { titulo: req.title, status: r.status }); throw new Error(`HTTP ${r.status}`); }
          const { id, semDesigner, dedupe, designer, atribuicao, card, pedido } = await r.json() as
            { id: string; semDesigner?: boolean; dedupe?: boolean; designer?: string | null; atribuicao?: MotivoEscolha | null; card?: ContentCard | null; pedido?: DesignRequest | null };
          trilha("demanda:criar:ok", { titulo: req.title, id, card: req.contentCardId ?? null, dedupe: !!dedupe, semDesigner: !!semDesigner, designer: designer ?? null, atribuicao: atribuicao ?? null });
          // O servidor escolhe o dono quando o cliente não tem designer na ficha. Quem criou precisa
          // saber pra qual quadro foi — antes essa frase era um pedido de "arrume na ficha" que
          // ninguém arrumava, e a demanda ficava invisível em "(sem designer)".
          if (semDesigner) {
            toast.warning(`"${req.title}" foi criada, mas não há designer ativo no time pra receber — ela ficou em "(sem designer)".`, { duration: 9000 });
          } else if (designer && atribuicao && atribuicao !== "carteira") {
            toast.info(avisoDeAtribuicao({ designer, motivo: atribuicao }, req.clientName), { duration: 7000 });
          }
          const confirmed = (pedido ?? { ...optimistic, id, assignedDesigner: designer ?? undefined }) as DesignRequest;
          marcarMutacao();
          set((s) => ({
            // O pedido repetido (clique duplo) já pode estar na lista: não duplica.
            designRequests: s.designRequests.some((x) => x.id === confirmed.id)
              ? s.designRequests.filter((x) => x.id !== tempId).map((x) => x.id === confirmed.id ? confirmed : x)
              : s.designRequests.map((x) => x.id === tempId ? confirmed : x),
          }), false, "content/design/add/confirmed");
          // O card do pedido (o que já existia, agora "Com o designer"; ou o que nasceu com o pedido).
          if (card) get().aplicarDoServidor({ card });
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
          const corpo = await res.json().catch(() => ({})) as { error?: string } & EstadoDoServidor;
          if (!res.ok) throw new Error(corpo.error || `HTTP ${res.status}`);
          // Mudança de status do pedido é transição do card: o servidor devolve os dois como ficaram.
          if (corpo.card || corpo.pedido) get().aplicarDoServidor(corpo);
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
