// tests/pedido-pdf.test.ts — "loninho, transforma esse roteiro em pdf pro varejão".
//
// A armadilha que estes testes guardam: transformar em PDF a PRÓPRIA frase do pedido. O documento
// sai bonito com uma linha só, parece ter funcionado, e o Roberto só descobre quando o cliente
// abre.

import { describe, it, expect } from "vitest";
import { pediuPdf, lerPedidoPdf } from "@/lib/cs/pedido-pdf";

describe("reconhecer o pedido", () => {
  it("entende o jeito que se pede", () => {
    expect(pediuPdf("loninho, transforma esse roteiro em pdf")).toBe(true);
    expect(pediuPdf("faz um pdf disso")).toBe(true);
    expect(pediuPdf("vira documento pra mandar pro cliente")).toBe(true);
  });

  it("não confunde conversa sobre pdf com pedido", () => {
    expect(pediuPdf("o cliente não abriu o pdf")).toBe(false);
    expect(pediuPdf("o pdf ficou bom")).toBe(false);
  });
});

describe("separar o pedido do conteúdo", () => {
  const msg = `loninho, transforma esse roteiro em pdf pro varejão

1. Vídeo de venda

Duração: 30 segundos

Você de Araruama está construindo?`;

  it("tira a linha do pedido do documento", () => {
    const p = lerPedidoPdf(msg);
    expect(p.quer).toBe(true);
    expect(p.conteudo).not.toContain("loninho");
    expect(p.conteudo).not.toContain("transforma esse roteiro");
  });

  it("preserva o conteúdo inteiro", () => {
    const p = lerPedidoPdf(msg);
    expect(p.conteudo).toContain("Vídeo de venda");
    expect(p.conteudo).toContain("Duração: 30 segundos");
    expect(p.conteudo).toContain("está construindo");
  });

  it("reconhece o tipo pelo que foi pedido", () => {
    expect(lerPedidoPdf(msg).tipo).toBe("Roteiro de Vídeo");
    expect(lerPedidoPdf("faz um pdf dessa pauta\n\nSegunda: post de preço").tipo).toBe("Pauta de Conteúdo");
    expect(lerPedidoPdf("gera documento\n\nTexto qualquer aqui").tipo).toBe("Documento");
  });

  it("pedido SEM conteúdo não vira documento de uma linha", () => {
    const p = lerPedidoPdf("loninho faz um pdf disso");
    expect(p.quer).toBe(true);
    expect(p.conteudo.length).toBeLessThan(30);   // a rota recusa abaixo de 30
  });
});
