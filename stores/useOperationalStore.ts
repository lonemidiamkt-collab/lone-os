import { create } from "zustand";
import { devtools, subscribeWithSelector } from "zustand/middleware";
import type {
  TimelineEntry,
  OnboardingItem,
  GlobalChatMessage,
  Task,
  Notice,
  Role,
  CreativeAsset,
  SocialProofEntry,
  CrisisNote,
  QuinzReport,
  MoodEntry,
  MoodType,
  ClientAccess,
} from "@/lib/types";
import { authedFetch } from "@/lib/supabase/authed-fetch";
import { supabase } from "@/lib/supabase/client";

interface OperationalState {
  timeline: Record<string, TimelineEntry[]>;
  onboarding: Record<string, OnboardingItem[]>;
  globalChat: GlobalChatMessage[];
  tasks: Task[];
  notices: Notice[];
  creativeAssets: Record<string, CreativeAsset[]>;
  socialProofs: Record<string, SocialProofEntry[]>;
  crisisNotes: Record<string, CrisisNote[]>;
  quinzReports: QuinzReport[];
  moodHistory: Record<string, MoodEntry[]>;
  clientAccess: Record<string, ClientAccess>;
  initialized: boolean;

  init: () => Promise<void>;
  subscribeRealtime: () => () => void;

  addTimelineEntry: (entry: Omit<TimelineEntry, "id">) => Promise<void>;
  toggleOnboardingItem: (clientId: string, itemId: string, actor: string) => Promise<void>;
  sendGlobalMessage: (user: string, role: Role, text: string) => void;

  addCreativeAsset: (asset: Omit<CreativeAsset, "id">) => Promise<void>;
  addSocialProof: (entry: Omit<SocialProofEntry, "id" | "createdAt">) => Promise<void>;
  addCrisisNote: (clientId: string, note: string, actor: string) => Promise<void>;
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
export const selectCrisisNotes = (s: OperationalState) => s.crisisNotes;
export const selectClientCrisisNotes = (clientId: string) => (s: OperationalState) =>
  s.crisisNotes[clientId] ?? [];
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
export const selectGlobalChat = (s: OperationalState) => s.globalChat;
export const selectTasks = (s: OperationalState) => s.tasks;
export const selectNotices = (s: OperationalState) => s.notices;

export const useOperationalStore = create<OperationalState>()(
  devtools(
    subscribeWithSelector((set, get) => ({
      timeline: {},
      onboarding: {},
      globalChat: [],
      tasks: [],
      notices: [],
      creativeAssets: {},
      socialProofs: {},
      crisisNotes: {},
      quinzReports: [],
      moodHistory: {},
      clientAccess: {},
      initialized: false,

      init: async () => {
        if (get().initialized) return;
        try {
          const res = await authedFetch("/api/data/operational");
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const { timeline, onboardingItems, globalChat, tasks, notices, creativeAssets, socialProofs, crisisNotes, quinzReports, moodEntries, clientAccess } = await res.json();
          set({ timeline, onboarding: onboardingItems, globalChat, tasks, notices, creativeAssets, socialProofs, crisisNotes, quinzReports, moodHistory: moodEntries, clientAccess, initialized: true }, false, "ops/init/done");
        } catch {}
      },

      subscribeRealtime: () => {
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
          .on("postgres_changes", { event: "INSERT", schema: "public", table: "global_chat_messages" }, (p) => {
            if (!p.new) return;
            const row = p.new as Record<string, unknown>;
            const msg: GlobalChatMessage = {
              id: row.id as string,
              user: row.user as string,
              role: row.role as Role,
              text: row.text as string,
              timestamp: row.created_at as string,
            };
            set((s) => ({
              globalChat: s.globalChat.some((m) => m.id === msg.id) ? s.globalChat : [...s.globalChat, msg],
            }), false, "ops/rt/globalchat/insert");
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
        try {
          const res = await authedFetch("/api/data/operational/mutations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "updateOnboarding", itemId, completed, actor }),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
        } catch {
          set((s) => ({
            onboarding: {
              ...s.onboarding,
              [clientId]: (s.onboarding[clientId] ?? []).map((i) => i.id === itemId ? item : i),
            },
          }), false, "ops/onboarding/toggle/rollback");
        }
      },

      sendGlobalMessage: (user, role, text) => {
        const tempMsg: GlobalChatMessage = {
          id: `temp-gc-${Date.now()}`,
          user,
          role,
          text,
          timestamp: new Date().toISOString(),
        };
        set((s) => ({ globalChat: [...s.globalChat, tempMsg] }), false, "ops/globalchat/optimistic");
        authedFetch("/api/data/operational/mutations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "insertGlobalChat", user, role, text }),
        }).catch(() => {
          set((s) => ({
            globalChat: s.globalChat.filter((m) => m.id !== tempMsg.id),
          }), false, "ops/globalchat/rollback");
        });
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

      addCrisisNote: async (clientId, note, actor) => {
        const res = await authedFetch("/api/data/operational/mutations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "insertCrisisNote", clientId, note, actor }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const { crisisNotes } = await res.json();
        set({ crisisNotes }, false, "ops/crisis/add");
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
        try {
          const res = await authedFetch("/api/tasks/create", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(task),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          const confirmed: Task = { ...optimistic, id: data.id ?? tempId };
          set((s) => ({
            tasks: s.tasks.map((t) => t.id === tempId ? confirmed : t),
          }), false, "ops/task/add/confirmed");
          return confirmed;
        } catch (err) {
          set((s) => ({ tasks: s.tasks.filter((t) => t.id !== tempId) }), false, "ops/task/add/rollback");
          throw err;
        }
      },

      updateTask: async (id, updates) => {
        const prev = get().tasks.find((t) => t.id === id);
        set((s) => ({
          tasks: s.tasks.map((t) => t.id === id ? { ...t, ...updates } : t),
        }), false, "ops/task/update/optimistic");
        try {
          const res = await authedFetch("/api/tasks/update", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, ...updates }),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
        } catch (err) {
          if (prev) set((s) => ({ tasks: s.tasks.map((t) => t.id === id ? prev : t) }), false, "ops/task/update/rollback");
          throw err;
        }
      },

      deleteTask: async (id) => {
        const prev = get().tasks.find((t) => t.id === id);
        set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) }), false, "ops/task/delete/optimistic");
        try {
          const res = await authedFetch("/api/tasks/delete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id }),
          });
          if (!res.ok) {
            if (prev) set((s) => ({ tasks: s.tasks.some((t) => t.id === id) ? s.tasks : [...s.tasks, prev] }), false, "ops/task/delete/rollback");
            throw new Error(`HTTP ${res.status}`);
          }
        } catch (err) {
          if (prev) set((s) => ({ tasks: s.tasks.some((t) => t.id === id) ? s.tasks : [...s.tasks, prev] }), false, "ops/task/delete/rollback");
          throw err;
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
