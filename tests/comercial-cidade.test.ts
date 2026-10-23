import { describe, expect, it } from "vitest";
import { normalizarCidade } from "@/lib/crm/cidade";

describe("cidade escrita de um jeito só", () => {
  it("maiúscula inicial, conectores em minúscula, espaços limpos", () => {
    expect(normalizarCidade("rio das ostras")).toBe("Rio das Ostras");
    expect(normalizarCidade("  CABO   FRIO ")).toBe("Cabo Frio");
    expect(normalizarCidade("são pedro da aldeia")).toBe("São Pedro da Aldeia");
    expect(normalizarCidade("armação dos búzios")).toBe("Armação dos Búzios");
  });
  it("não inventa nome e vazio vira nulo", () => {
    expect(normalizarCidade("campos")).toBe("Campos");
    expect(normalizarCidade("   ")).toBeNull();
    expect(normalizarCidade(null)).toBeNull();
  });
});
