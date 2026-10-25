// tests/login-erro.test.ts — 25/10/2026, onda 6 da auditoria de erro recuperável, item 8.5.
// Toda falha do Supabase virava "Senha incorreta" e apagava a senha: rede caída, deploy no meio, o Kong
// recusando as chaves (a queda de 16/10) e o limite de tentativas (429).

import { describe, it, expect } from "vitest";
import { apagaSenha, falhaDeLogin, motivoDoErroDeLogin } from "@/lib/auth/login-erro";

describe("por que o login não entrou", () => {
  it("senha errada é senha errada (GoTrue: 400 invalid_credentials) — e só ela apaga o campo", () => {
    const r = falhaDeLogin({ status: 400, code: "invalid_credentials", message: "Invalid login credentials" });
    expect(r).toMatchObject({ ok: false, motivo: "credencial", frase: expect.stringMatching(/Senha incorreta/) });
    expect(apagaSenha("credencial")).toBe(true);
  });

  it("rede caída / pedido que não voltou não é senha", () => {
    expect(motivoDoErroDeLogin({ name: "AuthRetryableFetchError", status: 0, message: "Failed to fetch" })).toBe("rede");
    expect(motivoDoErroDeLogin({ message: "TypeError: NetworkError when attempting to fetch resource." })).toBe("rede");
    expect(falhaDeLogin({ name: "AuthRetryableFetchError", status: 0 }).frase).toMatch(/Sem conexão/);
    expect(apagaSenha("rede")).toBe(false);
  });

  it("limite de tentativas (429) pede para esperar, sem apagar a senha", () => {
    const r = falhaDeLogin({ status: 429, code: "over_request_rate_limit", message: "Request rate limit reached" });
    expect(r).toMatchObject({ motivo: "limite", frase: expect.stringMatching(/Espere 1 ou 2 minutos/) });
    expect(apagaSenha("limite")).toBe(false);
  });

  it("o Kong recusando a chave (16/10) e o servidor fora (5xx) viram 'login não está respondendo'", () => {
    expect(motivoDoErroDeLogin({ status: 401, message: "Invalid authentication credentials" })).toBe("servidor");
    expect(motivoDoErroDeLogin({ status: 502, message: "Bad Gateway" })).toBe("servidor");
    expect(falhaDeLogin({ status: 503 }).frase).toMatch(/não está respondendo/);
    // E nenhuma frase promete o "modo local" que nunca existiu.
    for (const e of [{ status: 0 }, { status: 503 }, { status: 418 }]) expect(falhaDeLogin(e).frase).not.toMatch(/modo local/i);
  });

  it("login bloqueado (removido da equipe) diz isso, e não 'senha incorreta'", () => {
    const r = falhaDeLogin({ status: 400, code: "user_banned", message: "User is banned" });
    expect(r).toMatchObject({ motivo: "bloqueado", frase: expect.stringMatching(/acesso ao painel está bloqueado/) });
    expect(apagaSenha("bloqueado")).toBe(false);
  });

  it("o resto diz o código, sem culpar a senha", () => {
    expect(falhaDeLogin({ status: 418, message: "teapot" })).toMatchObject({ motivo: "desconhecido", frase: expect.stringMatching(/erro 418/) });
    expect(falhaDeLogin(null).motivo).toBe("desconhecido");
  });
});
