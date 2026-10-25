// @vitest-environment node
// tests/aviso-saldo-reserva.test.ts — 25/10/2026, auditoria 9.8. Dados INVENTADOS.
//
// O QUE ACONTECIA: o alerta de saldo conferia o log, ENVIAVA e só depois gravava (sem checar o insert). Cron das
// 2h + "Sincronizar" liam "ainda não avisado" juntos e o grupo recebia em dobro; insert que falhava fazia o aviso
// repetir a cada 2 h. Agora a linha do log é gravada ANTES (reserva) e o índice único segura a segunda rodada.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

type Linha = Record<string, unknown>;
let log: Linha[] = [];
let falharLeitura = false;
let falharInsert = false;

vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: {
    from: () => {
      let filtro: [string, unknown] | null = null;
      let op: "select" | "delete" = "select";
      const q = {
        select: () => q,
        delete: () => { op = "delete"; return q; },
        eq: (c: string, v: unknown) => {
          filtro = [c, v];
          if (op === "delete") { log = log.filter((r) => r[c] !== v); return Promise.resolve({ error: null }); }
          return q;
        },
        limit: () => Promise.resolve(falharLeitura
          ? { data: null, error: { message: "timeout" } }
          : { data: log.filter((r) => r[filtro![0]] === filtro![1]), error: null }),
        insert: (l: Linha) => {
          if (falharInsert) return Promise.resolve({ error: { code: "XX000", message: "falha simulada" } });
          // índice único da migration 20261025130000
          if (log.some((r) => r.cycle_key === l.cycle_key)) return Promise.resolve({ error: { code: "23505", message: "duplicate key" } });
          log.push(l);
          return Promise.resolve({ error: null });
        },
      };
      return q;
    },
  },
}));

let envio: { ok: boolean; error?: string; incerto?: boolean } = { ok: true };
const enviados: string[] = [];
vi.mock("@/lib/whatsapp/evolution", () => ({ sendGroupText: async (_g: string, t: string) => { enviados.push(t); return envio; } }));
vi.mock("@/lib/api/cron-guard", () => ({ requireCron: () => null }));
vi.mock("@/lib/traffic/sync-core", () => ({
  getAlertSettings: async () => ({ enabled: true, groupJid: "trafego@g.us", warningPct: 18, criticalPct: 10, mode: "digest" }),
  runBalanceSync: async () => ({
    accounts: [{ clientName: "Loja Alfa", metaAccountId: "act_1", adAccountId: "uuid-1", available: 0, opAlerts: [{ type: "verba_zerada", severity: "critical", reason: "Saldo zerado" }] }],
  }),
}));

const { reservarAviso } = await import("@/lib/traffic/aviso-reserva");
const { POST } = await import("@/app/api/system/urgent-alerts/route");
const rodar = async () => (await POST(new NextRequest("http://x/api/system/urgent-alerts", { method: "POST" }))).json();
const linha = (k: string) => ({ ad_account_id: "uuid-1", cycle_key: k, balance_at_trigger: 0, channel: "whatsapp_group", sent_at: "2026-10-25T12:00:00Z" });

beforeEach(() => { log = []; falharLeitura = false; falharInsert = false; envio = { ok: true }; enviados.length = 0; });

describe("reserva do aviso", () => {
  it("a segunda rodada esbarra na reserva da primeira", async () => {
    expect(await reservarAviso(linha("act_1|critical|2026-10-25"))).toBe("reservado");
    expect(await reservarAviso(linha("act_1|critical|2026-10-25"))).toBe("ja-avisado");
  });
  it("não conseguir ler ou gravar é 'erro' — quem chama não envia", async () => {
    falharLeitura = true;
    expect(await reservarAviso(linha("k1"))).toBe("erro");
    falharLeitura = false; falharInsert = true;
    expect(await reservarAviso(linha("k2"))).toBe("erro");
  });
});

describe("alertas urgentes (terça/quinta)", () => {
  it("o erro original: duas rodadas no mesmo dia mandavam duas vezes — agora a segunda pula", async () => {
    expect((await rodar())).toMatchObject({ ok: true, sent: 1 });
    expect((await rodar())).toMatchObject({ ok: true, sent: 0, skipped: 1 });
    expect(enviados).toHaveLength(1);
  });

  it("envio que falhou com certeza devolve a reserva: a próxima rodada avisa", async () => {
    envio = { ok: false, error: "HTTP 400" };
    expect(await rodar()).toMatchObject({ ok: false, failed: 1 });
    expect(log).toHaveLength(0);
    envio = { ok: true };
    expect(await rodar()).toMatchObject({ ok: true, sent: 1 });
  });

  it("envio incerto mantém a reserva (pode ter saído) e a rotina não diz ok", async () => {
    envio = { ok: false, error: "o WhatsApp não respondeu em 10 s — pode ter saído", incerto: true };
    expect(await rodar()).toMatchObject({ ok: false, incertos: 1 });
    expect(log).toHaveLength(1);
    envio = { ok: true };
    expect(await rodar()).toMatchObject({ sent: 0, skipped: 1 });
  });

  it("sem conseguir registrar, não envia (senão repetiria a cada rodada)", async () => {
    falharInsert = true;
    const r = await rodar();
    expect(r.ok).toBe(false);
    expect(enviados).toHaveLength(0);
  });
});
