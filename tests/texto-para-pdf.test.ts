// tests/texto-para-pdf.test.ts — texto colado no WhatsApp vira blocos de roteiro.
//
// O risco aqui não é quebrar: é PERDER TEXTO em silêncio. O PDF sai bonito mesmo faltando um
// parágrafo, e ninguém confere linha a linha antes de mandar pro cliente. Por isso quase todo
// teste aqui verifica que nada some.

import { describe, it, expect } from "vitest";
import { lerBlocos } from "@/lib/cs/texto-para-pdf";

const ROTEIRO = `1. Vídeo de venda — material bruto

Duração: 25–30 segundos

"Você de Araruama está construindo e precisa de material bruto com rapidez?"

No Varejão da Construção, você encontra cimento Campeão, tijolo, areia e muito mais.

Texto na tela:
Cimento Campeão • Tijolo • Areia
Envie sua lista

2. Vídeo de localização

Duração: 20–25 segundos

O Varejão da Construção está na Rua XV de Novembro, 231.

Texto na tela:
📍 Rua XV de Novembro, 231`;

describe("ler o roteiro colado", () => {
  it("separa os blocos numerados", () => {
    const b = lerBlocos(ROTEIRO);
    expect(b).toHaveLength(2);
    expect(b[0].titulo).toBe("Vídeo de venda — material bruto");
    expect(b[1].titulo).toBe("Vídeo de localização");
  });

  it("tira a duração do corpo, pra ela virar etiqueta", () => {
    const b = lerBlocos(ROTEIRO);
    expect(b[0].duracao).toBe("25–30 segundos");
    expect(b[0].paragrafos.join(" ")).not.toContain("Duração");
  });

  it("separa o texto na tela das falas", () => {
    const b = lerBlocos(ROTEIRO);
    expect(b[0].textoNaTela).toEqual(["Cimento Campeão • Tijolo • Areia", "Envie sua lista"]);
    expect(b[0].paragrafos.some((p) => p.includes("Cimento Campeão •"))).toBe(false);
  });

  it("NÃO PERDE NENHUMA FALA — é o que ninguém confere antes de mandar", () => {
    const b = lerBlocos(ROTEIRO);
    const tudo = b.flatMap((x) => [...x.paragrafos, ...x.textoNaTela]).join(" ");
    for (const trecho of ["está construindo", "cimento Campeão", "Rua XV de Novembro, 231", "Envie sua lista"]) {
      expect(tudo).toContain(trecho);
    }
  });

  it("aspas curvas do WhatsApp viram retas (viram caixinha no PDF)", () => {
    const b = lerBlocos(ROTEIRO);
    expect(b[0].paragrafos[0]).toContain('"Você de Araruama');
    expect(b[0].paragrafos[0]).not.toContain("“");
  });
});

describe("o que ele não recusa", () => {
  it("texto sem numeração vira um bloco só, em vez de erro", () => {
    const b = lerBlocos("Fala solta do cliente.\n\nSegunda linha.");
    expect(b).toHaveLength(1);
    expect(b[0].paragrafos).toHaveLength(2);
  });

  it("texto vazio não gera bloco fantasma", () => {
    expect(lerBlocos("")).toHaveLength(0);
    expect(lerBlocos("   \n\n  ")).toHaveLength(0);
  });

  it("não confunde preço com número de bloco", () => {
    const b = lerBlocos("Leve 3 sacos de cimento\n\n1. Vídeo de venda");
    expect(b.some((x) => x.titulo === "Vídeo de venda")).toBe(true);
    expect(b[0].paragrafos.join(" ")).toContain("Leve 3 sacos");
  });
});
