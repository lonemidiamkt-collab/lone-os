// tests/vigia-entrega.test.ts — Leva 7A (N1): conta ativa que vinha gastando e não gastou nada hoje.

import { describe, it, expect } from "vitest";
import { quemVigiar, gastouHoje, textoVigia, type ContaParaVigiar } from "@/lib/defense/vigia-entrega";

const conta = (o: Partial<ContaParaVigiar> = {}): ContaParaVigiar => ({
  clientId: "a", nome: "Loja A", gestor: "Julio", metaAccountId: "act_1", status: 1, media3d: 120, oculta: false, visto: false, ...o,
});

describe("vigia de entrega", () => {
  it("só conta ativa, visível, sem visto e que vinha gastando", () => {
    expect(quemVigiar([conta()])).toHaveLength(1);
    expect(quemVigiar([conta({ status: 3 })])).toHaveLength(0);          // pagamento falhou: outro alerta
    expect(quemVigiar([conta({ oculta: true })])).toHaveLength(0);
    expect(quemVigiar([conta({ visto: true })])).toHaveLength(0);
    expect(quemVigiar([conta({ media3d: 0 })])).toHaveLength(0);         // já parada há dias: o Hoje mostra
    expect(quemVigiar([conta({ media3d: null })])).toHaveLength(0);
  });

  it("sem linha de hoje na Meta é gasto zero; linha com gasto não é", () => {
    expect(gastouHoje(null)).toBe(0);
    expect(gastouHoje({ spend: "0" })).toBe(0);
    expect(gastouHoje({ spend: "12.50" })).toBe(12.5);
  });

  it("mensagem: uma linha por conta, quem gastava mais primeiro, com o gestor", () => {
    const t = textoVigia([
      { clientId: "a", nome: "Loja A", media3d: 80, gestorTrecho: "@5522999999999" },
      { clientId: "b", nome: "Loja B", media3d: 200, gestorTrecho: "Julio" },
    ], "11:05");
    expect(t).toContain("*2 contas ativas sem gasto hoje* (leitura das 11:05)");
    expect(t.indexOf("Loja B")).toBeLessThan(t.indexOf("Loja A"));
    expect(t).toContain("@5522999999999");
    expect(textoVigia([{ clientId: "a", nome: "Loja A", media3d: 80, gestorTrecho: "" }], "11:05")).toContain("*1 conta ativa sem gasto hoje*");
  });
});
