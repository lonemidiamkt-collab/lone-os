// O plano tem que virar CARD. Medido em 27/07: 7 calendários gerados na vida, zero cards.
// O motor mais caro do sistema produzia um PDF que morria no grupo.
import { describe, it, expect } from "vitest";
import { pediuParaCriar } from "@/lib/cs/plano-em-cards";

describe("pediuParaCriar — o 'ok' que fecha o ciclo", () => {
  it("reconhece o pedido explícito", () => {
    for (const t of ["cria os cards", "pode criar os cards", "abre as demandas",
                     "manda pro board", "sobe os cards pro social"]) {
      expect(pediuParaCriar(t)).toBe(true);
    }
  });

  it("aceita o 'ok' seco logo depois do plano", () => {
    for (const t of ["ok", "isso", "show", "fechou", "perfeito", "pode ser"]) {
      expect(pediuParaCriar(t)).toBe(true);
    }
  });

  it("NÃO confunde frase longa que começa com ok", () => {
    // "ok mas antes muda o gancho do segundo post" não é autorização pra criar tudo.
    expect(pediuParaCriar("ok mas antes muda o gancho do segundo post e o CTA do terceiro")).toBe(false);
  });

  it("verbo sem objeto não conta", () => {
    expect(pediuParaCriar("cria um roteiro pro imperio")).toBe(false);
    expect(pediuParaCriar("manda o relatorio")).toBe(false);
  });

  it("pedir calendário de novo não é 'criar cards'", () => {
    expect(pediuParaCriar("loninho monta o calendario mensal do max")).toBe(false);
  });
});
