// tests/cs-nps-envio-incerto.test.ts — pergunta do NPS que PODE ter chegado não é feita de novo
// (auditoria 21/10/2026, item 5.2).
//
// O erro original: timeout no envio apagava a linha da pesquisa, e a rodada da hora seguinte (o cron
// roda de hora em hora) perguntava a nota de novo no mesmo grupo — quando a primeira já tinha chegado.

import { describe, it, expect, vi, beforeEach } from "vitest";

const apagadas: unknown[] = [];
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: {
    from: () => {
      const q: Record<string, unknown> = {};
      q.insert = () => q;
      q.select = () => q;
      q.maybeSingle = () => Promise.resolve({ data: { id: "linha-1" }, error: null });
      q.delete = () => ({ eq: (_c: string, v: unknown) => { apagadas.push(v); return Promise.resolve({ error: null }); } });
      q.update = () => ({ eq: () => Promise.resolve({ error: null }) });
      return q;
    },
  },
}));
const csSendGroupText = vi.fn();
vi.mock("@/lib/cs/notify", () => ({ csSendGroupText: (...a: unknown[]) => csSendGroupText(...a) }));

import { enviarPerguntas } from "@/lib/cs/nps-server";

const envio = {
  meetingId: "m1", clientId: "c1", cliente: "Body Skin", groupJid: "g@g.us",
  realizadaEm: "2026-10-20T15:00:00Z", texto: "De 0 a 10, quanto você indicaria a Lone?",
};

beforeEach(() => { apagadas.length = 0; csSendGroupText.mockReset(); });

describe("enviarPerguntas — desfecho do envio", () => {
  it("timeout: a linha FICA (a hora seguinte não pergunta de novo) e volta como incerto", async () => {
    csSendGroupText.mockResolvedValue({ ok: false, incerto: true, error: "o WhatsApp não respondeu em 10 s — pode ter saído" });
    const [r] = await enviarPerguntas([envio]);
    expect(apagadas).toHaveLength(0);
    expect(r).toMatchObject({ ok: false, incerto: true, cliente: "Body Skin" });
  });

  it("falha CERTA continua apagando a linha — aí perguntar de novo é o certo", async () => {
    csSendGroupText.mockResolvedValue({ ok: false, error: "HTTP 400" });
    const [r] = await enviarPerguntas([envio]);
    expect(apagadas).toEqual(["linha-1"]);
    expect(r.ok).toBe(false);
    expect(r.incerto).toBeUndefined();
  });

  it("enviada: segue normal", async () => {
    csSendGroupText.mockResolvedValue({ ok: true, id: "msg-1" });
    const [r] = await enviarPerguntas([envio]);
    expect(r.ok).toBe(true);
    expect(apagadas).toHaveLength(0);
  });
});
