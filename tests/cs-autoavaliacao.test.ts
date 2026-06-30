import { describe, it, expect } from "vitest";
import { computeAutoavaliacao, formatAutoavaliacao } from "@/lib/cs/autoavaliacao";

describe("computeAutoavaliacao", () => {
  const demandas = [
    { tipo: "arte_nova", status: "confirmada", cliente_nome: "A" },
    { tipo: "arte_nova", status: "confirmada", cliente_nome: "B" },
    { tipo: "arte_nova", status: "confirmada", cliente_nome: "C" },
    { tipo: "cobranca_prazo", status: "descartada", cliente_nome: "Madeireira" },
    { tipo: "cobranca_prazo", status: "descartada", cliente_nome: "Madeireira" },
    { tipo: "duvida", status: "pendente", cliente_nome: "D" },
  ];
  const s = computeAutoavaliacao(demandas);

  it("conta aprovadas/recusadas/pendentes", () => {
    expect(s.total).toBe(6);
    expect(s.aprovadas).toBe(3);
    expect(s.recusadas).toBe(2);
    expect(s.pendentes).toBe(1);
  });
  it("taxa de acerto = 3/5 = 60% e falso positivo 40%", () => {
    expect(s.taxaAprovacao).toBe(60);
    expect(s.taxaFalsoPositivo).toBe(40);
  });
  it("detecta erro recorrente por tipo e por cliente (>=2)", () => {
    expect(s.recorrentesTipo).toEqual([{ tipo: "cobranca_prazo", recusas: 2 }]);
    expect(s.recorrentesCliente).toEqual([{ cliente: "Madeireira", recusas: 2 }]);
  });
  it("formata o relatório com os números", () => {
    const txt = formatAutoavaliacao(s, "01/06 a 07/06");
    expect(txt).toContain("60%");
    expect(txt).toContain("cobranca_prazo");
  });
  it("lista vazia → sem dados", () => {
    expect(computeAutoavaliacao([]).total).toBe(0);
    expect(formatAutoavaliacao(computeAutoavaliacao([]), "x")).toContain("Nenhuma sugestão");
  });
});
