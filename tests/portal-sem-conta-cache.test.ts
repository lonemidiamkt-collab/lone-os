// @vitest-environment node
// tests/portal-sem-conta-cache.test.ts — 04/11/2026, JJ e Casa das Telhas: o painel aberto ANTES de a conta
// de anúncio ser ligada ficava guardado como "sem conta" e valia até 24h. O cliente via R$ 0 com campanha
// rodando. Agora "sem conta" guardado só vale enquanto não há conta, e ligar a conta esquece o cache.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { bancoEmMemoria } from "./helpers/banco-em-memoria";

const banco = bancoEmMemoria();
const estado = vi.hoisted(() => ({ conta: null as string | null, construidos: 0 }));
vi.mock("next/server", () => ({ after: (f: () => unknown) => { void f(); } }));
vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: banco.supabaseAdmin }));
vi.mock("@/lib/portal/conta", () => ({ contaDoCliente: async () => ({ conta: estado.conta, indefinida: null }) }));
vi.mock("@/lib/portal/buildSnapshot", () => ({
  buildSnapshot: async () => { estado.construidos++; return snap("ok", 17.21); },
}));

const { obterSnapshot, esquecerSnapshots } = await import("@/lib/portal/snapshotCache");

const periodo = { kind: "last_week", start: "2026-10-28", end: "2026-11-03", previous_start: "2026-10-21", previous_end: "2026-10-27" };
function snap(ads_status: string, gasto: number) {
  return { ads_status, period: periodo, active_ads: { items: [], total: 0, with_messages: 0 },
    kpis: { spend: { value: gasto } } } as never;
}
const agora = new Date("2026-11-05T00:30:00Z");

beforeEach(() => {
  banco.limpar();
  estado.conta = null; estado.construidos = 0;
  // Guardado às 00:01 (fresco: menos de 6h) como "sem conta".
  banco.db.client_report_snapshots = [{ client_id: "c1", period_kind: "last_week", period_start: "2026-10-28",
    data: snap("sem_conta", 0), generated_at: "2026-11-05T00:01:00Z" }];
});

describe("painel guardado como 'sem conta'", () => {
  it("cliente continua sem conta: entrega o guardado, sem ir à Meta", async () => {
    const d = await obterSnapshot("c1", "last_week", agora) as unknown as { ads_status: string };
    expect(d.ads_status).toBe("sem_conta");
    expect(estado.construidos).toBe(0);
  });
  it("conta ligada depois: busca agora, mesmo com o guardado 'fresco'", async () => {
    estado.conta = "act_242255811967023";
    const d = await obterSnapshot("c1", "last_week", agora) as unknown as { ads_status: string; kpis: { spend: { value: number } } };
    expect(estado.construidos).toBe(1);
    expect(d.ads_status).toBe("ok");
    expect(d.kpis.spend.value).toBe(17.21);
  });
});

describe("esquecerSnapshots (ligar, trocar ou desligar a conta)", () => {
  it("apaga todos os períodos do cliente e só dele", async () => {
    banco.db.client_report_snapshots.push(
      { client_id: "c1", period_kind: "this_month", period_start: "2026-11-01", data: {}, generated_at: "2026-11-04T09:45:00Z" },
      { client_id: "outro", period_kind: "last_week", period_start: "2026-10-28", data: {}, generated_at: "2026-11-04T09:45:00Z" },
    );
    expect(await esquecerSnapshots("c1")).toBeNull();
    expect(banco.db.client_report_snapshots.map((r) => r.client_id)).toEqual(["outro"]);
  });
});
