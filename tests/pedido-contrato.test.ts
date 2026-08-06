// tests/pedido-contrato.test.ts — entender o pedido de contrato escrito no grupo.
//
// O risco aqui é único no sistema: o resultado é um DOCUMENTO que vai pro cliente assinar. Ler
// "12 meses" como R$ 12 ou "dia 10" como valor 10 produz um contrato errado e crível — pior que
// não gerar nada. Por isso metade dos testes é sobre NÃO chutar.

import { describe, it, expect } from "vitest";
import { lerPedido, pediuContrato, extrairNumeros, trouxeOsNumeros } from "@/lib/contracts/pedido-contrato";

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

describe("responder a pergunta É pedir (o silêncio de 06/08)", () => {
  // Real: o agente perguntou "quer que eu gere o contrato? me manda valor e vencimento" e o
  // Roberto respondeu isto. Não havia verbo de comando nenhum — e o agente ficou MUDO.
  const resposta = "dia de vencimento dia 10, sao 3 meses de contrato no valor de 1797";

  it("entende a resposta como pedido", () => {
    expect(pediuContrato(resposta)).toBe(true);
  });

  it("tira os números certos dela", () => {
    expect(extrairNumeros(resposta)).toMatchObject({ valorMensal: 1797, diaPagamento: 10, duracaoMeses: 3 });
  });

  it('sem a palavra "contrato", valor + vencimento já é a resposta', () => {
    expect(trouxeOsNumeros("1797, dia 10")).toBe(true);
    expect(trouxeOsNumeros("pode ser 2500 todo dia 5")).toBe(true);
  });

  it("conversa sobre contrato sem números continua não sendo pedido", () => {
    expect(pediuContrato("o contrato dele vence em setembro")).toBe(false);
    expect(pediuContrato("o cliente ainda não assinou o contrato")).toBe(false);
    expect(trouxeOsNumeros("o contrato venceu")).toBe(false);
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
    expect(r.faltando).toContain("dia de vencimento");
    expect(r.diaPagamento).toBeUndefined();
  });

  it("pedido sem número nenhum cobra valor e vencimento", () => {
    expect(extrairNumeros("gera o contrato").faltando).toEqual(["valor mensal", "dia de vencimento"]);
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

describe("ciclos são o padrão; prazo determinado precisa ser dito", () => {
  it("sem dizer nada, é o contrato padrão da casa — duração NÃO é cobrada", () => {
    const r = extrairNumeros("2500, dia 10");
    expect(r.modalidade).toBe("ciclos");
    expect(r.faltando).toEqual([]);   // ciclo de 3 meses vem do padrão, não da mensagem
  });

  it('"teste de 1 mês" vira prazo determinado', () => {
    const r = extrairNumeros("1200, 1 mes, dia 10, teste");
    expect(r.modalidade).toBe("determinado");
    expect(r.duracaoMeses).toBe(1);
  });

  it("prazo determinado SEM prazo não gera — aí a duração faz falta", () => {
    expect(extrairNumeros("1200, dia 10, prazo determinado").faltando).toContain("prazo (em meses)");
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
