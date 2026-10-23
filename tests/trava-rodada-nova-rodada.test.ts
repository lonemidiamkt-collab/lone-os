// tests/trava-rodada-nova-rodada.test.ts — rodar de novo depois de terminar, nunca duas ao mesmo tempo
// (auditoria 21/10/2026, itens 5.3 e 5.6).
//
// O relatório e o broadcast precisam poder rodar de novo no mesmo dia pra completar quem ficou de fora
// (o dedup por cliente impede a repetição). O que a trava tem que impedir é DUAS rodadas juntas.

import { describe, it, expect, vi, beforeEach } from "vitest";

type Run = { routine: string; date_key: string; started_at: string; finished_at: string | null };
const runs: Run[] = [];

vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: {
    from: () => ({
      insert: (row: { routine: string; date_key: string }) => {
        if (runs.some((r) => r.routine === row.routine && r.date_key === row.date_key)) {
          return Promise.resolve({ error: { code: "23505", message: "duplicate key" } });
        }
        runs.push({ ...row, started_at: new Date().toISOString(), finished_at: null });
        return Promise.resolve({ error: null });
      },
      select: () => {
        const f: Record<string, unknown> = {};
        const q = {
          eq: (c: string, v: unknown) => { f[c] = v; return q; },
          maybeSingle: () => Promise.resolve({
            data: runs.find((r) => r.routine === f.routine && r.date_key === f.date_key) ?? null, error: null,
          }),
        };
        return q;
      },
      update: (patch: Partial<Run>) => {
        const f: Record<string, unknown> = {};
        let soTerminada = false;
        const aplicar = () => {
          const alvo = runs.filter((r) => r.routine === f.routine && r.date_key === f.date_key && (!soTerminada || r.finished_at));
          for (const r of alvo) Object.assign(r, patch);
          return alvo;
        };
        const q = {
          eq: (c: string, v: unknown) => { f[c] = v; return q; },
          not: () => { soTerminada = true; return q; },
          select: () => Promise.resolve({ data: aplicar().map((r) => ({ routine: r.routine })), error: null }),
          then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: aplicar(), error: null }).then(ok),
        };
        return q;
      },
    }),
  },
}));

import { reservarRodada, fecharRodada } from "@/lib/system/trava-rodada";

beforeEach(() => { runs.length = 0; });

describe("reservarRodada com permitirNovaRodada", () => {
  it("rodada terminada pode rodar de novo (o 'rodar de novo pra quem ficou de fora')", async () => {
    expect((await reservarRodada("weekly-reports-mensal", "2026-10-01", { permitirNovaRodada: true })).conseguiu).toBe(true);
    await fecharRodada("weekly-reports-mensal", "2026-10-01", true);
    expect((await reservarRodada("weekly-reports-mensal", "2026-10-01", { permitirNovaRodada: true })).conseguiu).toBe(true);
  });

  it("mas não duas ao mesmo tempo: a segunda chamada esbarra na primeira", async () => {
    await reservarRodada("broadcast:fim-de-mes", "2026-10-21", { permitirNovaRodada: true });
    await fecharRodada("broadcast:fim-de-mes", "2026-10-21", true);
    const [a, b] = await Promise.all([
      reservarRodada("broadcast:fim-de-mes", "2026-10-21", { permitirNovaRodada: true }),
      reservarRodada("broadcast:fim-de-mes", "2026-10-21", { permitirNovaRodada: true }),
    ]);
    expect([a.conseguiu, b.conseguiu].filter(Boolean)).toHaveLength(1);
  });

  it("enquanto a primeira roda, a segunda não entra", async () => {
    await reservarRodada("weekly-reports-mensal", "2026-10-01", { permitirNovaRodada: true });
    const r = await reservarRodada("weekly-reports-mensal", "2026-10-01", { permitirNovaRodada: true });
    expect(r.conseguiu).toBe(false);
    expect(r.motivo).toContain("ainda está rodando");
  });

  it("sem a opção, continua 'uma por dia' (client-messages, conferência de postagem)", async () => {
    await reservarRodada("client-messages:wed", "2026-10-21");
    await fecharRodada("client-messages:wed", "2026-10-21", true);
    const r = await reservarRodada("client-messages:wed", "2026-10-21");
    expect(r).toMatchObject({ conseguiu: false, motivo: "já rodou hoje" });
  });
});
