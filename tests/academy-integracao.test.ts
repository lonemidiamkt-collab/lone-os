// @vitest-environment node
// tests/academy-integracao.test.ts — Lone Academy na ficha do cliente (04/11/2026).
// A gestão libera por cliente; o Lone OS assina o pedido e a Academy cria a empresa e manda o e-mail.
// O que se testa: a assinatura bate com a da Academy (vetor fixo, o mesmo teste existe lá), integração
// sem configuração diz que está desligada, falha da Academy aparece como falha, só gestão libera,
// cliente encerrado não libera, e encerrar/reativar acompanha na Academy.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { bancoEmMemoria } from "./helpers/banco-em-memoria";
import { assinar, textoAssinado } from "@/lib/academy/assinatura";

const banco = bancoEmMemoria();
const usuario = vi.hoisted(() => ({ isAdmin: true }));
const espias = vi.hoisted(() => ({ historico: vi.fn(async (..._a: unknown[]) => {}), enviar: vi.fn(async (..._a: unknown[]) => ({})), link: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: banco.supabaseAdmin }));
vi.mock("@/lib/supabase/auth-server", () => ({ getServerUser: async () => ({ id: "u1", email: "roberto@lone", isAdmin: usuario.isAdmin }) }));
vi.mock("@/lib/clients/historico", () => ({ registrarHistorico: espias.historico }));
vi.mock("@/lib/cs/notify", () => ({ csSendGroupText: espias.enviar }));
vi.mock("@/lib/portal/link-automatico", () => ({ dispararLinkDoPortal: espias.link }));

const { GET, POST } = await import("@/app/api/clients/[id]/academy/route");
const lifecycle = await import("@/app/api/clients/[id]/lifecycle/route");
const { statusNaAcademy, situacaoEsperada } = await import("@/lib/academy/cliente");

const ID = "22222222-2222-4222-8222-222222222222";
const SEGREDO = "s".repeat(64);
const ctx = { params: Promise.resolve({ id: ID }) };
const pedir = (corpo?: Record<string, unknown>) => corpo
  ? POST(new NextRequest(`http://x/api/clients/${ID}/academy`, { method: "POST", body: JSON.stringify(corpo) }), ctx)
  : GET(new NextRequest(`http://x/api/clients/${ID}/academy`), ctx);

type Chamada = { url: string; init: RequestInit };
let chamadas: Chamada[] = [];
let responder: (c: Chamada) => Response = () => new Response("{}", { status: 200 });

beforeEach(() => {
  banco.limpar();
  usuario.isAdmin = true;
  espias.historico.mockClear();
  chamadas = [];
  process.env.ACADEMY_URL = "https://academy.teste";
  process.env.ACADEMY_SHARED_SECRET = SEGREDO;
  banco.db.clients = [{ id: ID, name: "Casa Exemplo LTDA", nome_fantasia: "Casa Exemplo", contact_name: "Paula Souza",
    email: null, email_corporativo: "paula@casaexemplo.com.br", active: true, churned_at: null, lifecycle: "ativo" }];
  banco.db.client_lifecycles = [{ id: "c1", client_id: ID, ciclo: 1, iniciou_em: "2026-01-10", encerrou_em: null, offboarding_id: null, motivo: null }];
  banco.db.team_members = [{ email: "roberto@lone", name: "Roberto" }];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => { const c = { url: String(url), init }; chamadas.push(c); return responder(c); }));
});

const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });

describe("assinatura", () => {
  it("é a mesma da Academy (vetor fixo; lone-academy/tests/integracao-lone-os.test.ts confere o mesmo texto)", () => {
    expect(assinar("a".repeat(64), textoAssinado("1800000000", "post", "/api/integracao/lone-os", '{"acao":"liberar"}')))
      .toBe("sha256=165b3ea2db5089e06b63cc11ed1942bae45c5eba695c50ebc5a52b13147461ea");
  });
  it("cada pedido sai assinado com hora, método, caminho e corpo", async () => {
    responder = () => json({ existe: false });
    await statusNaAcademy(ID);
    const h = chamadas[0].init.headers as Record<string, string>;
    expect(chamadas[0].url).toBe(`https://academy.teste/api/integracao/lone-os?cliente=${ID}`);
    expect(h["x-lone-assinatura"]).toBe(assinar(SEGREDO, textoAssinado(h["x-lone-timestamp"], "GET", `/api/integracao/lone-os?cliente=${ID}`, "")));
  });
});

describe("falha nunca vira sucesso", () => {
  it("sem configuração: diz que a integração está desligada e não chama ninguém", async () => {
    delete process.env.ACADEMY_SHARED_SECRET;
    const r = await pedir();
    expect(r.status).toBe(503);
    expect((await r.json()).error).toMatch(/desligada/);
    expect(chamadas).toHaveLength(0);
  });
  it("Academy fora do ar: erro com o que fazer", async () => {
    responder = () => { throw new Error("ECONNREFUSED"); };
    const r = await pedir();
    expect(r.status).toBe(502);
    expect((await r.json()).error).toMatch(/Não consegui falar com a Lone Academy/);
  });
  it("Academy recusa: a frase dela chega à tela", async () => {
    responder = () => json({ erro: "Assinatura não confere." }, 401);
    expect((await (await pedir()).json()).error).toBe("Assinatura não confere.");
  });
});

describe("liberar", () => {
  it("só gestão", async () => {
    usuario.isAdmin = false;
    expect((await pedir()).status).toBe(403);
    expect((await pedir({ acao: "liberar", gestorNome: "Paula", gestorEmail: "paula@x.com" })).status).toBe(403);
  });
  it("GET sugere o dono e o e-mail da aba Dados", async () => {
    responder = () => json({ existe: false });
    const d = await (await pedir()).json();
    expect(d.sugestao).toEqual({ gestorNome: "Paula Souza", gestorEmail: "paula@casaexemplo.com.br" });
  });
  it("manda à Academy o nome do BANCO (não o do navegador), o dono e os assentos; registra na linha do tempo", async () => {
    responder = () => json({ resultado: "convite_enviado", existe: true, email: { enviado: true }, link: "https://academy.teste/convite/x" });
    const r = await pedir({ acao: "liberar", gestorNome: "Paula Souza", gestorEmail: "Paula@CasaExemplo.com.br", assentos: 12, nome: "Outro nome" });
    expect(r.status).toBe(200);
    const corpo = JSON.parse(String(chamadas[0].init.body));
    expect(corpo).toEqual({ acao: "liberar", cliente: { id: ID, nome: "Casa Exemplo" }, gestor: { nome: "Paula Souza", email: "paula@casaexemplo.com.br" }, assentos: 12 });
    expect(espias.historico).toHaveBeenCalledWith(expect.objectContaining({ clientId: ID, descricao: "Lone Academy liberada para paula@casaexemplo.com.br" }));
  });
  it("e-mail que não saiu fica escrito na linha do tempo", async () => {
    responder = () => json({ resultado: "convite_enviado", existe: true, email: { enviado: false, motivo: "x" }, link: "https://academy.teste/convite/x" });
    await pedir({ acao: "liberar", gestorNome: "Paula", gestorEmail: "paula@x.com" });
    expect(espias.historico).toHaveBeenCalledWith(expect.objectContaining({ descricao: expect.stringMatching(/o e-mail não saiu/) }));
  });
  it("e-mail inválido é recusado antes de sair daqui", async () => {
    const r = await pedir({ acao: "liberar", gestorNome: "Paula", gestorEmail: "paula@" });
    expect(r.status).toBe(422);
    expect(chamadas).toHaveLength(0);
  });
  it("cliente encerrado não libera", async () => {
    banco.db.clients[0].active = false;
    const r = await pedir({ acao: "liberar", gestorNome: "Paula", gestorEmail: "paula@x.com" });
    expect(r.status).toBe(409);
    expect(chamadas).toHaveLength(0);
  });
});

describe("ciclo de vida acompanha", () => {
  it("encerrar fecha a Academy", async () => {
    responder = () => json({ resultado: "situacao_alterada", existe: true, situacao: "closed" });
    const r = await lifecycle.POST(new NextRequest(`http://x/api/clients/${ID}/lifecycle`, { method: "POST", body: JSON.stringify({ action: "archive", category: "preco" }) }), ctx);
    expect(r.status).toBe(200);
    const pedido = chamadas.find((c) => c.init.method === "POST");
    expect(JSON.parse(String(pedido?.init.body))).toEqual({ acao: "situacao", cliente: { id: ID }, situacao: "closed" });
  });
  it("cliente sem Academy: encerrar segue normal (404 da Academy não é erro)", async () => {
    responder = () => json({ erro: "Este cliente ainda não tem a Lone Academy liberada." }, 404);
    const r = await lifecycle.POST(new NextRequest(`http://x/api/clients/${ID}/lifecycle`, { method: "POST", body: JSON.stringify({ action: "archive", category: "preco" }) }), ctx);
    expect(r.status).toBe(200);
    expect((await r.json()).academy).toBeNull();
  });
  it("reativar só reabre o que estava encerrado", async () => {
    banco.db.clients[0].active = false; banco.db.clients[0].churned_at = "2026-10-01T00:00:00Z";
    responder = (c) => c.init.method === "GET" ? json({ existe: true, situacao: "paused" }) : json({});
    await lifecycle.POST(new NextRequest(`http://x/api/clients/${ID}/lifecycle`, { method: "POST", body: JSON.stringify({ action: "reactivate" }) }), ctx);
    expect(chamadas.filter((c) => c.init.method === "POST")).toHaveLength(0);
  });
  it("regra: só o encerramento fecha (pausa não)", () => {
    expect(situacaoEsperada({ active: true })).toBe("active");
    expect(situacaoEsperada({ active: false })).toBe("closed");
    expect(situacaoEsperada({ active: true, churned_at: "2026-10-01" })).toBe("closed");
  });
});
