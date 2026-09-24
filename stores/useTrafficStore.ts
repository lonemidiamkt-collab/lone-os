import { create } from "zustand";
import { devtools, subscribeWithSelector } from "zustand/middleware";
import { authedFetch } from "@/lib/supabase/authed-fetch";
import { chamar } from "@/lib/api/chamar";
import type { TrafficRoutineCheck } from "@/lib/types";

// Leva 4: o store do tráfego guarda só a rotina (checks de suporte/relatório/feedback). Saíram:
//  - investmentData (verba no localStorage da aba Investimento) → Tráfego › Contas & Verba, no servidor;
//  - trafficReports (Relatórios Mensais manuais, removidos na Leva 1) → o mensal é automático;
//  - adAccounts/syncBalances: ninguém lia, e o init chamava /api/traffic/ad-accounts — que vai à Meta
//    listar contas — a cada tela aberta; com o token vencido, virava "Não consegui carregar".

interface TrafficState {
  trafficRoutineChecks: TrafficRoutineCheck[];
  /** Falha ao carregar a rotina. Com erro, `initialized` fica false e o próximo init tenta de novo. */
  loadError: string | null;
  initialized: boolean;

  init: () => Promise<void>;
  addTrafficRoutineCheck: (check: Omit<TrafficRoutineCheck, "id" | "completedAt">) => Promise<void>;
}

export const selectTrafficRoutineChecks = (s: TrafficState) => s.trafficRoutineChecks;

export const useTrafficStore = create<TrafficState>()(
  devtools(
    subscribeWithSelector((set, get) => ({
      trafficRoutineChecks: [],
      loadError: null,
      initialized: false,

      init: async () => {
        if (get().initialized) return;
        const trafegoRes = await chamar<{ trafficRoutineChecks?: TrafficRoutineCheck[] }>("/api/data/traffic");
        // Resposta ruim NÃO vira lista vazia com cara de verdade: guarda o que veio e marca o erro.
        const patch: Partial<TrafficState> = {};
        if (trafegoRes.ok) patch.trafficRoutineChecks = trafegoRes.data?.trafficRoutineChecks ?? [];
        const erro = trafegoRes.ok ? null : trafegoRes.erro;
        set({ ...patch, loadError: erro, initialized: erro === null }, false, erro ? "traffic/init/error" : "traffic/init/done");
      },

      addTrafficRoutineCheck: async (check) => {
        const tempId = `temp-trc-${Date.now()}`;
        const optimistic: TrafficRoutineCheck = { ...check, id: tempId, completedAt: new Date().toISOString() } as TrafficRoutineCheck;
        set((s) => ({ trafficRoutineChecks: [optimistic, ...s.trafficRoutineChecks] }), false, "traffic/routineCheck/add/optimistic");
        try {
          const res = await authedFetch("/api/data/traffic/mutations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "insertTrafficCheck", check }),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const { trafficRoutineChecks } = await res.json();
          set({ trafficRoutineChecks }, false, "traffic/routineCheck/add/confirmed");
        } catch {
          set((s) => ({ trafficRoutineChecks: s.trafficRoutineChecks.filter((c) => c.id !== tempId) }), false, "traffic/routineCheck/add/rollback");
        }
      },
    })),
    { name: "TrafficStore" }
  )
);
