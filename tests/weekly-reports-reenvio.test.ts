// @vitest-environment node
// tests/weekly-reports-reenvio.test.ts — "rodar de novo pra quem ficou de fora" funciona de verdade
// (auditoria 21/10/2026, itens 5.3 e 5.2 no relatório).
//
// O erro original, em três partes:
//   1. a linha "sent" GLOBAL do dia fazia a segunda rodada sair "skipped" com ok:true — o aviso
//      interno mandava rodar de novo e ninguém recebia;
//   2. com force=1 o dedup por cliente também caía e TODOS recebiam de novo;
//   3. o registro por cliente engolia o erro: sem ele, a rodada seguinte mandava em dobro sem aviso.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ligarRelogioFalso, esperarComRelogioFalso } from "./fixtures/relogio-falso";

type Linha = { week_key: string; status: string; error?: string | null; message?: string };
const log: Linha[] = [];
let insertFalha = false;

vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: {
    from: () => {
      const filtros: ((r: Record<string, unknown>) => boolean)[] = [];
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.limit = () => q;
      q.eq = (c: string, v: unknown) => { filtros.push((r) => r[c] === v); return q; };
      q.in = (c: string, vs: unknown[]) => { filtros.push((r) => vs.includes(r[c])); return q; };
      q.insert = (row: Linha | Linha[]) => {
        if (insertFalha) return Promise.resolve({ error: { message: "sem conexão com o banco" } });
        log.push(...[row].flat());
        return Promise.resolve({ error: null });
      };
      q.then = (ok: (v: unknown) => unknown, erro: (e: unknown) => unknown) =>
        Promise.resolve({ data: log.filter((r) => filtros.every((f) => f(r as never))), error: null }).then(ok, erro);
      return q;
    },
  },
}));

const clientes = [
  { id: "a", name: "Armazém do Ferro", nome_fantasia: null, service_type: "assessoria_trafego", meta_ad_account_id: "act_1", whatsapp_group_jid: "a@g.us" },
  { id: "b", name: "Bazar Ribeiro", nome_fantasia: null, service_type: "assessoria_trafego", meta_ad_account_id: "act_2", whatsapp_group_jid: "b@g.us" },
];
const sendMediaDocument = vi.fn();
const csSendGroupText = vi.fn(async () => ({ ok: true }));

vi.mock("@/lib/api/cron-guard", () => ({ requireCron: () => null }));
vi.mock("@/lib/email/emailService", () => ({ sendEmail: async () => ({}) }));
vi.mock("@/lib/traffic/renderPdf", () => ({ htmlToPdf: async () => ({ ok: true, buffer: Buffer.from("") }) }));
vi.mock("@/lib/traffic/sync-core", () => ({
  getMetaToken: async () => "tok",
  getAlertSettings: async () => ({ enabled: true, groupJid: "interno@g.us" }),
}));
vi.mock("@/lib/traffic/weekly-report", () => ({
  selectActiveMetaClients: async (id?: string | null) => (id ? clientes.filter((c) => c.id === id) : clientes),
  buildClientPdf: async () => ({ ok: true, buffer: Buffer.from("pdf") }),
  periodLabelDays: () => "01/09 – 30/09",
  slug: (s: string) => s,
  clientDisplayName: (c: { nome_fantasia: string | null; name: string }) => c.nome_fantasia || c.name,
  montarHtmlRelatorioCliente: async () => ({ ok: false }),
  selectReportClient: async () => null,
}));
vi.mock("@/lib/whatsapp/evolution", () => ({ sendMediaDocument: (...a: unknown[]) => sendMediaDocument(...a) }));
vi.mock("@/lib/cs/notify", () => ({ csSendGroupText: (...a: unknown[]) => csSendGroupText(...(a as [])) }));
vi.mock("@/lib/system/trava-rodada", () => ({
  reservarRodada: async () => ({ conseguiu: true }),
  fecharRodada: async () => {},
}));

import { NextRequest } from "next/server";
import { POST } from "@/app/api/system/weekly-reports/route";

// A pausa de 2 s entre clientes passa no relógio falso; a folga é só pra máquina carregada.
vi.setConfig({ testTimeout: 30_000 });

const rodar = async (qs = "") => {
  const res = await esperarComRelogioFalso(
    POST(new NextRequest(`http://localhost/api/system/weekly-reports?period=month${qs}`, { method: "POST" })));
  return res.json() as Promise<Record<string, unknown>>;
};
const destinos = () => sendMediaDocument.mock.calls.map((c) => c[0]);

beforeEach(() => {
  log.length = 0;
  insertFalha = false;
  sendMediaDocument.mockReset();
  csSendGroupText.mockClear();
  process.env.CS_INTERNAL_GROUP_JID = "interno@g.us";
  ligarRelogioFalso();
});
afterEach(() => { vi.useRealTimers(); });

describe("rodar de novo manda só pra quem ficou de fora", () => {
  it("a segunda rodada entrega a quem falhou (antes: 'skipped' e ninguém recebia)", async () => {
    sendMediaDocument
      .mockResolvedValueOnce({ ok: true })                          // Armazém recebe
      .mockResolvedValueOnce({ ok: false, error: "HTTP 400" });     // Bazar falha (certo que não saiu)
    const r1 = await rodar();
    expect(r1).toMatchObject({ sent: 1, failed: 1 });

    sendMediaDocument.mockReset().mockResolvedValue({ ok: true });
    const r2 = await rodar();
    expect(destinos()).toEqual(["b@g.us"]);                         // só o Bazar
    expect(r2).toMatchObject({ status: "sent", sent: 1, jaTinham: 1 });
  });

  it("rodada que só acha quem já recebeu não é falha nem manda e-mail de '0 enviados'", async () => {
    sendMediaDocument.mockResolvedValue({ ok: true });
    await rodar();
    sendMediaDocument.mockReset();
    const r = await rodar();
    expect(sendMediaDocument).not.toHaveBeenCalled();
    expect(r).toMatchObject({ ok: true, status: "skipped", jaTinham: 2 });
  });
});

describe("force e clientId", () => {
  it("force=1 NÃO reenvia a quem já recebeu (antes: todos de novo)", async () => {
    sendMediaDocument.mockResolvedValue({ ok: true });
    await rodar();
    sendMediaDocument.mockReset();
    const r = await rodar("&force=1");
    expect(sendMediaDocument).not.toHaveBeenCalled();
    expect(String(r.aviso)).toContain("clientId");
  });

  it("clientId explícito reenvia a UM cliente — é o reenvio de propósito", async () => {
    sendMediaDocument.mockResolvedValue({ ok: true });
    await rodar();
    sendMediaDocument.mockReset().mockResolvedValue({ ok: true });
    await rodar("&clientId=a");
    expect(destinos()).toEqual(["a@g.us"]);
  });
});

describe("envio incerto e registro que falha", () => {
  it("incerto não é reenviado na rodada seguinte e o time é avisado pra conferir", async () => {
    sendMediaDocument
      .mockResolvedValueOnce({ ok: false, incerto: true, error: "o WhatsApp não respondeu em 60 s — pode ter saído" })
      .mockResolvedValueOnce({ ok: true });
    const r1 = await rodar();
    expect((r1.incertos as unknown[]).length).toBe(1);
    const avisos = csSendGroupText.mock.calls.map((c) => String((c as unknown[])[1]));
    expect(avisos.some((t) => t.includes("Não sei se o relatório") && t.includes("Armazém do Ferro"))).toBe(true);

    sendMediaDocument.mockReset().mockResolvedValue({ ok: true });
    await rodar();
    expect(sendMediaDocument).not.toHaveBeenCalled();               // nem o incerto, nem quem recebeu
  });

  it("relatório que saiu sem registro aparece — a próxima rodada mandaria em dobro", async () => {
    insertFalha = true;
    sendMediaDocument.mockResolvedValue({ ok: true });
    const r = await rodar();
    expect(r.semRegistro).toEqual(["Armazém do Ferro", "Bazar Ribeiro"]);
    const avisos = csSendGroupText.mock.calls.map((c) => String((c as unknown[])[1]));
    expect(avisos.some((t) => t.includes("não consegui registrar"))).toBe(true);
  });
});
