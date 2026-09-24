// Ficha do cliente: e-mail sujo de cadastro antigo travava o salvar inteiro (Edumar, 24/09).
import { describe, it, expect } from "vitest";
import { z } from "zod";
import { normalizarEmail, mensagemDadosInvalidos } from "@/lib/clients/email";

const emailOpc = z.preprocess(normalizarEmail, z.string().email().max(256).nullable().optional());

describe("normalizarEmail", () => {
  it("tira ponto final e espaços colados", () => {
    expect(normalizarEmail("edumarautopecas2@gmail.com.")).toBe("edumarautopecas2@gmail.com");
    expect(normalizarEmail("  fulano@loja.com.br  ")).toBe("fulano@loja.com.br");
  });
  it("vazio vira null (apaga o campo em vez de travar)", () => {
    expect(normalizarEmail("   ")).toBeNull();
  });
  it("o e-mail da Edumar passa na validação; lixo de verdade continua recusado", () => {
    expect(emailOpc.safeParse("edumarautopecas2@gmail.com.").success).toBe(true);
    expect(emailOpc.safeParse("sem-arroba").success).toBe(false);
  });
});

describe("mensagemDadosInvalidos", () => {
  it("diz qual campo está errado, em português", () => {
    expect(mensagemDadosInvalidos(["email", "emailCorporativo", "email"])).toBe("Dados inválidos: e-mail, e-mail corporativo");
  });
});
