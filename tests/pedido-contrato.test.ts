// tests/pedido-contrato.test.ts — entender o pedido de contrato escrito no grupo.
//
// O risco aqui é único no sistema: o resultado é um DOCUMENTO que vai pro cliente assinar. Ler
// "12 meses" como R$ 12 ou "dia 10" como valor 10 produz um contrato errado e crível — pior que
// não gerar nada. Por isso metade dos testes é sobre NÃO chutar.

import { describe, it, expect } from "vitest";
import { lerPedido, pediuContrato, extrairNumeros } from "@/lib/contracts/pedido-contrato";

describe("reconhecer o pedido", () => {
  it("entende o jeito que se fala no grupo", () => {
    expect(pediuContrato("gera o contrato do Bruno Tintas")).toBe(true);
    expect(pediuContrato("pode mandar o contrato")).toBe(true);
    expect(pediuContrato("quero o contrato dele")).toBe(true);
  });

  it('entende o "sim" seco logo depois da oferta', () => {
    expect(pediuContrato("sim")).toBe(true);
    expect(pediuContrato("pode ser")).toBe(true);
  });

  it("não confunde conversa sobre contrato com pedido de gerar", () => {
    expect(pediuContrato("o cliente ainda não assinou o contrato")).toBe(false);
    expect(pediuContrato("o contrato dele vence em setembro")).toBe(false);
  });
});

describe("os três números", () => {
  it('lê a frase completa: "2500, 12 meses, dia 10"', () => {
    const r = extrairNumeros("2500, 12 meses, dia 10");
    expect(r).toMatchObject({ valorMensal: 2500, duracaoMeses: 12, diaPagamento: 10 });
    expect(r.faltando).toEqual([]);
  });

  it("aceita o valor como a pessoa escreve", () => {
    expect(extrairNumeros("R$ 2.500,00 por 6 meses dia 5").valorMensal).toBe(2500);
    expect(extrairNumeros("2,5k por 6 meses dia 5").valorMensal).toBe(2500);
    expect(extrairNumeros("1500 12 meses dia 10").valorMensal).toBe(1500);
  });

  it('"1 ano" vira 12 meses', () => {
    expect(extrairNumeros("3000, 1 ano, dia 10").duracaoMeses).toBe(12);
    expect(extrairNumeros("3000, 2 anos, dia 10").duracaoMeses).toBe(24);
  });

  it('NÃO lê "dia 10" como valor — a ordem de leitura importa', () => {
    const r = extrairNumeros("dia 10, 12 meses, 2500");
    expect(r.diaPagamento).toBe(10);
    expect(r.valorMensal).toBe(2500);
    expect(r.duracaoMeses).toBe(12);
  });

  it('NÃO lê "12 meses" como valor mensal', () => {
    const r = extrairNumeros("12 meses, 2500, dia 5");
    expect(r.valorMensal).toBe(2500);
    expect(r.duracaoMeses).toBe(12);
  });
});

describe("o que ele se recusa a adivinhar", () => {
  it("faltando um número, DIZ qual falta em vez de chutar", () => {
    const r = extrairNumeros("2500 por 12 meses");
    expect(r.faltando).toContain("dia de pagamento");
    expect(r.diaPagamento).toBeUndefined();
  });

  it("pedido sem número nenhum lista os três", () => {
    expect(extrairNumeros("gera o contrato").faltando).toHaveLength(3);
  });

  it("dia 31 não vale — não existe em fevereiro", () => {
    expect(extrairNumeros("2500, 12 meses, dia 31").diaPagamento).toBeUndefined();
  });

  it("valor absurdo é leitura errada, não intenção", () => {
    expect(extrairNumeros("50, 12 meses, dia 10").valorMensal).toBeUndefined();
    expect(extrairNumeros("999999, 12 meses, dia 10").valorMensal).toBeUndefined();
  });

  it("prazo absurdo idem", () => {
    expect(extrairNumeros("2500, 120 meses, dia 10").duracaoMeses).toBeUndefined();
  });
});

describe("leitura completa", () => {
  it("junta intenção e números", () => {
    const p = lerPedido("gera o contrato: 3000, 12 meses, dia 10");
    expect(p.querContrato).toBe(true);
    expect(p.faltando).toEqual([]);
    expect(p.valorMensal).toBe(3000);
  });
});
