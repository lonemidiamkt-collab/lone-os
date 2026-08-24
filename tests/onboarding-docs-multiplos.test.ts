import { describe, it, expect } from "vitest";
import { listaDocs, adicionarDoc, primeiroDoc, SEP_DOCS } from "@/lib/onboarding/docs";

// Roberto (24/08): "na área de cadastro do cliente ele só conseguiu adicionar um conteúdo de imagem
// no arquivo, sendo que quando é CNPJ às vezes é mais de uma imagem".
// O campo guardava UMA url: a segunda página do cartão CNPJ apagava a primeira, sem aviso.

const A = "legal://docs/cnpj-p1.jpg";
const B = "legal://docs/cnpj-p2.jpg";

describe("compatibilidade com o que já está salvo", () => {
  it("cadastro antigo, com uma url só, continua funcionando", () => {
    expect(listaDocs(A)).toEqual([A]);
    expect(primeiroDoc(A)).toBe(A);
  });

  it("campo vazio ou nulo não vira lista com lixo", () => {
    for (const v of ["", null, undefined, "   ", "\n\n"]) {
      expect(listaDocs(v as string)).toEqual([]);
    }
    expect(primeiroDoc(null)).toBeNull();
  });
});

describe("várias páginas", () => {
  it("acrescenta sem apagar a anterior — era exatamente o bug", () => {
    const depoisDaPrimeira = adicionarDoc(undefined, A);
    const depoisDaSegunda = adicionarDoc(depoisDaPrimeira, B);
    expect(listaDocs(depoisDaSegunda)).toEqual([A, B]);
  });

  it("três páginas continuam todas lá", () => {
    let v = "";
    for (const u of [A, B, "legal://docs/cnpj-p3.pdf"]) v = adicionarDoc(v, u);
    expect(listaDocs(v)).toHaveLength(3);
  });

  it("quem só sabe ler um arquivo pega o primeiro, sem quebrar", () => {
    const v = adicionarDoc(adicionarDoc("", A), B);
    expect(primeiroDoc(v)).toBe(A);
    expect(v.split(SEP_DOCS)[0]).toBe(A); // formato continua legível por quem lê cru
  });
});
