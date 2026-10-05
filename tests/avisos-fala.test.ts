import { describe, it, expect } from "vitest";
import { fraseParaFalar, deveFalar, podeOuvir } from "@/lib/avisos/fala";

describe("o que o painel fala", () => {
  it("tira emoji, asterisco e link; lê reais por extenso", () => {
    expect(fraseParaFalar("🚨 *Saldo acabando* — Paradise Suplementos", "Saldo R$ 5,01. Veja https://painel.lonemidia.com/traffic"))
      .toBe("Saldo acabando — Paradise Suplementos. Saldo 5 reais e 1 centavo. Veja");
    expect(fraseParaFalar("Conta parada: Maicon minerais", "Vinha gastando R$ 59,22/dia")).toContain("59 reais e 22 centavos/dia");
    expect(fraseParaFalar("Verba", "R$ 1.200,00 no mês")).toBe("Verba. 1200 reais no mês");
  });

  it("frase longa é cortada no fim de uma frase, não no meio da palavra", () => {
    const corpo = "Primeira frase do aviso. " + "Segunda frase bem comprida que continua ".repeat(10);
    const f = fraseParaFalar("Aviso", corpo, 120);
    expect(f.length).toBeLessThanOrEqual(121);
    expect(f.endsWith(".")).toBe(true);
  });
});

describe("quem ouve", () => {
  it("só aviso de tráfego fala, e só pra tráfego e gestão", () => {
    expect(deveFalar({ type: "trafego", title: "t", body: "" }, "traffic", true)).toBe(true);
    expect(deveFalar({ type: "trafego", title: "t", body: "" }, "admin", true)).toBe(true);
    expect(deveFalar({ type: "trafego", title: "t", body: "" }, "designer", true)).toBe(false);
    expect(deveFalar({ type: "content", title: "t", body: "" }, "traffic", true)).toBe(false);
    expect(deveFalar({ type: "trafego", title: "t", body: "" }, "traffic", false)).toBe(false);
  });

  it("aviso de arte fala pro social e pro designer — a máquina do Carlos", () => {
    const arte = { type: "content" as const, title: "Arte entregue", body: "O Rodrigo entregou a arte de SEX 9 da Veneza" };
    expect(deveFalar(arte, "social", true)).toBe(true);
    expect(deveFalar(arte, "designer", true)).toBe(true);
    expect(deveFalar(arte, "traffic", true)).toBe(false);
    // conteúdo que não é arte entrando não fala
    expect(deveFalar({ type: "content", title: "Conteúdo reprovado", body: "voltou pra pauta" }, "social", true)).toBe(false);
  });

  it("papel desconhecido não ouve", () => {
    expect(podeOuvir(undefined)).toBe(false);
    expect(podeOuvir("comercial")).toBe(false);
  });
});
