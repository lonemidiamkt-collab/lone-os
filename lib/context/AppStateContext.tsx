"use client";

import { createContext, useContext, useState, useCallback, useMemo, useEffect } from "react";
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
  SocialProofEntry,
  CrisisNote,
  SocialTeamMember,
  AppNotification,
  NotificationType,
  QuinzReport,
  CardComment,
  ClientAccess,
  DesignRequest,
  Task,
  TrafficMonthlyReport,
  TrafficRoutineCheck,
  SocialMonthlyReport,
  ContentApproval,
  MonthlyDeliveryReport,
  SocialPerformanceScore,
  PerformanceLevel,
  ClientInvestmentData,
  InvestmentPaymentMethod,
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
  mockQuinzReports,
  mockDesignRequests,
  mockTasks,
  mockTrafficReports,
  mockTrafficRoutineChecks,
  mockSocialReports,
} from "@/lib/mockData";
import * as db from "@/lib/supabase/queries";
import { useRole } from "@/lib/context/RoleContext";

// ============================================
// Fallback init functions (used when DB is unavailable)
// ============================================

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

// ============================================
// Context Interface (unchanged — no UI breaks)
// ============================================

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
  socialProofs: Record<string, SocialProofEntry[]>;
  crisisNotes: Record<string, CrisisNote[]>;
  socialTeam: SocialTeamMember[];
  socialAuthUser: string | null;
  notifications: AppNotification[];
  quinzReports: QuinzReport[];
  designRequests: DesignRequest[];
  clientAccess: Record<string, ClientAccess>;
  tasks: Task[];
  trafficReports: TrafficMonthlyReport[];
  trafficRoutineChecks: TrafficRoutineCheck[];
  addTrafficReport: (report: Omit<TrafficMonthlyReport, "id" | "createdAt">) => TrafficMonthlyReport;
  updateTrafficReport: (id: string, updates: Partial<TrafficMonthlyReport>) => void;
  addTrafficRoutineCheck: (check: Omit<TrafficRoutineCheck, "id" | "completedAt">) => void;
  socialReports: SocialMonthlyReport[];
  addSocialReport: (report: Omit<SocialMonthlyReport, "id" | "createdAt">) => SocialMonthlyReport;
  updateSocialReport: (id: string, updates: Partial<SocialMonthlyReport>) => void;
  contentApprovals: ContentApproval[];
  approveContent: (cardId: string, reviewer: string) => void;
  rejectContent: (cardId: string, reviewer: string, reason: string) => void;
  pushNotification: (type: NotificationType, title: string, body: string, clientId?: string) => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  addQuinzReport: (report: Omit<QuinzReport, "id" | "createdAt">) => void;
  addCardComment: (cardId: string, author: string, role: Role, text: string) => void;
  deleteNotice: (id: string) => void;
  addNotice: (data: { title: string; body: string; urgent: boolean; createdBy: string; scheduledAt?: string; category?: "general" | "meeting" | "deadline" | "reminder" }) => void;
  addSocialProof: (entry: Omit<SocialProofEntry, "id" | "createdAt">) => void;
  addCrisisNote: (clientId: string, note: string, actor: string) => void;
  addSocialTeamMember: (name: string, password: string) => void;
  loginSocial: (name: string, password: string) => boolean;
  logoutSocial: () => void;
  updateDesignRequest: (id: string, updates: Partial<DesignRequest>) => void;
  addDesignRequest: (req: Omit<DesignRequest, "id"> & { contentCardId?: string }) => DesignRequest;
  updateClientAccess: (clientId: string, access: Partial<ClientAccess>, actor: string) => void;

  addTask: (task: Omit<Task, "id">) => Task;
  updateTask: (id: string, updates: Partial<Task>) => void;

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
    assignedDesigner: string;
    notes?: string;
    metaAdAccountId?: string;
    metaAdAccountName?: string;
  }) => Client;

  updateClientStatus: (clientId: string, status: ClientStatus, actor: string) => void;
  addTimelineEntry: (entry: Omit<TimelineEntry, "id">) => void;
  sendClientMessage: (clientId: string, user: string, text: string) => void;
  sendGlobalMessage: (user: string, role: Role, text: string) => void;
  toggleOnboardingItem: (clientId: string, itemId: string, actor: string) => void;

  monthlyDeliveryReports: MonthlyDeliveryReport[];
  socialPerformanceScores: SocialPerformanceScore[];

  // Investment Control
  investmentData: Record<string, ClientInvestmentData>;
  updateInvestmentData: (clientId: string, data: Partial<ClientInvestmentData>, actor: string) => void;

  // DB loading state
  dbReady: boolean;
}

const AppStateContext = createContext<AppStateContextValue>({} as AppStateContextValue);

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useRole();

  // ---------- State ----------
  const [clients, setClients] = useState<Client[]>(() => mockClients);

  // Investment Control — initialized from localStorage or client.monthlyBudget + paymentMethod
  const [investmentData, setInvestmentData] = useState<Record<string, ClientInvestmentData>>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("lone_investmentData");
        if (saved) return JSON.parse(saved) as Record<string, ClientInvestmentData>;
      } catch {}
    }
    const result: Record<string, ClientInvestmentData> = {};
    const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
    mockClients.forEach((c) => {
      const pm: InvestmentPaymentMethod = c.paymentMethod === "transferencia" ? "pix" : (c.paymentMethod as InvestmentPaymentMethod);
      result[c.id] = {
        clientId: c.id,
        monthlyBudget: c.monthlyBudget,
        dailyBudget: parseFloat((c.monthlyBudget / daysInMonth).toFixed(2)),
        paymentMethod: pm,
      };
    });
    return result;
  });
  const [contentCards, setContentCards] = useState<ContentCard[]>(() => mockContentCards);
  const [timeline, setTimeline] = useState<Record<string, TimelineEntry[]>>(() => mockTimeline);
  const [moodHistory, setMoodHistory] = useState<Record<string, MoodEntry[]>>(() => mockMoodHistory);
  const [creativeAssets, setCreativeAssets] = useState<Record<string, CreativeAsset[]>>(() => mockCreativeAssets);
  const [clientChats, setClientChats] = useState<Record<string, ChatMessage[]>>(() => initClientChats());
  const [globalChat, setGlobalChat] = useState<GlobalChatMessage[]>(() => mockGlobalChat);
  const [onboarding, setOnboarding] = useState<Record<string, OnboardingItem[]>>(() => initOnboarding());
  const [notices, setNotices] = useState<Notice[]>(() => mockNotices);
  const [socialProofs, setSocialProofs] = useState<Record<string, SocialProofEntry[]>>({});
  const [crisisNotes, setCrisisNotes] = useState<Record<string, CrisisNote[]>>({});
  const [socialTeam, setSocialTeam] = useState<SocialTeamMember[]>([
    { id: "sm-1", name: "Carlos Melo", password: "00" },
    { id: "sm-2", name: "Mariana Costa", password: "00" },
  ]);
  const [socialAuthUser, setSocialAuthUser] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>(() => [
    { id: "notif-1", type: "status", title: "Cliente em risco", body: "Fitness Power foi marcado como Em Risco", clientId: "c4", read: false, createdAt: "2026-03-20T14:00:00" },
    { id: "notif-2", type: "content", title: "Card publicado", body: "Reels lançamento do novo curso — EduPro foi publicado", read: false, createdAt: "2026-03-20T10:00:00" },
    { id: "notif-3", type: "sla", title: "Gargalo detectado", body: "Reel: 5 dicas de investimento está parado há 7 dias em Produção", clientId: "c6", read: true, createdAt: "2026-03-19T09:00:00" },
  ]);

  const [quinzReports, setQuinzReports] = useState<QuinzReport[]>(() => mockQuinzReports);
  const [designRequests, setDesignRequests] = useState<DesignRequest[]>(() => mockDesignRequests);
  const [tasks, setTasks] = useState<Task[]>(() => mockTasks);
  const [trafficReports, setTrafficReports] = useState<TrafficMonthlyReport[]>(() => mockTrafficReports);
  const [trafficRoutineChecks, setTrafficRoutineChecks] = useState<TrafficRoutineCheck[]>(() => mockTrafficRoutineChecks);
  const [socialReports, setSocialReports] = useState<SocialMonthlyReport[]>(() => mockSocialReports);
  const [contentApprovals, setContentApprovals] = useState<ContentApproval[]>([]);

  const [clientAccess, setClientAccess] = useState<Record<string, ClientAccess>>(() => {
    const result: Record<string, ClientAccess> = {};
    mockClients.forEach((c) => {
      if (c.status !== "onboarding") {
        result[c.id] = {
          clientId: c.id,
          instagramLogin: c.instagramUser,
          driveLink: c.driveLink,
        };
      }
    });
    return result;
  });

  const [dbReady, setDbReady] = useState(false);

  // ---------- Persist investmentData to localStorage ----------
  useEffect(() => {
    try {
      localStorage.setItem("lone_investmentData", JSON.stringify(investmentData));
    } catch {}
  }, [investmentData]);

  // ---------- Load from Supabase when authenticated ----------
  useEffect(() => {
    if (!isAuthenticated) {
      setDbReady(false);
      return;
    }

    let cancelled = false;

    async function loadFromDb() {
      try {
        // First load team members (needed for name/ID lookups)
        await db.fetchTeamMembers();

        // Fetch all data in parallel
        const [
          dbClients,
          dbTasks,
          dbCards,
          dbDesignReqs,
          dbNotices,
          dbTimeline,
          dbClientChats,
          dbGlobalChat,
          dbOnboarding,
          dbMood,
          dbCreative,
          dbSocialProofs,
          dbCrisis,
          dbNotifications,
          dbQuinz,
          dbAccess,
          dbTrafficReports,
          dbRoutineChecks,
          dbSocialReports,
          dbApprovals,
        ] = await Promise.all([
          db.fetchClients(),
          db.fetchTasks(),
          db.fetchContentCards(),
          db.fetchDesignRequests(),
          db.fetchNotices(),
          db.fetchTimeline(),
          db.fetchClientChats(),
          db.fetchGlobalChat(),
          db.fetchOnboardingItems(),
          db.fetchMoodEntries(),
          db.fetchCreativeAssets(),
          db.fetchSocialProofs(),
          db.fetchCrisisNotes(),
          db.fetchNotifications(),
          db.fetchQuinzReports(),
          db.fetchClientAccess(),
          db.fetchTrafficReports(),
          db.fetchTrafficRoutineChecks(),
          db.fetchSocialReports(),
          db.fetchContentApprovals(),
        ]);

        if (cancelled) return;

        // Only update state if we got data from DB
        if (dbClients.length > 0) setClients(dbClients);
        if (dbTasks.length > 0) setTasks(dbTasks);
        if (dbCards.length > 0) setContentCards(dbCards);
        if (dbDesignReqs.length > 0) setDesignRequests(dbDesignReqs);
        if (dbNotices.length > 0) setNotices(dbNotices);
        if (Object.keys(dbTimeline).length > 0) setTimeline(dbTimeline);
        if (Object.keys(dbClientChats).length > 0) setClientChats(dbClientChats);
        if (dbGlobalChat.length > 0) setGlobalChat(dbGlobalChat);
        if (Object.keys(dbOnboarding).length > 0) setOnboarding(dbOnboarding);
        if (Object.keys(dbMood).length > 0) setMoodHistory(dbMood);
        if (Object.keys(dbCreative).length > 0) setCreativeAssets(dbCreative);
        if (Object.keys(dbSocialProofs).length > 0) setSocialProofs(dbSocialProofs);
        if (Object.keys(dbCrisis).length > 0) setCrisisNotes(dbCrisis);
        if (dbNotifications.length > 0) setNotifications(dbNotifications);
        if (dbQuinz.length > 0) setQuinzReports(dbQuinz);
        if (Object.keys(dbAccess).length > 0) setClientAccess(dbAccess);
        if (dbTrafficReports.length > 0) setTrafficReports(dbTrafficReports);
        if (dbRoutineChecks.length > 0) setTrafficRoutineChecks(dbRoutineChecks);
        if (dbSocialReports.length > 0) setSocialReports(dbSocialReports);
        if (dbApprovals.length > 0) setContentApprovals(dbApprovals);

        setDbReady(true);
      } catch (err) {
        console.warn("[Lone OS] DB load failed, using mock data:", err);
        // Keep mock data as fallback
        setDbReady(true);
      }
    }

    loadFromDb();
    return () => { cancelled = true; };
  }, [isAuthenticated]);

  // ---------- Helpers ----------

  const now = useCallback(
    () =>
      new Date().toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
    []
  );

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
      // Persist to DB (fire-and-forget)
      db.insertTimelineEntry(entry).catch(() => {});
    },
    []
  );

  const pushNotification = useCallback(
    (type: NotificationType, title: string, body: string, clientId?: string) => {
      const notif: AppNotification = {
        id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        type,
        title,
        body,
        clientId,
        read: false,
        createdAt: new Date().toISOString(),
      };
      setNotifications((prev) => [notif, ...prev]);
      // Persist to DB
      db.insertNotification({ type, title, body, clientId }).catch(() => {});
    },
    []
  );

  const markNotificationRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
    db.markNotificationReadDb(id).catch(() => {});
  }, []);

  const markAllNotificationsRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    db.markAllNotificationsReadDb().catch(() => {});
  }, []);

  // ---------- Actions (same interface, now with DB persistence) ----------

  const addQuinzReport = useCallback(
    (report: Omit<QuinzReport, "id" | "createdAt">) => {
      const newReport: QuinzReport = {
        ...report,
        id: `qr-${Date.now()}`,
        createdAt: new Date().toISOString().split("T")[0],
      };
      setQuinzReports((prev) => [newReport, ...prev]);
      pushTimeline({
        clientId: report.clientId,
        type: "report",
        actor: report.createdBy,
        description: `Relatório quinzenal registrado — Período: ${report.period}`,
        timestamp: now(),
      });
      pushNotification("system", "Novo relatório", `Relatório quinzenal de ${report.clientName} — ${report.period}`, report.clientId);
      db.insertQuinzReport(report).catch(() => {});
    },
    [pushTimeline, pushNotification, now]
  );

  const addClient = useCallback(
    (data: {
      name: string;
      industry: string;
      monthlyBudget: number;
      paymentMethod: Client["paymentMethod"];
      assignedTraffic: string;
      assignedSocial: string;
      assignedDesigner: string;
      notes?: string;
      metaAdAccountId?: string;
      metaAdAccountName?: string;
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
      setClientChats((prev) => ({ ...prev, [id]: [] }));

      const items: OnboardingItem[] = DEFAULT_ONBOARDING_ITEMS.map((item, i) => ({
        ...item,
        id: `ob-${id}-${i}`,
      }));
      setOnboarding((prev) => ({ ...prev, [id]: items }));

      pushTimeline({
        clientId: id,
        type: "onboarding",
        actor: "Sistema",
        description: `Cliente ${data.name} cadastrado. Onboarding iniciado automaticamente.`,
        timestamp: now(),
      });

      pushNotification(
        "system",
        "Novo cliente cadastrado",
        `${data.name} (${data.industry}) entrou em onboarding. Tráfego: ${data.assignedTraffic}, Social: ${data.assignedSocial}, Designer: ${data.assignedDesigner}.`,
      );

      // Persist to DB — replace optimistic ID with real UUID
      db.insertClient(newClient).then((dbClient) => {
        setClients((prev) =>
          prev.map((c) => (c.id === id ? { ...c, id: dbClient.id } : c))
        );
        // Create onboarding items in DB
        db.insertOnboardingItems(
          dbClient.id,
          DEFAULT_ONBOARDING_ITEMS.map((item, i) => ({ label: item.label, sortOrder: i }))
        ).catch(() => {});
      }).catch(() => {});

      return newClient;
    },
    [pushTimeline, pushNotification, now]
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
      const clientName = clients.find((c) => c.id === clientId)?.name ?? clientId;
      pushNotification("status", `Status alterado`, `${clientName} agora está "${statusLabels[status]}"`, clientId);
      db.updateClientDb(clientId, { status }).catch(() => {});
    },
    [pushTimeline, clients, pushNotification, now]
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

      pushTimeline({
        clientId,
        type: "chat",
        actor: user,
        description: text,
        timestamp: now(),
      });

      db.insertClientChatMessage(clientId, user, text).catch(() => {});
    },
    [pushTimeline, now]
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
      db.insertGlobalChatMessage(user, role, text).catch(() => {});
    },
    []
  );

  const addContentCard = useCallback(
    (card: Omit<ContentCard, "id">): ContentCard => {
      const newCard: ContentCard = {
        ...card,
        id: `cc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        statusChangedAt: new Date().toISOString(),
      };
      setContentCards((prev) => [...prev, newCard]);
      setClients((prev) =>
        prev.map((c) =>
          c.id === card.clientId
            ? { ...c, lastKanbanActivity: new Date().toISOString() }
            : c
        )
      );
      if (card.requestedByTraffic) {
        pushNotification(
          "content",
          "Solicitação de conteúdo — Tráfego",
          `${card.requestedByTraffic} solicitou "${card.title}" para ${card.clientName} (${card.format}). Social: ${card.socialMedia}, verifique o kanban.`,
          card.clientId
        );
      } else {
        pushNotification(
          "content",
          "Novo conteúdo criado",
          `"${card.title}" para ${card.clientName} — ${card.format}. Responsável: ${card.socialMedia}.`,
          card.clientId
        );
      }

      // Persist
      const tempId = newCard.id;
      db.insertContentCard(card).then((dbCard) => {
        setContentCards((prev) =>
          prev.map((c) => (c.id === tempId ? { ...c, id: dbCard.id } : c))
        );
      }).catch(() => {});
      db.updateClientDb(card.clientId, { lastKanbanActivity: new Date().toISOString() }).catch(() => {});

      return newCard;
    },
    [pushNotification]
  );

  // Valid status transitions — enforces workflow pipeline
  const VALID_TRANSITIONS: Record<string, string[]> = {
    ideas: ["script"],
    script: ["ideas", "in_production"],
    in_production: ["script", "approval"],
    approval: ["in_production", "client_approval", "scheduled"],
    client_approval: ["approval", "scheduled", "in_production"],
    scheduled: ["published", "client_approval"],
    published: [],
  };

  const updateContentCard = useCallback(
    (id: string, updates: Partial<ContentCard>) => {
      setContentCards((prev) => {
        const card = prev.find((c) => c.id === id);
        if (!card) return prev;
        // Enforce workflow transitions
        if (card && updates.status && updates.status !== card.status) {
          const allowed = VALID_TRANSITIONS[card.status] ?? [];
          if (allowed.length > 0 && !allowed.includes(updates.status)) {
            pushNotification(
              "system",
              "Transição bloqueada",
              `Não é possível mover "${card.title}" de ${card.status} para ${updates.status}. Siga o fluxo correto.`,
              card.clientId
            );
            return prev;
          }
          // Prerequisite checks — warn but don't block
          if (updates.status === "approval" && !card.imageUrl && !updates.imageUrl) {
            pushNotification("system", "Atenção: sem arte", `"${card.title}" foi para aprovação sem arte do designer. Solicite ao designer.`, card.clientId);
          }
          if (updates.status === "scheduled" && !card.imageUrl && !updates.imageUrl) {
            pushNotification("system", "Atenção: sem arte", `"${card.title}" foi agendado sem arte. Verifique antes de publicar.`, card.clientId);
          }
          // Auto-set scheduledAt when moving to scheduled
          if (updates.status === "scheduled" && card.status !== "scheduled") {
            updates.scheduledAt = updates.scheduledAt || new Date().toISOString();
            pushNotification("system", "Verificação pendente", `"${card.title}" foi agendado. Lembre-se de verificar se o post foi ao ar após a publicação.`, card.clientId);
          }
          if (updates.status === "published" && !card.socialConfirmedBy && !updates.socialConfirmedBy) {
            pushNotification("system", "Atenção: sem confirmação", `"${card.title}" foi publicado sem confirmação do social media.`, card.clientId);
          }
          // Block published without verification — require publishVerifyChecks
          if (updates.status === "published" && !card.publishVerifiedAt && !updates.publishVerifiedAt) {
            pushNotification("system", "Verificação obrigatória", `"${card.title}" precisa de verificação de publicação antes de ser marcado como publicado. Use o painel de verificação.`, card.clientId);
          }
          // Success toast for status change
          const CARD_STATUS_LABELS: Record<string, string> = {
            script: "Roteiro", in_production: "Produção", approval: "Aprovação",
            scheduled: "Agendado", published: "Publicado", revision: "Revisão",
          };
          const newLabel = CARD_STATUS_LABELS[updates.status!] ?? updates.status;
          pushNotification("content", "Card movido", `"${card.title}" → ${newLabel}`, card.clientId);

          setClients((cls) =>
            cls.map((c) => {
              if (c.id !== card.clientId) return c;
              const isPublishing = updates.status === "published" && card.status !== "published";
              const clientUpdates: Partial<Client> = {
                lastKanbanActivity: new Date().toISOString(),
                postsThisMonth: isPublishing ? (c.postsThisMonth ?? 0) + 1 : c.postsThisMonth,
                lastPostDate: isPublishing ? new Date().toISOString().split("T")[0] : c.lastPostDate,
              };
              db.updateClientDb(c.id, clientUpdates).catch(() => {});
              return { ...c, ...clientUpdates };
            })
          );
          if (updates.status === "published") {
            pushNotification("content", "Conteúdo publicado", `${card.title} — ${card.clientName}. Tráfego: avaliar impulsionamento.`, card.clientId);
          }
          if (updates.status === "approval") {
            pushNotification("content", "Card aguardando aprovação", `"${card.title}" de ${card.clientName} precisa de revisão do gestor.`, card.clientId);
          }
          if (updates.status === "client_approval") {
            pushNotification("content", "Aprovação do cliente", `"${card.title}" de ${card.clientName} enviado para aprovação do cliente.`, card.clientId);
          }
          if (updates.status === "in_production" && card.status === "script") {
            pushNotification("content", "Card em produção", `"${card.title}" de ${card.clientName} entrou em produção. Designer: verificar fila.`, card.clientId);
            // Auto-create design request if card doesn't have one yet
            if (!card.designRequestId) {
              const autoReq = addDesignRequest({
                title: card.title,
                clientId: card.clientId,
                clientName: card.clientName,
                requestedBy: card.socialMedia || "Social Media",
                priority: card.priority,
                status: "queued",
                format: card.format || "Post",
                briefing: card.briefing || card.caption || `Arte para "${card.title}"`,
                contentCardId: card.id,
              });
              // Link the design request back to the card
              updates.designRequestId = autoReq.id;
            }
          }
        }
        if (card && updates.imageUrl && updates.designerDeliveredBy) {
          const isReplacement = !!card.designerDeliveredAt;
          pushNotification(
            "content",
            isReplacement ? "Arte atualizada pelo designer" : "Arte entregue pelo designer",
            `${updates.designerDeliveredBy} ${isReplacement ? "atualizou" : "enviou"} a arte de "${card.title}" para ${card.clientName}. Social media: conferir e confirmar.`,
            card.clientId
          );
        }
        if (card && updates.socialConfirmedBy && !card.socialConfirmedAt) {
          pushNotification(
            "content",
            "Arte confirmada pelo social media",
            `${updates.socialConfirmedBy} confirmou a arte de "${card.title}" — ${card.clientName}.`,
            card.clientId
          );
        }
        if (card && updates.nonDeliveryReason && !card.nonDeliveryReason) {
          pushNotification(
            "content",
            "Entrega não realizada",
            `"${card.title}" de ${card.clientName}: ${updates.nonDeliveryReason}`,
            card.clientId
          );
        }
        if (card && updates.trafficSuggestion && !card.trafficSuggestion) {
          pushNotification(
            "content",
            "Sugestão de tráfego",
            `Tráfego sugeriu impulsionamento para "${card.title}" — ${card.clientName}. Social media: verificar recomendação.`,
            card.clientId
          );
        }

        // Persist to DB
        db.updateContentCardDb(id, updates).catch(() => {});

        return prev.map((c) => {
          if (c.id !== id) return c;
          const merged = { ...c, ...updates };
          if (updates.status && updates.status !== c.status) {
            merged.statusChangedAt = new Date().toISOString();
          }
          return merged;
        });
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pushNotification]
  );

  const updateClientData = useCallback(
    (clientId: string, updates: Partial<Client>) => {
      setClients((prev) =>
        prev.map((c) => (c.id === clientId ? { ...c, ...updates } : c))
      );
      db.updateClientDb(clientId, updates).catch(() => {});
    },
    []
  );

  const updateInvestmentData = useCallback(
    (clientId: string, data: Partial<ClientInvestmentData>, actor: string) => {
      setInvestmentData((prev) => ({
        ...prev,
        [clientId]: {
          ...(prev[clientId] ?? { clientId, monthlyBudget: 0, dailyBudget: 0, paymentMethod: "pix" as InvestmentPaymentMethod }),
          ...data,
          updatedBy: actor,
          updatedAt: new Date().toISOString(),
        },
      }));
      // Also sync monthlyBudget back to the Client record for consistency
      if (data.monthlyBudget !== undefined) {
        setClients((prev) =>
          prev.map((c) => (c.id === clientId ? { ...c, monthlyBudget: data.monthlyBudget! } : c))
        );
      }
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
      db.insertMoodEntry(clientId, mood, note, actor).catch(() => {});
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
      db.insertCreativeAsset(asset).catch(() => {});
    },
    []
  );

  const addNotice = useCallback(
    (data: { title: string; body: string; urgent: boolean; createdBy: string; scheduledAt?: string; category?: "general" | "meeting" | "deadline" | "reminder" }) => {
      const notice = {
        id: `n-${Date.now()}`,
        ...data,
        createdAt: new Date().toISOString().split("T")[0],
      };
      setNotices((prev) => [notice, ...prev]);
      if (data.urgent || data.category === "meeting") {
        pushNotification(
          "system",
          data.urgent ? "Aviso urgente" : "Novo aviso",
          `${data.title}${data.scheduledAt ? ` — ${data.scheduledAt}` : ""}`,
        );
      }
      db.insertNotice(data).catch(() => {});
    },
    [pushNotification]
  );

  const deleteNotice = useCallback((id: string) => {
    setNotices((prev) => prev.filter((n) => n.id !== id));
    db.deleteNoticeDb(id).catch(() => {});
  }, []);

  const addCardComment = useCallback(
    (cardId: string, author: string, role: Role, text: string) => {
      const comment: CardComment = {
        id: `cmt-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        author,
        role,
        text,
        createdAt: new Date().toISOString(),
      };
      setContentCards((prev) => {
        const card = prev.find((c) => c.id === cardId);
        if (card) {
          pushNotification(
            "content",
            "Novo comentário",
            `${author} comentou em "${card.title}" — ${card.clientName}: "${text.slice(0, 60)}${text.length > 60 ? "..." : ""}"`,
            card.clientId
          );
        }
        return prev.map((c) =>
          c.id === cardId
            ? { ...c, comments: [...(c.comments ?? []), comment] }
            : c
        );
      });
      db.insertCardComment(cardId, author, text).catch(() => {});
    },
    [pushNotification]
  );

  const addSocialTeamMember = useCallback(
    (name: string, password: string) => {
      setSocialTeam((prev) => [...prev, { id: `sm-${Date.now()}`, name, password }]);
    },
    []
  );

  const loginSocial = useCallback(
    (name: string, password: string): boolean => {
      const member = socialTeam.find((m) => m.name === name && m.password === password);
      if (member) {
        setSocialAuthUser(member.name);
        return true;
      }
      return false;
    },
    [socialTeam]
  );

  const logoutSocial = useCallback(() => {
    setSocialAuthUser(null);
  }, []);

  const updateDesignRequest = useCallback(
    (id: string, updates: Partial<DesignRequest>) => {
      setDesignRequests((prev) => {
        const req = prev.find((r) => r.id === id);
        if (req && updates.status === "done" && req.status !== "done") {
          pushNotification(
            "content",
            "Design concluído",
            `"${req.title}" para ${req.clientName} está pronto. Social pode avançar o card.`,
            req.clientId
          );
          setContentCards((cards) =>
            cards.map((c) => {
              if (c.designRequestId !== req.id) return c;
              // Only set delivery info if not already set by UploadArtModal
              if (c.designerDeliveredAt) return c;
              const cardUpdates = {
                designerDeliveredAt: new Date().toISOString(),
                designerDeliveredBy: req.requestedBy || "Designer",
              };
              db.updateContentCardDb(c.id, cardUpdates).catch(() => {});
              return { ...c, ...cardUpdates };
            })
          );
          pushTimeline({
            clientId: req.clientId,
            type: "design",
            actor: "Designer",
            description: `Arte concluída: "${req.title}" — pronta para social media.`,
            timestamp: now(),
          });
        }
        return prev.map((r) => (r.id === id ? { ...r, ...updates } : r));
      });
      db.updateDesignRequestDb(id, updates).catch(() => {});
    },
    [pushNotification, pushTimeline, now]
  );

  const addDesignRequest = useCallback(
    (req: Omit<DesignRequest, "id"> & { contentCardId?: string }): DesignRequest => {
      const newReq: DesignRequest = { ...req, id: `dr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` };
      setDesignRequests((prev) => [newReq, ...prev]);
      if (req.contentCardId) {
        setContentCards((prev) =>
          prev.map((c) =>
            c.id === req.contentCardId ? { ...c, designRequestId: newReq.id } : c
          )
        );
      }
      pushNotification(
        "content",
        "Nova solicitação de design",
        `"${req.title}" para ${req.clientName} — Prioridade: ${req.priority}`,
        req.clientId
      );
      pushTimeline({
        clientId: req.clientId,
        type: "design",
        actor: req.requestedBy,
        description: `Solicitação de design criada: "${req.title}" — ${req.format}`,
        timestamp: now(),
      });

      const tempId = newReq.id;
      db.insertDesignRequest(req).then((dbReq) => {
        setDesignRequests((prev) =>
          prev.map((r) => (r.id === tempId ? { ...r, id: dbReq.id } : r))
        );
        if (req.contentCardId) {
          db.updateContentCardDb(req.contentCardId, { designRequestId: dbReq.id }).catch(() => {});
        }
      }).catch(() => {});

      return newReq;
    },
    [pushNotification, pushTimeline, now]
  );

  const updateClientAccess = useCallback(
    (clientId: string, access: Partial<ClientAccess>, actor: string) => {
      setClientAccess((prev) => ({
        ...prev,
        [clientId]: {
          ...(prev[clientId] ?? { clientId }),
          ...access,
          clientId,
          updatedBy: actor,
          updatedAt: new Date().toISOString(),
        },
      }));
      pushTimeline({
        clientId,
        type: "manual",
        actor,
        description: "Acessos do cliente atualizados",
        timestamp: now(),
      });
      db.upsertClientAccess(clientId, access, actor).catch(() => {});
    },
    [pushTimeline, now]
  );

  const addTask = useCallback(
    (task: Omit<Task, "id">): Task => {
      const newTask: Task = { ...task, id: `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` };
      setTasks((prev) => [newTask, ...prev]);
      pushNotification(
        "system",
        "Nova tarefa atribuída",
        `"${task.title}" para ${task.clientName} — Responsável: ${task.assignedTo}`,
        task.clientId
      );

      const tempId = newTask.id;
      db.insertTask(task).then((dbTask) => {
        setTasks((prev) =>
          prev.map((t) => (t.id === tempId ? { ...t, id: dbTask.id } : t))
        );
      }).catch(() => {});

      return newTask;
    },
    [pushNotification]
  );

  const updateTask = useCallback(
    (id: string, updates: Partial<Task>) => {
      setTasks((prev) => {
        const task = prev.find((t) => t.id === id);
        if (task && updates.status && updates.status !== task.status) {
          if (updates.status === "done") {
            pushNotification("system", "Tarefa concluída", `"${task.title}" de ${task.clientName} foi concluída por ${task.assignedTo}.`, task.clientId);
            pushTimeline({ clientId: task.clientId, type: "task", actor: task.assignedTo, description: `Tarefa concluída: "${task.title}"`, timestamp: now() });
          } else if (updates.status === "in_progress") {
            pushNotification("system", "Tarefa iniciada", `"${task.title}" de ${task.clientName} — ${task.assignedTo} começou a trabalhar.`, task.clientId);
          } else if (updates.status === "review") {
            pushNotification("system", "Tarefa em revisão", `"${task.title}" de ${task.clientName} foi enviada para validação por ${task.assignedTo}.`, task.clientId);
          }
        }
        return prev.map((t) => (t.id === id ? { ...t, ...updates } : t));
      });
      db.updateTaskDb(id, updates).catch(() => {});
    },
    [pushNotification, pushTimeline, now]
  );

  const addTrafficReport = useCallback(
    (report: Omit<TrafficMonthlyReport, "id" | "createdAt">): TrafficMonthlyReport => {
      const newReport: TrafficMonthlyReport = {
        ...report,
        id: `tr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        createdAt: new Date().toISOString().slice(0, 10),
      };
      setTrafficReports((prev) => [newReport, ...prev]);
      pushNotification("system", "Relatório de tráfego criado", `Relatório de ${report.clientName} (${report.month}) — ${report.messages} mensagens, custo R$${report.messageCost.toFixed(2)}.`, report.clientId);
      db.insertTrafficReport(report).catch(() => {});
      return newReport;
    },
    [pushNotification]
  );

  const updateTrafficReport = useCallback(
    (id: string, updates: Partial<TrafficMonthlyReport>) => {
      setTrafficReports((prev) => prev.map((r) => (r.id === id ? { ...r, ...updates } : r)));
      db.updateTrafficReportDb(id, updates).catch(() => {});
    },
    []
  );

  const addTrafficRoutineCheck = useCallback(
    (check: Omit<TrafficRoutineCheck, "id" | "completedAt">) => {
      const newCheck: TrafficRoutineCheck = {
        ...check,
        id: `rc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        completedAt: new Date().toISOString(),
      };
      setTrafficRoutineChecks((prev) => [newCheck, ...prev]);
      pushNotification("checkin", "Check-in de tráfego", `${check.completedBy} registrou ${check.type} para ${check.clientName}.`, check.clientId);
      db.insertTrafficRoutineCheck(check).catch(() => {});
    },
    [pushNotification]
  );

  const addSocialReport = useCallback(
    (report: Omit<SocialMonthlyReport, "id" | "createdAt">): SocialMonthlyReport => {
      const newReport: SocialMonthlyReport = {
        ...report,
        id: `sr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        createdAt: new Date().toISOString().slice(0, 10),
      };
      setSocialReports((prev) => [newReport, ...prev]);
      pushNotification("system", "Relatório social criado", `Relatório de ${report.clientName} (${report.month}) — ${report.postsPublished}/${report.postsGoal} posts, taxa ${report.engagementRate}%.`, report.clientId);
      db.insertSocialReport(report).catch(() => {});
      return newReport;
    },
    [pushNotification]
  );

  const updateSocialReport = useCallback(
    (id: string, updates: Partial<SocialMonthlyReport>) => {
      setSocialReports((prev) => prev.map((r) => (r.id === id ? { ...r, ...updates } : r)));
      db.updateSocialReportDb(id, updates).catch(() => {});
    },
    []
  );

  const approveContent = useCallback(
    (cardId: string, reviewer: string) => {
      const approval: ContentApproval = {
        id: `ca-${Date.now()}`,
        cardId,
        status: "approved",
        reviewedBy: reviewer,
        reviewedAt: new Date().toISOString(),
      };
      setContentApprovals((prev) => [...prev.filter((a) => a.cardId !== cardId), approval]);
      setContentCards((prev) => {
        const card = prev.find((c) => c.id === cardId);
        if (card) {
          pushNotification("content", "Conteúdo aprovado", `"${card.title}" de ${card.clientName} foi aprovado por ${reviewer}. Pronto para agendamento.`, card.clientId);
        }
        return prev.map((c) => c.id === cardId ? { ...c, status: "scheduled" as const, statusChangedAt: new Date().toISOString() } : c);
      });
      db.upsertContentApproval({ cardId, status: "approved", reviewedBy: reviewer, reviewedAt: new Date().toISOString() }).catch(() => {});
      db.updateContentCardDb(cardId, { status: "scheduled" }).catch(() => {});
    },
    [pushNotification]
  );

  const rejectContent = useCallback(
    (cardId: string, reviewer: string, reason: string) => {
      const approval: ContentApproval = {
        id: `ca-${Date.now()}`,
        cardId,
        status: "rejected",
        reviewedBy: reviewer,
        reviewedAt: new Date().toISOString(),
        reason,
      };
      setContentApprovals((prev) => [...prev.filter((a) => a.cardId !== cardId), approval]);
      setContentCards((prev) => {
        const card = prev.find((c) => c.id === cardId);
        if (card) {
          pushNotification("content", "Conteúdo reprovado", `"${card.title}" de ${card.clientName} foi reprovado: ${reason}`, card.clientId);
        }
        return prev.map((c) => c.id === cardId ? { ...c, status: "in_production" as const, statusChangedAt: new Date().toISOString() } : c);
      });
      db.upsertContentApproval({ cardId, status: "rejected", reviewedBy: reviewer, reviewedAt: new Date().toISOString(), reason }).catch(() => {});
      db.updateContentCardDb(cardId, { status: "in_production" }).catch(() => {});
    },
    [pushNotification]
  );

  const addSocialProof = useCallback(
    (entry: Omit<SocialProofEntry, "id" | "createdAt">) => {
      const newEntry: SocialProofEntry = {
        ...entry,
        id: `sp-${Date.now()}`,
        createdAt: now(),
      };
      setSocialProofs((prev) => ({
        ...prev,
        [entry.clientId]: [newEntry, ...(prev[entry.clientId] ?? [])],
      }));
      pushTimeline({
        clientId: entry.clientId,
        type: "report",
        actor: entry.createdBy,
        description: `Prova social registrada: ${entry.metric1Label} ${entry.metric1Value}, ${entry.metric2Label} ${entry.metric2Value}, ${entry.metric3Label} ${entry.metric3Value}`,
        timestamp: now(),
      });
      db.insertSocialProof(entry).catch(() => {});
    },
    [pushTimeline, now]
  );

  const addCrisisNote = useCallback(
    (clientId: string, note: string, actor: string) => {
      const newNote: CrisisNote = {
        id: `cn-${Date.now()}`,
        clientId,
        note,
        createdBy: actor,
        createdAt: now(),
      };
      setCrisisNotes((prev) => ({
        ...prev,
        [clientId]: [newNote, ...(prev[clientId] ?? [])],
      }));
      pushTimeline({
        clientId,
        type: "status",
        actor,
        description: `Nota de crise registrada: "${note.slice(0, 80)}${note.length > 80 ? "..." : ""}"`,
        timestamp: now(),
      });
      const client = clients.find((c) => c.id === clientId);
      pushNotification(
        "sla",
        "Nota de crise registrada",
        `${actor} registrou crise em ${client?.name ?? "cliente"}: "${note.slice(0, 80)}${note.length > 80 ? "..." : ""}"`,
        clientId
      );
      db.insertCrisisNote(clientId, note, actor).catch(() => {});
    },
    [pushTimeline, pushNotification, now, clients]
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
          db.updateOnboardingItemDb(itemId, updatedItem.completed, actor).catch(() => {});
        }

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
          setClientAccess((prev) => ({
            ...prev,
            [clientId]: prev[clientId] ?? { clientId },
          }));
          pushNotification("system", "Onboarding concluído", `Preencha os acessos do cliente na aba Acessos.`, clientId);
          db.updateClientDb(clientId, { status: "good" }).catch(() => {});
        }

        return { ...prev, [clientId]: items };
      });
    },
    [pushTimeline, now, pushNotification]
  );

  // ---------- Computed (unchanged) ----------

  const monthlyDeliveryReports = useMemo<MonthlyDeliveryReport[]>(() => {
    const reports: MonthlyDeliveryReport[] = [];
    const monthSet = new Set<string>();
    contentCards.forEach((c) => {
      if (c.dueDate) monthSet.add(c.dueDate.slice(0, 7));
      if (c.statusChangedAt) monthSet.add(c.statusChangedAt.slice(0, 10).slice(0, 7));
    });
    const currentMonth = new Date().toISOString().slice(0, 7);
    monthSet.add(currentMonth);

    const activeClients = clients.filter((cl) => cl.status !== "onboarding");

    for (const month of Array.from(monthSet).sort()) {
      for (const client of activeClients) {
        const clientCards = contentCards.filter(
          (c) => c.clientId === client.id && c.dueDate?.startsWith(month)
        );
        const publishedThisMonth = contentCards.filter(
          (c) =>
            c.clientId === client.id &&
            c.status === "published" &&
            (c.dueDate?.startsWith(month) || c.statusChangedAt?.startsWith(month))
        );

        const goal = client.postsGoal ?? 12;
        const delivered = publishedThisMonth.length;
        const scheduled = clientCards.filter((c) => c.status === "scheduled").length;
        const inProd = clientCards.filter((c) =>
          ["in_production", "approval", "client_approval", "script"].includes(c.status)
        ).length;
        const ideas = clientCards.filter((c) => c.status === "ideas").length;

        const formatMap = new Map<string, number>();
        publishedThisMonth.forEach((c) => {
          formatMap.set(c.format, (formatMap.get(c.format) ?? 0) + 1);
        });

        reports.push({
          id: `mdr-${client.id}-${month}`,
          clientId: client.id,
          clientName: client.name,
          socialMedia: client.assignedSocial,
          month,
          postsGoal: goal,
          postsDelivered: delivered,
          completionRate: goal > 0 ? Math.round((delivered / goal) * 100) : 0,
          cardsByStatus: { published: delivered, scheduled, inProduction: inProd, ideas },
          formats: Array.from(formatMap).map(([format, count]) => ({ format, count })),
          generatedAt: new Date().toISOString(),
        });
      }
    }
    return reports;
  }, [contentCards, clients]);

  const socialPerformanceScores = useMemo<SocialPerformanceScore[]>(() => {
    const socialPeople = [...new Set(clients.filter((c) => c.status !== "onboarding").map((c) => c.assignedSocial))];
    const currentMonth = new Date().toISOString().slice(0, 7);

    return socialPeople.map((person) => {
      const personClients = clients.filter(
        (c) => c.assignedSocial === person && c.status !== "onboarding"
      );
      let totalGoal = 0;
      let totalDelivered = 0;
      const breakdown = personClients.map((client) => {
        const goal = client.postsGoal ?? 12;
        const delivered = contentCards.filter(
          (c) =>
            c.clientId === client.id &&
            c.status === "published" &&
            (c.dueDate?.startsWith(currentMonth) || c.statusChangedAt?.startsWith(currentMonth))
        ).length;
        totalGoal += goal;
        totalDelivered += delivered;
        return {
          clientId: client.id,
          clientName: client.name,
          goal,
          delivered,
          rate: goal > 0 ? Math.round((delivered / goal) * 100) : 0,
        };
      });

      const overallRate = totalGoal > 0 ? Math.round((totalDelivered / totalGoal) * 100) : 0;
      let level: PerformanceLevel = "excellent";
      if (overallRate < 70) level = "critical";
      else if (overallRate < 80) level = "warning";
      else if (overallRate < 95) level = "good";

      return {
        socialMedia: person,
        totalClients: personClients.length,
        totalPostsGoal: totalGoal,
        totalPostsDelivered: totalDelivered,
        overallRate,
        level,
        clientBreakdown: breakdown,
      };
    });
  }, [contentCards, clients]);

  // ---------- Provider ----------

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
        socialProofs,
        crisisNotes,
        socialTeam,
        socialAuthUser,
        notifications,
        quinzReports,
        designRequests,
        clientAccess,
        tasks,
        trafficReports,
        trafficRoutineChecks,
        addTrafficReport,
        updateTrafficReport,
        addTrafficRoutineCheck,
        socialReports,
        addSocialReport,
        updateSocialReport,
        contentApprovals,
        approveContent,
        rejectContent,
        pushNotification,
        markNotificationRead,
        markAllNotificationsRead,
        addQuinzReport,
        addCardComment,
        deleteNotice,
        addClient,
        updateClientStatus,
        updateContentCard,
        addContentCard,
        updateClientData,
        addMoodEntry,
        addCreativeAsset,
        addNotice,
        addSocialProof,
        addCrisisNote,
        addSocialTeamMember,
        loginSocial,
        logoutSocial,
        updateDesignRequest,
        addDesignRequest,
        updateClientAccess,
        addTask,
        updateTask,
        addTimelineEntry,
        sendClientMessage,
        sendGlobalMessage,
        toggleOnboardingItem,
        monthlyDeliveryReports,
        socialPerformanceScores,
        investmentData,
        updateInvestmentData,
        dbReady,
      }}
    >
      {children}
    </AppStateContext.Provider>
  );
}

export function useAppState() {
  return useContext(AppStateContext);
}
