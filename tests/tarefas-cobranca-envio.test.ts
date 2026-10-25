// @vitest-environment node
// Cobrança de tarefas (9h/10h): só marca como cobrada a tarefa de quem RECEBEU (auditoria 13.2, 25/10/2026).
// Dados INVENTADOS.
//
// O QUE ACONTECIA: `last_reminded_at` era gravado em TODAS as tarefas da rodada, inclusive nas da pessoa cujo PDF e
// texto não saíram; a rodada das 10h via a marca e não tentava de novo. Sem grupo configurado, nada saía e a rotina
// respondia ok:true.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { idsCobrados } from "@/lib/tarefas/cobranca";

type Linha = Record<string, unknown>;
let tarefas: Linha[] = [];
const marcadas: string[] = [];
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: {
    from: () => {
      const q: Record<string, unknown> = {};
      let ids: string[] | null = null;
      for (const m of ["select", "neq", "not", "eq", "order"]) q[m] = () => q;
      q.update = () => q;
      q.in = (_c: string, v: string[]) => { ids = v; return q; };
      q.then = (ok: (v: unknown) => unknown) => {
        if (ids) { marcadas.push(...ids); return Promise.resolve({ data: null, error: null }).then(ok); }
        return Promise.resolve({ data: tarefas, error: null }).then(ok);
      };
      return q;
    },
  },
}));
vi.mock("@/lib/api/cron-guard", () => ({ requireCron: () => null }));
vi.mock("@/lib/cs/setup-fechar-server", () => ({ fecharSetupResolvido: async () => ({ fechadas: [] }) }));
vi.mock("@/lib/cs/dono-tarefa", () => ({
  resolverDonos: async (ts: { id: string; assigned_to: string | null }[]) => new Map(ts.map((t) => [t.id, t.assigned_to])),
}));
vi.mock("@/lib/reports/tarefasPdf", () => ({
  tarefasPdfHtml: () => "<html/>", tarefasPessoaPdfHtml: () => "<html/>",
  legendaPessoa: (b: { pessoa: string }) => `Tarefas de ${b.pessoa}`,
}));
vi.mock("@/lib/cs/mencao", () => ({ mencionar: async () => ({ trecho: "", jids: [], notifica: false }) }));
vi.mock("@/lib/traffic/renderPdf", () => ({ htmlToPdf: async () => ({ ok: true, buffer: Buffer.from("pdf") }) }));
vi.mock("@/lib/cs/roteiro-pdf", () => ({ loadLoneLogo: async () => "" }));
/** Quem não recebe: PDF e texto falham para essas pessoas. */
const recusam = new Set<string>();
vi.mock("@/lib/cs/notify", () => ({
  csSendGroupDocument: async (_d: string, _b: string, arquivo: string) =>
    [...recusam].some((p) => arquivo.startsWith(p)) ? { ok: false, error: "Evolution recusou" } : { ok: true },
  csSendGroupText: async (_d: string, texto: string) =>
    [...recusam].some((p) => texto.includes(p)) ? { ok: false, error: "Evolution recusou" } : { ok: true },
}));

const rota = await import("@/app/api/system/task-reminders/route");
const chamar = () => rota.POST(new NextRequest("http://x/api/system/task-reminders", { method: "POST" }));

beforeEach(() => {
  // 26/10/2026 09h30 em SP: atrasadas e as que vencem hoje entram na rodada das 9h.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-26T12:30:00Z"));
  vi.spyOn(globalThis, "setTimeout").mockImplementation(((fn: () => void) => { fn(); return 0; }) as unknown as typeof setTimeout);
  marcadas.length = 0;
  recusam.clear();
  process.env.CS_TEAM_GROUP_JID = "equipe@g.us";
  tarefas = [
    { id: "t1", title: "Arte do feed", assigned_to: "Bruna", client_id: null, client_name: "Cliente Exemplo", due_date: "2026-10-20", priority: "high", status: "pending", last_reminded_at: null },
    { id: "t2", title: "Relatório", assigned_to: "Carlos", client_id: null, client_name: null, due_date: "2026-10-26", priority: "medium", status: "pending", last_reminded_at: null },
  ];
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("idsCobrados", () => {
  it("só as tarefas de quem recebeu", () => {
    expect(idsCobrados([{ id: "a", pessoa: "Bruna" }, { id: "b", pessoa: "Carlos" }], new Set(["Bruna"]))).toEqual(["a"]);
  });
});

describe("task-reminders", () => {
  it("tudo saiu: marca as duas e responde ok", async () => {
    const r = await (await chamar()).json();
    expect(r.ok).toBe(true);
    expect(marcadas.sort()).toEqual(["t1", "t2"]);
  });

  it("o erro original: o envio do Carlos falhou e a tarefa dele era marcada mesmo assim — agora fica sem marca e ok:false", async () => {
    recusam.add("Carlos");
    const r = await (await chamar()).json();
    expect(marcadas).toEqual(["t1"]);
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/Carlos/);
  });

  it("sem grupo configurado: ok:false com o motivo, e nada é marcado", async () => {
    delete process.env.CS_TEAM_GROUP_JID;
    delete process.env.CS_INTERNAL_GROUP_JID;
    const r = await (await chamar()).json();
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/não configurado/);
    expect(marcadas).toEqual([]);
  });
});
