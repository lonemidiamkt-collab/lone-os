// tests/onboarding-pagina.test.ts — 24/10/2026, auditoria de erro recuperável, itens 1.9, 1.10, 1.14.

import { describe, it, expect } from "vitest";
import { falhaDeAbertura, fraseDoErroDoEnvio, esperaDoRascunho, deveSalvarAoSair } from "@/lib/onboarding/pagina";

describe("1.9 abrir o link: só 404 é link inválido", () => {
  it("404/400 = inválido; rede, deploy e banco = não consegui abrir agora", () => {
    expect(falhaDeAbertura(404)).toBe("invalido");
    expect(falhaDeAbertura(400)).toBe("invalido");
    for (const s of [0, 500, 502, 503, 504, 429]) expect(falhaDeAbertura(s), String(s)).toBe("indisponivel");
  });
});

describe("1.10 erro no envio: frase humana, nunca o texto do Postgres", () => {
  it("500 com texto cru do banco vira frase de gente", () => {
    const f = fraseDoErroDoEnvio(500, 'duplicate key value violates unique constraint "x"');
    expect(f).not.toMatch(/duplicate|constraint/);
    expect(f).toMatch(/Seus dados continuam aqui/);
  });
  it("sem rede e reinício do sistema dizem o que fazer", () => {
    expect(fraseDoErroDoEnvio(0)).toMatch(/Sem conexão/);
    expect(fraseDoErroDoEnvio(503)).toMatch(/reiniciando/);
  });
  it("4xx do servidor (escrito para o cliente) passa como veio", () => {
    expect(fraseDoErroDoEnvio(400, "Instagram: falta a senha. Volte em Acessos.")).toBe("Instagram: falta a senha. Volte em Acessos.");
  });
});

describe("1.14 rascunho: tenta de novo sozinho e salva ao sair", () => {
  it("primeira tentativa em 3 s; depois de falhar, espera crescente até 1 min", () => {
    expect(esperaDoRascunho(0)).toBe(3_000);
    expect(esperaDoRascunho(1)).toBe(5_000);
    expect(esperaDoRascunho(2)).toBe(15_000);
    expect(esperaDoRascunho(9)).toBe(60_000);
  });
  it("ao sair, manda só se há algo que o servidor não tem (e nunca antes de carregar)", () => {
    expect(deveSalvarAoSair('{"a":1}', '{"a":0}')).toBe(true);
    expect(deveSalvarAoSair('{"a":1}', '{"a":1}')).toBe(false);
    expect(deveSalvarAoSair('{"a":1}', null)).toBe(false);
  });
});
