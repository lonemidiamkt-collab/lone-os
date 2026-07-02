// Teste OFFLINE da pauta semanal proativa — helpers puros (datas, serialização, formatação).
import { describe, it, expect } from "vitest";
import { datasProximaSemana, serializePauta, parsePautaItens, formatPauta, buildPautaSugestao, labelDia } from "@/lib/cs/pauta";

describe("datasProximaSemana", () => {
  it("de uma quinta → seg/qua/sex da semana seguinte", () => {
    // 2026-07-02 é quinta; próxima segunda = 06/07 → [06, 08, 10].
    const { datas } = datasProximaSemana(new Date("2026-07-02T12:00:00"));
    expect(datas).toEqual(["2026-07-06", "2026-07-08", "2026-07-10"]);
  });
  it("de uma segunda → a PRÓXIMA segunda (não a atual)", () => {
    const { datas } = datasProximaSemana(new Date("2026-07-06T12:00:00"));
    expect(datas[0]).toBe("2026-07-13");
  });
});

describe("serialize/parse pauta", () => {
  const itens = [
    { dia: "2026-07-06", titulo: "Post — dica de piso", descricao: "Mostrar 3 erros comuns.", formato: "Carrossel" },
    { dia: "2026-07-10", titulo: "Reels — bastidor", descricao: "Time no showroom.", formato: "Reels" },
  ];
  it("roundtrip", () => {
    expect(parsePautaItens(serializePauta("2026-07-06", itens))).toEqual(itens);
  });
  it("texto que não é pauta → null (msg comum de cliente não vira card em lote)", () => {
    expect(parsePautaItens("preciso de uma arte pra amanhã")).toBeNull();
    expect(parsePautaItens('{"itens": []}')).toBeNull();
  });
});

describe("formatação", () => {
  it("labelDia em pt-BR", () => {
    expect(labelDia("2026-07-06")).toBe("segunda 06/07");
  });
  it("sugestão nomeia o responsável, o cliente e a quantidade de cards", () => {
    const msg = buildPautaSugestao("Carlos", "Império dos Pisos", [
      { dia: "2026-07-06", titulo: "Post — dica", descricao: "x", formato: "Post" },
      { dia: "2026-07-08", titulo: "Reels — tour", descricao: "y", formato: "Reels" },
    ]);
    expect(msg).toContain("Carlos");
    expect(msg).toContain("*Império dos Pisos*");
    expect(msg).toContain("os 2 cards");
    expect(formatPauta([{ dia: "2026-07-08", titulo: "T", descricao: "D", formato: "F" }])).toContain("quarta 08/07");
  });
});
