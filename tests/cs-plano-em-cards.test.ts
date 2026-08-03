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

// Como o time REALMENTE aprova o calendário (Roberto, 03/08): "o planejamento do cliente X está
// aprovado". Antes só o imperativo funcionava ("cria os cards"), então a aprovação do mensal não
// virava nada e alguém abria card a card na mão.
describe("aprovação de planejamento vira card", () => {
  it("entende a frase do dia a dia", () => {
    expect(pediuParaCriar("Lone, o planejamento do Bazar Ribeiro está aprovado")).toBe(true);
    expect(pediuParaCriar("o calendário do mês da Dijana foi aprovado pelo cliente")).toBe(true);
    expect(pediuParaCriar("aprovei a linha editorial do Quero Tintas")).toBe(true);
    expect(pediuParaCriar("o quinzenal do Portuga tá ok, pode seguir")).toBe(true);
  });

  it("continua entendendo o jeito antigo", () => {
    expect(pediuParaCriar("cria os cards")).toBe(true);
    expect(pediuParaCriar("ok")).toBe(true);
  });

  it("NÃO dispara com aprovação de outra coisa — card errado no board é retrabalho", () => {
    // "aprovado" sozinho pode ser sobre a ARTE, não sobre o planejamento.
    expect(pediuParaCriar("a arte do Bazar foi aprovada pelo cliente")).toBe(false);
    expect(pediuParaCriar("o orçamento está aprovado")).toBe(false);
    expect(pediuParaCriar("o cliente aprovou o post de ontem")).toBe(false);
  });
});
