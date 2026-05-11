import { create } from "zustand";
import { devtools, subscribeWithSelector } from "zustand/middleware";
import { authedFetch } from "@/lib/supabase/authed-fetch";

// ──────────────────────────────────────────────────────────────────────────────
// Types (mirrored from DB schema — extend as needed)
// ──────────────────────────────────────────────────────────────────────────────

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
  syncing: boolean;
  initialized: boolean;

  init: () => Promise<void>;
  syncBalances: () => Promise<void>;
  addAdAccount: (clientId: string, metaAccountId: string, accountName: string) => Promise<AdAccount>;
}

export const selectAdAccounts = (s: TrafficState) => s.adAccounts;
export const selectAnomalyAlerts = (s: TrafficState) => s.anomalyAlerts;
export const selectTrafficSyncing = (s: TrafficState) => s.syncing;
export const selectAdAccountsByClient = (clientId: string) => (s: TrafficState) =>
  s.adAccounts.filter((a) => a.clientId === clientId);

export const useTrafficStore = create<TrafficState>()(
  devtools(
    subscribeWithSelector((set, get) => ({
      adAccounts: [],
      anomalyAlerts: [],
      syncing: false,
      initialized: false,

      init: async () => {
        if (get().initialized) return;
        try {
          const res = await authedFetch("/api/traffic/ad-accounts");
          if (!res.ok) return;
          const data = await res.json();
          set({ adAccounts: data.accounts ?? [], initialized: true }, false, "traffic/init/done");
        } catch {}
      },

      syncBalances: async () => {
        set({ syncing: true }, false, "traffic/sync/start");
        try {
          const res = await authedFetch("/api/traffic/sync-balances", { method: "POST" });
          if (res.ok) {
            // Re-fetch accounts after sync
            await get().init();
            set({ initialized: false });
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
          id,
          clientId,
          metaAccountId,
          accountName,
          billingType: "unknown",
          balance: null,
          currentMonthSpend: null,
          lastSyncAt: null,
        };
        set((s) => ({ adAccounts: [...s.adAccounts, account] }), false, "traffic/account/add");
        return account;
      },
    })),
    { name: "TrafficStore" }
  )
);
