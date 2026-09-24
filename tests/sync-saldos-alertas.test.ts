// tests/sync-saldos-alertas.test.ts — o sync de 2 em 2h não pode virar 7 avisos por dia da mesma
// conta. O anti-spam (uma vez por conta+severidade+dia) é o que sustenta a frequência nova.

import { describe, it, expect, vi, beforeEach } from "vitest";

const jaAvisados = new Set<string>();
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({
        eq: (_c: string, key: string) => ({
          limit: () => Promise.resolve({ data: jaAvisados.has(key) ? [{ id: 1 }] : [], error: null }),
        }),
      }),
    }),
  },
}));
vi.mock("@/lib/whatsapp/evolution", () => ({ sendGroupText: async () => ({ ok: true }) }));

import { alertasPendentes, type AlertSettings } from "@/lib/traffic/sync-core";
import type { DigestAccount } from "@/lib/budgets/alert-engine";

const settings: AlertSettings = { enabled: true, groupJid: "g@g.us", warningPct: 30, criticalPct: 10, mode: "digest" };
const agora = "2026-09-23T15:00:00.000Z"; // 12h BRT
const conta = (id: string, severity: DigestAccount["alert"]["severity"]): DigestAccount => ({
  clientName: `Cliente ${id}`, metaAccountId: id, isPrepaid: true, available: 50, daysRemaining: 1,
  avgDailySpend: 50, currency: "BRL", alert: { severity, reason: "saldo baixo", pctRemaining: 5 },
  adAccountId: `uuid-${id}`,
});

beforeEach(() => jaAvisados.clear());

describe("alertasPendentes", () => {
  it("só crítico e atenção viram aviso", async () => {
    const r = await alertasPendentes([conta("1", "critical"), conta("2", "warning"), conta("3", "ok"), conta("4", "error")], settings, agora);
    expect(r.map((a) => a.snap.metaAccountId)).toEqual(["1", "2"]);
  });

  it("conta já avisada hoje nessa severidade não sai de novo", async () => {
    jaAvisados.add("1|critical|2026-09-23");
    const r = await alertasPendentes([conta("1", "critical"), conta("2", "critical")], settings, agora);
    expect(r.map((a) => a.snap.metaAccountId)).toEqual(["2"]);
  });

  it("piorar de atenção pra crítico no mesmo dia avisa de novo (severidade nova)", async () => {
    jaAvisados.add("1|warning|2026-09-23");
    const r = await alertasPendentes([conta("1", "critical")], settings, agora);
    expect(r).toHaveLength(1);
  });

  it("a mesma conta em dois cadastros avisa uma vez só", async () => {
    const r = await alertasPendentes([conta("1", "critical"), conta("1", "critical")], settings, agora);
    expect(r).toHaveLength(1);
  });

  it("alerta desligado ou sem grupo = nenhum aviso", async () => {
    expect(await alertasPendentes([conta("1", "critical")], { ...settings, enabled: false }, agora)).toEqual([]);
    expect(await alertasPendentes([conta("1", "critical")], { ...settings, groupJid: null }, agora)).toEqual([]);
  });
});
