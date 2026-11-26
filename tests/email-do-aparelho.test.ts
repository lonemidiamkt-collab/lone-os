// tests/email-do-aparelho.test.ts — Fase 0, leva 0B (25/11/2026).
// A lista pública do login deixou de trazer o e-mail. A pessoa clica na foto e, na primeira vez em cada
// aparelho, digita o e-mail junto com a senha; depois o aparelho lembra. E-mails inventados.

import { describe, expect, it } from "vitest";
import { chaveDoPerfil, emailParaEntrar, esquecerEmail, lembrarEmail, lerEmailLembrado, pareceEmail } from "@/lib/auth/email-do-aparelho";

function memoria() {
  const m = new Map<string, string>();
  return {
    m,
    storage: {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => { m.set(k, v); },
      removeItem: (k: string) => { m.delete(k); },
    } as unknown as Storage,
  };
}

describe("e-mail lembrado no aparelho", () => {
  it("lembra por perfil, em minúsculas e sem espaço, e esquece quando pedem", () => {
    const { storage } = memoria();
    const s = () => storage;
    expect(lerEmailLembrado(s, "id-ana")).toBeNull();
    lembrarEmail(s, "id-ana", "  Ana@Exemplo.test ");
    expect(lerEmailLembrado(s, "id-ana")).toBe("ana@exemplo.test");
    expect(lerEmailLembrado(s, "id-beto")).toBeNull(); // cada perfil com o seu
    esquecerEmail(s, "id-ana");
    expect(lerEmailLembrado(s, "id-ana")).toBeNull();
  });

  it("sem localStorage (aba anônima, bloqueado, servidor) não quebra: só não lembra", () => {
    const quebrado = () => { throw new Error("SecurityError"); };
    expect(() => lembrarEmail(quebrado, "id-ana", "ana@exemplo.test")).not.toThrow();
    expect(lerEmailLembrado(quebrado, "id-ana")).toBeNull();
    expect(() => esquecerEmail(quebrado, "id-ana")).not.toThrow();
    const semGetItem = () => ({ getItem: () => { throw new Error("x"); } }) as unknown as Storage;
    expect(lerEmailLembrado(semGetItem, "id-ana")).toBeNull();
  });

  it("valor estranho guardado não vira e-mail", () => {
    const { storage, m } = memoria();
    m.set(chaveDoPerfil("id-ana"), "não é e-mail");
    expect(lerEmailLembrado(() => storage, "id-ana")).toBeNull();
  });

  it("lembra só e-mail válido", () => {
    const { storage, m } = memoria();
    lembrarEmail(() => storage, "id-ana", "sem-arroba");
    expect(m.size).toBe(0);
  });
});

describe("qual e-mail usar para entrar", () => {
  it("o digitado vale mais que o lembrado; o lembrado vale quando não digitaram", () => {
    expect(emailParaEntrar({ digitado: "Beto@Exemplo.test", lembrado: "ana@exemplo.test" })).toBe("beto@exemplo.test");
    expect(emailParaEntrar({ digitado: "  ", lembrado: "ana@exemplo.test" })).toBe("ana@exemplo.test");
    expect(emailParaEntrar({ conhecido: "ana@exemplo.test" })).toBe("ana@exemplo.test");
  });

  it("sem nenhum e-mail (ou só lixo) devolve null — a tela pede o e-mail, não manda 'senha incorreta'", () => {
    expect(emailParaEntrar({})).toBeNull();
    expect(emailParaEntrar({ digitado: "ana", lembrado: null, conhecido: "" })).toBeNull();
  });

  it("pareceEmail", () => {
    expect(pareceEmail("ana@exemplo.test")).toBe(true);
    expect(pareceEmail("ana@exemplo")).toBe(false);
    expect(pareceEmail("a na@exemplo.test")).toBe(false);
    expect(pareceEmail("")).toBe(false);
  });
});
