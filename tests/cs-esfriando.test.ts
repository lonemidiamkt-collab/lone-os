// Teste OFFLINE do detector de cliente esfriando — só a lógica pura buildEsfriandoDigest.
import { describe, it, expect } from "vitest";
import { buildEsfriandoDigest } from "@/lib/cs/esfriando";

describe("buildEsfriandoDigest", () => {
  it("lista vazia → string vazia (chamador não posta)", () => {
    expect(buildEsfriandoDigest([])).toBe("");
  });

  it("1 cliente → singular", () => {
    const msg = buildEsfriandoDigest([{ nome: "Contele", diasQuieto: 9, social: "Carlos" }]);
    expect(msg).toContain("Um cliente");
    expect(msg).toContain("*Contele* — 9 dias sem falar (Carlos)");
  });

  it("vários → ordena do mais quieto pro menos", () => {
    const msg = buildEsfriandoDigest([
      { nome: "A", diasQuieto: 8 },
      { nome: "B", diasQuieto: 20 },
      { nome: "C", diasQuieto: 12 },
    ]);
    expect(msg).toContain("3 clientes");
    const iB = msg.indexOf("*B*"), iC = msg.indexOf("*C*"), iA = msg.indexOf("*A*");
    expect(iB).toBeLessThan(iC);
    expect(iC).toBeLessThan(iA);
  });
});
