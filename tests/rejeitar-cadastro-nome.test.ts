// tests/rejeitar-cadastro-nome.test.ts — 24/10/2026, auditoria de erro recuperável (item 3.14).
// "Rejeitar" em Cadastros Pendentes perguntava só "Rejeitar este cadastro?" — e apaga de vez.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { textoRejeitarCadastro } from "@/lib/clients/rejeitar-cadastro";

describe("confirmação de rejeitar cadastro", () => {
  it("diz o nome (e o contato) de quem vai ser apagado, e que não tem volta", () => {
    const t = textoRejeitarCadastro("Padaria do Zé", "João Silva");
    expect(t).toMatch(/^Rejeitar o cadastro de "Padaria do Zé" \(contato: João Silva\)\?/);
    expect(t).toMatch(/não dá para desfazer/);
  });

  it("sem contato, ou contato igual ao nome, não repete", () => {
    expect(textoRejeitarCadastro("João Silva", "João Silva")).toMatch(/^Rejeitar o cadastro de "João Silva"\?/);
    expect(textoRejeitarCadastro("Padaria", "")).toMatch(/^Rejeitar o cadastro de "Padaria"\?/);
  });

  it("a fila usa a confirmação com o nome", () => {
    const src = readFileSync("app/clients/pending/page.tsx", "utf8");
    expect(src).toMatch(/confirm\(textoRejeitarCadastro\(nome, getContactDisplay\(selected, sub\)\)\)/);
    expect(src).not.toMatch(/confirm\("Rejeitar este cadastro\?/);
  });
});
