"use client";

import { createContext, useContext, useState, useCallback } from "react";
import type {
  Client,
  Role,
  TimelineEntry,
  ChatMessage,
  GlobalChatMessage,
  OnboardingItem,
  ClientStatus,
  ContentCard,
  MoodEntry,
  MoodType,
  CreativeAsset,
  Notice,
} from "@/lib/types";
import {
  mockClients,
  mockClientChats,
  mockTimeline,
  mockGlobalChat,
  mockContentCards,
  mockMoodHistory,
  mockCreativeAssets,
  DEFAULT_ONBOARDING_ITEMS,
  mockNotices,
} from "@/lib/mockData";

// Convert raw mockClientChats to ChatMessage[]
function initClientChats(): Record<string, ChatMessage[]> {
  const result: Record<string, ChatMessage[]> = {};
  for (const [clientId, messages] of Object.entries(mockClientChats)) {
    result[clientId] = messages.map((m, i) => ({
      id: `init-${clientId}-${i}`,
      user: m.user,
      text: m.text,
      timestamp: m.time,
    }));
  }
  return result;
}

// Build onboarding state for all existing onboarding clients
function initOnboarding(): Record<string, OnboardingItem[]> {
  const result: Record<string, OnboardingItem[]> = {};
  mockClients
    .filter((c) => c.status === "onboarding")
    .forEach((c) => {
      result[c.id] = DEFAULT_ONBOARDING_ITEMS.map((item, i) => ({
        ...item,
        id: `ob-${c.id}-${i}`,
      }));
    });
  return result;
}

interface AppStateContextValue {
  clients: Client[];
  contentCards: ContentCard[];
  timeline: Record<string, TimelineEntry[]>;
  clientChats: Record<string, ChatMessage[]>;
  globalChat: GlobalChatMessage[];
  onboarding: Record<string, OnboardingItem[]>;
  moodHistory: Record<string, MoodEntry[]>;
  creativeAssets: Record<string, CreativeAsset[]>;
  notices: Notice[];
  addNotice: (data: { title: string; body: string; urgent: boolean; createdBy: string }) => void;

  updateContentCard: (id: string, updates: Partial<ContentCard>) => void;
  addContentCard: (card: Omit<ContentCard, "id">) => ContentCard;
  updateClientData: (clientId: string, updates: Partial<Client>) => void;
  addMoodEntry: (clientId: string, mood: MoodType, note: string, actor: string) => void;
  addCreativeAsset: (asset: Omit<CreativeAsset, "id">) => void;

  addClient: (data: {
    name: string;
    industry: string;
    monthlyBudget: number;
    paymentMethod: Client["paymentMethod"];
    assignedTraffic: string;
    assignedSocial: string;
    notes?: string;
  }) => Client;

  updateClientStatus: (clientId: string, status: ClientStatus, actor: string) => void;

  addTimelineEntry: (entry: Omit<TimelineEntry, "id">) => void;

  sendClientMessage: (clientId: string, user: string, text: string) => void;

  sendGlobalMessage: (user: string, role: Role, text: string) => void;

  toggleOnboardingItem: (clientId: string, itemId: string, actor: string) => void;
}

const AppStateContext = createContext<AppStateContextValue>({} as AppStateContextValue);

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [clients, setClients] = useState<Client[]>(() => mockClients);
  const [contentCards, setContentCards] = useState<ContentCard[]>(() => mockContentCards);
  const [timeline, setTimeline] = useState<Record<string, TimelineEntry[]>>(() => mockTimeline);
  const [moodHistory, setMoodHistory] = useState<Record<string, MoodEntry[]>>(() => mockMoodHistory);
  const [creativeAssets, setCreativeAssets] = useState<Record<string, CreativeAsset[]>>(() => mockCreativeAssets);
  const [clientChats, setClientChats] = useState<Record<string, ChatMessage[]>>(() => initClientChats());
  const [globalChat, setGlobalChat] = useState<GlobalChatMessage[]>(() => mockGlobalChat);
  const [onboarding, setOnboarding] = useState<Record<string, OnboardingItem[]>>(() => initOnboarding());
  const [notices, setNotices] = useState<Notice[]>(() => mockNotices);

  const now = () =>
    new Date().toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  const pushTimeline = useCallback(
    (entry: Omit<TimelineEntry, "id">) => {
      const newEntry: TimelineEntry = {
        ...entry,
        id: `tl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      };
      setTimeline((prev) => ({
        ...prev,
        [entry.clientId]: [newEntry, ...(prev[entry.clientId] ?? [])],
      }));
    },
    []
  );

  const addClient = useCallback(
    (data: {
      name: string;
      industry: string;
      monthlyBudget: number;
      paymentMethod: Client["paymentMethod"];
      assignedTraffic: string;
      assignedSocial: string;
      notes?: string;
    }): Client => {
      const id = `c-${Date.now()}`;
      const newClient: Client = {
        ...data,
        id,
        status: "onboarding",
        attentionLevel: "medium",
        tags: [],
        joinDate: new Date().toISOString().split("T")[0],
      };

      setClients((prev) => [...prev, newClient]);

      // Initialize empty chat
      setClientChats((prev) => ({ ...prev, [id]: [] }));

      // Initialize onboarding checklist
      const items: OnboardingItem[] = DEFAULT_ONBOARDING_ITEMS.map((item, i) => ({
        ...item,
        id: `ob-${id}-${i}`,
      }));
      setOnboarding((prev) => ({ ...prev, [id]: items }));

      // Auto-log to timeline
      pushTimeline({
        clientId: id,
        type: "onboarding",
        actor: "Sistema",
        description: `Cliente ${data.name} cadastrado. Onboarding iniciado automaticamente.`,
        timestamp: now(),
      });

      return newClient;
    },
    [pushTimeline]
  );

  const updateClientStatus = useCallback(
    (clientId: string, status: ClientStatus, actor: string) => {
      setClients((prev) =>
        prev.map((c) => (c.id === clientId ? { ...c, status } : c))
      );
      const statusLabels: Record<ClientStatus, string> = {
        onboarding: "Onboarding",
        good: "Bons Resultados",
        average: "Resultados Médios",
        at_risk: "Em Risco",
      };
      pushTimeline({
        clientId,
        type: "status",
        actor,
        description: `Status atualizado para "${statusLabels[status]}".`,
        timestamp: now(),
      });
    },
    [pushTimeline]
  );

  const addTimelineEntry = useCallback(pushTimeline, [pushTimeline]);

  const sendClientMessage = useCallback(
    (clientId: string, user: string, text: string) => {
      const timestamp = new Date().toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });

      const msg: ChatMessage = {
        id: `msg-${Date.now()}`,
        user,
        text,
        timestamp,
      };

      setClientChats((prev) => ({
        ...prev,
        [clientId]: [...(prev[clientId] ?? []), msg],
      }));

      // Auto-log every chat message to the timeline
      pushTimeline({
        clientId,
        type: "chat",
        actor: user,
        description: text,
        timestamp: now(),
      });
    },
    [pushTimeline]
  );

  const sendGlobalMessage = useCallback(
    (user: string, role: Role, text: string) => {
      const timestamp = new Date().toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
      setGlobalChat((prev) => [
        ...prev,
        { id: `gc-${Date.now()}`, user, role, text, timestamp },
      ]);
    },
    []
  );

  const addContentCard = useCallback(
    (card: Omit<ContentCard, "id">): ContentCard => {
      const newCard: ContentCard = {
        ...card,
        id: `cc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      };
      setContentCards((prev) => [...prev, newCard]);
      setClients((prev) =>
        prev.map((c) =>
          c.id === card.clientId
            ? { ...c, lastKanbanActivity: new Date().toISOString() }
            : c
        )
      );
      return newCard;
    },
    []
  );

  const updateContentCard = useCallback(
    (id: string, updates: Partial<ContentCard>) => {
      setContentCards((prev) => {
        const card = prev.find((c) => c.id === id);
        if (card && updates.status && updates.status !== card.status) {
          setClients((cls) =>
            cls.map((c) => {
              if (c.id !== card.clientId) return c;
              return {
                ...c,
                lastKanbanActivity: new Date().toISOString(),
                postsThisMonth:
                  updates.status === "published" && card.status !== "published"
                    ? (c.postsThisMonth ?? 0) + 1
                    : c.postsThisMonth,
              };
            })
          );
        }
        return prev.map((c) => (c.id === id ? { ...c, ...updates } : c));
      });
    },
    []
  );

  const updateClientData = useCallback(
    (clientId: string, updates: Partial<Client>) => {
      setClients((prev) =>
        prev.map((c) => (c.id === clientId ? { ...c, ...updates } : c))
      );
    },
    []
  );

  const addMoodEntry = useCallback(
    (clientId: string, mood: MoodType, note: string, actor: string) => {
      const entry: MoodEntry = {
        id: `mood-${Date.now()}`,
        mood,
        note: note || undefined,
        recordedBy: actor,
        date: new Date().toISOString().split("T")[0],
      };
      setMoodHistory((prev) => ({
        ...prev,
        [clientId]: [entry, ...(prev[clientId] ?? [])],
      }));
    },
    []
  );

  const addCreativeAsset = useCallback(
    (asset: Omit<CreativeAsset, "id">) => {
      const newAsset: CreativeAsset = {
        ...asset,
        id: `ca-${Date.now()}`,
      };
      setCreativeAssets((prev) => ({
        ...prev,
        [asset.clientId]: [...(prev[asset.clientId] ?? []), newAsset],
      }));
    },
    []
  );

  const addNotice = useCallback(
    (data: { title: string; body: string; urgent: boolean; createdBy: string }) => {
      setNotices((prev) => [
        {
          id: `n-${Date.now()}`,
          ...data,
          createdAt: new Date().toISOString().split("T")[0],
        },
        ...prev,
      ]);
    },
    []
  );

  const toggleOnboardingItem = useCallback(
    (clientId: string, itemId: string, actor: string) => {
      setOnboarding((prev) => {
        const items = (prev[clientId] ?? []).map((item) => {
          if (item.id !== itemId) return item;
          const nowCompleted = !item.completed;
          return {
            ...item,
            completed: nowCompleted,
            completedBy: nowCompleted ? actor : undefined,
            completedAt: nowCompleted ? now() : undefined,
          };
        });

        const updatedItem = items.find((i) => i.id === itemId);
        if (updatedItem) {
          pushTimeline({
            clientId,
            type: "onboarding",
            actor,
            description: `${updatedItem.completed ? "Concluiu" : "Desmarcou"} onboarding: "${updatedItem.label}".`,
            timestamp: now(),
          });
        }

        // Auto-promote to "good" when all items completed
        const allDone = items.every((i) => i.completed);
        if (allDone) {
          setClients((cls) =>
            cls.map((c) =>
              c.id === clientId && c.status === "onboarding"
                ? { ...c, status: "good" }
                : c
            )
          );
          pushTimeline({
            clientId,
            type: "status",
            actor: "Sistema",
            description: "Onboarding concluído! Cliente promovido automaticamente para Ativo.",
            timestamp: now(),
          });
        }

        return { ...prev, [clientId]: items };
      });
    },
    [pushTimeline]
  );

  return (
    <AppStateContext.Provider
      value={{
        clients,
        contentCards,
        timeline,
        clientChats,
        globalChat,
        onboarding,
        moodHistory,
        creativeAssets,
        notices,
        addClient,
        updateClientStatus,
        updateContentCard,
        addContentCard,
        updateClientData,
        addMoodEntry,
        addCreativeAsset,
        addNotice,
        addTimelineEntry,
        sendClientMessage,
        sendGlobalMessage,
        toggleOnboardingItem,
      }}
    >
      {children}
    </AppStateContext.Provider>
  );
}

export function useAppState() {
  return useContext(AppStateContext);
}
