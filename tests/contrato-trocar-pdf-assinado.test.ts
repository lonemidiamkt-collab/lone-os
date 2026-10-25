// @vitest-environment node
// tests/contrato-trocar-pdf-assinado.test.ts — 24/10/2026, auditoria de erro recuperável (item 3.13).
// Depois do primeiro envio do PDF assinado só havia "Ver assinado": PDF errado ficava para sempre.
// Agora "Trocar PDF assinado" substitui com confirmação e o anterior fica guardado (referência em
// contracts.signed_pdf_anteriores; o arquivo antigo NÃO sai do storage).

import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { bancoEmMemoria } from "./helpers/banco-em-memoria";
import { anterioresDepoisDaTroca, decidirEnvioAssinado, lerAnteriores } from "@/lib/contracts/pdf-assinado";

const banco = bancoEmMemoria();
const storage = vi.hoisted(() => ({ upload: vi.fn(), remove: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: { from: (t: string) => banco.supabaseAdmin.from(t), storage: { from: () => storage } },
}));
vi.mock("@/lib/supabase/auth-server", () => ({ getServerUser: async () => ({ id: "u1", email: "roberto@lone", isAdmin: true }) }));

const { POST } = await import("@/app/api/contracts/upload-signed/route");
const CONTRATO = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ANTIGO = "legal://contracts-signed/cli/antigo.pdf";

function enviar(substituir: boolean) {
  const fd = new FormData();
  fd.append("file", new File([new Uint8Array([37, 80, 68, 70])], "assinado.pdf", { type: "application/pdf" }));
  fd.append("contractId", CONTRATO);
  if (substituir) fd.append("substituir", "1");
  return POST(new NextRequest("http://x/api/contracts/upload-signed", { method: "POST", body: fd }));
}
const contrato = () => banco.db.contracts[0];

beforeEach(() => {
  banco.limpar();
  storage.upload.mockReset().mockResolvedValue({ error: null });
  storage.remove.mockReset().mockResolvedValue({ error: null });
  banco.db.contracts = [{
    id: CONTRATO, client_id: "cli", version: 2, status: "active",
    signed_pdf_path: ANTIGO, signed_at: "2026-10-01T12:00:00Z", signed_uploaded_by: "lucas@lone", signature_method: "d4sign_manual",
    signed_pdf_anteriores: [],
  }];
});

describe("regra da troca", () => {
  it("sem PDF ainda: envio normal", () => {
    expect(decidirEnvioAssinado({ signed_pdf_path: null }, false)).toEqual({ ok: true, troca: false });
  });
  it("já assinado e sem pedir troca: recusa (tela velha não substitui o PDF certo)", () => {
    expect(decidirEnvioAssinado({ signed_pdf_path: ANTIGO, signed_pdf_anteriores: [] }, false)).toMatchObject({ ok: false, status: 409 });
  });
  it("sem a coluna de anteriores (migration não aplicada): recusa em vez de perder a referência", () => {
    const d = decidirEnvioAssinado({ signed_pdf_path: ANTIGO }, true);
    expect(d).toMatchObject({ ok: false, status: 503 });
    expect(!d.ok && d.erro).toMatch(/20261024120000/);
  });
  it("o anterior entra no topo com quem enviou e quem trocou; os mais velhos continuam", () => {
    const lista = anterioresDepoisDaTroca(
      { signed_pdf_path: ANTIGO, signed_at: "2026-10-01T12:00:00Z", signed_uploaded_by: "lucas@lone", signed_pdf_anteriores: [{ path: "legal://x/mais-velho.pdf", substituidoEm: "2026-09-01", substituidoPor: "a" }] },
      "roberto@lone", "2026-10-24T10:00:00Z");
    expect(lista.map((a) => a.path)).toEqual([ANTIGO, "legal://x/mais-velho.pdf"]);
    expect(lista[0]).toMatchObject({ enviadoPor: "lucas@lone", substituidoPor: "roberto@lone" });
    expect(lerAnteriores("lixo")).toEqual([]);
  });
});

describe("/api/contracts/upload-signed", () => {
  it("envio comum sobre contrato já assinado: 409 e nada sobe", async () => {
    const r = await enviar(false);
    expect(r.status).toBe(409);
    expect(storage.upload).not.toHaveBeenCalled();
    expect(contrato().signed_pdf_path).toBe(ANTIGO);
  });

  it("trocar: o novo vale, o anterior fica guardado e o arquivo antigo não é apagado", async () => {
    const r = await enviar(true);
    expect(r.status).toBe(200);
    expect((await r.json()).troca).toBe(true);
    expect(contrato().signed_pdf_path).not.toBe(ANTIGO);
    expect((contrato().signed_pdf_anteriores as { path: string }[])[0].path).toBe(ANTIGO);
    expect(storage.remove).not.toHaveBeenCalled();
    expect(banco.db.contract_audit_log?.[0]).toMatchObject({ action: "signed_replaced" });
  });

  it("se a gravação falha, só o arquivo NOVO sai do storage — o anterior continua valendo", async () => {
    banco.falharEm("contracts", "update", { message: "deadlock" });
    const r = await enviar(true);
    expect(r.status).toBe(500);
    expect(contrato().signed_pdf_path).toBe(ANTIGO);
    expect(storage.remove).toHaveBeenCalledTimes(1);
    expect(storage.remove.mock.calls[0][0][0]).not.toContain("antigo.pdf");
  });
});

describe("tela do contrato", () => {
  it("tem 'Trocar PDF assinado' com confirmação e mostra os anteriores", () => {
    const src = readFileSync("components/ContractGenerator.tsx", "utf8");
    expect(src).toMatch(/Trocar PDF assinado/);
    expect(src).toMatch(/window\.confirm\(/);
    expect(src).toMatch(/PDFs anteriores/);
    expect(src).toMatch(/fd\.append\("substituir", "1"\)/);
  });
});
