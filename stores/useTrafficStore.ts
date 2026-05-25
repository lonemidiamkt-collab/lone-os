import { create } from "zustand";
import { devtools, subscribeWithSelector } from "zustand/middleware";
import { authedFetch } from "@/lib/supabase/authed-fetch";
import type { TrafficMonthlyReport, TrafficRoutineCheck, ClientInvestmentData, InvestmentPaymentMethod } from "@/lib/types";
import * as db from "@/lib/supabase/queries";

export interface AdAccount {
  id: string;
  clientId: string;
  metaAccountId: string;
  accountName: string;
  billingType: "prepaid" | "postpaid" | "unknown";
  balance: number | null;
  currentMonthSpend: number | null;
  lastSyncAt: string | null;
}

export interface AnomalyAlert {
  id: string;
  clientId: string;
  metricDate: string;
  anomalyType: string;
  severity: "low" | "medium" | "high" | "critical";
  message: string;
  resolvedAt: string | null;
  createdAt: string;
}

interface TrafficState {
  adAccounts: AdAccount[];
  anomalyAlerts: AnomalyAlert[];
  trafficReports: TrafficMonthlyReport[];
  trafficRoutineChecks: TrafficRoutineCheck[];
  investmentData: Record<string, ClientInvestmentData>;
  syncing: boolean;
  initialized: boolean;

  init: () => Promise<void>;
  syncBalances: () => Promise<void>;
  addAdAccount: (clientId: string, metaAccountId: string, accountName: string) => Promise<AdAccount>;

  addTrafficReport: (report: Omit<TrafficMonthlyReport, "id" | "createdAt">) => Promise<TrafficMonthlyReport>;
  updateTrafficReport: (id: string, updates: Partial<TrafficMonthlyReport>) => Promise<void>;
  addTrafficRoutineCheck: (check: Omit<TrafficRoutineCheck, "id" | "completedAt">) => Promise<void>;
  updateInvestmentData: (clientId: string, data: Partial<ClientInvestmentData>, actor: string) => void;
}

export const selectAdAccounts = (s: TrafficState) => s.adAccounts;
export const selectAnomalyAlerts = (s: TrafficState) => s.anomalyAlerts;
export const selectTrafficSyncing = (s: TrafficState) => s.syncing;
export const selectTrafficReports = (s: TrafficState) => s.trafficReports;
export const selectTrafficRoutineChecks = (s: TrafficState) => s.trafficRoutineChecks;
export const selectInvestmentData = (s: TrafficState) => s.investmentData;
export const selectAdAccountsByClient = (clientId: string) => (s: TrafficState) =>
  s.adAccounts.filter((a) => a.clientId === clientId);

function loadInvestmentDataFromStorage(): Record<string, ClientInvestmentData> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem("lone_investmentData");
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveInvestmentDataToStorage(data: Record<string, ClientInvestmentData>): void {
  if (typeof window === "undefined") return;
  try { localStorage.setItem("lone_investmentData", JSON.stringify(data)); } catch {}
}

export const useTrafficStore = create<TrafficState>()(
  devtools(
    subscribeWithSelector((set, get) => ({
      adAccounts: [],
      anomalyAlerts: [],
      trafficReports: [],
      trafficRoutineChecks: [],
      investmentData: {},
      syncing: false,
      initialized: false,

      init: async () => {
        if (get().initialized) return;
        const investmentData = loadInvestmentDataFromStorage();
        try {
          const [adAccountsRes, trafficReports, trafficRoutineChecks] = await Promise.all([
            authedFetch("/api/traffic/ad-accounts"),
            db.fetchTrafficReports(),
            db.fetchTrafficRoutineChecks(),
          ]);
          const adAccounts = adAccountsRes.ok ? ((await adAccountsRes.json()).accounts ?? []) : [];
          set({ adAccounts, trafficReports, trafficRoutineChecks, investmentData, initialized: true }, false, "traffic/init/done");
        } catch {
          set({ investmentData, initialized: true }, false, "traffic/init/done/partial");
        }
      },

      syncBalances: async () => {
        set({ syncing: true }, false, "traffic/sync/start");
        try {
          const res = await authedFetch("/api/traffic/sync-balances", { method: "POST" });
          if (res.ok) {
            set({ initialized: false }, false, "traffic/sync/reset");
            await get().init();
          }
        } finally {
          set({ syncing: false }, false, "traffic/sync/done");
        }
      },

      addAdAccount: async (clientId, metaAccountId, accountName) => {
        const res = await authedFetch("/api/traffic/ad-accounts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId, metaAccountId, accountName }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const { id } = await res.json();
        const account: AdAccount = {
          id, clientId, metaAccountId, accountName,
          billingType: "unknown", balance: null, currentMonthSpend: null, lastSyncAt: null,
        };
        set((s) => ({ adAccounts: [...s.adAccounts, account] }), false, "traffic/account/add");
        return account;
      },

      addTrafficReport: async (report) => {
        const tempId = `temp-tr-${Date.now()}`;
        const optimistic: TrafficMonthlyReport = { ...report, id: tempId, createdAt: new Date().toISOString() } as TrafficMonthlyReport;
        set((s) => ({ trafficReports: [optimistic, ...s.trafficReports] }), false, "traffic/report/add/optimistic");
        try {
          await db.insertTrafficReport(report);
          const updated = await db.fetchTrafficReports();
          set({ trafficReports: updated }, false, "traffic/report/add/confirmed");
          return updated.find((r) => r.id !== tempId) ?? optimistic;
        } catch (err) {
          set((s) => ({ trafficReports: s.trafficReports.filter((r) => r.id !== tempId) }), false, "traffic/report/add/rollback");
          throw err;
        }
      },

      updateTrafficReport: async (id, updates) => {
        const prev = get().trafficReports.find((r) => r.id === id);
        set((s) => ({
          trafficReports: s.trafficReports.map((r) => r.id === id ? { ...r, ...updates } : r),
        }), false, "traffic/report/update/optimistic");
        try {
          await db.updateTrafficReportDb(id, updates);
        } catch (err) {
          if (prev) set((s) => ({ trafficReports: s.trafficReports.map((r) => r.id === id ? prev : r) }), false, "traffic/report/update/rollback");
          throw err;
        }
      },

      addTrafficRoutineCheck: async (check) => {
        const tempId = `temp-trc-${Date.now()}`;
        const optimistic: TrafficRoutineCheck = { ...check, id: tempId, completedAt: new Date().toISOString() } as TrafficRoutineCheck;
        set((s) => ({ trafficRoutineChecks: [optimistic, ...s.trafficRoutineChecks] }), false, "traffic/routineCheck/add/optimistic");
        try {
          await db.insertTrafficRoutineCheck(check);
          const updated = await db.fetchTrafficRoutineChecks();
          set({ trafficRoutineChecks: updated }, false, "traffic/routineCheck/add/confirmed");
        } catch {
          set((s) => ({ trafficRoutineChecks: s.trafficRoutineChecks.filter((c) => c.id !== tempId) }), false, "traffic/routineCheck/add/rollback");
        }
      },

      updateInvestmentData: (clientId, data, actor) => {
        const prev = get().investmentData[clientId];
        const updated: ClientInvestmentData = {
          ...(prev ?? { clientId, monthlyBudget: 0, dailyBudget: 0, paymentMethod: "pix" as InvestmentPaymentMethod }),
          ...data,
          updatedBy: actor,
          updatedAt: new Date().toISOString(),
        };
        const next = { ...get().investmentData, [clientId]: updated };
        set({ investmentData: next }, false, "traffic/investment/update");
        saveInvestmentDataToStorage(next);
      },
    })),
    { name: "TrafficStore" }
  )
);
