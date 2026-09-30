import { describe, it, expect } from "vitest";
import { normalizarNumero, mencoesUnicas } from "@/lib/cs/mencao";
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


// 30/09/2026: o Vigia de entrega falhou em 28/09 e 30/09 com "mentioned contains duplicate item".
// MAX Contabilidade, Reformar Construção e Veterinária Regional pararam de gastar no mesmo dia, as
// três do Julio — o número dele entrou três vezes e a Evolution recusou a mensagem INTEIRA. Nos
// dias com uma conta só, o aviso saía. Três contas sem gasto e o grupo de tráfego sem saber.
describe("menções sem repetição", () => {
  const JULIO = "5522999990000@s.whatsapp.net";

  it("o mesmo gestor em três contas vira uma menção só", () => {
    expect(mencoesUnicas([JULIO, JULIO, JULIO])).toEqual([JULIO]);
  });

  it("mantém a ordem e as pessoas diferentes", () => {
    const THIAGO = "5522988880000@s.whatsapp.net";
    expect(mencoesUnicas([JULIO, THIAGO, JULIO])).toEqual([JULIO, THIAGO]);
  });

  it("número com e sem sufixo do WhatsApp é a mesma pessoa", () => {
    expect(mencoesUnicas([JULIO, "5522999990000"])).toEqual([JULIO]);
  });

  it("vazio, nulo e espaço não viram menção", () => {
    expect(mencoesUnicas(["", null, undefined, "  "])).toEqual([]);
    expect(mencoesUnicas(undefined)).toEqual([]);
  });
});
