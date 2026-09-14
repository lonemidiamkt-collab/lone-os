import { describe, it, expect } from "vitest";
import { ranquear, pontuar, reconciliar, paraPessoa, fingerprintDe, exposicaoNormalizada, valido } from "@/lib/priority/motor";
import type { ItemBruto } from "@/lib/priority/tipos";

// Fase 1 — o ranking é função pura: a ordem tem que ser explicável e estável.

const base = (x: Partial<ItemBruto>): ItemBruto => ({
  fonte: "producao", clientId: "c1", cliente: "Quero Tintas", entityRef: null, motivo: "x", titulo: "t",
  fato: ["fato com número 3"], recomendacao: "faça", severidade: 50, urgencia: 50, confianca: 0.9, exposicaoRs: null,
  reversivel: true, ownerRole: "social", owner: "Carlos Augusto", nivelPolicy: "C", ...x,
});
const ctx = { importanciaCliente: { c1: 70, c2: 95 } };

describe("motor de prioridade", () => {
  it("dinheiro saindo hoje, irreversível, cliente em risco: sobe; ajuste reversível e barato: desce", () => {
    const r = ranquear([
      base({ motivo: "b", cliente: "B", severidade: 60, urgencia: 40, reversivel: true }),
      base({ motivo: "a", cliente: "A", clientId: "c2", severidade: 60, urgencia: 40, exposicaoRs: 300, reversivel: false }),
    ], ctx);
    expect(r.map((x) => x.cliente)).toEqual(["A", "B"]);
    expect(r[0].explicacaoScore).toMatchObject({ exposicao: expect.any(Number), irreversibilidade: 100, importancia: 95 });
  });

  it("confiança baixa derruba o score na proporção", () => {
    const alto = pontuar(base({ confianca: 1 }), ctx).score;
    const baixo = pontuar(base({ confianca: 0.5 }), ctx).score;
    expect(baixo).toBeCloseTo(alto / 2, 0);
  });

  it("exposição em escala log: R$10≈33, R$100≈67, R$1000=100", () => {
    expect(exposicaoNormalizada(10)).toBe(33);
    expect(exposicaoNormalizada(100)).toBe(67);
    expect(exposicaoNormalizada(1000)).toBe(100);
    expect(exposicaoNormalizada(0)).toBe(0);
  });

  it("sem fato não entra; mesma coisa duas vezes na rodada entra uma", () => {
    const r = ranquear([base({ fato: [] }), base({ motivo: "dup" }), base({ motivo: "dup" })], ctx);
    expect(r).toHaveLength(1);
    expect(valido(base({ recomendacao: " " }))).toBe(false);
  });

  it("fingerprint identifica a coisa, não a rodada", () => {
    expect(fingerprintDe({ fonte: "trafego", clientId: "c1", entityRef: null, motivo: "cpl_acima" })).toBe("trafego|c1|-|cpl_acima");
  });

  it("reconciliar: aberta+na rodada atualiza; só na rodada insere; só aberta resolve", () => {
    const novas = ranquear([base({ motivo: "fica" }), base({ motivo: "nova" })], ctx);
    const abertas = [{ id: "1", fingerprint: fingerprintDe(base({ motivo: "fica" })) }, { id: "2", fingerprint: fingerprintDe(base({ motivo: "sumiu" })) }];
    const r = reconciliar(abertas, novas);
    expect(r.atualizar.map((a) => a.id)).toEqual(["1"]);
    expect(r.inserir.map((n) => n.motivo)).toEqual(["nova"]);
    expect(r.resolver).toEqual(["2"]);
  });

  it("lista da pessoa: pelo nome, ou pelo papel quando ninguém foi nomeado", () => {
    const recs = ranquear([
      base({ motivo: "1", owner: "Carlos Augusto", ownerRole: "social" }),
      base({ motivo: "2", owner: null, ownerRole: "social" }),
      base({ motivo: "3", owner: "Thiago", ownerRole: "social" }),
      base({ motivo: "4", owner: null, ownerRole: "manager" }),
    ], ctx);
    expect(paraPessoa(recs, { nome: "carlos augusto", papel: "social" }).map((r) => r.motivo).sort()).toEqual(["1", "2"]);
    expect(paraPessoa(recs, { nome: "Julio", papel: "manager" }).map((r) => r.motivo)).toEqual(["4"]);
  });
});
