import { describe, it, expect } from "vitest";
import { MOTIVOS_SAIDA, MOTIVOS_LISTA, EVITAVEIS } from "@/lib/clients/churn";

// Antes de virar obrigatório: 6 clientes arquivados, 1 com motivo. Cinco saíram e ninguém sabe
// por quê — não dá pra saber se a agência perde cliente por preço, resultado ou atendimento.
describe("motivo de saída", () => {
  it("cobre as saídas que mudam uma decisão diferente", () => {
    for (const m of ["preco", "resultado", "atendimento", "concorrente"]) {
      expect(MOTIVOS_SAIDA).toHaveProperty(m);
    }
  });

  it("distingue saída evitável de saída que não era da agência", () => {
    // Cliente que fechou as portas não é falha de entrega; resultado ruim é.
    expect(EVITAVEIS).toContain("resultado");
    expect(EVITAVEIS).not.toContain("fechou");
  });

  it("a lista é curta — campo longo demais vira campo mal preenchido", () => {
    expect(MOTIVOS_LISTA.length).toBeLessThanOrEqual(8);
    expect(MOTIVOS_LISTA.every(([, rotulo]) => rotulo.length > 0)).toBe(true);
  });
});
