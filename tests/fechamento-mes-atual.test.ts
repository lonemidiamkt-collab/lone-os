import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// Roberto (11/09/2026): "o mês ainda está em agosto e já estamos no dia 11 de setembro". A tela de
// fechamento começava no mês ANTERIOR de propósito e o atual não existia nem como opção. Durante o
// mês é quando dá pra corrigir a rota; no fechamento já é retrato.
const COMP = readFileSync("components/FechamentoMensal.tsx", "utf8");
const ROTA = readFileSync("app/api/scores/mensal/route.ts", "utf8");

describe("fechamento do mês abre no mês atual", () => {
  it("a lista de meses começa no corrente, não no anterior", () => {
    expect(COMP).toMatch(/new Date\(hoje\.getFullYear\(\), hoje\.getMonth\(\) - i, 15\)/);
    expect(COMP).not.toMatch(/hoje\.getMonth\(\) - 1 - i/);
  });

  it("o mês corrente vem marcado como parcial, para ninguém ler 40% no dia 11 como resultado", () => {
    expect(COMP).toMatch(/emAndamento: i === 0/);
    expect(COMP).toMatch(/parcial — até hoje/);
  });

  it("a rota, sem parâmetro, também responde o mês atual", () => {
    expect(ROTA).toMatch(/new Date\(hoje\.getFullYear\(\), hoje\.getMonth\(\), 15\)/);
    expect(ROTA).not.toMatch(/hoje\.getMonth\(\) - 1, 15/);
  });
});
