import { create } from "zustand";
import { devtools, subscribeWithSelector } from "zustand/middleware";
import type { AppNotification, NotificationType } from "@/lib/types";
import { authedFetch } from "@/lib/supabase/authed-fetch";
import { chamar } from "@/lib/api/chamar";
import { supabase, REALTIME_ENABLED } from "@/lib/supabase/client";
import { ehTemporario, idsNaoLidos, marcarNaLista } from "@/lib/notificacoes/lidas";

interface NotificationsState {
  notifications: AppNotification[];
  initialized: boolean;
  /** A última leitura falhou (24/10/2026, auditoria 4.11): o sino diz "não carregou" em vez de "Tudo em dia". */
  erroCarga: string | null;

  init: () => Promise<void>;
  refresh: () => Promise<void>;
  subscribeRealtime: () => () => void;

  push: (type: NotificationType, title: string, body: string, clientId?: string, cardId?: string) => Promise<void>;
  markRead: (id: string) => Promise<void>;
  /** Marca SÓ estes ids (os não lidos que estão na tela). Devolve quais marcou — é o que o Desfazer volta. */
  markAllRead: (ids: string[]) => Promise<{ ok: boolean; erro: string | null; marcadas: string[] }>;
  /** O Desfazer do "Marcar todas como lidas": volta estes ids para não lidos. */
  desmarcarLidas: (ids: string[]) => Promise<{ ok: boolean; erro: string | null }>;
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
      erroCarga: null,

      // ORDEM É PELO HORÁRIO DO SERVIDOR, SEMPRE. Concatenar listas sem reordenar deixava o item
      // otimista preso no topo (relógio do navegador) acima de avisos mais novos — foi o "ordem
      // errada depois das entregas". Mais novo primeiro; empate desempata por id pra a ordem não
      // dançar entre renders.
      init: async () => {
        if (get().initialized) return;
        // FALHA ≠ VAZIO (24/10/2026): antes o erro era engolido e o sino vazio dizia "Tudo em dia".
        const r = await chamar<{ notifications: AppNotification[] }>("/api/data/notifications");
        if (!r.ok || !r.data) { set({ erroCarga: r.erro ?? "Não consegui carregar os avisos." }, false, "notifs/init/erro"); return; }
        set({ notifications: ordenar(r.data.notifications ?? []), initialized: true, erroCarga: null }, false, "notifs/init/done");
      },

      // Recarrega do banco (o init tem guard e só roda 1x). Usado no poll do AppShell pra que
      // notificações de OUTROS usuários (ex: "Conteúdo reprovado" pelo social) cheguem sem F5.
      refresh: async () => {
        const r = await chamar<{ notifications: AppNotification[] }>("/api/data/notifications");
        if (!r.ok || !r.data) { set({ erroCarga: r.erro ?? "Não consegui carregar os avisos." }, false, "notifs/refresh/erro"); return; }
        const notifications = r.data.notifications ?? [];
        set((s) => {
          // Banco é a verdade; preserva locais recém-empurrados que ainda não voltaram dele.
          const dbIds = new Set(notifications.map((n) => n.id));
          // Só sobrevive o local que AINDA está subindo. O temporário que já virou linha no banco
          // não é reconhecido pelo id (o banco gera outro), então some por idade — senão ele
          // duplicaria o aviso real e ficaria colado no topo pra sempre.
          const localOnly = s.notifications.filter(
            (n) => !dbIds.has(n.id) && (!n.id.startsWith("temp-") || Date.now() - Date.parse(n.createdAt) < 30_000),
          );
          return { notifications: ordenar([...localOnly, ...notifications]), initialized: true, erroCarga: null };
        }, false, "notifs/refresh");
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
              falar: row.falar === true,
              avisoId: (row.aviso_id as string | null) ?? undefined,
              paraMim: row.target_user != null,
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

      // SÓ OS DA TELA, E A FALHA APARECE (21/10/2026). Antes marcava a lista inteira aqui e mandava o
      // servidor marcar a tabela toda, sem olhar a resposta: limpava o sino do time e, se a rede caía,
      // a tela dizia "lidas" e elas voltavam na próxima leitura. Agora: marca na hora (otimista),
      // e se o servidor recusar, volta exatamente o que mudou e devolve a frase do erro.
      markAllRead: async (ids) => {
        const naoLidos = new Set(idsNaoLidos(get().notifications));
        const alvo = ids.filter((id) => naoLidos.has(id));
        if (!alvo.length) return { ok: true, erro: null, marcadas: [] };
        set((s) => ({ notifications: marcarNaLista(s.notifications, alvo, true) }), false, "notifs/markAllRead");
        const doBanco = alvo.filter((id) => !ehTemporario(id));
        if (!doBanco.length) return { ok: true, erro: null, marcadas: alvo };
        const r = await chamar<{ marcados?: string[] }>("/api/data/notifications", { action: "markAllRead", ids: doBanco });
        if (!r.ok) {
          set((s) => ({ notifications: marcarNaLista(s.notifications, alvo, false) }), false, "notifs/markAllRead/rollback");
          return { ok: false, erro: r.erro, marcadas: [] };
        }
        // O servidor só marca os desta pessoa e os do time: o que ele recusou volta a não lido aqui
        // também, senão a tela mostraria "lido" e o aviso voltaria na próxima leitura.
        const doServidor = new Set(r.data?.marcados ?? doBanco);
        const recusados = doBanco.filter((id) => !doServidor.has(id));
        if (recusados.length) set((s) => ({ notifications: marcarNaLista(s.notifications, recusados, false) }), false, "notifs/markAllRead/recusados");
        return { ok: true, erro: null, marcadas: alvo.filter((id) => !recusados.includes(id)) };
      },

      desmarcarLidas: async (ids) => {
        if (!ids.length) return { ok: true, erro: null };
        set((s) => ({ notifications: marcarNaLista(s.notifications, ids, false) }), false, "notifs/desmarcar");
        const doBanco = ids.filter((id) => !ehTemporario(id));
        if (!doBanco.length) return { ok: true, erro: null };
        const r = await chamar("/api/data/notifications", { action: "markUnread", ids: doBanco });
        if (!r.ok) {
          set((s) => ({ notifications: marcarNaLista(s.notifications, ids, true) }), false, "notifs/desmarcar/rollback");
          return { ok: false, erro: r.erro };
        }
        return { ok: true, erro: null };
      },
    })),
    { name: "NotificationsStore" }
  )
);
