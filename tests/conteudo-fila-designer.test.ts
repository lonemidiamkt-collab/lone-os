// A fila do designer (lib/conteudo/fila-designer.ts): o quadro de produção lido do lado de quem faz a
// arte — colunas pelo estado da arte, não pela etapa do social.
import { describe, it, expect } from "vitest";
import {
  COLUNAS_FILA, acimaDoLimite, agendaDoDesigner, colunaDaFila, contextoDoSocial, faltasNoPedido, formatoDaPeca,
  miniaturaDoItem, montarFila, motivoDasFaltas, resumirFila, rotuloRodada, urgenciaDoPrazo, LIMITE_FAZENDO,
} from "@/lib/conteudo/fila-designer";
import { montarItem } from "@/lib/conteudo/quadro";
import type { CardAttachment, ContentCard, DesignRequest } from "@/lib/types";

const HOJE = "2026-09-24"; // quinta-feira

const card = (p: Partial<ContentCard>): ContentCard =>
  ({ id: "c", title: "Post", clientId: "k1", clientName: "Cliente", socialMedia: "Carlos", status: "in_production", priority: "medium", format: "Post", ...p } as ContentCard);
const pedido = (p: Partial<DesignRequest>): DesignRequest =>
  ({ id: "p", title: "Arte", clientId: "k1", clientName: "Cliente", requestedBy: "Carlos", priority: "medium", status: "queued", format: "Post", briefing: "", ...p } as DesignRequest);
const clientes = [{ id: "k1", assignedDesigner: "Rodrigo" }];
const anexo = (p: Partial<CardAttachment>): CardAttachment =>
  ({ id: "a", card_id: "c", url: "https://x/a.png", path: "a", position: 0, created_at: "2026-09-20", ...p } as CardAttachment);

/** Card + pedido ligados, já como item do quadro. */
function item(c: Partial<ContentCard>, p: Partial<DesignRequest> | null = { status: "queued" }) {
  const id = c.id ?? "c";
  const ped = p ? pedido({ id: `p-${id}`, contentCardId: id, ...p }) : null;
  return montarItem(card({ ...c, id, designRequestId: ped?.id }), ped ? [ped] : [], clientes);
}

describe("em que coluna da fila o card cai", () => {
  it("pelo estado da arte: fila, fazendo, ajuste, entregue", () => {
    expect(colunaDaFila(item({}, { status: "queued" }))).toBe("na_fila");
    expect(colunaDaFila(item({}, { status: "in_progress" }))).toBe("fazendo");
    expect(colunaDaFila(item({ alteracaoPendenteEm: "2026-09-23T10:00:00Z", alteracaoMotivo: "trocar foto" }, { status: "in_progress" }))).toBe("ajustes");
    expect(colunaDaFila(item({ status: "approval", designerDeliveredAt: "2026-09-23T10:00:00Z" }, { status: "done" }))).toBe("entregue");
    expect(colunaDaFila(item({ status: "client_approval", designerDeliveredAt: "2026-09-23T10:00:00Z" }, { status: "done" }))).toBe("entregue");
  });

  it("aprovado: agendado, no ar, ou o cliente já aprovou", () => {
    expect(colunaDaFila(item({ status: "scheduled", designerDeliveredAt: "x" }, { status: "done" }))).toBe("aprovado");
    expect(colunaDaFila(item({ status: "published", designerDeliveredAt: "x" }, { status: "done" }))).toBe("aprovado");
    expect(colunaDaFila(item({ status: "client_approval", designerDeliveredAt: "x", clientApprovedAt: "y" }, { status: "done" }))).toBe("aprovado");
  });

  it("devolvido ao social fica na fila; card sem pedido de arte não é do designer", () => {
    expect(colunaDaFila(item({ status: "blocked", blockedReason: "sem preço" }))).toBe("na_fila");
    expect(colunaDaFila(item({ status: "ideas" }, null))).toBeNull();
  });

  it("as etapas do social viram contexto, não coluna", () => {
    expect(COLUNAS_FILA.map((c) => c.rotulo)).toEqual(["Na fila", "Fazendo", "Ajustes pedidos", "Entregue", "Aprovado / No ar"]);
    expect(contextoDoSocial(item({ status: "client_approval", designerDeliveredAt: "x" }, { status: "done" }))).toBe("Com o cliente");
    expect(contextoDoSocial(item({}))).toBeNull();
  });
});

describe("a fila montada", () => {
  const fila = (itens: ReturnType<typeof item>[]) => Object.fromEntries(montarFila(itens, { hoje: HOJE }).map((c) => [c.id, c]));

  it("na fila: prazo mais perto primeiro, depois prioridade; devolvido vai pro fim", () => {
    const f = fila([
      item({ id: "longe", dueDate: "2026-10-10" }),
      item({ id: "devolvido", status: "blocked", dueDate: "2026-09-20" }),
      item({ id: "perto-media", dueDate: "2026-09-25", priority: "medium" }),
      item({ id: "perto-alta", dueDate: "2026-09-25", priority: "high" }),
      item({ id: "sem-prazo" }),
    ]);
    expect(f.na_fila.itens.map((i: { card: ContentCard }) => i.card.id)).toEqual(["perto-alta", "perto-media", "longe", "sem-prazo", "devolvido"]);
  });

  it("entregue: o mais recente em cima; aprovado e entregue antigos saem, contados", () => {
    const f = fila([
      item({ id: "e-velho", status: "approval", designerDeliveredAt: "2026-09-20T10:00:00Z" }, { status: "done" }),
      item({ id: "e-novo", status: "approval", designerDeliveredAt: "2026-09-23T10:00:00Z" }, { status: "done" }),
      item({ id: "e-mes-passado", status: "approval", designerDeliveredAt: "2026-07-01T10:00:00Z" }, { status: "done" }),
      item({ id: "no-ar-recente", status: "published", designerDeliveredAt: "x", publishVerifiedAt: "2026-09-22T10:00:00Z" }, { status: "done" }),
      item({ id: "no-ar-antigo", status: "published", designerDeliveredAt: "x", publishVerifiedAt: "2026-08-01T10:00:00Z" }, { status: "done" }),
    ]);
    expect(f.entregue.itens.map((i: { card: ContentCard }) => i.card.id)).toEqual(["e-novo", "e-velho"]);
    expect(f.entregue.ocultos).toBe(1);
    expect(f.aprovado.itens.map((i: { card: ContentCard }) => i.card.id)).toEqual(["no-ar-recente"]);
    expect(f.aprovado.ocultos).toBe(1);
  });

  it("card fora do trabalho do designer não entra em coluna nenhuma", () => {
    const f = fila([item({ id: "pauta", status: "ideas" }, null)]);
    expect(Object.values(f).every((c) => (c as { itens: unknown[] }).itens.length === 0)).toBe(true);
  });
});

describe("números da fila", () => {
  it("para hoje = o que ele deve com prazo hoje ou vencido; devolvido não conta como dívida", () => {
    const r = resumirFila([
      item({ id: "a", dueDate: "2026-09-23" }),
      item({ id: "b", dueDate: HOJE }, { status: "in_progress" }),
      item({ id: "c", dueDate: "2026-09-30", alteracaoPendenteEm: "x" }, { status: "in_progress" }),
      item({ id: "d", status: "blocked", dueDate: "2026-09-20" }),
      item({ id: "e", status: "approval", designerDeliveredAt: "x", dueDate: "2026-09-20" }, { status: "done" }),
    ], HOJE);
    expect(r).toEqual({ paraHoje: 2, vencidas: 1, ajustes: 1, naFila: 1, fazendo: 1, devolvidos: 1, devendo: 3 });
  });

  it("limite de WIP por designer", () => {
    expect(acimaDoLimite(LIMITE_FAZENDO)).toBe(false);
    expect(acimaDoLimite(LIMITE_FAZENDO + 1)).toBe(true);
    expect(acimaDoLimite(LIMITE_FAZENDO + 1, 2)).toBe(false);
  });
});

describe("o que o cartão mostra", () => {
  it("prazo do jeito que o designer lê", () => {
    expect(urgenciaDoPrazo("2026-09-22", HOJE)).toMatchObject({ nivel: "vencido", rotulo: "Venceu 22/09" });
    expect(urgenciaDoPrazo(HOJE, HOJE)).toMatchObject({ nivel: "hoje", rotulo: "Hoje" });
    expect(urgenciaDoPrazo("2026-09-25", HOJE)).toMatchObject({ nivel: "amanha", rotulo: "Amanhã" });
    expect(urgenciaDoPrazo("2026-09-26", HOJE)).toMatchObject({ nivel: "semana", rotulo: "sáb 26/09" });
    expect(urgenciaDoPrazo("2026-10-10", HOJE)).toMatchObject({ nivel: "depois", rotulo: "10/10" });
    expect(urgenciaDoPrazo(null, HOJE)).toBeNull();
  });

  it("formato: tipo, medida e lâminas", () => {
    expect(formatoDaPeca("Carrossel 5 lâminas")).toEqual({ rotulo: "Carrossel", medida: "1080×1350", detalhe: "5 lâminas" });
    expect(formatoDaPeca("Story")).toEqual({ rotulo: "Story", medida: "1080×1920", detalhe: null });
    expect(formatoDaPeca("Reels")).toMatchObject({ rotulo: "Reels", medida: "1080×1920" });
    expect(formatoDaPeca("Post Feed 1080x1080")).toMatchObject({ rotulo: "Post", medida: "1080×1080" });
    expect(formatoDaPeca("Banner")).toMatchObject({ rotulo: "Banner", medida: null });
    expect(formatoDaPeca("")).toMatchObject({ rotulo: "Peça", medida: null });
  });

  it("o que falta no pedido, nomeado, e o texto pronto da devolução", () => {
    expect(faltasNoPedido({ briefing: "", formato: "", prazo: null, guidelines: "" })).toEqual(["briefing", "formato", "prazo", "guidelines do cliente"]);
    expect(faltasNoPedido({ briefing: "", briefingDoPedido: "Promo de sexta, preço R$ 19,90", formato: "Post", prazo: HOJE, guidelines: "Azul" })).toEqual([]);
    expect(motivoDasFaltas(["briefing", "formato"])).toBe("Falta no pedido: briefing, formato.");
    expect(motivoDasFaltas([])).toBe("");
  });

  it("miniatura: antes da entrega a referência, depois a versão atual", () => {
    const anexos = [anexo({ id: "ref", url: "https://x/ref.png", tipo: "referencia", position: 0 }), anexo({ id: "v", url: "https://x/v2.png", tipo: "entrega", position: 1 })];
    const it = item({ cardAttachments: anexos });
    expect(miniaturaDoItem(it, "na_fila")).toEqual({ url: "https://x/ref.png", tipo: "referencia" });
    expect(miniaturaDoItem(it, "ajustes")).toEqual({ url: "https://x/v2.png", tipo: "versao" });
    expect(miniaturaDoItem(item({}, { status: "queued", attachments: ["https://x/doc.pdf", "https://x/ia.png"] }), "na_fila")).toEqual({ url: "https://x/ia.png", tipo: "referencia" });
    expect(miniaturaDoItem(item({}), "na_fila")).toBeNull();
  });

  it("rodada de ajuste", () => {
    expect(rotuloRodada(0)).toBeNull();
    expect(rotuloRodada(2)).toBe("2º ajuste");
  });
});

describe("Meu Trabalho › Hoje do designer", () => {
  it("ajustes primeiro, depois o prazo de hoje, depois a fila (fazendo na frente)", () => {
    const a = agendaDoDesigner([
      item({ id: "fila-longe", dueDate: "2026-10-01" }),
      item({ id: "fazendo-longe", dueDate: "2026-10-05" }, { status: "in_progress" }),
      item({ id: "vencida", dueDate: "2026-09-22" }),
      item({ id: "ajuste", dueDate: "2026-09-30", alteracaoPendenteEm: "x" }, { status: "in_progress" }),
      item({ id: "devolvida", status: "blocked" }),
      item({ id: "entregue", status: "approval", designerDeliveredAt: "x" }, { status: "done" }),
    ], HOJE);
    expect(a.ajustes.map((i) => i.card.id)).toEqual(["ajuste"]);
    expect(a.paraHoje.map((i) => i.card.id)).toEqual(["vencida"]);
    expect(a.proximas.map((i) => i.card.id)).toEqual(["fazendo-longe", "fila-longe"]);
    expect(a.devolvidos.map((i) => i.card.id)).toEqual(["devolvida"]);
    expect(a.total).toBe(4);
  });
});
