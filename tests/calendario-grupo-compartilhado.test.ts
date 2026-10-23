// @vitest-environment node
// tests/calendario-grupo-compartilhado.test.ts — um calendário por GRUPO (auditoria 21/10/2026, 5.8).
//
// O erro original: o dedup era por cliente. Bazar Ribeiro Maricá e Saquarema dividem o mesmo grupo
// (Veneza também) e o grupo recebia o PDF do mês duas vezes, cada um com um nome na legenda.
// Junto, o 5.2: o PDF que estourava o tempo no agente ia de novo pelo número do gestor.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ligarRelogioFalso, esperarComRelogioFalso } from "./fixtures/relogio-falso";

type Linha = { client_id: string; date_key: string; kind: string; status: string; error?: string | null };
const log: Linha[] = [];

vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: {
    from: (t: string) => {
      const filtros: ((r: Record<string, unknown>) => boolean)[] = [];
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.eq = (c: string, v: unknown) => { filtros.push((r) => r[c] === v); return q; };
      q.in = (c: string, vs: unknown[]) => { filtros.push((r) => vs.includes(r[c])); return q; };
      // agency_settings: rotina ligada, legenda padrão.
      q.maybeSingle = () => Promise.resolve({
        data: t === "agency_settings" && filtros.some((f) => f({ key: "traffic_monthly_calendar_enabled" })) ? { value: "true" } : null,
        error: null,
      });
      q.insert = (row: Linha | Linha[]) => { log.push(...[row].flat()); return Promise.resolve({ error: null }); };
      q.then = (ok: (v: unknown) => unknown, erro: (e: unknown) => unknown) =>
        Promise.resolve({ data: log.filter((r) => filtros.every((f) => f(r as never))), error: null }).then(ok, erro);
      return q;
    },
  },
}));

const CLIENTES = [
  { id: "maric", name: "Bazar Ribeiro Maricá", nome_fantasia: null, service_type: "lone_growth", meta_ad_account_id: null, whatsapp_group_jid: "bazar@g.us" },
  { id: "saqua", name: "Bazar Ribeiro Saquarema", nome_fantasia: null, service_type: "lone_growth", meta_ad_account_id: null, whatsapp_group_jid: "bazar@g.us" },
  { id: "armaz", name: "Armazém do Ferro", nome_fantasia: null, service_type: "assessoria_social", meta_ad_account_id: null, whatsapp_group_jid: "armazem@g.us" },
];
const csSendGroupDocument = vi.fn();
const sendMediaDocument = vi.fn();

vi.mock("@/lib/api/cron-guard", () => ({ requireCron: () => null }));
vi.mock("@/lib/email/emailService", () => ({ sendEmail: async () => ({}) }));
vi.mock("@/lib/traffic/weekly-report", () => ({
  selectActiveClientsWithGroup: async () => CLIENTES,
  clientDisplayName: (c: { nome_fantasia: string | null; name: string }) => c.nome_fantasia || c.name,
}));
vi.mock("@/lib/holidays/client-calendar-html", () => ({ buildClientCalendarHtml: async () => "<html></html>" }));
vi.mock("@/lib/holidays/pdf-server", () => ({ holidaysPdfFilename: () => "calendario-novembro.pdf" }));
vi.mock("@/lib/traffic/renderPdf", () => ({ htmlToPdf: async () => ({ ok: true, buffer: Buffer.from("pdf") }) }));
vi.mock("@/lib/whatsapp/evolution", () => ({ sendMediaDocument: (...a: unknown[]) => sendMediaDocument(...a) }));
vi.mock("@/lib/cs/notify", () => ({ csSendGroupDocument: (...a: unknown[]) => csSendGroupDocument(...a) }));
vi.mock("@/lib/cs/entregas", () => ({ conferirEAvisar: async () => null }));

import { NextRequest } from "next/server";
import { POST } from "@/app/api/system/monthly-calendar/route";

// A pausa de 2,5 s entre grupos passa no relógio falso; a folga é só pra máquina carregada.
vi.setConfig({ testTimeout: 30_000 });

const rodar = async () => {
  const res = await esperarComRelogioFalso(POST(new NextRequest("http://localhost/api/system/monthly-calendar", { method: "POST" })));
  return res.json() as Promise<Record<string, unknown>>;
};

beforeEach(() => {
  log.length = 0;
  csSendGroupDocument.mockReset().mockResolvedValue({ ok: true });
  sendMediaDocument.mockReset().mockResolvedValue({ ok: true });
  // 20/10/2026 é terça: dia efetivo do envio de outubro.
  ligarRelogioFalso();
  vi.setSystemTime(new Date("2026-10-20T12:00:00Z"));
});
afterEach(() => { vi.useRealTimers(); });

describe("calendário do mês em grupo compartilhado", () => {
  it("um envio por grupo, citando as lojas juntas (antes: 2 PDFs no grupo do Bazar)", async () => {
    const r = await rodar();
    expect(csSendGroupDocument.mock.calls.map((c) => c[0])).toEqual(["bazar@g.us", "armazem@g.us"]);
    const legendaBazar = String(csSendGroupDocument.mock.calls[0][3]);
    expect(legendaBazar).toContain("Bazar Ribeiro Maricá e Bazar Ribeiro Saquarema");
    expect(r).toMatchObject({ sent: 2, grupos: 2, lojas: 3 });
    // Cada loja fica registrada como recebida — o sinal "promoção sem resposta" lê por cliente.
    expect(log.filter((l) => l.status === "sent").map((l) => l.client_id).sort()).toEqual(["armaz", "maric", "saqua"]);
  });

  it("rodar de novo no mesmo dia não manda outra vez a nenhum grupo", async () => {
    await rodar();
    csSendGroupDocument.mockReset().mockResolvedValue({ ok: true });
    await rodar();
    expect(csSendGroupDocument).not.toHaveBeenCalled();
  });

  it("PDF que estoura o tempo no agente NÃO vai de novo pelo gestor, e não é reenviado na rodada seguinte", async () => {
    csSendGroupDocument.mockResolvedValue({ ok: false, incerto: true, error: "o WhatsApp não respondeu em 60 s — pode ter saído" });
    const r = await rodar();
    expect(sendMediaDocument).not.toHaveBeenCalled();
    expect(r).toMatchObject({ sent: 0, incertos: 2 });

    csSendGroupDocument.mockReset().mockResolvedValue({ ok: true });
    await rodar();
    expect(csSendGroupDocument).not.toHaveBeenCalled();
  });

  it("agente fora do grupo (falha certa): o gestor manda — a redundância continua", async () => {
    csSendGroupDocument.mockResolvedValue({ ok: false, error: "HTTP 400: not-authorized" });
    const r = await rodar();
    expect(sendMediaDocument).toHaveBeenCalledTimes(2);
    expect(r).toMatchObject({ sent: 2 });
  });
});
