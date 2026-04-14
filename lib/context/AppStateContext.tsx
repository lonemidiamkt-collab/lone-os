"use client";

import { createContext, useContext, useState, useCallback, useMemo, useEffect, useRef } from "react";
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
  Reminder,
  AutomationRule,
} from "@/lib/types";
import {
  mockClients,
  // mockClientChats — removed (no mock data)
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
// localStorage Persistence Layer
// ============================================

const STORAGE_KEY = "lone-os-state";

interface PersistedState {
  clients: Client[];
  investmentData: Record<string, ClientInvestmentData>;
  contentCards: ContentCard[];
  timeline: Record<string, TimelineEntry[]>;
  moodHistory: Record<string, MoodEntry[]>;
  creativeAssets: Record<string, CreativeAsset[]>;
  clientChats: Record<string, ChatMessage[]>;
  globalChat: GlobalChatMessage[];
  onboarding: Record<string, OnboardingItem[]>;
  notices: Notice[];
  socialProofs: Record<string, SocialProofEntry[]>;
  crisisNotes: Record<string, CrisisNote[]>;
  socialTeam: SocialTeamMember[];
  socialAuthUser: string | null;
  notifications: AppNotification[];
  quinzReports: QuinzReport[];
  designRequests: DesignRequest[];
  tasks: Task[];
  trafficReports: TrafficMonthlyReport[];
  trafficRoutineChecks: TrafficRoutineCheck[];
  socialReports: SocialMonthlyReport[];
  contentApprovals: ContentApproval[];
  clientAccess: Record<string, ClientAccess>;
  reminders: Reminder[];
}

const DATA_VERSION = "2026-04-14-clean"; // Increment to force purge cached mock data

function loadFromStorage(): Partial<PersistedState> | null {
  if (typeof window === "undefined") return null;
  try {
    // Force purge if data version changed (removes old mock data from cache)
    const storedVersion = localStorage.getItem("lone-os-data-version");
    if (storedVersion !== DATA_VERSION) {
      console.log("[Lone OS] Data version changed — purging cached data");
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem("lone_reminders");
      localStorage.removeItem("lone_investmentData");
      localStorage.removeItem("lone_automations");
      localStorage.removeItem("lone-os-snapshots");
      localStorage.removeItem("lone-os-delivery-log");
      localStorage.removeItem("lone-os-morning-briefing");
      localStorage.setItem("lone-os-data-version", DATA_VERSION);
      return null;
    }

    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Partial<PersistedState>;
  } catch (err) {
    console.warn("[Lone OS] Failed to load from localStorage:", err);
    return null;
  }
}

function clearStorage() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
    // Also clear the legacy per-field keys
    localStorage.removeItem("lone_reminders");
    localStorage.removeItem("lone_investmentData");
  } catch {}
}

// ============================================
// Fallback init functions (used when DB is unavailable)
// ============================================

function initClientChats(): Record<string, ChatMessage[]> { return {}; }
function initOnboarding(): Record<string, OnboardingItem[]> { return {}; }

function initInvestmentData(): Record<string, ClientInvestmentData> {
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
}

function initClientAccess(): Record<string, ClientAccess> {
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
}

function initNotifications(): AppNotification[] {
  return [
    { id: "notif-1", type: "status", title: "Cliente em risco", body: "Fitness Power foi marcado como Em Risco", clientId: "c4", read: false, createdAt: "2026-03-20T14:00:00" },
    { id: "notif-2", type: "content", title: "Card publicado", body: "Reels lançamento do novo curso — EduPro foi publicado", read: false, createdAt: "2026-03-20T10:00:00" },
    { id: "notif-3", type: "sla", title: "Gargalo detectado", body: "Reel: 5 dicas de investimento está parado há 7 dias em Produção", clientId: "c6", read: true, createdAt: "2026-03-19T09:00:00" },
  ];
}

function initSocialTeam(): SocialTeamMember[] {
  return [
    { id: "sm-1", name: "Carlos Melo", password: "00" },
    { id: "sm-2", name: "Mariana Costa", password: "00" },
  ];
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
  deleteTask: (id: string) => void;
  deleteContentCard: (id: string) => void;
  deleteDesignRequest: (id: string) => void;

  updateContentCard: (id: string, updates: Partial<ContentCard>) => void;
  addContentCard: (card: Omit<ContentCard, "id">) => ContentCard;
  updateClientData: (clientId: string, updates: Partial<Client>) => void;
  addMoodEntry: (clientId: string, mood: MoodType, note: string, actor: string) => void;
  addCreativeAsset: (asset: Omit<CreativeAsset, "id">) => void;

  addClient: (data: Omit<Client, "id" | "status" | "attentionLevel" | "tags" | "joinDate" | "lastPostDate">) => Client;

  updateClientStatus: (clientId: string, status: ClientStatus, actor: string) => void;
  addTimelineEntry: (entry: Omit<TimelineEntry, "id">) => void;
  sendClientMessage: (clientId: string, user: string, text: string) => void;
  sendGlobalMessage: (user: string, role: Role, text: string) => void;
  toggleOnboardingItem: (clientId: string, itemId: string, actor: string) => void;

  monthlyDeliveryReports: MonthlyDeliveryReport[];
  socialPerformanceScores: SocialPerformanceScore[];

  // Reminders
  reminders: Reminder[];
  addReminder: (reminder: Omit<Reminder, "id">) => Reminder;
  toggleReminder: (id: string) => void;
  updateReminder: (id: string, updates: Partial<Reminder>) => void;

  // Automations
  automationRules: AutomationRule[];
  addAutomationRule: (rule: Omit<AutomationRule, "id" | "createdAt" | "triggerCount">) => AutomationRule;
  updateAutomationRule: (id: string, updates: Partial<AutomationRule>) => void;
  toggleAutomationRule: (id: string) => void;
  deleteAutomationRule: (id: string) => void;

  // Investment Control
  investmentData: Record<string, ClientInvestmentData>;
  updateInvestmentData: (clientId: string, data: Partial<ClientInvestmentData>, actor: string) => void;

  // DB loading state
  dbReady: boolean;

  // Reset state — clears localStorage and reloads mock data
  resetState: () => void;
}

const AppStateContext = createContext<AppStateContextValue>({} as AppStateContextValue);

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useRole();

  // Load persisted state once at init
  const cached = useRef(loadFromStorage());

  // ---------- State (initialized from localStorage → fallback to mock) ----------
  const [clients, setClients] = useState<Client[]>(() => cached.current?.clients ?? []);

  const [investmentData, setInvestmentData] = useState<Record<string, ClientInvestmentData>>(() => {
    if (cached.current?.investmentData) return cached.current.investmentData;
    // Legacy localStorage key migration
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("lone_investmentData");
        if (saved) return JSON.parse(saved) as Record<string, ClientInvestmentData>;
      } catch {}
    }
    return initInvestmentData();
  });

  const [contentCards, setContentCards] = useState<ContentCard[]>(() => cached.current?.contentCards ?? []);
  const [timeline, setTimeline] = useState<Record<string, TimelineEntry[]>>(() => cached.current?.timeline ?? {});
  const [moodHistory, setMoodHistory] = useState<Record<string, MoodEntry[]>>(() => cached.current?.moodHistory ?? {});
  const [creativeAssets, setCreativeAssets] = useState<Record<string, CreativeAsset[]>>(() => cached.current?.creativeAssets ?? {});
  const [clientChats, setClientChats] = useState<Record<string, ChatMessage[]>>(() => cached.current?.clientChats ?? {});
  const [globalChat, setGlobalChat] = useState<GlobalChatMessage[]>(() => cached.current?.globalChat ?? []);
  const [onboarding, setOnboarding] = useState<Record<string, OnboardingItem[]>>(() => cached.current?.onboarding ?? {});
  const [notices, setNotices] = useState<Notice[]>(() => cached.current?.notices ?? []);
  const [socialProofs, setSocialProofs] = useState<Record<string, SocialProofEntry[]>>(() => cached.current?.socialProofs ?? {});
  const [crisisNotes, setCrisisNotes] = useState<Record<string, CrisisNote[]>>(() => cached.current?.crisisNotes ?? {});
  const [socialTeam, setSocialTeam] = useState<SocialTeamMember[]>(() => cached.current?.socialTeam ?? initSocialTeam());
  const [socialAuthUser, setSocialAuthUser] = useState<string | null>(() => cached.current?.socialAuthUser ?? null);
  const [notifications, setNotifications] = useState<AppNotification[]>(() => cached.current?.notifications ?? initNotifications());

  const [quinzReports, setQuinzReports] = useState<QuinzReport[]>(() => cached.current?.quinzReports ?? []);
  const [designRequests, setDesignRequests] = useState<DesignRequest[]>(() => cached.current?.designRequests ?? []);
  const [tasks, setTasks] = useState<Task[]>(() => cached.current?.tasks ?? []);
  const [trafficReports, setTrafficReports] = useState<TrafficMonthlyReport[]>(() => cached.current?.trafficReports ?? []);
  const [trafficRoutineChecks, setTrafficRoutineChecks] = useState<TrafficRoutineCheck[]>(() => cached.current?.trafficRoutineChecks ?? []);
  const [socialReports, setSocialReports] = useState<SocialMonthlyReport[]>(() => cached.current?.socialReports ?? []);
  const [contentApprovals, setContentApprovals] = useState<ContentApproval[]>(() => cached.current?.contentApprovals ?? []);

  const [clientAccess, setClientAccess] = useState<Record<string, ClientAccess>>(() => cached.current?.clientAccess ?? initClientAccess());

  const [reminders, setReminders] = useState<Reminder[]>(() => {
    if (cached.current?.reminders) return cached.current.reminders;
    // Legacy localStorage key migration
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("lone_reminders");
        if (saved) return JSON.parse(saved) as Reminder[];
      } catch {}
    }
    return [];
  });

  const DEFAULT_AUTOMATION_RULES: AutomationRule[] = [
    { id: "auto-1", name: "Risco de Churn", description: "Cliente marcado como em risco de cancelamento — notifica CS + Gerente imediatamente", trigger: "client_status_change", triggerConfig: { status: "at_risk" }, action: "send_notification", actionConfig: { target: "cs,manager", message: "Cliente em risco de churn" }, enabled: true, createdAt: new Date().toISOString(), triggerCount: 3 },
    { id: "auto-2", name: "Task Vencida", description: "Tarefa passou do prazo de entrega — notifica o responsavel", trigger: "task_overdue", triggerConfig: {}, action: "send_notification", actionConfig: { target: "assignee", message: "Tarefa vencida" }, enabled: true, createdAt: new Date().toISOString(), triggerCount: 7 },
    { id: "auto-3", name: "SLA de Aprovacao (48h)", description: "Conteudo aguardando aprovacao ha mais de 48h — alerta o time social", trigger: "content_approval_pending", triggerConfig: { hours: "48" }, action: "send_notification", actionConfig: { target: "social", message: "Conteudo parado em aprovacao alem do SLA" }, enabled: true, createdAt: new Date().toISOString(), triggerCount: 2 },
    { id: "auto-4", name: "Limite de Verba (90%)", description: "Investimento atingiu 90% do orcamento mensal — alerta trafego + gerente", trigger: "budget_threshold", triggerConfig: { percent: "90" }, action: "send_notification", actionConfig: { target: "traffic,manager", message: "Verba acima de 90% do orcamento" }, enabled: true, createdAt: new Date().toISOString(), triggerCount: 1 },
    { id: "auto-5", name: "SLA de Onboarding (7 Dias)", description: "Funil de onboarding com SLA por fase: Setup 24h, Coleta 72h, Kickoff 168h", trigger: "onboarding_stalled", triggerConfig: { phase1: "24", phase2: "72", phase3: "168" }, action: "send_notification", actionConfig: { target: "cs,manager", message: "[Urgente] Gargalo no onboarding" }, enabled: true, createdAt: new Date().toISOString(), triggerCount: 0 },
  ];

  const [automationRules, setAutomationRules] = useState<AutomationRule[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("lone_automations");
        if (saved) return JSON.parse(saved) as AutomationRule[];
      } catch {}
    }
    return DEFAULT_AUTOMATION_RULES;
  });

  const [dbReady, setDbReady] = useState(false);

  // ─── Delivery Log (BI tracking) ──────────────────────────
  const logDelivery = useCallback((entry: Omit<import("@/lib/types").DeliveryLog, "id">) => {
    const log: import("@/lib/types").DeliveryLog = { ...entry, id: `dl-${Date.now()}-${Math.random().toString(36).slice(2, 5)}` };
    try {
      const existing = JSON.parse(localStorage.getItem("lone-os-delivery-log") ?? "[]");
      existing.unshift(log);
      localStorage.setItem("lone-os-delivery-log", JSON.stringify(existing.slice(0, 500)));
    } catch {}
  }, []);

  // ---------- Debounced save to localStorage ----------
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInitialMount = useRef(true);

  useEffect(() => {
    // Skip saving on the very first render (initial load)
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = setTimeout(() => {
      try {
        // Sanitize passwords before persisting to localStorage
        const sanitizedAccess: typeof clientAccess = {};
        for (const [k, v] of Object.entries(clientAccess)) {
          const clean = { ...v };
          for (const field of ["instagramPassword","facebookPassword","tiktokPassword","linkedinPassword","youtubePassword","mlabsPassword"] as const) {
            if (clean[field]) clean[field] = "••••" + (clean[field]?.slice(-2) ?? "");
          }
          sanitizedAccess[k] = clean;
        }
        const sanitizedTeam = socialTeam.map((m) => ({ ...m, password: "••••" }));

        const stateToSave: PersistedState = {
          clients,
          investmentData,
          contentCards,
          timeline,
          moodHistory,
          creativeAssets,
          clientChats,
          globalChat,
          onboarding,
          notices,
          socialProofs,
          crisisNotes,
          socialTeam: sanitizedTeam,
          socialAuthUser,
          notifications,
          quinzReports,
          designRequests,
          tasks,
          trafficReports,
          trafficRoutineChecks,
          socialReports,
          contentApprovals,
          clientAccess: sanitizedAccess,
          reminders,
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
      } catch (err) {
        console.warn("[Lone OS] Failed to save to localStorage:", err);
      }
    }, 500);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [
    clients, investmentData, contentCards, timeline, moodHistory,
    creativeAssets, clientChats, globalChat, onboarding, notices,
    socialProofs, crisisNotes, socialTeam, socialAuthUser, notifications,
    quinzReports, designRequests, tasks, trafficReports, trafficRoutineChecks,
    socialReports, contentApprovals, clientAccess, reminders,
  ]);

  // ---------- Legacy persistence (keep for backwards compat, will be superseded by STORAGE_KEY) ----------
  useEffect(() => {
    try { localStorage.setItem("lone_reminders", JSON.stringify(reminders)); } catch {}
  }, [reminders]);

  useEffect(() => {
    try {
      localStorage.setItem("lone_investmentData", JSON.stringify(investmentData));
    } catch {}
  }, [investmentData]);

  // ---------- Automation Rules Engine ----------
  // Refs to hold latest state so the interval callback never goes stale
  const automationRulesRef = useRef(automationRules);
  automationRulesRef.current = automationRules;
  const clientsRef = useRef(clients);
  clientsRef.current = clients;
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
  const contentCardsRef = useRef(contentCards);
  contentCardsRef.current = contentCards;
  const investmentDataRef = useRef(investmentData);
  investmentDataRef.current = investmentData;
  const onboardingRef = useRef(onboarding);
  onboardingRef.current = onboarding;

  // Track which (ruleId, itemId) pairs have already been triggered to avoid duplicates
  const automationTriggeredRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    function evaluateAutomationRules() {
      const rules = automationRulesRef.current;
      const enabledRules = rules.filter((r) => r.enabled);
      if (enabledRules.length === 0) return;

      const now = new Date();
      const triggered = automationTriggeredRef.current;
      let rulesUpdated = false;
      const ruleUpdates: Record<string, { triggerCount: number; lastTriggeredAt: string }> = {};

      for (const rule of enabledRules) {
        let matchedIds: string[] = [];

        switch (rule.trigger) {
          case "client_status_change": {
            const targetStatus = rule.triggerConfig.status;
            if (!targetStatus) break;
            matchedIds = clientsRef.current
              .filter((c) => c.status === targetStatus)
              .map((c) => c.id);
            break;
          }

          case "task_overdue": {
            const todayStr = now.toISOString().split("T")[0];
            matchedIds = tasksRef.current
              .filter((t) => t.status !== "done" && t.dueDate && t.dueDate < todayStr)
              .map((t) => t.id);
            break;
          }

          case "content_approval_pending": {
            const thresholdHours = parseInt(rule.triggerConfig.hours || "48", 10);
            matchedIds = contentCardsRef.current
              .filter((card) => {
                if (card.status !== "approval" && card.status !== "client_approval") return false;
                if (!card.statusChangedAt) return false;
                const changedAt = new Date(card.statusChangedAt);
                const hoursElapsed = (now.getTime() - changedAt.getTime()) / (1000 * 60 * 60);
                return hoursElapsed >= thresholdHours;
              })
              .map((card) => card.id);
            break;
          }

          case "budget_threshold": {
            // Budget threshold requires actual spend data.
            // Currently investmentData only has monthlyBudget/dailyBudget without actual spend tracking.
            // This trigger will activate when spend tracking is implemented.
            break;
          }

          case "onboarding_stalled": {
            // Phase-based SLA: check each onboarding phase threshold
            const phase1h = parseInt(rule.triggerConfig.phase1 || "24", 10);
            const phase2h = parseInt(rule.triggerConfig.phase2 || "72", 10);
            const phase3h = parseInt(rule.triggerConfig.phase3 || "168", 10);
            const fallbackDays = parseInt(rule.triggerConfig.days || "7", 10);

            clientsRef.current.forEach((c) => {
              if (c.status !== "onboarding" || !c.joinDate) return;
              const joinDate = new Date(c.joinDate);
              const hoursElapsed = (now.getTime() - joinDate.getTime()) / (1000 * 60 * 60);

              // Check which phase is breached (most urgent first)
              if (hoursElapsed >= phase3h) {
                matchedIds.push(`${c.id}::phase3`);
              } else if (hoursElapsed >= phase2h) {
                matchedIds.push(`${c.id}::phase2`);
              } else if (hoursElapsed >= phase1h) {
                matchedIds.push(`${c.id}::phase1`);
              } else if (hoursElapsed >= fallbackDays * 24) {
                matchedIds.push(`${c.id}::general`);
              }
            });
            break;
          }
        }

        // Filter out already-triggered (ruleId + itemId) combos
        const newMatches = matchedIds.filter((itemId) => !triggered.has(`${rule.id}::${itemId}`));

        if (newMatches.length > 0) {
          // Mark as triggered
          for (const itemId of newMatches) {
            triggered.add(`${rule.id}::${itemId}`);
          }

          // Execute action — build notification body
          const actionMessage = rule.actionConfig.message || rule.name;
          let body: string;
          let clientId: string | undefined;

          if (rule.trigger === "onboarding_stalled") {
            // Onboarding: include phase info in notification
            const phaseLabels: Record<string, string> = { phase1: "Setup", phase2: "Coleta de Dados", phase3: "Kickoff Operacional", general: "Geral" };
            const details = newMatches.map((m) => {
              const [cId, phase] = m.split("::");
              const client = clientsRef.current.find((c) => c.id === cId);
              return `${client?.name ?? cId} na fase ${phaseLabels[phase] ?? phase}`;
            });
            body = `[Urgente] Gargalo no onboarding: ${details.join(", ")}`;
            clientId = newMatches[0]?.split("::")[0];
          } else {
            const matchCount = newMatches.length;
            body = matchCount === 1 ? actionMessage : `${actionMessage} (${matchCount} itens)`;
            if (rule.trigger === "client_status_change") clientId = newMatches[0];
          }

          // Use the pushNotification via a direct state update to avoid stale closure
          const notif: AppNotification = {
            id: `notif-auto-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
            type: "system",
            title: `[Auto] ${rule.name}`,
            body,
            clientId,
            read: false,
            createdAt: new Date().toISOString(),
          };
          setNotifications((prev) => [notif, ...prev]);

          // Track rule update
          const prevCount = ruleUpdates[rule.id]?.triggerCount ?? rule.triggerCount;
          ruleUpdates[rule.id] = {
            triggerCount: prevCount + newMatches.length,
            lastTriggeredAt: new Date().toISOString(),
          };
          rulesUpdated = true;
        }
      }

      // Batch-update rules that fired
      if (rulesUpdated) {
        setAutomationRules((prev) => {
          const next = prev.map((r) =>
            ruleUpdates[r.id]
              ? { ...r, triggerCount: ruleUpdates[r.id].triggerCount, lastTriggeredAt: ruleUpdates[r.id].lastTriggeredAt }
              : r
          );
          try { localStorage.setItem("lone_automations", JSON.stringify(next)); } catch {}
          return next;
        });
      }
    }

    // Run once on mount, then every 60 seconds
    // Run once after 5s delay (not immediately, to avoid spam on page load)
    const initTimer = setTimeout(evaluateAutomationRules, 5000);
    // Then check every 10 minutes (was 60s — too aggressive)
    const intervalId = setInterval(evaluateAutomationRules, 600_000);

    return () => { clearTimeout(initTimer); clearInterval(intervalId); };
  }, []); // Empty deps — uses refs for latest state

  // ---------- Reset state — clears localStorage and reloads mock data ----------
  const resetState = useCallback(() => {
    clearStorage();
    setClients(mockClients);
    setInvestmentData(initInvestmentData());
    setContentCards(mockContentCards);
    setTimeline(mockTimeline);
    setMoodHistory(mockMoodHistory);
    setCreativeAssets(mockCreativeAssets);
    setClientChats(initClientChats());
    setGlobalChat(mockGlobalChat);
    setOnboarding(initOnboarding());
    setNotices(mockNotices);
    setSocialProofs({});
    setCrisisNotes({});
    setSocialTeam(initSocialTeam());
    setSocialAuthUser(null);
    setNotifications(initNotifications());
    setQuinzReports(mockQuinzReports);
    setDesignRequests(mockDesignRequests);
    setTasks(mockTasks);
    setTrafficReports(mockTrafficReports);
    setTrafficRoutineChecks(mockTrafficRoutineChecks);
    setSocialReports(mockSocialReports);
    setContentApprovals([]);
    setClientAccess(initClientAccess());
    setReminders([]);
  }, []);

  // ---------- Load from Supabase when authenticated (takes priority over localStorage) ----------
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

        // Supabase data takes priority over localStorage when available
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
        console.warn("[Lone OS] DB load failed, using localStorage/mock data:", err);
        // Keep localStorage/mock data as fallback
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
    (data: Omit<Client, "id" | "status" | "attentionLevel" | "tags" | "joinDate" | "lastPostDate">): Client => {
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
      const now = new Date().toISOString();
      const newCard: ContentCard = {
        ...card,
        id: `cc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        statusChangedAt: now,
        columnEnteredAt: { [card.status]: now, ...(card.columnEnteredAt ?? {}) },
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
    ideas: ["script", "in_production", "blocked"],
    script: ["ideas", "in_production", "blocked"],
    in_production: ["script", "approval", "blocked"],
    blocked: ["ideas", "script", "in_production"],
    approval: ["in_production", "client_approval", "scheduled", "blocked"],
    client_approval: ["approval", "scheduled", "in_production", "blocked"],
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
          // ── Timesheet Invisível (ContentCard) ──
          if (updates.status === "in_production" && card.status !== "in_production") {
            // Entering production → start timer
            updates.workStartedAt = new Date().toISOString();
          } else if (card.status === "in_production" && updates.status !== "in_production") {
            // Leaving production → accumulate time
            if (card.workStartedAt) {
              const elapsed = Date.now() - new Date(card.workStartedAt).getTime();
              updates.totalTimeSpentMs = (card.totalTimeSpentMs ?? 0) + elapsed;
              updates.workStartedAt = undefined;
            }
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
            // Log delivery for BI
            logDelivery({
              userId: card.socialMedia ?? "unknown",
              clientId: card.clientId,
              clientName: card.clientName,
              cardId: card.id,
              cardTitle: card.title,
              taskType: "content",
              action: "published",
              leadTimeMs: card.statusChangedAt ? Date.now() - new Date(card.columnEnteredAt?.ideas ?? card.statusChangedAt).getTime() : 0,
              timestamp: new Date().toISOString(),
            });
          }
          // Log design delivery
          if (updates.designerDeliveredAt && !card.designerDeliveredAt) {
            logDelivery({
              userId: updates.designerDeliveredBy ?? "unknown",
              clientId: card.clientId,
              clientName: card.clientName,
              cardId: card.id,
              cardTitle: card.title,
              taskType: "design",
              action: "delivered",
              leadTimeMs: card.columnEnteredAt?.in_production ? Date.now() - new Date(card.columnEnteredAt.in_production).getTime() : 0,
              timestamp: new Date().toISOString(),
            });
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
            const now = new Date().toISOString();
            merged.statusChangedAt = now;
            // Track per-column entry timestamps for accurate SLA
            merged.columnEnteredAt = {
              ...(c.columnEnteredAt ?? {}),
              [updates.status]: now,
            };
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
          // ── Timesheet Invisível (Task) ──
          if (updates.status === "in_progress" && task.status !== "in_progress") {
            updates.workStartedAt = new Date().toISOString();
          } else if (task.status === "in_progress" && updates.status !== "in_progress") {
            if (task.workStartedAt) {
              const elapsed = Date.now() - new Date(task.workStartedAt).getTime();
              updates.totalTimeSpentMs = (task.totalTimeSpentMs ?? 0) + elapsed;
              updates.workStartedAt = undefined;
            }
          }

          if (updates.status === "done") {
            pushNotification("system", "Tarefa concluída", `"${task.title}" de ${task.clientName} foi concluída por ${task.assignedTo}.`, task.clientId);
            pushTimeline({ clientId: task.clientId, type: "task", actor: task.assignedTo, description: `Tarefa concluída: "${task.title}"`, timestamp: now() });
            // Log for BI
            logDelivery({
              userId: task.assignedTo,
              clientId: task.clientId,
              clientName: task.clientName,
              cardId: task.id,
              cardTitle: task.title,
              taskType: "task",
              action: "completed",
              leadTimeMs: task.startDate ? Date.now() - new Date(task.startDate).getTime() : 0,
              timestamp: new Date().toISOString(),
            });
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

  // ─── Delete functions ─────────────────────────────────────
  const deleteTask = useCallback((id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const deleteContentCard = useCallback((id: string) => {
    setContentCards((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const deleteDesignRequest = useCallback((id: string) => {
    setDesignRequests((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const addReminder = useCallback(
    (reminder: Omit<Reminder, "id">): Reminder => {
      const newReminder: Reminder = { ...reminder, id: `rem-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` };
      setReminders((prev) => [newReminder, ...prev]);
      return newReminder;
    },
    []
  );

  const toggleReminder = useCallback(
    (id: string) => {
      setReminders((prev) => prev.map((r) => r.id === id ? { ...r, done: !r.done } : r));
    },
    []
  );

  const updateReminder = useCallback(
    (id: string, updates: Partial<Reminder>) => {
      setReminders((prev) => prev.map((r) => r.id === id ? { ...r, ...updates } : r));
    },
    []
  );

  // ─── Automation Rules ───────────────────────────────────────
  const addAutomationRule = useCallback(
    (rule: Omit<AutomationRule, "id" | "createdAt" | "triggerCount">): AutomationRule => {
      const newRule: AutomationRule = { ...rule, id: `auto-${Date.now()}`, createdAt: new Date().toISOString(), triggerCount: 0 };
      setAutomationRules((prev) => {
        const next = [newRule, ...prev];
        try { localStorage.setItem("lone_automations", JSON.stringify(next)); } catch {}
        return next;
      });
      return newRule;
    },
    []
  );

  const updateAutomationRule = useCallback(
    (id: string, updates: Partial<AutomationRule>) => {
      setAutomationRules((prev) => {
        const next = prev.map((r) => r.id === id ? { ...r, ...updates } : r);
        try { localStorage.setItem("lone_automations", JSON.stringify(next)); } catch {}
        return next;
      });
    },
    []
  );

  const toggleAutomationRule = useCallback(
    (id: string) => {
      setAutomationRules((prev) => {
        const next = prev.map((r) => r.id === id ? { ...r, enabled: !r.enabled } : r);
        try { localStorage.setItem("lone_automations", JSON.stringify(next)); } catch {}
        return next;
      });
    },
    []
  );

  const deleteAutomationRule = useCallback(
    (id: string) => {
      setAutomationRules((prev) => {
        const next = prev.filter((r) => r.id !== id);
        try { localStorage.setItem("lone_automations", JSON.stringify(next)); } catch {}
        return next;
      });
    },
    []
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
        deleteTask,
        deleteContentCard,
        deleteDesignRequest,
        addTimelineEntry,
        sendClientMessage,
        sendGlobalMessage,
        toggleOnboardingItem,
        monthlyDeliveryReports,
        socialPerformanceScores,
        reminders,
        addReminder,
        toggleReminder,
        updateReminder,
        automationRules,
        addAutomationRule,
        updateAutomationRule,
        toggleAutomationRule,
        deleteAutomationRule,
        investmentData,
        updateInvestmentData,
        dbReady,
        resetState,
      }}
    >
      {children}
    </AppStateContext.Provider>
  );
}

export function useAppState() {
  return useContext(AppStateContext);
}
