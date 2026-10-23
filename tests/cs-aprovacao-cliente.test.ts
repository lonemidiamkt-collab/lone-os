// tests/cs-aprovacao-cliente.test.ts — o "aprovado" do cliente no grupo (auditoria 21/10/2026, 2.4).
//
// O erro original: o inbound marcava o card ENTREGUE mais recente do cliente — em "Revisão interna"
// (o cliente nunca viu) ou arquivado — e o movia para Agendado. E voltar o card não tirava o selo
// "Cliente aprovou". Aqui: só a arte "Com o cliente"; com duas, pergunta; voltar desfaz.

import { describe, it, expect } from "vitest";
import { escolherCardAprovado, textoAprovacaoAmbigua, type CardCandidato } from "@/lib/cs/aprovacao-cliente";
import { camposDaTroca, trocaDesfazAprovacao } from "@/lib/conteudo/producao";

const AGORA = new Date("2026-10-21T15:00:00Z");
const diasAtras = (d: number) => new Date(AGORA.getTime() - d * 86400_000).toISOString();
const card = (p: Partial<CardCandidato> & { id: string }): CardCandidato => ({
  title: `Arte ${p.id}`, status: "client_approval", designerDeliveredAt: diasAtras(1),
  clientApprovedAt: null, archivedAt: null, createdAt: diasAtras(3), ...p,
});

describe("qual arte o cliente aprovou", () => {
  it("o erro original: entregue em Revisão interna NÃO é candidata (o cliente nunca viu)", () => {
    const r = escolherCardAprovado([card({ id: "rev", status: "approval" })], AGORA);
    expect(r.tipo).toBe("nenhum");
  });

  it("o erro original: card arquivado NÃO é candidato", () => {
    const r = escolherCardAprovado([card({ id: "arq", archivedAt: diasAtras(1) })], AGORA);
    expect(r.tipo).toBe("nenhum");
  });

  it("a única arte Com o cliente é a aprovada — mesmo havendo uma entregue mais recente em revisão", () => {
    const r = escolherCardAprovado([
      card({ id: "rev", status: "approval", designerDeliveredAt: diasAtras(0) }),
      card({ id: "cli", status: "client_approval", designerDeliveredAt: diasAtras(2) }),
    ], AGORA);
    expect(r).toMatchObject({ tipo: "marcar", inferirEntrega: false });
    if (r.tipo === "marcar") expect(r.card.id).toBe("cli");
  });

  it("duas artes Com o cliente: pergunta ao time em vez de chutar", () => {
    const r = escolherCardAprovado([card({ id: "a" }), card({ id: "b" })], AGORA);
    expect(r.tipo).toBe("perguntar");
    if (r.tipo === "perguntar") expect(r.cards.map((c) => c.id).sort()).toEqual(["a", "b"]);
  });

  it("já aprovada, agendada ou no ar não entra", () => {
    expect(escolherCardAprovado([card({ id: "x", clientApprovedAt: diasAtras(1) })], AGORA).tipo).toBe("nenhum");
    expect(escolherCardAprovado([card({ id: "y", status: "scheduled" })], AGORA).tipo).toBe("nenhum");
    expect(escolherCardAprovado([card({ id: "z", status: "published" })], AGORA).tipo).toBe("nenhum");
  });

  it("Com o cliente sem entrega marcada: aprova e infere a entrega", () => {
    const r = escolherCardAprovado([card({ id: "c", designerDeliveredAt: null })], AGORA);
    expect(r).toMatchObject({ tipo: "marcar", inferirEntrega: true });
  });

  describe("entrega inferida (designer mandou a arte direto no grupo — Roberto, 02/09)", () => {
    const comDesigner = (p: Partial<CardCandidato> & { id: string }) =>
      card({ status: "in_production", designerDeliveredAt: null, ...p });

    it("um único card recente com o designer: marca e infere a entrega", () => {
      const r = escolherCardAprovado([comDesigner({ id: "d" })], AGORA);
      expect(r).toMatchObject({ tipo: "marcar", inferirEntrega: true });
    });

    it("dois com o designer: não mexe (inferir no card errado é pior)", () => {
      expect(escolherCardAprovado([comDesigner({ id: "d1" }), comDesigner({ id: "d2" })], AGORA).tipo).toBe("nenhum");
    });

    it("velho (mais de 21 dias), devolvido pelo designer ou já entregue: não conta", () => {
      expect(escolherCardAprovado([comDesigner({ id: "v", createdAt: diasAtras(30) })], AGORA).tipo).toBe("nenhum");
      expect(escolherCardAprovado([comDesigner({ id: "b", status: "blocked" })], AGORA).tipo).toBe("nenhum");
    });

    it("se há arte com o cliente, ela vence o card com o designer", () => {
      const r = escolherCardAprovado([comDesigner({ id: "d" }), card({ id: "cli" })], AGORA);
      expect(r.tipo === "marcar" && r.card.id).toBe("cli");
    });
  });

  it("a pergunta ao time lista as artes e diz o que fazer", () => {
    const t = textoAprovacaoAmbigua("Padaria", [{ title: "Promo pão" }, { title: "Story café" }]);
    expect(t).toContain("*Padaria*");
    expect(t).toContain("• Promo pão");
    expect(t).toContain("• Story café");
    expect(t).toMatch(/Não marquei nenhuma/);
  });
});

describe("voltar o card desfaz a aprovação do cliente", () => {
  const AG = "2026-10-21T15:00:00.000Z";

  it("o erro original: de Agendado de volta para Com o cliente, o selo sai", () => {
    const campos = camposDaTroca({ status: "scheduled", clientApprovedAt: "2026-10-21T12:00:00Z" }, "client_approval", "Carlos", AG);
    expect(campos).toMatchObject({ status: "client_approval", clientApprovedAt: null });
  });

  it("para Revisão interna ou antes, o selo sai", () => {
    for (const para of ["approval", "in_production", "ideas"] as const) {
      expect(camposDaTroca({ status: "scheduled", clientApprovedAt: "x" }, para, "C", AG)).toHaveProperty("clientApprovedAt", null);
    }
  });

  it("para a frente (Agendado → No ar) o selo fica", () => {
    expect(camposDaTroca({ status: "scheduled", scheduledAt: "x", clientApprovedAt: "x" }, "published", "C", AG)).not.toHaveProperty("clientApprovedAt");
  });

  it("aprovado pelo portal ainda Com o cliente e indo pra Agendado: fica", () => {
    expect(camposDaTroca({ status: "client_approval", clientApprovedAt: "x" }, "scheduled", "C", AG)).not.toHaveProperty("clientApprovedAt");
  });

  it("sem aprovação, nada a limpar", () => {
    expect(camposDaTroca({ status: "scheduled" }, "approval", "C", AG)).not.toHaveProperty("clientApprovedAt");
  });

  it("a regra", () => {
    expect(trocaDesfazAprovacao("scheduled", "client_approval")).toBe(true);
    expect(trocaDesfazAprovacao("published", "client_approval")).toBe(true);
    expect(trocaDesfazAprovacao("client_approval", "approval")).toBe(true);
    expect(trocaDesfazAprovacao("published", "scheduled")).toBe(false);
    expect(trocaDesfazAprovacao("approval", "client_approval")).toBe(false);
    expect(trocaDesfazAprovacao("client_approval", "scheduled")).toBe(false);
  });
});
