import { describe, it, expect } from "vitest";
import { apenasNovos, chaveNome, montarTexto } from "@/lib/clients/produtos-do-briefing";

describe("produtos do briefing — só o que falta, sem duplicar", () => {
  it("compara por nome normalizado (acento, caixa, pontuação) e tira duplicata interna", () => {
    const out = apenasNovos([
      { nome: "Tinta Suvinil 18L", categoria: "tintas", marca: "Suvinil", preco: null, descricao: null },
      { nome: "tinta suvinil 18l", categoria: null, marca: null, preco: null, descricao: null },
      { nome: "Massa Corrida", categoria: "massas", marca: null, preco: 49.9, descricao: null },
      { nome: "PÓ", categoria: null, marca: null, preco: null, descricao: null }, // curto demais
    ], ["Massa corrida"]);
    expect(out.map((p) => p.nome)).toEqual(["Tinta Suvinil 18L"]);
    expect(chaveNome("Porcelanato 60×60 — Portinari")).toBe("porcelanato 60 60 portinari");
  });
  it("monta o texto só com o que existe e limita o tamanho", () => {
    const t = montarTexto({ resumo: "Loja de tintas", produtosBriefing: ["Suvinil", "Coral"], fixo: null, campanha: "", regras: ["Sempre mostrar R$ do kit"] });
    expect(t).toContain("Resumo estratégico: Loja de tintas");
    expect(t).toContain("Produtos citados no briefing: Suvinil; Coral");
    expect(t).not.toContain("Briefing fixo");
    expect(t).toContain("Regras/observações ativas: Sempre mostrar R$ do kit");
    expect(montarTexto({ resumo: "x".repeat(20_000) }).length).toBeLessThanOrEqual(9000);
  });
});
