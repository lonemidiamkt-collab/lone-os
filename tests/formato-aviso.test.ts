import { describe, it, expect } from "vitest";
import { escolherFormato, vaiDePdf, separarPorTamanho, LIMITE_ITENS } from "@/lib/cs/formato-aviso";

// Os dois casos reais do grupo do time em 11/09/2026, que motivaram a regra.
describe("o formato segue o volume, não o destinatário", () => {
  it("um item vira texto, nunca PDF", () => {
    // Chegaram quatro PDFs no grupo com UM item cada ("Julio — 1 item hoje", "time — 1 item hoje").
    // Baixar e abrir um arquivo para ler seis palavras é pior que ler a linha ali mesmo.
    expect(escolherFormato({ itens: 1 })).toBe("texto");
    expect(vaiDePdf(1)).toBe(false);
  });

  it("lista longa vira PDF", () => {
    // A véspera de sexta saiu como texto com 11 clientes e o WhatsApp cortou com "Ler mais" —
    // quem estava no fim da lista não foi lido.
    expect(escolherFormato({ itens: 11 })).toBe("pdf");
  });

  it("o corte fica em mais de 4 itens", () => {
    expect(escolherFormato({ itens: LIMITE_ITENS })).toBe("texto");
    expect(escolherFormato({ itens: LIMITE_ITENS + 1 })).toBe("pdf");
  });

  it("texto comprido vira PDF mesmo com poucos itens", () => {
    // Dois itens podem ser dois parágrafos. Quem manda é o que o WhatsApp vai cortar.
    const longo = "x".repeat(700);
    expect(escolherFormato({ itens: 2, texto: longo })).toBe("pdf");
    expect(escolherFormato({ itens: 2, texto: "curto" })).toBe("texto");
  });

  it("lista vazia nunca gera PDF", () => {
    expect(escolherFormato({ itens: 0 })).toBe("texto");
    expect(escolherFormato({ itens: -1 })).toBe("texto");
  });
});

describe("agrupar os pequenos", () => {
  const bloco = (n: number) => ({ itens: Array.from({ length: n }, (_, i) => i) });

  it("separa quem vai sozinho de quem vai junto", () => {
    // O caso do dia: Julio(1), time(1), Gabriel(1), Rodrigo(1) e um bloco grande de 8.
    const { emPdf, juntos } = separarPorTamanho([bloco(1), bloco(1), bloco(8), bloco(1), bloco(1)]);
    expect(emPdf).toHaveLength(1);
    expect(juntos).toHaveLength(4);
  });

  it("descarta bloco vazio dos dois lados", () => {
    const { emPdf, juntos } = separarPorTamanho([bloco(0), bloco(2)]);
    expect(emPdf).toHaveLength(0);
    expect(juntos).toHaveLength(1);
  });
});
