import { describe, it, expect } from "vitest";
import { avaliarSaude, formatSaudeDigest } from "@/lib/cs/saude";

describe("avaliarSaude", () => {
  it("reclamação recente → risco alto", () => {
    const a = avaliarSaude("X", { status: "good", reclamacaoRecente: true, retracaoRecente: false, diasSemPost: 3 });
    expect(a.risco).toBe("alto");
    expect(a.motivos[0]).toContain("reclamou");
  });
  it("status at_risk → alto", () => {
    expect(avaliarSaude("Y", { status: "at_risk", reclamacaoRecente: false, retracaoRecente: false, diasSemPost: 2 }).risco).toBe("alto");
  });
  it(">30 dias sem post → alto; entre 21-30 → médio", () => {
    expect(avaliarSaude("A", { status: "good", reclamacaoRecente: false, retracaoRecente: false, diasSemPost: 40 }).risco).toBe("alto");
    expect(avaliarSaude("B", { status: "good", reclamacaoRecente: false, retracaoRecente: false, diasSemPost: 25 }).risco).toBe("medio");
  });
  it("tudo ok → baixo", () => {
    expect(avaliarSaude("Z", { status: "good", reclamacaoRecente: false, retracaoRecente: false, diasSemPost: 2 }).risco).toBe("baixo");
  });
  it("digest lista só os em risco", () => {
    const txt = formatSaudeDigest([
      avaliarSaude("Risco", { status: "at_risk", reclamacaoRecente: false, retracaoRecente: false, diasSemPost: 1 }),
      avaliarSaude("Saudavel", { status: "good", reclamacaoRecente: false, retracaoRecente: false, diasSemPost: 1 }),
    ], "30/06");
    expect(txt).toContain("Risco");
    expect(txt).not.toContain("Saudavel");
  });
});
