import { create } from "zustand";
import { toast } from "sonner";
import { devtools, subscribeWithSelector } from "zustand/middleware";
import type { Client, ClientStatus, ChatMessage } from "@/lib/types";
import { supabase, REALTIME_ENABLED } from "@/lib/supabase/client";
import { authedFetch } from "@/lib/supabase/authed-fetch";
import { chamar } from "@/lib/api/chamar";
import { rotuloResultadoAnuncio, TITULO_RESULTADO_ANUNCIO } from "@/lib/scores/resultado-anuncio";

/** Patch de cliente: `null` apaga o campo no banco (undefined = não mexe). */
export type ClientPatch = { [K in keyof Client]?: Client[K] | null };

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

interface ClientsState {
  clients: Client[];
  clientChats: Record<string, ChatMessage[]>;
  loading: boolean;
  initialized: boolean;
  /** Por que a última carga falhou (null = não falhou). Erro de leitura não é carteira vazia. */
  erro: string | null;

  // Actions
  init: () => Promise<void>;
  /** Confere, sem piscar a tela, quem cuida de cada cliente e se entrou cliente novo. */
  atualizarEquipe: () => Promise<void>;
  subscribeRealtime: () => () => void;

  addClient: (data: Omit<Client, "id" | "status" | "attentionLevel" | "tags" | "joinDate" | "lastPostDate"> & Partial<Pick<Client, "status" | "attentionLevel" | "tags" | "joinDate" | "lastPostDate">>) => Promise<Client>;
  updateClient: (id: string, updates: ClientPatch) => Promise<void>;
  /** Só o estado local — para quem já gravou por rota própria (portal, ficha viva, pausa). */
  patchClientLocal: (id: string, patch: ClientPatch) => void;
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

// Conferência da carteira (25/11/2026): o realtime está desligado no servidor, e o designer recém-colocado num
// cliente só aparecia para ele depois de um F5. Resposta que saiu antes de uma gravação local é descartada.
const INTERVALO_EQUIPE = 45_000;
let conferindo = false;
let conferidoEm = 0;
let mutacoes = 0; // quantas gravações já começaram ou terminaram
let gravando = 0; // quantas estão em voo
const marcar = () => { mutacoes++; };
type Equipe = Pick<Client, "id" | "assignedTraffic" | "assignedSocial" | "assignedDesigner">;

export const useClientsStore = create<ClientsState>()(
  devtools(
    subscribeWithSelector((set, get) => ({
      clients: [],
      clientChats: {},
      loading: false,
      initialized: false,
      erro: null,

      // ── Fetch all clients + chats from Supabase ──────────────────────────
      init: async () => {
        if (get().initialized || get().loading) return;
        set({ loading: true, erro: null }, false, "clients/init/start");
        const r = await chamar<{ clients?: Client[]; clientChats?: Record<string, ChatMessage[]> }>("/api/data/clients");
        if (!r.ok || !Array.isArray(r.data?.clients)) {
          // Sem isto a lista ficava vazia em silêncio e a tela dizia "nenhum cliente na sua carteira"
          // como se fosse verdade. Erro de carga não é lista vazia. 24/10/2026 (auditoria 3.11): o
          // motivo fica no store para a tela mostrar com "Tentar de novo" (init() volta a tentar).
          const erro = r.erro ?? "A lista de clientes veio vazia do servidor.";
          console.error("[clients/init] falhou:", erro);
          set({ loading: false, erro }, false, "clients/init/error");
          return;
        }
        set({ clients: r.data!.clients!, clientChats: r.data!.clientChats ?? {}, loading: false, initialized: true, erro: null }, false, "clients/init/done");
      },

      atualizarEquipe: async () => {
        if (!get().initialized) { await get().init(); return; }
        if (conferindo || gravando || Date.now() - conferidoEm < INTERVALO_EQUIPE) return;
        conferindo = true;
        conferidoEm = Date.now();
        const antes = mutacoes;
        try {
          const r = await chamar<{ equipe?: Equipe[] }>("/api/data/clients?so=equipe");
          // Falhou: fica a lista que está na tela; a próxima conferência tenta de novo.
          if (!r.ok || !Array.isArray(r.data?.equipe) || mutacoes !== antes) return;
          const equipe = new Map(r.data!.equipe!.map((e) => [e.id, e]));
          const conhecidos = new Set(get().clients.map((c) => c.id));
          let novos: Client[] = [];
          if ([...equipe.keys()].some((id) => !conhecidos.has(id))) {
            const t = await chamar<{ clients?: Client[] }>("/api/data/clients");
            if (mutacoes !== antes) return;
            novos = (t.data?.clients ?? []).filter((c) => !conhecidos.has(c.id));
          }
          let mudou = novos.length > 0;
          // Só os responsáveis: o resto da ficha continua o que a pessoa está vendo (e talvez editando).
          const clients = get().clients.map((c) => {
            const e = equipe.get(c.id);
            if (!e || (e.assignedTraffic === c.assignedTraffic && e.assignedSocial === c.assignedSocial && e.assignedDesigner === c.assignedDesigner)) return c;
            mudou = true;
            return { ...c, assignedTraffic: e.assignedTraffic, assignedSocial: e.assignedSocial, assignedDesigner: e.assignedDesigner };
          });
          if (mudou) set({ clients: [...clients, ...novos] }, false, "clients/equipe");
        } finally { conferindo = false; }
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
        marcar();
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
        // 24/10/2026 (auditoria 3.8): o motivo da rota chega a quem cadastrou — antes virava
        // "HTTP 409" e o "esta conta Meta é do cliente X" se perdia no caminho.
        const r = await chamar<{ id?: string }>("/api/data/clients", data);
        const id = r.data?.id;
        if (!r.ok || !id) {
          set((s) => ({ clients: s.clients.filter((c) => c.id !== tempId) }), false, "clients/add/rollback");
          throw new Error(r.erro ?? "O servidor não devolveu o cliente criado.");
        }
        marcar();
        const confirmed: Client = { ...optimistic, id };
        set((s) => ({
          clients: s.clients.map((c) => c.id === tempId ? confirmed : c),
        }), false, "clients/add/confirmed");
        return confirmed;
      },

      // ── updateClient ──────────────────────────────────────────────────────
      updateClient: async (id, updates) => {
        const prev = get().clients.find((c) => c.id === id);
        marcar(); gravando++;
        set((s) => ({
          clients: s.clients.map((c) => c.id === id ? ({ ...c, ...updates } as Client) : c),
        }), false, "clients/update/optimistic");
        try {
          const r = await chamar<{ client?: Record<string, unknown> }>("/api/clients/update", { id, ...updates });
          if (!r.ok) throw new Error(r.erro ?? "Não consegui salvar o cliente.");
          // Designer trocado: as artes já abertas continuam com quem estavam — oferece passar (25/11/2026).
          if (updates.assignedDesigner !== undefined && prev) {
            const ficou = r.data?.client ? (r.data.client.assigned_designer as string | null) : updates.assignedDesigner;
            void import("@/lib/design/passar-artes").then((m) => m.oferecerPassarArtes(id, prev.assignedDesigner, ficou)).catch(() => {});
          }
        } catch (err) {
          if (prev) {
            set((s) => ({
              clients: s.clients.map((c) => c.id === id ? prev : c),
            }), false, "clients/update/rollback");
          }
          throw err;
        } finally { marcar(); gravando--; }
      },

      patchClientLocal: (id, patch) => {
        marcar();
        set((s) => ({
          clients: s.clients.map((c) => c.id === id ? ({ ...c, ...patch } as Client) : c),
        }), false, "clients/patch/local");
      },

      // ── updateClientStatus ────────────────────────────────────────────────
      updateClientStatus: async (id, status, actor) => {
        const prev = get().clients.find((c) => c.id === id);
        set((s) => ({
          clients: s.clients.map((c) => c.id === id ? { ...c, status } : c),
        }), false, "clients/status/optimistic");
        const r = await chamar("/api/clients/update", { id, status });
        if (!r.ok) {
          if (prev) {
            set((s) => ({
              clients: s.clients.map((c) => c.id === id ? prev : c),
            }), false, "clients/status/rollback");
          }
          // Sem throw: nenhum chamador trata, e o toast já conta o que houve.
          toast.error(r.erro ?? "Não consegui mudar o resultado do anúncio.");
          return;
        }
        // O status já está salvo; falhar só o histórico não desfaz a mudança, mas avisa.
        const t = await chamar("/api/data/operational/mutations", {
          action: "insertTimeline",
          entry: {
            clientId: id, type: "status", actor,
            description: `${TITULO_RESULTADO_ANUNCIO}: ${rotuloResultadoAnuncio(prev?.status)} → ${rotuloResultadoAnuncio(status)}`,
            timestamp: new Date().toISOString(),
          },
        });
        if (!t.ok) toast.error("Status salvo, mas não entrou no histórico do cliente.");
      },

      // ── sendClientMessage ─────────────────────────────────────────────────
      sendClientMessage: (clientId, user, text) => {
        const tempMsg: ChatMessage = {
          id: `temp-msg-${Date.now()}`,
          user,
          text,
          // Mesmo formato "dd/mm hh:mm" (SP) do que é persistido — senão a msg otimista aparecia
          // como ISO cru (2026-07-10T16:45:00.000Z) até dar reload.
          timestamp: new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }),
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
