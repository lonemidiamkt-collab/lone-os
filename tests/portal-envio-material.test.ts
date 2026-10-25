// @vitest-environment node
// tests/portal-envio-material.test.ts — "Enviar material" do portal (24/10/2026, item 1.11).
// Antes: escolher já enviava (sem lista, sem remover) e cada arquivo virava uma mensagem no grupo
// do time. Agora: um aviso só por envio, aviso automático se a aba fechar no meio, e o cliente
// apaga o que mandou errado enquanto o time não abriu.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { bancoEmMemoria } from "./helpers/banco-em-memoria";

const banco = bancoEmMemoria();
const mensagens: string[] = [];
const removidos: string[] = [];
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: {
    from: banco.supabaseAdmin.from,
    storage: { from: () => ({
      upload: async () => ({ error: null }),
      remove: async (p: string[]) => { removidos.push(...p); return { error: null }; },
    }) },
  },
}));
vi.mock("@/lib/cs/notify", () => ({ csSendGroupText: async (_jid: string, texto: string) => { mensagens.push(texto); return { ok: true }; } }));

const upload = await import("@/app/api/portal/[token]/upload/route");
const aviso = await import("@/app/api/portal/[token]/upload/aviso/route");
const { mensagemDoLote, loteValido, podeApagarMaterial, criarRegistroDeLotes } = await import("@/lib/portal/envio-material");
const { ESPERA_AVISO_AUTOMATICO_MS } = await import("@/lib/portal/envio-material-server");

const params = { params: Promise.resolve({ token: "tok-portal" }) };
let seqLote = 0;
const novoLote = () => `lote-teste-${++seqLote}-${Date.now()}`;

function mandar(nome: string, extra: Record<string, string> = {}) {
  const fd = new FormData();
  fd.append("arquivo", new File([new Uint8Array([1, 2, 3])], nome, { type: "image/jpeg" }));
  fd.append("observacao", "fotos do produto novo");
  for (const [k, v] of Object.entries(extra)) fd.append(k, v);
  return upload.POST(new NextRequest("http://x/api/portal/tok-portal/upload", { method: "POST", body: fd }), params);
}
const pedirAviso = (lote: string, ids: string[] = []) =>
  aviso.POST(new NextRequest("http://x/api/portal/tok-portal/upload/aviso", { method: "POST", body: JSON.stringify({ lote, ids }) }), params);
const apagar = (id: string) =>
  upload.DELETE(new NextRequest(`http://x/api/portal/tok-portal/upload?id=${id}`, { method: "DELETE" }), params);

beforeEach(() => {
  banco.limpar();
  mensagens.length = 0;
  removidos.length = 0;
  process.env.CS_TEAM_GROUP_JID = "grupo-time@g.us";
  banco.db.clients = [{ id: "c1", name: "Padaria Pão Bom", public_report_token: "tok-portal", public_report_enabled: true, active: true }];
});
afterEach(() => { vi.useRealTimers(); delete process.env.CS_TEAM_GROUP_JID; });

describe("um aviso só por envio", () => {
  it("o erro original: 3 arquivos = 3 mensagens; agora sobem calados e o aviso sai UMA vez com os 3", async () => {
    const lote = novoLote();
    for (const n of ["a.jpg", "b.jpg", "c.jpg"]) expect((await mandar(n, { lote, avisar: "depois" })).status).toBe(200);
    expect(mensagens).toHaveLength(0);

    const r = await pedirAviso(lote);
    expect(await r.json()).toMatchObject({ ok: true, avisados: 3 });
    expect(mensagens).toHaveLength(1);
    expect(mensagens[0]).toMatch(/Padaria Pão Bom\* mandou 3 arquivos/);
    for (const n of ["a.jpg", "b.jpg", "c.jpg"]) expect(mensagens[0]).toContain(n);
    expect(mensagens[0]).toContain("fotos do produto novo");
  });

  it("pedir o aviso de novo (clique duplo) não manda outra mensagem", async () => {
    const lote = novoLote();
    await mandar("a.jpg", { lote, avisar: "depois" });
    await pedirAviso(lote);
    expect(await (await pedirAviso(lote)).json()).toMatchObject({ jaAvisado: true });
    expect(mensagens).toHaveLength(1);
  });

  it("aba fechada no meio: o servidor avisa sozinho o que chegou", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const lote = novoLote();
    await mandar("a.jpg", { lote, avisar: "depois" });
    await mandar("b.jpg", { lote, avisar: "depois" });
    expect(mensagens).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(ESPERA_AVISO_AUTOMATICO_MS + 10);
    await vi.waitFor(() => expect(mensagens).toHaveLength(1));
    expect(mensagens[0]).toMatch(/mandou 2 arquivos/);
    // A página que voltar depois não avisa em dobro.
    expect(await (await pedirAviso(lote)).json()).toMatchObject({ jaAvisado: true });
  });

  it("sem lote (página antiga) continua avisando por arquivo", async () => {
    await mandar("a.jpg");
    expect(mensagens).toHaveLength(1);
  });
});

describe("apagar o que o time ainda não abriu", () => {
  const ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
  it("não aberto: apaga o registro e o arquivo", async () => {
    banco.db.client_uploads = [{ id: ID, client_id: "c1", storage_path: "c1/x.jpg", file_name: "x.jpg", visto_em: null }];
    const r = await apagar(ID);
    expect(r.status).toBe(200);
    expect(banco.db.client_uploads).toHaveLength(0);
    expect(removidos).toEqual(["c1/x.jpg"]);
  });
  it("já aberto pelo time: recusa com frase e não apaga", async () => {
    banco.db.client_uploads = [{ id: ID, client_id: "c1", storage_path: "c1/x.jpg", file_name: "x.jpg", visto_em: "2026-10-24T10:00:00Z" }];
    const r = await apagar(ID);
    expect(r.status).toBe(409);
    expect((await r.json()).error).toMatch(/já abriu/);
    expect(banco.db.client_uploads).toHaveLength(1);
  });
  it("arquivo de outro cliente: não acha", async () => {
    banco.db.client_uploads = [{ id: ID, client_id: "outro", storage_path: "o/x.jpg", file_name: "x.jpg", visto_em: null }];
    expect((await apagar(ID)).status).toBe(404);
    expect(banco.db.client_uploads).toHaveLength(1);
  });
});

describe("regras puras", () => {
  it("mensagem com todos os arquivos, quem mandou e a observação; lista longa resume", () => {
    const m = mensagemDoLote({ cliente: "Loja", enviadoPor: "Ana", observacao: "pro post de sexta", arquivos: [{ nome: "a.jpg", tamanhoBytes: 2048 }, { nome: "b.pdf" }] });
    expect(m).toBe('📎 *Loja* mandou 2 arquivos pelo painel\nEnviado por: Ana\n• a.jpg (2 KB)\n• b.pdf\n\n_"pro post de sexta"_');
    const muitos = mensagemDoLote({ cliente: "Loja", arquivos: Array.from({ length: 20 }, (_, i) => ({ nome: `f${i}.jpg` })) });
    expect(muitos).toContain("… e mais 5");
  });
  it("lote só no formato esperado; apagar só sem visto", () => {
    expect(loteValido("l-abc123-xyz")).toBe(true);
    expect(loteValido("../../etc")).toBe(false);
    expect(podeApagarMaterial({ visto_em: null })).toBe(true);
    expect(podeApagarMaterial({ visto_em: "2026-10-24" })).toBe(false);
  });
  it("registro: concluir antes do automático desarma; aviso que falhou pode ser pedido de novo", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const avisos: string[][] = [];
    const reg = criarRegistroDeLotes({ esperaMs: 1000, avisar: (_c, ids) => { avisos.push(ids); } });
    reg.chegou("lote-aaaaaaaa", "c1", "u1");
    reg.chegou("lote-aaaaaaaa", "c1", "u2");
    expect(reg.concluir("lote-aaaaaaaa", "c1")).toEqual(["u1", "u2"]);
    await vi.advanceTimersByTimeAsync(2000);
    expect(avisos).toEqual([]);
    expect(reg.concluir("lote-aaaaaaaa", "c1")).toBeNull();
    reg.esquecer("lote-aaaaaaaa", "c1");
    expect(reg.concluir("lote-aaaaaaaa", "c1")).toEqual([]);
  });
});
