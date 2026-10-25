import { create } from "zustand";
import { devtools, subscribeWithSelector } from "zustand/middleware";
import type {
  TimelineEntry,
  OnboardingItem,
  Task,
  Notice,
  CreativeAsset,
  SocialProofEntry,
  QuinzReport,
  MoodEntry,
  MoodType,
  ClientAccess,
} from "@/lib/types";
import { authedFetch } from "@/lib/supabase/authed-fetch";
import { chamar } from "@/lib/api/chamar";
import { toast } from "sonner";
import { supabase, REALTIME_ENABLED } from "@/lib/supabase/client";

interface OperationalState {
  timeline: Record<string, TimelineEntry[]>;
  onboarding: Record<string, OnboardingItem[]>;
  tasks: Task[];
  notices: Notice[];
  creativeAssets: Record<string, CreativeAsset[]>;
  socialProofs: Record<string, SocialProofEntry[]>;
  quinzReports: QuinzReport[];
  moodHistory: Record<string, MoodEntry[]>;
  clientAccess: Record<string, ClientAccess>;
  initialized: boolean;
  /** A carga inteira falhou (rede, servidor). Com erro, `initialized` fica false e "Tentar de novo" recarrega. */
  loadError: string | null;
  /** As tarefas não carregaram (carga inteira ou só elas): a lista NÃO é "nenhuma tarefa" (25/10/2026, 13.4/6.4). */
  tarefasErro: string | null;

  init: () => Promise<void>;
  /** Recarrega mesmo já carregado — o botão "Tentar de novo". */
  recarregar: () => Promise<void>;
  subscribeRealtime: () => () => void;

  addTimelineEntry: (entry: Omit<TimelineEntry, "id">) => Promise<void>;
  toggleOnboardingItem: (clientId: string, itemId: string, actor: string) => Promise<void>;

  addCreativeAsset: (asset: Omit<CreativeAsset, "id">) => Promise<void>;
  addSocialProof: (entry: Omit<SocialProofEntry, "id" | "createdAt">) => Promise<void>;
  addQuinzReport: (report: Omit<QuinzReport, "id" | "createdAt">) => Promise<void>;
  addMoodEntry: (clientId: string, mood: MoodType, note: string, actor: string) => void;
  updateClientAccess: (clientId: string, access: Partial<ClientAccess>, actor: string) => Promise<void>;

  addTask: (task: Omit<Task, "id">) => Promise<Task>;
  updateTask: (id: string, updates: Partial<Task>) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;

  addNotice: (data: { title: string; body: string; urgent: boolean; createdBy: string; scheduledAt?: string; category?: string }) => Promise<void>;
  deleteNotice: (id: string) => Promise<void>;
}

export const selectCreativeAssets = (s: OperationalState) => s.creativeAssets;
export const selectClientCreativeAssets = (clientId: string) => (s: OperationalState) =>
  s.creativeAssets[clientId] ?? [];
export const selectSocialProofs = (s: OperationalState) => s.socialProofs;
export const selectClientSocialProofs = (clientId: string) => (s: OperationalState) =>
  s.socialProofs[clientId] ?? [];
export const selectQuinzReports = (s: OperationalState) => s.quinzReports;
export const selectMoodHistory = (s: OperationalState) => s.moodHistory;
export const selectClientMoodHistory = (clientId: string) => (s: OperationalState) =>
  s.moodHistory[clientId] ?? [];
export const selectClientAccess = (s: OperationalState) => s.clientAccess;
export const selectTimeline = (s: OperationalState) => s.timeline;
export const selectClientTimeline = (clientId: string) => (s: OperationalState) =>
  s.timeline[clientId] ?? [];
export const selectOnboarding = (s: OperationalState) => s.onboarding;
export const selectClientOnboarding = (clientId: string) => (s: OperationalState) =>
  s.onboarding[clientId] ?? [];
export const selectTasks = (s: OperationalState) => s.tasks;
/** As tarefas da tela são a verdade? Carregadas e sem erro. Antes disso, "nenhuma tarefa" não pode aparecer. */
export const selectTarefasProntas = (s: OperationalState) => s.initialized && !s.tarefasErro;
export const selectNotices = (s: OperationalState) => s.notices;

/** Carga em andamento — init do casco e da tela ao mesmo tempo não fazem duas idas ao servidor. */
let carregando: Promise<void> | null = null;

export const useOperationalStore = create<OperationalState>()(
  devtools(
    subscribeWithSelector((set, get) => ({
      timeline: {},
      onboarding: {},
      tasks: [],
      notices: [],
      creativeAssets: {},
      socialProofs: {},
      quinzReports: [],
      moodHistory: {},
      clientAccess: {},
      initialized: false,
      loadError: null,
      tarefasErro: null,

      init: async () => {
        // Tarefas com erro também recarregam: o casco chama init a cada 45 s e assim tenta de novo sozinho.
        if (get().initialized && !get().tarefasErro) return;
        await get().recarregar();
      },

      // 25/10/2026 (auditoria 13.4/6.4): o `catch {}` engolia a falha — a lista de tarefas dizia "Nenhuma tarefa em
      // aberto" e o Hoje "Tudo em dia!". Agora a falha vira `loadError`/`tarefasErro`, e o que já estava na tela fica.
      recarregar: () => {
        if (carregando) return carregando;
        carregando = (async () => {
          type Payload = {
            timeline: Record<string, TimelineEntry[]>; onboardingItems: Record<string, OnboardingItem[]>;
            tasks: Task[] | null; tarefasErro?: string | null; notices: Notice[];
            creativeAssets: Record<string, CreativeAsset[]>; socialProofs: Record<string, SocialProofEntry[]>;
            quinzReports: QuinzReport[]; moodEntries: Record<string, MoodEntry[]>; clientAccess: Record<string, ClientAccess>;
          };
          const r = await chamar<Payload>("/api/data/operational");
          if (!r.ok || !r.data) {
            const motivo = r.erro ?? "O servidor não devolveu os dados.";
            set({ loadError: motivo, tarefasErro: `Não consegui carregar as tarefas: ${motivo}` }, false, "ops/init/error");
            return;
          }
          const d = r.data;
          set((s) => ({
            timeline: d.timeline, onboarding: d.onboardingItems, notices: d.notices, creativeAssets: d.creativeAssets,
            socialProofs: d.socialProofs, quinzReports: d.quinzReports, moodHistory: d.moodEntries, clientAccess: d.clientAccess,
            // Tarefas que não vieram mantêm as que já estavam na tela (se havia), com o aviso de erro por cima.
            tasks: d.tasks ?? s.tasks,
            tarefasErro: d.tasks ? null : `Não consegui carregar as tarefas: ${d.tarefasErro || "o servidor não devolveu a lista"}`,
            loadError: null, initialized: true,
          }), false, "ops/init/done");
        })().finally(() => { carregando = null; });
        return carregando;
      },

      subscribeRealtime: () => {
        // Realtime desligado no servidor (RAM) — não tenta o WebSocket pra não spammar o console.
        if (!REALTIME_ENABLED) return () => {};
        const channel = supabase
          .channel("store:operational")
          .on("postgres_changes", { event: "INSERT", schema: "public", table: "tasks" }, (p) => {
            if (!p.new) return;
            const task = p.new as unknown as Task;
            set((s) => ({
              tasks: s.tasks.some((t) => t.id === task.id) ? s.tasks : [...s.tasks, task],
            }), false, "ops/rt/task/insert");
          })
          .on("postgres_changes", { event: "UPDATE", schema: "public", table: "tasks" }, (p) => {
            if (!p.new) return;
            const updated = p.new as unknown as Task;
            set((s) => ({
              tasks: s.tasks.map((t) => t.id === updated.id ? { ...t, ...updated } : t),
            }), false, "ops/rt/task/update");
          })
          .on("postgres_changes", { event: "DELETE", schema: "public", table: "tasks" }, (p) => {
            const id = (p.old as { id?: string })?.id;
            if (id) set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) }), false, "ops/rt/task/delete");
          })
          .subscribe();
        return () => { supabase.removeChannel(channel); };
      },

      addTimelineEntry: async (entry) => {
        const res = await authedFetch("/api/data/operational/mutations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "insertTimeline", entry }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const { timeline } = await res.json();
        set({ timeline }, false, "ops/timeline/add");
      },

      toggleOnboardingItem: async (clientId, itemId, actor) => {
        const items = get().onboarding[clientId] ?? [];
        const item = items.find((i) => i.id === itemId);
        if (!item) return;
        const completed = !item.completed;
        set((s) => ({
          onboarding: {
            ...s.onboarding,
            [clientId]: (s.onboarding[clientId] ?? []).map((i) =>
              i.id === itemId ? { ...i, completed, completedAt: completed ? new Date().toISOString() : undefined } : i
            ),
          },
        }), false, "ops/onboarding/toggle/optimistic");
        const r = await chamar("/api/data/operational/mutations", { action: "updateOnboarding", itemId, completed, actor });
        if (!r.ok) {
          set((s) => ({
            onboarding: {
              ...s.onboarding,
              [clientId]: (s.onboarding[clientId] ?? []).map((i) => i.id === itemId ? item : i),
            },
          }), false, "ops/onboarding/toggle/rollback");
          // 24/10/2026 (auditoria 3.15): o item voltava ao estado anterior sem dizer nada — parecia
          // que o clique não tinha pegado, e a pessoa seguia achando que tinha marcado.
          const motivo = (r.erro ?? "erro desconhecido").replace(/[.?!\s]+$/, "");
          toast.error(`Não salvei "${item.label}" ${completed ? "como feito" : "como pendente"}: ${motivo}. O item voltou como estava.`);
        }
      },

      addMoodEntry: (clientId, mood, note, actor) => {
        const entry: MoodEntry = {
          id: `mood-${Date.now()}`,
          mood,
          note: note || undefined,
          recordedBy: actor,
          date: new Date().toISOString().split("T")[0],
        };
        set((s) => ({
          moodHistory: {
            ...s.moodHistory,
            [clientId]: [entry, ...(s.moodHistory[clientId] ?? [])],
          },
        }), false, "ops/mood/add/optimistic");
        authedFetch("/api/data/operational/mutations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "insertMood", clientId, mood, note, actor }),
        }).catch(() => {});
      },

      updateClientAccess: async (clientId, access, actor) => {
        const prev = get().clientAccess[clientId];
        set((s) => ({
          clientAccess: {
            ...s.clientAccess,
            [clientId]: { ...(s.clientAccess[clientId] ?? { clientId }), ...access, clientId, updatedBy: actor, updatedAt: new Date().toISOString() },
          },
        }), false, "ops/access/update/optimistic");
        try {
          const res = await authedFetch("/api/data/operational/mutations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "upsertClientAccess", clientId, access, actor }),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
        } catch {
          if (prev !== undefined) {
            set((s) => ({ clientAccess: { ...s.clientAccess, [clientId]: prev } }), false, "ops/access/update/rollback");
          }
        }
      },

      addCreativeAsset: async (asset) => {
        const res = await authedFetch("/api/data/operational/mutations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "insertCreativeAsset", asset }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const { creativeAssets } = await res.json();
        set({ creativeAssets }, false, "ops/creative/add");
      },

      addSocialProof: async (entry) => {
        const res = await authedFetch("/api/data/operational/mutations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "insertSocialProof", entry }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const { socialProofs } = await res.json();
        set({ socialProofs }, false, "ops/socialproof/add");
      },

      addQuinzReport: async (report) => {
        const tempId = `temp-quinz-${Date.now()}`;
        const optimistic: QuinzReport = {
          ...report,
          id: tempId,
          createdAt: new Date().toISOString(),
        } as QuinzReport;
        set((s) => ({ quinzReports: [optimistic, ...s.quinzReports] }), false, "ops/quinz/add/optimistic");
        try {
          const res = await authedFetch("/api/data/operational/mutations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "insertQuinzReport", report }),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const { quinzReports } = await res.json();
          set({ quinzReports }, false, "ops/quinz/add/confirmed");
        } catch (err) {
          set((s) => ({ quinzReports: s.quinzReports.filter((r) => r.id !== tempId) }), false, "ops/quinz/add/rollback");
          throw err;
        }
      },

      addTask: async (task) => {
        const tempId = `temp-task-${Date.now()}`;
        const optimistic: Task = { ...task, id: tempId } as Task;
        set((s) => ({ tasks: [...s.tasks, optimistic] }), false, "ops/task/add/optimistic");
        // TAREFAS COM O MOTIVO DO SERVIDOR (24/10/2026, auditoria 4.15): o erro jogado para a tela era "HTTP 500" e
        // a tela trocava por uma frase genérica. `chamar` traz a frase do servidor; quem chama mostra `erro.message`.
        const r = await chamar<{ id?: string }>("/api/tasks/create", task);
        if (!r.ok) {
          set((s) => ({ tasks: s.tasks.filter((t) => t.id !== tempId) }), false, "ops/task/add/rollback");
          throw new Error(r.erro ?? "Não consegui criar a tarefa.");
        }
        const confirmed: Task = { ...optimistic, id: r.data?.id ?? tempId };
        set((s) => ({
          tasks: s.tasks.map((t) => t.id === tempId ? confirmed : t),
        }), false, "ops/task/add/confirmed");
        return confirmed;
      },

      updateTask: async (id, updates) => {
        const prev = get().tasks.find((t) => t.id === id);
        set((s) => ({
          tasks: s.tasks.map((t) => t.id === id ? { ...t, ...updates } : t),
        }), false, "ops/task/update/optimistic");
        const r = await chamar("/api/tasks/update", { id, ...updates });
        if (!r.ok) {
          if (prev) set((s) => ({ tasks: s.tasks.map((t) => t.id === id ? prev : t) }), false, "ops/task/update/rollback");
          throw new Error(r.erro ?? "Não consegui salvar a tarefa.");
        }
      },

      deleteTask: async (id) => {
        const prev = get().tasks.find((t) => t.id === id);
        set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) }), false, "ops/task/delete/optimistic");
        const r = await chamar("/api/tasks/delete", { id });
        if (!r.ok) {
          if (prev) set((s) => ({ tasks: s.tasks.some((t) => t.id === id) ? s.tasks : [...s.tasks, prev] }), false, "ops/task/delete/rollback");
          throw new Error(r.erro ?? "Não consegui excluir a tarefa.");
        }
      },

      addNotice: async (data) => {
        const res = await authedFetch("/api/data/operational/mutations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "insertNotice", data }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const { notices } = await res.json();
        set({ notices }, false, "ops/notice/add");
      },

      deleteNotice: async (id) => {
        const prev = get().notices.find((n) => n.id === id);
        set((s) => ({ notices: s.notices.filter((n) => n.id !== id) }), false, "ops/notice/delete/optimistic");
        try {
          const res = await authedFetch("/api/data/operational/mutations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "deleteNotice", id }),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const { notices } = await res.json();
          set({ notices }, false, "ops/notice/delete/confirmed");
        } catch {
          if (prev) set((s) => ({ notices: s.notices.some((n) => n.id === id) ? s.notices : [...s.notices, prev] }), false, "ops/notice/delete/rollback");
        }
      },
    })),
    { name: "OperationalStore" }
  )
);
