// @vitest-environment node
// tests/contrato-gerar-adendo.test.ts — gerar contrato e registrar adendo pelo servidor (auditoria de
// erro recuperável, 21/10/2026, item 3.6).
//
// O que acontecia: o navegador subia o PDF e inseria o contrato sem olhar erro nenhum e fechava a
// janela como salvo; a versão era "contratos na tela + 1" (lista que falhou → V1 de novo); o adendo
// que não gravava apagava o texto digitado do mesmo jeito.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

type Op = { tabela: string; tipo: "select" | "insert" | "update" | "delete"; dados?: unknown; filtros: [string, unknown][] };
const ops: Op[] = [];
const storage: { acao: string; caminho: string }[] = [];
let responder: (op: Op) => { data: unknown; error: { message: string } | null } = () => ({ data: null, error: null });
let falhaUpload: string | null = null;

function consulta(tabela: string) {
  const op: Op = { tabela, tipo: "select", filtros: [] };
  const fim = async () => { ops.push(op); return responder(op); };
  const q = {
    select: () => q,
    insert: (d: unknown) => { op.tipo = "insert"; op.dados = d; return q; },
    update: (d: unknown) => { op.tipo = "update"; op.dados = d; return q; },
    delete: () => { op.tipo = "delete"; return q; },
    eq: (c: string, v: unknown) => { op.filtros.push([c, v]); return q; },
    order: () => q,
    limit: () => q,
    maybeSingle: fim,
    single: fim,
    then: (ok: (v: unknown) => unknown, erro?: (e: unknown) => unknown) => fim().then(ok, erro),
  };
  return q;
}

vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: {
    from: (t: string) => consulta(t),
    storage: {
      from: () => ({
        upload: async (caminho: string) => { storage.push({ acao: "upload", caminho }); return { error: falhaUpload ? { message: falhaUpload } : null }; },
        remove: async (caminhos: string[]) => { storage.push({ acao: "remove", caminho: caminhos[0] }); return { error: null }; },
      }),
    },
  },
}));
vi.mock("@/lib/api/require-role", () => ({
  GESTAO: ["admin", "manager"],
  requireRole: async () => ({ user: { id: "u1", email: "lonemidiamkt@gmail.com", isAdmin: true }, papel: "admin" }),
}));

const { POST: gerar } = await import("@/app/api/contracts/gerar/route");
const { POST: adendo } = await import("@/app/api/contracts/adendo/route");
const { validarNovoContrato, validarAdendo, proximaVersao, somarMesesIso } = await import("@/lib/contracts/registro");

const CLIENTE = "11111111-2222-3333-4444-555555555555";
const CONTRATO = "99999999-8888-7777-6666-555555555555";

function formulario(extra: Record<string, string> = {}) {
  const fd = new FormData();
  fd.append("file", new File([new Uint8Array([37, 80, 68, 70])], "contrato.pdf", { type: "application/pdf" }));
  const campos: Record<string, string> = {
    clientId: CLIENTE, serviceType: "assessoria_trafego", monthlyValue: "1500", startDate: "2026-11-01",
    durationMonths: "6", paymentDay: "10", hasRenewal: "false", ...extra,
  };
  for (const [k, v] of Object.entries(campos)) fd.append(k, v);
  return new NextRequest("http://x/api/contracts/gerar", { method: "POST", body: fd });
}

let maiorVersao: number | null;
let falhaInsert: string | null;
let falhaLeituraVersao: boolean;

beforeEach(() => {
  ops.length = 0; storage.length = 0;
  maiorVersao = 3; falhaInsert = null; falhaUpload = null; falhaLeituraVersao = false;
  responder = (op) => {
    if (op.tabela === "clients") return { data: { id: CLIENTE }, error: null };
    if (op.tabela === "team_members") return { data: { name: "Roberto" }, error: null };
    if (op.tabela === "contracts" && op.tipo === "select") {
      // Por id: o contrato renovado (gerar) ou o contrato do adendo.
      if (op.filtros.some(([c]) => c === "id")) return { data: { id: CONTRATO, version: 2, client_id: CLIENTE }, error: null };
      if (falhaLeituraVersao) return { data: null, error: { message: "timeout" } };
      return { data: maiorVersao == null ? null : { version: maiorVersao }, error: null };
    }
    if (op.tabela === "contracts" && op.tipo === "insert") {
      if (falhaInsert) return { data: null, error: { message: falhaInsert } };
      return { data: { id: "novo", version: (op.dados as { version: number }).version }, error: null };
    }
    if (op.tabela === "contract_addendums" && op.tipo === "insert") {
      if (falhaInsert) return { data: null, error: { message: falhaInsert } };
      return { data: { id: "ad1" }, error: null };
    }
    return { data: null, error: null };
  };
});

describe("gerar contrato", () => {
  it("a versão sai do BANCO (maior + 1), não do tamanho da lista da tela", async () => {
    const r = await gerar(formulario());
    const j = await r.json();
    expect(r.status).toBe(200);
    expect(j).toMatchObject({ ok: true, version: 4, avisos: [] });
    const ins = ops.find((o) => o.tabela === "contracts" && o.tipo === "insert")!.dados as Record<string, unknown>;
    expect(ins).toMatchObject({ version: 4, client_id: CLIENTE, monthly_value: 1500, end_date: "2027-05-01", status: "draft", generated_by: "Roberto" });
  });

  it("sem contrato nenhum: V1", async () => {
    maiorVersao = null;
    expect((await (await gerar(formulario())).json()).version).toBe(1);
  });

  it("não conseguiu ler as versões: recusa em vez de chutar V1", async () => {
    falhaLeituraVersao = true;
    const r = await gerar(formulario());
    expect(r.status).toBe(503);
    expect(storage).toHaveLength(0);
    expect(ops.some((o) => o.tabela === "contracts" && o.tipo === "insert")).toBe(false);
  });

  it("PDF não subiu: não grava contrato e diz o que houve", async () => {
    falhaUpload = "Bucket not found";
    const r = await gerar(formulario());
    expect(r.status).toBe(500);
    expect((await r.json()).error).toMatch(/Bucket not found/);
    expect(ops.some((o) => o.tabela === "contracts" && o.tipo === "insert")).toBe(false);
  });

  it("linha não gravou: apaga o PDF enviado e responde erro (antes a tela fechava como salvo)", async () => {
    falhaInsert = "permission denied for table contracts";
    const r = await gerar(formulario());
    expect(r.status).toBe(500);
    expect((await r.json()).error).toMatch(/Nada foi salvo/);
    expect(storage.map((s) => s.acao)).toEqual(["upload", "remove"]);
  });

  it("renovação registra de qual versão veio", async () => {
    await gerar(formulario({ previousContractId: CONTRATO }));
    const aud = ops.find((o) => o.tabela === "contract_audit_log")!.dados as { action: string; details: string }[];
    expect(aud.map((a) => a.action)).toEqual(["generated", "renewal"]);
    expect(aud[1].details).toMatch(/V2/);
  });
});

describe("adendo", () => {
  const corpo = { contractId: CONTRATO, changeType: "valor", description: "Reajuste para R$ 1.800", oldValue: "1500", newValue: "1800", effectiveDate: "2026-12-01" };
  const req = (b: unknown) => new NextRequest("http://x/api/contracts/adendo", { method: "POST", body: JSON.stringify(b) });

  it("grava e confirma", async () => {
    const r = await adendo(req(corpo));
    expect(r.status).toBe(200);
    expect(ops.find((o) => o.tabela === "contract_addendums")!.dados).toMatchObject({ contract_id: CONTRATO, description: "Reajuste para R$ 1.800", generated_by: "Roberto" });
  });

  it("falha do banco volta como falha (a tela mantém o texto)", async () => {
    falhaInsert = "violates check constraint";
    const r = await adendo(req(corpo));
    expect(r.status).toBe(500);
    expect((await r.json()).error).toMatch(/Seu texto continua na tela/);
  });
});

describe("validação", () => {
  it("contrato: o que falta vira frase", () => {
    const base = { clientId: CLIENTE, serviceType: "lone_growth", monthlyValue: "2000", startDate: "2026-11-01", durationMonths: "3", paymentDay: "5" };
    expect(validarNovoContrato(base).ok).toBe(true);
    expect(validarNovoContrato({ ...base, monthlyValue: "0" })).toEqual({ ok: false, erro: "Informe o valor mensal (maior que zero)." });
    expect(validarNovoContrato({ ...base, serviceType: "outro" }).ok).toBe(false);
    expect(validarNovoContrato({ ...base, durationMonths: "40" }).ok).toBe(false);
    expect(validarNovoContrato({ ...base, hasRenewal: "true" })).toEqual({ ok: false, erro: "Informe o novo valor do reajuste ou desmarque o reajuste." });
    expect(validarNovoContrato({ ...base, hasRenewal: "true", renewalValue: "2500" })).toMatchObject({ ok: true, dados: { renewalValue: 2500 } });
  });

  it("adendo sem descrição não passa", () => {
    expect(validarAdendo({ contractId: CONTRATO, changeType: "valor", description: "  ", effectiveDate: "2026-12-01" }).ok).toBe(false);
  });

  it("versão e datas", () => {
    expect(proximaVersao(null)).toBe(1);
    expect(proximaVersao(7)).toBe(8);
    expect(somarMesesIso("2026-11-01", 6)).toBe("2027-05-01");
    expect(somarMesesIso("2026-01-15", 12)).toBe("2027-01-15");
  });
});
