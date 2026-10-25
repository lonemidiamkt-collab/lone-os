// @vitest-environment node
// tests/encerrar-parceria-passos.test.ts — 24/10/2026, auditoria de erro recuperável (item 3.10).
// "Concluir encerramento" marcava o processo como concluído PRIMEIRO e fazia as outras gravações sem
// olhar o erro: se tirar o cliente da carteira falhasse, a tela dizia "concluído" com ele ainda ativo.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { bancoEmMemoria } from "./helpers/banco-em-memoria";
import { executarPassos, respostaDosPassos } from "@/lib/clients/offboarding-passos";

const banco = bancoEmMemoria();
vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: banco.supabaseAdmin }));
vi.mock("@/lib/api/require-role", () => ({ GESTAO: ["admin", "manager"], requireRole: async () => ({ user: { id: "u1", email: "roberto@lone" }, papel: "admin" }) }));

const { POST } = await import("@/app/api/clients/offboarding/route");
const CLI = "11111111-1111-4111-8111-111111111111";
const pedir = (corpo: Record<string, unknown>) =>
  POST(new NextRequest("http://x/api/clients/offboarding", { method: "POST", body: JSON.stringify(corpo) }));

beforeEach(() => {
  banco.limpar();
  banco.db.team_members = [{ email: "roberto@lone", name: "Roberto" }];
  banco.db.clients = [{ id: CLI, name: "Padaria", active: true, lifecycle: "encerrando", churned_at: null }];
  banco.db.client_lifecycles = [{ id: "c1", client_id: CLI, ciclo: 1, iniciou_em: "2026-01-10", encerrou_em: null }];
  banco.db.client_offboardings = [{
    id: "off-1", client_id: CLI, iniciativa: "cliente", motivo: "preco", motivo_detalhe: null,
    solicitado_em: "2026-10-01", encerra_em: "2026-10-31", estado: "confirmado",
    financeiro_ok: true, entregas_ok: true, termo_path: "t.pdf", enviado_em: "2026-10-02", confirmado_em: "2026-10-03",
  }];
});

describe("passos conferidos", () => {
  const ok = () => Promise.resolve({ error: null });
  const falha = (m: string) => () => Promise.resolve({ error: { message: m } });

  it("passo essencial que falha interrompe; os seguintes nem rodam", async () => {
    const depois = vi.fn(ok);
    const r = await executarPassos([
      { rotulo: "tirar da carteira", essencial: true, rodar: falha("timeout") },
      { rotulo: "fechar o ciclo", essencial: false, rodar: depois },
    ]);
    expect(depois).not.toHaveBeenCalled();
    expect(r.falhaEssencial).toEqual({ rotulo: "tirar da carteira", erro: "timeout" });
    const resp = respostaDosPassos(r, { semEfeito: "O cliente continua ATIVO na carteira." });
    expect(resp.status).toBe(500);
    expect(resp.corpo.error).toMatch(/Não consegui tirar da carteira \(timeout\)\. O cliente continua ATIVO/);
  });

  it("passo de registro que falha não desfaz o resto: vira pendência dita na resposta", async () => {
    const r = await executarPassos([
      { rotulo: "tirar da carteira", essencial: true, rodar: ok },
      { rotulo: "registrar na linha do tempo", essencial: false, rodar: falha("rls") },
    ]);
    const resp = respostaDosPassos(r, { semEfeito: "" });
    expect(resp.status).toBe(200);
    expect(resp.corpo.pendencias).toEqual(["registrar na linha do tempo (rls)"]);
  });

  it("exceção conta como falha, não como sucesso", async () => {
    const r = await executarPassos([{ rotulo: "x", essencial: true, rodar: () => Promise.reject(new Error("rede caiu")) }]);
    expect(r.falhaEssencial?.erro).toBe("rede caiu");
  });
});

describe("/api/clients/offboarding — concluir", () => {
  it("o bug: falha ao tirar o cliente da carteira NÃO vira 'concluído'", async () => {
    banco.falharEm("clients", "update", { message: "connection reset" });
    const r = await pedir({ acao: "concluir", id: "off-1" });
    expect(r.status).toBe(500);
    expect((await r.json()).error).toMatch(/O cliente continua ATIVO/);
    expect(banco.db.client_offboardings[0].estado).toBe("confirmado");
    expect(banco.db.client_lifecycles[0].encerrou_em).toBeNull();
  });

  it("tudo certo: cliente inativo, ciclo fechado, processo concluído, sem pendência", async () => {
    const r = await pedir({ acao: "concluir", id: "off-1" });
    const j = await r.json();
    expect(r.status).toBe(200);
    expect(j.pendencias).toBeUndefined();
    expect(banco.db.clients[0]).toMatchObject({ active: false, lifecycle: "inativo" });
    expect(banco.db.client_lifecycles[0].encerrou_em).toBe("2026-10-31");
    expect(banco.db.client_offboardings[0].estado).toBe("concluido");
  });

  it("registro que falha volta como pendência (a tela não fecha como se estivesse tudo certo)", async () => {
    banco.falharEm("timeline_entries", "insert", { message: "permission denied" });
    const r = await pedir({ acao: "concluir", id: "off-1" });
    const j = await r.json();
    expect(r.status).toBe(200);
    expect(j.pendencias).toEqual(["registrar na linha do tempo do cliente (permission denied)"]);
  });
});

describe("tela de encerramento", () => {
  it("só fecha quando tudo gravou; com pendência, mostra o que faltou", () => {
    const src = readFileSync("components/EncerrarParceria.tsx", "utf8");
    expect(src).toMatch(/concluiuTudo/);
    expect(src).toMatch(/Feito, mas não consegui/);
  });
});
