// @vitest-environment node
// tests/onboarding-espelho-cofre.test.ts — a senha do link de cadastro chega ao cofre do social (24/10/2026).
//   A. Nem o envio final nem o provision (tela Cadastros Pendentes) copiavam para client_access.
//   B. O approve mandava a senha JÁ CIFRADA do cadastro para espelharNoCofre, que cifra de novo:
//      o social abriria um texto ilegível ("v1:…") no lugar da senha.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { randomBytes } from "node:crypto";
import { bancoEmMemoria } from "./helpers/banco-em-memoria";

process.env.VAULT_KEY = randomBytes(32).toString("base64");
const banco = bancoEmMemoria();
vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: banco.supabaseAdmin }));

const { senhasParaEspelho } = await import("@/lib/onboarding/espelho");
const { espelharCadastroNoCofre } = await import("@/lib/onboarding/espelho-server");
const { encryptVault, decryptVault } = await import("@/lib/crypto/vault");

const enc = (s: string) => encryptVault(s)!;

beforeEach(() => banco.limpar());

describe("o que vai para o cofre do social", () => {
  it("rascunho com senha cifrada → espelho recebe o TEXTO (quem cifra é o espelharNoCofre, uma vez)", () => {
    const p = senhasParaEspelho({ rascunho: {
      instagram_login: "padaria_ig", instagram_password: enc("ig-123"),
      meta_login: "dono@padaria.com", meta_password: enc("fb-456"),
      google_login: "ads@padaria.com", google_password: enc("g-789"),
    } }, decryptVault);
    expect(p.senhas).toEqual({
      instagram_login: "padaria_ig", instagram_password: "ig-123",
      facebook_login: "dono@padaria.com", facebook_password: "fb-456",
    });
    expect(p.naoDecifradas).toEqual([]);
  });

  it("a ficha vale antes do rascunho (o time pode ter corrigido), sempre em par", () => {
    const p = senhasParaEspelho({
      ficha: { instagram_login: "certo_ig", instagram_password: enc("nova") },
      rascunho: { instagram_login: "velho_ig", instagram_password: enc("velha") },
    }, decryptVault);
    expect(p.senhas).toMatchObject({ instagram_login: "certo_ig", instagram_password: "nova" });
  });

  it("ficha sem senha: o par inteiro vem do rascunho (nunca login de um com senha do outro)", () => {
    const p = senhasParaEspelho({
      ficha: { facebook_login: "antigo@x.com" },
      rascunho: { meta_login: "novo@x.com", meta_password: enc("s3nha") },
    }, decryptVault);
    expect(p.senhas).toEqual({ facebook_login: "novo@x.com", facebook_password: "s3nha" });
  });

  it("senha legada em texto puro passa; cifrado que não abre fica de fora e é dito (sem a senha)", () => {
    const p = senhasParaEspelho({ rascunho: {
      instagram_login: "ig", instagram_password: "texto-legado",
      meta_login: "fb", meta_password: "v1:AAAA:BBBB:CCCC",
    } }, decryptVault);
    expect(p.senhas.instagram_password).toBe("texto-legado");
    expect(p.senhas.facebook_password).toBeUndefined();
    expect(p.senhas.facebook_login).toBe("fb");
    expect(p.naoDecifradas).toEqual(["meta"]);
  });
});

describe("espelharCadastroNoCofre grava no client_access", () => {
  it("o erro B: a senha do cofre do social abre como a senha que o cliente digitou (não como 'v1:…')", async () => {
    banco.db.clients = [{ id: "c1", instagram_login: "padaria_ig", instagram_password: enc("ig-123") }];
    const r = await espelharCadastroNoCofre("c1", null);
    expect(r.ok).toBe(true);
    const linha = banco.db.client_access[0];
    expect(linha).toMatchObject({ client_id: "c1", instagram_login: "padaria_ig" });
    expect(String(linha.instagram_password)).toMatch(/^v1:/); // guardado cifrado…
    expect(decryptVault(linha.instagram_password as string)).toBe("ig-123"); // …uma vez só
  });

  it("cópia para a ficha falhou (usarFicha:false): usa o rascunho, não a ficha velha", async () => {
    banco.db.clients = [{ id: "c1", instagram_login: "ig", instagram_password: enc("velha") }];
    await espelharCadastroNoCofre("c1", { instagram_login: "ig", instagram_password: enc("nova") }, { usarFicha: false });
    expect(decryptVault(banco.db.client_access[0].instagram_password as string)).toBe("nova");
  });

  it("falha ao gravar aparece como falha, sem senha na mensagem", async () => {
    banco.db.clients = [{ id: "c1", instagram_login: "ig", instagram_password: enc("segredo-xyz") }];
    banco.falharEm("client_access", "upsert", { message: "permission denied" });
    const r = await espelharCadastroNoCofre("c1", null);
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/permission denied/);
    expect(JSON.stringify(r)).not.toMatch(/segredo-xyz/);
  });
});
