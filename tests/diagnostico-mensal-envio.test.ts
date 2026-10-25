// @vitest-environment node
// tests/diagnostico-mensal-envio.test.ts — 25/10/2026, auditoria 10.4. Dados INVENTADOS.
// O QUE ACONTECIA: o diagnóstico mensal respondia ok:true com 0 PDFs enviados — a Central ficava verde.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const gravados: string[] = [];
vi.mock("@/lib/api/cron-guard", () => ({ requireCron: () => null }));
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: {
    from: () => {
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.eq = (_c: string, v: string) => { q._k = v; return q; };
      q.maybeSingle = async () => (q._k === "traffic_alert_group_jid" ? { data: { value: "trafego@g.us" }, error: null } : { data: null, error: null });
      q.upsert = async (l: { key: string }) => { gravados.push(l.key); return { error: null }; };
      return q;
    },
  },
}));
vi.mock("@/lib/diagnostico-mensal/dados", () => ({
  periodoPadrao: () => ({ de: "2026-09-01", ate: "2026-09-30" }),
  periodoAnterior: () => ({ de: "2026-08-01", ate: "2026-08-31" }),
  selecionarClientes: async () => ({ elegiveis: [{ id: "c1", name: "Loja Alfa", nome_fantasia: null }], foraSocial: [], pausados: [] }),
  coletar: async () => ({ ig: null }),
}));
vi.mock("@/lib/diagnostico-mensal/pdf", () => ({
  diagnosticoMensalHtml: () => ({ html: "<p>x</p>", analise: { nota: 70, veredito: "ok", achados: [], atual: { invest: 500 } } }),
  legendaCliente: () => "legenda",
}));
vi.mock("@/lib/traffic/renderPdf", () => ({ htmlToPdf: async () => ({ ok: true, buffer: Buffer.from("pdf") }) }));
vi.mock("@/lib/cs/roteiro-pdf", () => ({ loadLoneLogo: async () => "" }));
let doc: { ok: boolean; error?: string; incerto?: boolean } = { ok: true };
vi.mock("@/lib/cs/notify", () => ({
  csSendGroupDocument: async () => doc,
  csSendGroupText: async () => ({ ok: true }),
}));

const { POST } = await import("@/app/api/system/diagnostico-mensal/route");
const enviar = async () => (await POST(new NextRequest("http://x/api/system/diagnostico-mensal?enviar=1", { method: "POST" }))).json();

beforeEach(() => { gravados.length = 0; doc = { ok: true }; });

describe("diagnóstico mensal — ok só quando o PDF saiu", () => {
  it("o erro original: 0 PDFs enviados e ok:true — agora ok:false com o motivo", async () => {
    doc = { ok: false, error: "HTTP 400" };
    const r = await enviar();
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/Loja Alfa: HTTP 400/);
    expect(gravados).toEqual([]); // não marca "já enviado": dá para rodar de novo
  });
  it("incerto marca 'já enviado' (não repete) mas não diz ok", async () => {
    doc = { ok: false, error: "sem resposta — pode ter saído", incerto: true };
    const r = await enviar();
    expect(r.ok).toBe(false);
    expect(gravados).toHaveLength(1);
  });
  it("enviou: ok", async () => {
    expect((await enviar()).ok).toBe(true);
  }, 10_000);
});
