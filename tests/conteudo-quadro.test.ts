// O quadro de produção em dados (lib/conteudo/quadro.ts): card + pedido de arte, de quem é, em que
// coluna cai, em que ordem — o mesmo para o Social e o Designer (Leva 5b, D1).
import { describe, it, expect } from "vitest";
import {
  colunasPorCliente, colunasPorDesigner, colunasPorEtapa, lerVista, montarItem, montarItens, passaNoFiltro,
  pedidoDoCard, resumir,
} from "@/lib/conteudo/quadro";
import { SEM_DONO } from "@/lib/design/dono";
import type { ContentCard, DesignRequest } from "@/lib/types";

const card = (p: Partial<ContentCard>): ContentCard =>
  ({ id: "c", title: "Post", clientId: "k1", clientName: "Cliente", socialMedia: "Carlos", status: "ideas", priority: "medium", format: "Post", ...p } as ContentCard);
const pedido = (p: Partial<DesignRequest>): DesignRequest =>
  ({ id: "p", title: "Arte: Post", clientId: "k1", clientName: "Cliente", requestedBy: "Carlos", priority: "medium", status: "queued", format: "Post", briefing: "", ...p } as DesignRequest);
const clientes = [{ id: "k1", assignedDesigner: "Rodrigo" }, { id: "k2", assignedDesigner: null }];

describe("abas e links antigos caem na vista certa", () => {
  it("Board de Produção e Kanbans → Meus; Quadro de Tarefas → Por designer", () => {
    expect(lerVista("kanban")).toBe("meus");
    expect(lerVista("kanbans")).toBe("meus");
    expect(lerVista("requests")).toBe("designer");
    expect(lerVista("unificada")).toBe("cliente");
    expect(lerVista("cliente")).toBe("cliente");
    expect(lerVista("qualquer")).toBeNull();
    expect(lerVista(null)).toBeNull();
  });
});

describe("o pedido do card", () => {
  it("o do vínculo vence; sem vínculo, o aberto mais novo que aponta pro card", () => {
    const ps = [pedido({ id: "velho", contentCardId: "c", status: "done", createdAt: "2026-09-01" }), pedido({ id: "aberto", contentCardId: "c", status: "queued", createdAt: "2026-08-01" })];
    expect(pedidoDoCard(card({ designRequestId: "velho" }), ps)?.id).toBe("velho");
    expect(pedidoDoCard(card({}), ps)?.id).toBe("aberto");
    expect(pedidoDoCard(card({ id: "outro" }), ps)).toBeNull();
  });
});

describe("item do quadro", () => {
  it("dono da arte: quem assumiu o pedido, senão a carteira do cliente", () => {
    expect(montarItem(card({ designRequestId: "p" }), [pedido({ assignedDesigner: "Gabriel" })], clientes).designer).toBe("Gabriel");
    expect(montarItem(card({}), [], clientes).designer).toBe("Rodrigo");
    expect(montarItem(card({ clientId: "k2" }), [], clientes).designer).toBeNull();
  });

  it("prazo da arte: a data de postagem; sem ela, o prazo do pedido", () => {
    expect(montarItem(card({ dueDate: "2026-09-30", designRequestId: "p" }), [pedido({ deadline: "2026-09-20" })], clientes).prazoArte).toBe("2026-09-30");
    expect(montarItem(card({ designRequestId: "p" }), [pedido({ deadline: "2026-09-20" })], clientes).prazoArte).toBe("2026-09-20");
  });

  it("arte nova = entregue, em Revisão interna, sem o social ter conferido", () => {
    expect(montarItem(card({ status: "approval", designerDeliveredAt: "x" }), [], clientes).arteNova).toBe(true);
    expect(montarItem(card({ status: "approval", designerDeliveredAt: "x", socialConfirmedAt: "y" }), [], clientes).arteNova).toBe(false);
  });

  it("arquivado não entra no quadro", () => {
    expect(montarItens([card({ archivedAt: "x" }), card({ id: "b" })], [], clientes).map((i) => i.card.id)).toEqual(["b"]);
  });
});

describe("filtro", () => {
  const itens = montarItens([
    card({ id: "a", socialMedia: "Carlos" }),
    card({ id: "b", socialMedia: "Thiago", clientId: "k2", title: "Promoção de verão" }),
  ], [], clientes);

  it("modo social: dono do card; modo designer: dono da arte (sem dono = quadro sem designer)", () => {
    expect(itens.filter((i) => passaNoFiltro(i, { pessoa: "Carlos", modo: "social" })).map((i) => i.card.id)).toEqual(["a"]);
    expect(itens.filter((i) => passaNoFiltro(i, { pessoa: "Rodrigo", modo: "designer" })).map((i) => i.card.id)).toEqual(["a"]);
    expect(itens.filter((i) => passaNoFiltro(i, { pessoa: SEM_DONO, modo: "designer" })).map((i) => i.card.id)).toEqual(["b"]);
    expect(itens.filter((i) => passaNoFiltro(i, { pessoa: "Todos", modo: "social" }))).toHaveLength(2);
  });

  it("busca sem acento e filtro de cliente", () => {
    expect(itens.filter((i) => passaNoFiltro(i, { pessoa: "Todos", modo: "social", busca: "promocao" })).map((i) => i.card.id)).toEqual(["b"]);
    expect(itens.filter((i) => passaNoFiltro(i, { pessoa: "Todos", modo: "social", clientId: "k1" })).map((i) => i.card.id)).toEqual(["a"]);
  });
});

describe("vistas", () => {
  it("Meus: seis colunas; o que pede ação no topo; No ar só o recente", () => {
    const itens = montarItens([
      card({ id: "fila", status: "in_production", designRequestId: "p1", dueDate: "2026-09-25" }),
      card({ id: "alt", status: "in_production", alteracaoPendenteEm: "x", dueDate: "2026-09-30" }),
      card({ id: "velho", status: "published", statusChangedAt: "2026-08-01T10:00:00Z" }),
      card({ id: "novo", status: "published", statusChangedAt: "2026-09-23T10:00:00Z" }),
    ], [pedido({ id: "p1" })], clientes);
    const cols = colunasPorEtapa(itens, { noArDesde: "2026-09-10" });
    expect(cols.map((c) => c.titulo)).toEqual(["Pauta", "Com o designer", "Revisão interna", "Com o cliente", "Agendado", "No ar"]);
    expect(cols[1].itens.map((i) => i.card.id)).toEqual(["alt", "fila"]);
    expect(cols[5].itens.map((i) => i.card.id)).toEqual(["novo"]);
  });

  it("Por cliente: só quem tem card (ou todos, se pedido)", () => {
    const itens = montarItens([card({ id: "a" })], [], clientes);
    const nomes = [{ id: "k1", nome: "Um" }, { id: "k2", nome: "Dois" }];
    expect(colunasPorCliente(itens, nomes).map((c) => c.titulo)).toEqual(["Um"]);
    expect(colunasPorCliente(itens, nomes, { comVazios: true }).map((c) => c.titulo)).toEqual(["Um", "Dois"]);
  });

  it("Por designer: a fila de cada um; livre aparece vazio; sem dono no fim", () => {
    const itens = montarItens([
      card({ id: "r", status: "in_production" }),
      card({ id: "s", status: "in_production", clientId: "k2" }),
      card({ id: "fora", status: "approval" }),
    ], [], clientes);
    const cols = colunasPorDesigner(itens, ["Rodrigo", "Gabriel"]);
    expect(cols.map((c) => c.id)).toEqual(["Gabriel", "Rodrigo", SEM_DONO]);
    expect(cols.find((c) => c.id === "Rodrigo")!.itens.map((i) => i.card.id)).toEqual(["r"]);
    expect(cols.find((c) => c.id === "Gabriel")!.itens).toHaveLength(0);
  });
});

describe("números do topo", () => {
  it("conta o que o designer deve, alterações, devolvidos e o que espera o social/cliente", () => {
    const itens = montarItens([
      card({ id: "1", status: "in_production", designRequestId: "p1", dueDate: "2026-09-20" }),
      card({ id: "2", status: "in_production", alteracaoPendenteEm: "x", dueDate: "2026-09-30" }),
      card({ id: "3", status: "blocked" }),
      card({ id: "4", status: "approval", designerDeliveredAt: "x" }),
      card({ id: "5", status: "client_approval" }),
    ], [pedido({ id: "p1" })], clientes);
    expect(resumir(itens, "2026-09-24")).toEqual({ comODesigner: 2, alteracoes: 1, bloqueados: 1, paraRevisar: 1, comOCliente: 1, urgentes: 1 });
  });
});
