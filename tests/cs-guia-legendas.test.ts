/**
 * QA: Guia de Legendas (lib/cs/guia-legendas) — o matcher de ficha por cliente e o método.
 * Garante que a ficha certa (voz + CONTATO) casa pelo nome, sem trocar cliente parecido.
 */

import { describe, it, expect } from "vitest";
import { METODO_LEGENDA, fichaDoCliente } from "@/lib/cs/guia-legendas";

describe("METODO_LEGENDA", () => {
  it("tem as âncoras do guia (contato sempre + anatomia)", () => {
    expect(METODO_LEGENDA).toContain("FECHA COM CONTATO");
    expect(METODO_LEGENDA).toContain("Gancho");
    expect(METODO_LEGENDA).toContain("CONTATO");
  });
});

describe("fichaDoCliente", () => {
  it("casa por nome e traz o contato exato", () => {
    const f = fichaDoCliente("Imperio dos Pisos");
    expect(f).toContain("Império dos Pisos");
    expect(f).toContain("99610-3383");
    expect(f).toContain("CONTATO");
  });

  it("Engetec → simulação/energia solar", () => {
    expect(fichaDoCliente("Engetec")).toContain("99715-7096");
  });

  it("não confunde Madeirão Móveis com Madeirão Madeiras (telefones diferentes)", () => {
    const moveis = fichaDoCliente("Madeirão Móveis");
    expect(moveis).toContain("99974-7847");
    expect(moveis).not.toContain("99751-8669");
  });

  it("cliente sem ficha → null", () => {
    expect(fichaDoCliente("Cliente Aleatório XPTO")).toBeNull();
  });
});
