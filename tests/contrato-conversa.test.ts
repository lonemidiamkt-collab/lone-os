import { describe, it, expect } from "vitest";
import { lerPedido, extrairNumeros } from "@/lib/contracts/pedido-contrato";
import { mesclarParcial, type ParcialContrato } from "@/lib/contracts/oferta";

// Regressão da conversa real no grupo CADASTRO (24/08/2026):
//   Roberto: "gerar contrato valor de 1797 3 meses"
//   Agente:  "ainda falta: dia de vencimento. Já entendi: valor R$ 1.797,00 · 3 meses"
//   Roberto: "vencimento dia 24"
//   Agente:  "ainda falta: dia de vencimento"   ← perguntou de novo
//   Roberto: "montou?"
//   Agente:  (silêncio)
// Cada mensagem era lida sozinha, então a resposta nunca completava o pedido.

describe("primeira mensagem", () => {
  it("entende valor e prazo, e pede só o que falta", () => {
    const p = lerPedido("gerar contrato valor de 1797 3 meses");
    expect(p.querContrato).toBe(true);
    expect(p.valorMensal).toBe(1797);
    expect(p.duracaoMeses).toBe(3);
    expect(p.faltando).toEqual(["dia de vencimento"]);
  });
});

describe("a resposta que era ignorada", () => {
  it("'vencimento dia 24' sozinha não parece pedido de contrato — por isso precisa do parcial", () => {
    const p = lerPedido("vencimento dia 24");
    expect(p.querContrato).toBe(false);      // continua false: a frase não pede nada
    expect(p.diaPagamento).toBe(24);         // mas o dia ESTÁ ali
  });

  it("juntando com o que o agente já tinha entendido, o contrato fica completo", () => {
    const parcial: ParcialContrato = {
      clientId: "c1", cliente: "ACM distribuidora", valorMensal: 1797, duracaoMeses: 3,
    };
    const juntos = mesclarParcial(parcial, extrairNumeros("vencimento dia 24"));
    expect(juntos).toEqual({ valorMensal: 1797, duracaoMeses: 3, diaPagamento: 24 });

    const falta = [
      juntos.valorMensal === undefined ? "valor mensal" : null,
      juntos.diaPagamento === undefined ? "dia de vencimento" : null,
    ].filter(Boolean);
    expect(falta).toEqual([]); // dá pra gerar
  });

  it("'dia 24' seco também completa", () => {
    const juntos = mesclarParcial(
      { clientId: "c1", cliente: "ACM", valorMensal: 1797 },
      extrairNumeros("dia 24"),
    );
    expect(juntos.diaPagamento).toBe(24);
  });

  it("correção vence o guardado: quem repete o valor está corrigindo", () => {
    const juntos = mesclarParcial(
      { clientId: "c1", cliente: "ACM", valorMensal: 1797, diaPagamento: 24 },
      extrairNumeros("na verdade é 2500"),
    );
    expect(juntos.valorMensal).toBe(2500);
    expect(juntos.diaPagamento).toBe(24); // o que não foi dito de novo se mantém
  });

  it("sem nada guardado, mesclar não inventa dado", () => {
    expect(mesclarParcial(null, extrairNumeros("vencimento dia 24")))
      .toEqual({ valorMensal: undefined, duracaoMeses: undefined, diaPagamento: 24 });
  });
});

describe("pergunta de status", () => {
  it("'montou?' não traz número nenhum — quem responde é o fluxo, com o que falta", () => {
    const p = lerPedido("montou?");
    expect(p.querContrato).toBe(false);
    expect(p.valorMensal).toBeUndefined();
    expect(p.diaPagamento).toBeUndefined();
  });
});
