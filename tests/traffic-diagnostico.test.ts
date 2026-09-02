import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// A primeira versão exigia sempre o volume cheio da política e devolveu ZERO achados, com problemas
// óbvios na base: Léo Carros gastou R$159 para UMA conversa numa conta de meta R$12,40 — 12x o teto
// — e ficou de fora por não ter 8 conversas. Esses casos escapavam por um vão: não é zero conversa
// (fora do desperdício) e não tem amostra (fora do custo acima da meta).
const SRC = readFileSync("lib/traffic/diagnostico.ts", "utf8");

describe("diagnóstico: evidência proporcional ao desvio", () => {
  it("desvio grande dispensa volume estatístico", () => {
    expect(SRC).toMatch(/exagero\s*>=\s*4\s*\?\s*1/);
  });

  it("desvio pequeno continua exigindo o volume da política", () => {
    expect(SRC).toContain("Number(pol.conversas_minimas ?? 5)");
  });

  it("o gasto mínimo continua valendo sempre", () => {
    // Sem piso de gasto, um conjunto de R$8 com 1 conversa viraria alarme.
    expect(SRC).toMatch(/cj\.gasto < Number\(pol\.gasto_minimo_decisao/);
  });

  it("a política revisada por gente nunca é sobrescrita", () => {
    const pol = readFileSync("app/api/system/traffic-policy/route.ts", "utf8");
    expect(pol).toMatch(/revisadas\.has\(c\.id as string\) && !refazer/);
  });

  it("sem volume, a política não é derivada — meta chutada é pior que ausente", () => {
    const pol = readFileSync("app/api/system/traffic-policy/route.ts", "utf8");
    expect(pol).toMatch(/comGasto\.length < 7 \|\| totalConv < 10/);
  });
});
