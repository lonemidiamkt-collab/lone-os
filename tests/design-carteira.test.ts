// @vitest-environment node
// 25/11/2026: o designer foi posto no cliente e o cliente não aparecia para ele.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { zerar, type Banco } from "./apoio/banco";
import { carteiraDoDesigner, clientesComNomeParecido, comQuem, podePassarJunto } from "@/lib/design/carteira";
import { montarItens, passaNoFiltro } from "@/lib/conteudo/quadro";
import type { ContentCard, DesignRequest } from "@/lib/types";

const { banco, quem } = vi.hoisted(() => ({ banco: {} as Banco, quem: { papel: "admin", email: "chefe@x.com", id: "u" } }));
vi.mock("@/lib/supabase/server", async () => ({ supabaseAdmin: (await import("./apoio/banco")).criarBanco(banco) }));
vi.mock("@/lib/api/require-role", async () => {
  const { NextResponse } = await import("next/server");
  return { GESTAO: ["admin", "manager"], requireRole: async (_: unknown, papeis: string[]) => papeis.includes(quem.papel) ? { user: { id: quem.id, email: quem.email }, papel: quem.papel } : NextResponse.json({ error: "Sem permissão" }, { status: 403 }) };
});
const { GET, POST } = await import("@/app/api/design-requests/passar/route");
const ver = async (id = "c1") => { const r = await GET(new NextRequest(`http://x/api?clientId=${id}`)); return { status: r.status, ...(await r.json()) }; };
const passar = async (corpo: object) => { const r = await POST(new NextRequest("http://x/api", { method: "POST", body: JSON.stringify(corpo) })); return { status: r.status, ...(await r.json()) }; };
const dono = (id: string) => banco.t.design_requests.find((p) => p.id === id)!.assigned_designer;
const pedido = (id: string, status: string, com: string | null, p = {}) => ({ id, client_id: "c1", status, assigned_designer: com, content_card_id: `k${id}`, created_at: "2026-11-01", ...p });
const card = (id: string, p = {}) => ({ id: `k${id}`, title: `Arte ${id}`, client_id: "c1", status: "in_production", archived_at: null, designer_delivered_at: null, alteracao_pendente_em: null, design_request_id: id, ...p });

beforeEach(() => {
  quem.papel = "admin"; quem.email = "chefe@x.com"; quem.id = "u";
  zerar(banco, {
    clients: [{ id: "c1", name: "Padaria Sol", nome_fantasia: null, assigned_designer: "Téo Braga " }, { id: "c2", name: "Sem dono", assigned_designer: null }, { id: "c3", name: "Velho", assigned_designer: "Saiu Daqui" }],
    team_members: [
      { name: "Téo Braga", email: "teo@x.com", role: "designer", is_active: true, deleted_at: null },
      { name: "Caio Lima", email: "caio@x.com", role: "designer", is_active: true, deleted_at: null },
      { name: "Saiu Daqui", email: "saiu@x.com", role: "designer", is_active: false, deleted_at: null },
    ],
    design_requests: [pedido("1", "queued", "Caio Lima"), pedido("2", "in_progress", "Caio Lima"), pedido("3", "queued", "teo braga"), pedido("4", "done", "Caio Lima"), pedido("5", "queued", null), pedido("6", "queued", "Caio Lima"), pedido("7", "queued", "Caio Lima", { client_id: "c2" })],
    content_cards: [card("1"), card("2"), card("3"), card("4", { designer_delivered_at: "2026-11-02" }), card("5"), card("6", { archived_at: "2026-11-03" })],
    notifications: [],
  });
});

describe("a regra", () => {
  const clientes = [{ id: "c1", name: "Padaria Sol", assignedDesigner: "Téo Braga" }, { id: "c2", name: "Academia Lua", assignedDesigner: "teo braga " }, { id: "c3", name: "Outro", assignedDesigner: "Caio Lima" }, { id: "c4", name: "Foi embora", assignedDesigner: "Téo Braga", active: false }];
  const cards = [{ id: "k1", title: "Post", clientId: "c1", status: "in_production", designRequestId: "1" }] as unknown as ContentCard[];
  const pedidos = [{ id: "1", clientId: "c1", status: "queued", assignedDesigner: "Caio Lima", contentCardId: "k1" }] as unknown as DesignRequest[];
  const itens = montarItens(cards, pedidos, clientes);

  it("o bug: trocar o designer do cliente não traz a arte que já estava com outro", () => {
    expect(itens.filter((it) => passaNoFiltro(it, { pessoa: "Téo Braga", modo: "designer" }))).toHaveLength(0);
  });
  it("a carteira mostra o cliente mesmo sem arte, e o que está em outra fila vem primeiro", () => {
    expect(carteiraDoDesigner("Téo Braga", clientes, itens)).toMatchObject([
      { nome: "Padaria Sol", abertas: 0, comOutros: [{ pedidoId: "1", com: "Caio Lima", fazendo: false }] },
      { nome: "Academia Lua", abertas: 0, comOutros: [] },
    ]);
  });
  it("outra grafia: aponta o cliente, e não confunde com outra pessoa da equipe", () => {
    const cs = [{ id: "a", name: "Loja", assignedDesigner: "Teho Braga" }, { id: "b", name: "Bar", assignedDesigner: "Caio Lima" }];
    expect(clientesComNomeParecido("Téo Braga", cs, [{ name: "Téo Braga" }, { name: "Caio Lima" }])).toEqual([]);
    expect(clientesComNomeParecido("Matheus Braga", [{ id: "a", name: "Loja", assignedDesigner: "Mateus" }], [{ name: "Matheus Braga" }])).toEqual([{ nome: "Loja", gravado: "Mateus" }]);
    expect(clientesComNomeParecido("Matheus Braga", [{ id: "a", name: "Loja", assignedDesigner: "Mateus" }], [])).toEqual([]);
  });
  it("quem leva junto e o texto de com quem está", () => {
    expect([podePassarJunto("admin", { fazendo: true }), podePassarJunto("designer", { fazendo: true }), podePassarJunto("designer", { fazendo: false }), podePassarJunto("social", { fazendo: false })]).toEqual([true, false, true, false]);
    expect(comQuem([{ com: "Caio" }, { com: "caio " }, { com: "Ana" }])).toBe("2 com Caio, 1 com Ana");
  });
});

describe("a rota", () => {
  it("conta só o que está aberto e com outra pessoa (nem entregue, nem arquivado, nem sem dono)", async () => {
    expect(await ver()).toMatchObject({ status: 200, para: "Téo Braga", artes: [{ pedidoId: "1", fazendo: false }, { pedidoId: "2", fazendo: true }] });
    expect(await ver("c2")).toMatchObject({ para: null, artes: [] });
    expect((await ver("nada")).status).toBe(404);
  });
  it("gestão passa tudo, com o nome do cadastro da equipe, e avisa os dois", async () => {
    expect(await passar({ clientId: "c1", ids: ["1", "2"] })).toMatchObject({ status: 200, passadas: ["1", "2"], para: "Téo Braga" });
    expect([dono("1"), dono("2"), dono("4"), dono("6"), dono("7")]).toEqual(["Téo Braga", "Téo Braga", "Caio Lima", "Caio Lima", "Caio Lima"]);
    expect(banco.t.notifications.map((n) => n.target_user)).toEqual(["Téo Braga", "Caio Lima"]);
  });
  it("o designer do cliente leva o que ninguém começou; o colega não é atropelado", async () => {
    quem.papel = "designer"; quem.email = "TEO@x.com";
    const r = await passar({ clientId: "c1", ids: ["1", "2"] });
    expect(r).toMatchObject({ passadas: ["1"] });
    expect(r.aviso).toMatch(/já começada ficou com quem está fazendo/);
    expect(dono("2")).toBe("Caio Lima");
    expect(banco.t.notifications.map((n) => n.target_user)).toEqual(["Caio Lima"]);
  });
  it("outro designer, social e quem não é da equipe não passam nada", async () => {
    quem.papel = "designer"; quem.email = "caio@x.com";
    expect((await passar({ clientId: "c1", ids: ["1"] })).status).toBe(403);
    quem.email = "ninguem@x.com";
    expect((await passar({ clientId: "c1", ids: ["1"] })).status).toBe(403);
    quem.papel = "social";
    expect((await passar({ clientId: "c1", ids: ["1"] })).status).toBe(403);
    expect((await ver()).status).toBe(403);
    expect(banco.escritas).toEqual([]);
  });
  it("id de outro cliente, entregue ou repetido não muda", async () => {
    expect(await passar({ clientId: "c1", ids: ["7", "4", "1", "1"] })).toMatchObject({ passadas: ["1"] });
    expect(dono("7")).toBe("Caio Lima");
  });
  it("trocou ou começou no meio: fica como está, e diz", async () => {
    banco.noMeio = { tabela: "design_requests", f: () => { banco.t.design_requests[0].assigned_designer = "Ana"; } };
    const r = await passar({ clientId: "c1", ids: ["1"] });
    expect(r.passadas).toEqual([]);
    expect(r.aviso).toMatch(/mudou no meio/);
    expect(dono("1")).toBe("Ana");
    expect(banco.t.notifications).toEqual([]);
  });
  it("começou no meio: o designer não leva", async () => {
    quem.papel = "designer"; quem.email = "teo@x.com";
    banco.noMeio = { tabela: "design_requests", f: () => { banco.t.design_requests[0].status = "in_progress"; } };
    expect((await passar({ clientId: "c1", ids: ["1"] })).passadas).toEqual([]);
    expect(dono("1")).toBe("Caio Lima");
  });
  it("cliente sem designer, ou com quem saiu da equipe: 409 com o que fazer", async () => {
    expect(await passar({ clientId: "c2", ids: ["7"] })).toMatchObject({ status: 409, error: expect.stringMatching(/sem designer na ficha/) });
    expect(await passar({ clientId: "c3", ids: ["1"] })).toMatchObject({ status: 409, error: expect.stringMatching(/não é designer ativo/) });
  });
  it("leitura ou gravação que falha aparece como falha", async () => {
    banco.falha.add("design_requests");
    expect((await ver()).status).toBe(500);
    expect((await passar({ clientId: "c1", ids: ["1"] })).status).toBe(500);
    banco.falha.clear(); banco.falha.add("update:design_requests");
    expect(await passar({ clientId: "c1", ids: ["1"] })).toMatchObject({ status: 500, error: expect.stringMatching(/Nada mudou/) });
    expect(dono("1")).toBe("Caio Lima");
  });
  it("repetir depois de passar (resposta perdida) não vira 'mudou no meio': já estava", async () => {
    await passar({ clientId: "c1", ids: ["1", "2"] });
    const r = await passar({ clientId: "c1", ids: ["1", "2"] });
    expect(r).toMatchObject({ status: 200, passadas: [], jaEstavam: ["1", "2"], operacao: null });
    expect(r.aviso).toBeUndefined();
  });
  it("a tela dizia outro nome: recusa em vez de passar para quem a pessoa não viu", async () => {
    expect((await passar({ clientId: "c1", ids: ["1"], para: "Ana" })).status).toBe(409);
    expect(dono("1")).toBe("Caio Lima");
    expect((await passar({ clientId: "c1", ids: ["1"], para: "teo braga" })).status).toBe(200);
  });
  it("Desfazer devolve a quem estava, avisa, e vale uma vez", async () => {
    const { operacao } = await passar({ clientId: "c1", ids: ["1", "2"] });
    banco.t.notifications = [];
    expect((await passar({ desfazer: operacao })).voltaram.map((v: { id: string }) => v.id)).toEqual(["1", "2"]);
    expect([dono("1"), dono("2")]).toEqual(["Caio Lima", "Caio Lima"]);
    expect(banco.t.notifications).toMatchObject([{ target_user: "Caio Lima", title: "2 artes voltaram para você" }]);
    expect((await passar({ desfazer: operacao })).status).toBe(410);
  });
  it("Desfazer não mexe no que mudou depois, nem serve a outra pessoa, nem com id inventado", async () => {
    const { operacao } = await passar({ clientId: "c1", ids: ["1", "2"] });
    quem.id = "outro";
    expect((await passar({ desfazer: operacao })).status).toBe(410);
    quem.id = "u";
    expect((await passar({ desfazer: "inventado" })).status).toBe(410);
    banco.t.design_requests[1].assigned_designer = "Ana";
    const r = await passar({ desfazer: operacao });
    expect(r.voltaram).toEqual([{ id: "1", para: "Caio Lima" }]);
    expect(r.aviso).toMatch(/1 arte já mudou de novo/);
    expect(dono("2")).toBe("Ana");
  });
  it("Desfazer que falha diz e pode ser tentado de novo", async () => {
    const { operacao } = await passar({ clientId: "c1", ids: ["1"] });
    banco.falha.add("update:design_requests");
    expect((await passar({ desfazer: operacao })).status).toBe(500);
    banco.falha.clear();
    expect((await passar({ desfazer: operacao })).voltaram).toHaveLength(1);
  });
  it("vínculo com pedido entregue: a tela e a rota concordam que não há o que passar", async () => {
    banco.t.design_requests.push(pedido("9", "queued", "Caio Lima", { content_card_id: "k4" }));
    expect((await ver()).artes.map((a: { pedidoId: string }) => a.pedidoId)).toEqual(["1", "2"]);
    banco.t.content_cards[3].alteracao_pendente_em = "2026-11-20";
    expect((await ver()).artes.map((a: { pedidoId: string }) => a.pedidoId)).toEqual(["1", "2"]);
  });
  it("pedido sem cliente ou sem artes é 400", async () => {
    expect((await passar({ clientId: "c1", ids: [] })).status).toBe(400);
    expect((await passar({ ids: ["1"] })).status).toBe(400);
  });
});
