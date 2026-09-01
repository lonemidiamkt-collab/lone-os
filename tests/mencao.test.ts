import { describe, it, expect } from "vitest";
import { normalizarNumero } from "@/lib/cs/mencao";
import { readFileSync } from "node:fs";

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

// Roberto: "quero que você sempre marque o Julio nesses avisos". O Julio é o assigned_traffic de 46
// dos 50 clientes — escrever "Julio" no código faria o aviso continuar indo pra ele no dia em que a
// carteira mudasse de dono, e ninguém lembraria de trocar.
describe("responsável de tráfego sai do cadastro, não do código", () => {
  it("o módulo não fixa nome de pessoa", () => {
    const src = readFileSync("lib/cs/mencao.ts", "utf8");
    const linhasDeCodigo = src.split("\n").filter((l) => !l.trim().startsWith("*") && !l.trim().startsWith("//"));
    expect(linhasDeCodigo.join("\n")).not.toMatch(/"Julio"|'Julio'/);
  });

  it("deriva de assigned_traffic", () => {
    expect(readFileSync("lib/cs/mencao.ts", "utf8")).toContain("assigned_traffic");
  });
});
