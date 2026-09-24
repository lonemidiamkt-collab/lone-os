// tests/ficha-uma-pagina.test.ts — a ficha de uma página do cliente (Leva 7C, N23).

import { describe, it, expect } from "vitest";
import { fichaPdfHtml, LIMITES, montarFicha, tomDaFicha, type DadosFicha } from "@/lib/clientes/ficha-uma-pagina";

const vazia: DadosFicha = {
  cliente: "Tintas <Bruno>", nicho: "Construção", instagram: "tintasbruno", logo: null, resumo: null, posicionamento: null, tom: null,
  publico: [], palavrasProibidas: [], concorrentesEvitar: [], produtos: [], destaques: [], ctas: [], regras: [],
  paleta: [], tipografia: null, evitarVisual: [], contato: null,
};

describe("ficha de uma página", () => {
  it("tom do briefing vale mais que a etiqueta do cadastro", () => {
    expect(tomDaFicha("Próximo, sem gíria", "formal")).toBe("Próximo, sem gíria");
    expect(tomDaFicha("", "funny")).toBe("Descontraído, com humor");
    expect(tomDaFicha(null, null)).toBeNull();
  });

  it("vazia: lista o que falta e não é suficiente para PDF", () => {
    const f = montarFicha(vazia);
    expect(f.suficiente).toBe(false);
    expect(f.faltando).toEqual(["Logo", "Posicionamento", "Tom de voz", "Palavras proibidas (ou confirmar que não há)", "Produtos", "Paleta de cores (ler o estilo visual)"]);
  });

  it("limpa repetidos, respeita os limites da folha e descarta cor inválida", () => {
    const f = montarFicha({
      ...vazia, posicionamento: "A loja de tinta do bairro", tom: "Próximo",
      produtos: [...Array.from({ length: 20 }, (_, i) => `Produto ${i}`), "produto 1"],
      palavrasProibidas: ["barato", "Barato", " barato "],
      paleta: [{ hex: "#0d4af5", papel: "destaque" }, { hex: "azul", papel: "fundo" }],
    });
    expect(f.produtos).toHaveLength(LIMITES.produtos);
    expect(f.palavrasProibidas).toEqual(["barato"]);
    expect(f.paleta).toEqual([{ hex: "#0d4af5", papel: "destaque" }]);
    expect(f.suficiente).toBe(true);
  });

  it("PDF escapa o que vem do banco e não mostra bloco vazio", () => {
    const html = fichaPdfHtml(montarFicha({ ...vazia, posicionamento: "Qualidade & preço justo", tom: "Próximo" }), "24/09/2026", "");
    expect(html).toContain("Tintas &lt;Bruno&gt;");
    expect(html).toContain("Qualidade &amp; preço justo");
    expect(html).not.toContain("Produtos e serviços");
    expect(html).not.toContain("Nunca usar");
    expect(html).not.toMatch(/undefined|null/);
    expect(html).toContain("gerada pelo Lone OS em 24/09/2026");
  });
});
