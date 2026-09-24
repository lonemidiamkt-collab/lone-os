// A etapa de design mora no card (lib/conteudo/producao.ts) — Leva 5b, D2. Uma função decide o que
// muda no card e no pedido de arte; este teste cobre cada transição e o arraste no quadro.
import { describe, it, expect } from "vitest";
import {
  camposDaTroca, designerDeve, estadoDoDesign, lerAcao, papelPode, planejarMovimento, planejarTransicao,
  type AcaoDesign, type CardDesign, type PedidoDesign, type ResultadoPlano,
} from "@/lib/conteudo/producao";

const AGORA = "2026-09-24T15:00:00.000Z";
const card = (p: Partial<CardDesign> = {}): CardDesign => ({ id: "c1", status: "ideas", dueDate: "2026-09-26", ...p });
const pedido = (status: PedidoDesign["status"]): PedidoDesign => ({ id: "p1", status });

function ok(r: ResultadoPlano) {
  if (!r.ok) throw new Error(`esperava plano, veio recusa: ${r.erro}`);
  return r.plano;
}
const plano = (a: AcaoDesign, c: CardDesign, p: PedidoDesign | null) => ok(planejarTransicao(a, c, p, AGORA));

describe("onde a arte está (estadoDoDesign)", () => {
  it("lê o card primeiro, depois o pedido", () => {
    expect(estadoDoDesign({ status: "blocked" }, pedido("queued"))).toBe("bloqueado");
    expect(estadoDoDesign({ status: "in_production", alteracaoPendenteEm: AGORA }, pedido("in_progress"))).toBe("alteracao");
    expect(estadoDoDesign({ status: "approval", designerDeliveredAt: AGORA }, pedido("done"))).toBe("entregue");
    expect(estadoDoDesign({ status: "in_production" }, pedido("in_progress"))).toBe("em_andamento");
    expect(estadoDoDesign({ status: "in_production" }, pedido("queued"))).toBe("na_fila");
    expect(estadoDoDesign({ status: "ideas" }, null)).toBe("sem_pedido");
  });

  it("pedido concluído sem data de entrega no card (legado) conta como entregue", () => {
    expect(estadoDoDesign({ status: "in_production" }, pedido("done"))).toBe("entregue");
  });

  it("o designer deve: fila, andamento e alteração — devolvido espera o social", () => {
    expect(designerDeve("na_fila")).toBe(true);
    expect(designerDeve("em_andamento")).toBe(true);
    expect(designerDeve("alteracao")).toBe(true);
    expect(designerDeve("bloqueado")).toBe(false);
    expect(designerDeve("entregue")).toBe(false);
  });
});

describe("pedir arte", () => {
  it("sem pedido: abre o pedido na fila e leva o card pra Com o designer", () => {
    const p = plano({ tipo: "pedir_arte" }, card({ columnEnteredAt: { ideas: "x" } }), null);
    expect(p.pedido).toEqual({ criar: true, status: "queued" });
    expect(p.card).toMatchObject({ status: "in_production", status_changed_at: AGORA });
    expect(p.card.column_entered_at).toEqual({ ideas: "x", in_production: AGORA });
  });

  it("clique repetido com pedido aberto: não abre outro", () => {
    const p = plano({ tipo: "pedir_arte" }, card({ status: "in_production" }), pedido("queued"));
    expect(p.pedido).toBeNull();
    expect(p.semEfeito).toBe(true);
  });

  it("card legado em Pauta com pedido aberto: só anda a etapa", () => {
    const p = plano({ tipo: "pedir_arte" }, card({ status: "ideas" }), pedido("in_progress"));
    expect(p.pedido).toBeNull();
    expect(p.card.status).toBe("in_production");
  });

  it("card devolvido: pedir de novo desbloqueia", () => {
    const p = plano({ tipo: "pedir_arte" }, card({ status: "blocked" }), pedido("queued"));
    expect(p.card).toMatchObject({ status: "in_production", blocked_reason: null, blocked_by: null, blocked_at: null });
  });

  it("arte já entregue: recusa — o caminho é pedir alteração", () => {
    const r = planejarTransicao({ tipo: "pedir_arte" }, card({ status: "approval", designerDeliveredAt: AGORA }), pedido("done"), AGORA);
    expect(r).toMatchObject({ ok: false, status: 409 });
  });

  it("pedido concluído sem entrega no card (legado): reabre em vez de abrir um segundo", () => {
    const p = plano({ tipo: "pedir_arte" }, card({ status: "ideas" }), pedido("done"));
    expect(p.pedido).toEqual({ status: "queued" });
  });

  it("card arquivado não mexe", () => {
    expect(planejarTransicao({ tipo: "pedir_arte" }, card({ archivedAt: AGORA }), null, AGORA)).toMatchObject({ ok: false, status: 409 });
  });
});

describe("designer pega (iniciar)", () => {
  it("fila → em andamento; o card fica em Com o designer", () => {
    const p = plano({ tipo: "iniciar" }, card({ status: "in_production" }), pedido("queued"));
    expect(p.pedido).toEqual({ status: "in_progress" });
    expect(p.card).toEqual({});
  });

  it("já em andamento: sem efeito", () => {
    expect(plano({ tipo: "iniciar" }, card({ status: "in_production" }), pedido("in_progress")).semEfeito).toBe(true);
  });

  it("sem pedido ou já entregue: recusa", () => {
    expect(planejarTransicao({ tipo: "iniciar" }, card(), null, AGORA)).toMatchObject({ ok: false, status: 409 });
    expect(planejarTransicao({ tipo: "iniciar" }, card(), pedido("done"), AGORA)).toMatchObject({ ok: false, status: 409 });
  });
});

describe("entrega", () => {
  it("pedido concluído + card em Revisão interna com a data de entrega", () => {
    const p = plano({ tipo: "entregue", quem: "Rodrigo" }, card({ status: "in_production" }), pedido("in_progress"));
    expect(p.pedido).toEqual({ status: "done" });
    expect(p.card).toMatchObject({ status: "approval", designer_delivered_at: AGORA, designer_delivered_by: "Rodrigo" });
  });

  it("depois da transação de entrega (data já gravada): só anda a etapa e não mexe no pedido concluído", () => {
    const p = plano({ tipo: "entregue" }, card({ status: "in_production", designerDeliveredAt: "2026-09-24T14:00:00Z" }), pedido("done"));
    expect(p.pedido).toBeNull();
    expect(p.card).toEqual({ status: "approval", status_changed_at: AGORA, column_entered_at: { approval: AGORA } });
  });

  it("zera a alteração pendente", () => {
    const p = plano({ tipo: "entregue" }, card({ status: "in_production", alteracaoPendenteEm: "x" }), pedido("in_progress"));
    expect(p.card).toMatchObject({ alteracao_pendente_em: null, alteracao_motivo: null });
  });

  it("card que o time já levou adiante (agendado) não volta pra revisão", () => {
    const p = plano({ tipo: "entregue" }, card({ status: "scheduled" }), pedido("queued"));
    expect(p.card.status).toBeUndefined();
    expect(p.card.designer_delivered_at).toBe(AGORA);
    expect(p.pedido).toEqual({ status: "done" });
  });

  it("entrega de card devolvido limpa o bloqueio", () => {
    const p = plano({ tipo: "entregue" }, card({ status: "blocked" }), pedido("queued"));
    expect(p.card).toMatchObject({ status: "approval", blocked_reason: null });
  });
});

describe("pedir alteração", () => {
  it("volta pra Com o designer, grava o motivo, a entrega anterior deixa de valer e o pedido reabre", () => {
    const p = plano({ tipo: "pedir_alteracao", motivo: "  preço errado  " },
      card({ status: "client_approval", designerDeliveredAt: "x" }), pedido("done"));
    expect(p.pedido).toEqual({ status: "in_progress" });
    expect(p.card).toMatchObject({
      status: "in_production", alteracao_pendente_em: AGORA, alteracao_motivo: "preço errado",
      designer_delivered_at: null, designer_delivered_by: null, social_confirmed_at: null, client_approved_at: null,
    });
  });

  it("sem pedido nenhum (arte feita por fora): abre um", () => {
    expect(plano({ tipo: "pedir_alteracao", motivo: "x" }, card({ status: "approval" }), null).pedido).toEqual({ criar: true, status: "queued" });
  });

  it("pedido ainda aberto: não muda o status do pedido", () => {
    expect(plano({ tipo: "pedir_alteracao", motivo: "x" }, card({ status: "in_production" }), pedido("queued")).pedido).toBeNull();
  });

  it("sem motivo: recusa (o designer precisa saber o que mudar)", () => {
    expect(planejarTransicao({ tipo: "pedir_alteracao", motivo: "   " }, card(), null, AGORA)).toMatchObject({ ok: false, status: 400 });
  });
});

describe("devolver ao social (bloquear) e desbloquear", () => {
  it("devolve com motivo e quem", () => {
    const p = plano({ tipo: "bloquear", motivo: "falta o preço", quem: "Rodrigo" }, card({ status: "in_production" }), pedido("queued"));
    expect(p.card).toMatchObject({ status: "blocked", blocked_reason: "falta o preço", blocked_by: "Rodrigo", blocked_at: AGORA });
    expect(p.pedido).toBeNull();
  });

  it("não devolve card que já passou do designer", () => {
    expect(planejarTransicao({ tipo: "bloquear", motivo: "x" }, card({ status: "approval" }), null, AGORA)).toMatchObject({ ok: false, status: 409 });
  });

  it("desbloquear volta pra fila; card não bloqueado: sem efeito", () => {
    expect(plano({ tipo: "desbloquear" }, card({ status: "blocked" }), pedido("queued")).card).toMatchObject({ status: "in_production", blocked_reason: null });
    expect(plano({ tipo: "desbloquear" }, card({ status: "in_production" }), pedido("queued")).semEfeito).toBe(true);
  });
});

describe("cancelar o pedido (gestão)", () => {
  it("apaga o pedido aberto e o card volta pra Pauta sem vínculo", () => {
    const p = plano({ tipo: "cancelar_pedido" }, card({ status: "in_production", designRequestId: "p1" }), pedido("queued"));
    expect(p.pedido).toEqual({ apagar: true });
    expect(p.card).toMatchObject({ status: "ideas", design_request_id: null });
  });

  it("pedido entregue não se cancela", () => {
    expect(planejarTransicao({ tipo: "cancelar_pedido" }, card(), pedido("done"), AGORA)).toMatchObject({ ok: false, status: 409 });
  });
});

describe("quem pode", () => {
  it("social pede arte e alteração; designer pega, entrega e devolve; só a gestão cancela", () => {
    expect(papelPode("social", "pedir_arte")).toBe(true);
    expect(papelPode("social", "pedir_alteracao")).toBe(true);
    expect(papelPode("social", "iniciar")).toBe(false);
    expect(papelPode("designer", "iniciar")).toBe(true);
    expect(papelPode("designer", "bloquear")).toBe(true);
    expect(papelPode("designer", "pedir_alteracao")).toBe(false);
    expect(papelPode("social", "cancelar_pedido")).toBe(false);
    expect(papelPode("manager", "cancelar_pedido")).toBe(true);
    expect(papelPode("comercial", "pedir_arte")).toBe(false);
    expect(papelPode(null, "pedir_arte")).toBe(false);
  });

  it("lê a ação do corpo e recusa o que não conhece", () => {
    expect(lerAcao({ tipo: "pedir_alteracao", motivo: "x" })).toEqual({ tipo: "pedir_alteracao", motivo: "x" });
    expect(lerAcao({ tipo: "apagar_tudo" })).toBeNull();
    expect(lerAcao(null)).toBeNull();
  });
});

describe("o arraste no quadro (planejarMovimento)", () => {
  const mov = (c: CardDesign, p: PedidoDesign | null, destino: Parameters<typeof planejarMovimento>[2], papel = "social") =>
    planejarMovimento(c, p, destino, papel);

  it("mesma etapa: nada (ideia ↔ roteiro são a mesma Pauta)", () => {
    expect(mov(card({ status: "script" }), null, "pauta")).toEqual({ tipo: "nada" });
  });

  it("Pauta → Com o designer = pedir arte; sem data de postagem, recusa", () => {
    expect(mov(card(), null, "com_designer")).toEqual({ tipo: "design", acao: { tipo: "pedir_arte" } });
    expect(mov(card({ dueDate: null }), null, "com_designer").tipo).toBe("recusar");
  });

  it("de volta pra Com o designer = pedir alteração (abre o modal do motivo)", () => {
    expect(mov(card({ status: "client_approval", designerDeliveredAt: AGORA }), pedido("done"), "com_designer")).toEqual({ tipo: "alteracao" });
  });

  it("sair de Com o designer sem arte: social é recusado, gestão abre a entrega", () => {
    const c = card({ status: "in_production" });
    expect(mov(c, pedido("in_progress"), "revisao").tipo).toBe("recusar");
    expect(mov(c, pedido("in_progress"), "agendado").tipo).toBe("recusar");
    expect(mov(c, pedido("in_progress"), "revisao", "admin")).toEqual({ tipo: "entregar" });
  });

  it("sair de Com o designer COM a arte entregue: troca simples", () => {
    expect(mov(card({ status: "in_production", designerDeliveredAt: AGORA }), pedido("done"), "revisao")).toEqual({ tipo: "status", status: "approval" });
  });

  it("Com o designer sem pedido (legado): anda livre", () => {
    expect(mov(card({ status: "in_production" }), null, "revisao")).toEqual({ tipo: "status", status: "approval" });
  });

  it("tirar do designer um pedido aberto: só a gestão (cancela o pedido)", () => {
    const c = card({ status: "in_production" });
    expect(mov(c, pedido("queued"), "pauta").tipo).toBe("recusar");
    expect(mov(c, pedido("queued"), "pauta", "manager")).toEqual({ tipo: "design", acao: { tipo: "cancelar_pedido" } });
  });

  it("da revisão em diante: troca simples", () => {
    expect(mov(card({ status: "approval" }), pedido("done"), "com_cliente")).toEqual({ tipo: "status", status: "client_approval" });
    expect(mov(card({ status: "scheduled" }), pedido("done"), "no_ar")).toEqual({ tipo: "status", status: "published" });
  });

  it("o designer: puxa da Pauta e entrega; o resto é do social", () => {
    expect(mov(card(), null, "com_designer", "designer")).toEqual({ tipo: "design", acao: { tipo: "pedir_arte" } });
    expect(mov(card({ status: "in_production" }), pedido("in_progress"), "revisao", "designer")).toEqual({ tipo: "entregar" });
    expect(mov(card({ status: "approval" }), pedido("done"), "com_cliente", "designer").tipo).toBe("recusar");
    expect(mov(card({ status: "approval" }), pedido("done"), "com_designer", "designer").tipo).toBe("recusar");
  });

  it("card arquivado não se move", () => {
    expect(mov(card({ archivedAt: AGORA }), null, "revisao").tipo).toBe("recusar");
  });
});

describe("campos de uma troca simples de etapa", () => {
  it("sair da Revisão pra frente confirma a arte; agendar carimba a data; no ar marca quem conferiu", () => {
    const base = { status: "approval" as const, designerDeliveredAt: "x", columnEnteredAt: { approval: "y" } };
    expect(camposDaTroca(base, "client_approval", "Carlos", AGORA)).toMatchObject({
      status: "client_approval", socialConfirmedAt: AGORA, socialConfirmedBy: "Carlos",
      columnEnteredAt: { approval: "y", client_approval: AGORA },
    });
    expect(camposDaTroca({ status: "client_approval" }, "scheduled", "Carlos", AGORA)).toMatchObject({ scheduledAt: AGORA });
    expect(camposDaTroca({ status: "scheduled", scheduledAt: "antes" }, "published", "Carlos", AGORA)).toMatchObject({ publishVerifiedAt: AGORA, publishVerifiedBy: "Carlos" });
    expect(camposDaTroca({ status: "scheduled", scheduledAt: "antes" }, "published", "Carlos", AGORA)).not.toHaveProperty("scheduledAt");
  });

  it("não reconfirma arte já confirmada, e tirar do bloqueio limpa o motivo", () => {
    expect(camposDaTroca({ status: "approval", designerDeliveredAt: "x", socialConfirmedAt: "z" }, "client_approval", "C", AGORA)).not.toHaveProperty("socialConfirmedAt");
    expect(camposDaTroca({ status: "blocked" }, "ideas", "C", AGORA)).toMatchObject({ blockedReason: null, blockedBy: null, blockedAt: null });
  });
});
