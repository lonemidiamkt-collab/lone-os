import { describe, it, expect } from "vitest";
import { normalizarNumero } from "@/lib/cs/mencao";

// Roberto: "quando você marca arroba Thiago, não está funcionando direito". O código escrevia
// "@Thiago" como texto puro — no WhatsApp isso não notifica ninguém.
describe("número para menção no WhatsApp", () => {
  it("aceita o formato que a gente escreve no dia a dia", () => {
    expect(normalizarNumero("(22) 99856-6220")).toBe("5522998566220");
    expect(normalizarNumero("22 99856-6220")).toBe("5522998566220");
  });

  it("não duplica o DDI de quem já tem", () => {
    expect(normalizarNumero("5522998566220")).toBe("5522998566220");
    expect(normalizarNumero("+55 22 99856-6220")).toBe("5522998566220");
  });

  it("fixo com 10 dígitos também vale", () => {
    expect(normalizarNumero("(22) 2665-1417")).toBe("552226651417");
  });

  it("lixo devolve null em vez de número inventado", () => {
    expect(normalizarNumero("")).toBeNull();
    expect(normalizarNumero("123")).toBeNull();
    expect(normalizarNumero(null)).toBeNull();
  });
});
