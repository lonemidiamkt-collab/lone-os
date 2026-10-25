// Comercial · legibilidade (23/10/2026): os pares texto × fundo do casco do comercial passam de 4,5:1 (WCAG AA).
// Lê os tokens direto de app/globals.css — se alguém trocar uma cor do casco por uma que não se lê, este teste reprova.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(path.resolve(__dirname, "../app/globals.css"), "utf8");

/** Conteúdo do primeiro bloco cujo seletor é exatamente `seletor`. */
function bloco(seletor: string): string {
  const i = css.indexOf(`${seletor} {`);
  if (i < 0) throw new Error(`bloco não encontrado: ${seletor}`);
  const ini = css.indexOf("{", i) + 1;
  return css.slice(ini, css.indexOf("}", ini));
}
function token(seletor: string, nome: string): string {
  const m = new RegExp(`${nome}:\\s*(#[0-9a-fA-F]{6})`).exec(bloco(seletor));
  if (!m) throw new Error(`${nome} não está em ${seletor}`);
  return m[1];
}
function corDaRegra(seletor: string): string {
  const m = new RegExp(`${seletor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{\\s*color:\\s*(#[0-9a-fA-F]{6})`).exec(css);
  if (!m) throw new Error(`regra não encontrada: ${seletor}`);
  return m[1];
}

const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mistura = (cor: string, alfa: number, fundo: string) => {
  const [a, b] = [rgb(cor), rgb(fundo)];
  return "#" + a.map((c, i) => Math.round(c * alfa + b[i] * (1 - alfa)).toString(16).padStart(2, "0")).join("");
};
function luminancia(h: string): number {
  const [r, g, b] = rgb(h).map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contraste(a: string, b: string): number {
  const [x, y] = [luminancia(a), luminancia(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

const CLARO = "html.casco-comercial:not(.dark)";
const CASCO = "html.casco-comercial";
const ESCURO = "html.dark.casco-comercial";

describe("comercial — contraste no tema claro", () => {
  const branco = "#ffffff";
  const fundos = { cartao: branco, pagina: token(CASCO, "--background"), suave: token(CASCO, "--muted") };
  // Fundos tingidos dos selos (bg-lone-*-bg) usam a cor ORIGINAL a 8–12%: o pior caso é 12% sobre branco.
  const tingido = { "--lone-success": mistura("#16a34a", 0.12, branco), "--lone-warning": mistura("#d97706", 0.12, branco), "--lone-danger": mistura("#dc2626", 0.12, branco) };

  for (const nome of ["--lone-success", "--lone-warning", "--lone-danger"] as const) {
    it(`${nome} como texto passa em cartão, página, fundo suave e no próprio fundo tingido`, () => {
      const cor = token(CLARO, nome);
      for (const [onde, fundo] of Object.entries({ ...fundos, tingido: tingido[nome] })) {
        expect(contraste(cor, fundo), `${nome} ${cor} sobre ${onde} ${fundo}`).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
  it("texto secundário e placeholder se leem", () => {
    expect(contraste(token(CASCO, "--muted-foreground"), fundos.suave)).toBeGreaterThanOrEqual(4.5);
    expect(contraste(corDaRegra(`${CLARO} ::placeholder`), branco)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("comercial — contraste no tema escuro", () => {
  const fundos = { cartao: token(ESCURO, "--card"), suave: token(ESCURO, "--muted"), destaque: token(ESCURO, "--accent"), pagina: token(ESCURO, "--background") };
  it("azul como TEXTO (link, selo, chip) usa o tom claro e passa em todos os fundos", () => {
    const azul = corDaRegra(`${ESCURO} .text-primary`);
    for (const [onde, fundo] of Object.entries(fundos)) expect(contraste(azul, fundo), `azul ${azul} sobre ${onde}`).toBeGreaterThanOrEqual(4.5);
  });
  it("texto secundário e placeholder se leem no cartão", () => {
    expect(contraste(token(ESCURO, "--muted-foreground"), fundos.cartao)).toBeGreaterThanOrEqual(4.5);
    expect(contraste(corDaRegra(`${ESCURO} ::placeholder`), fundos.cartao)).toBeGreaterThanOrEqual(4.5);
  });
  it("botão cheio: branco sobre o azul da marca passa", () => {
    expect(contraste("#ffffff", token(ESCURO, "--primary"))).toBeGreaterThanOrEqual(4.5);
  });
});

describe("comercial — tamanho mínimo de letra", () => {
  it("legenda e rótulos pequenos sobem para 12px; iniciais para 11px", () => {
    expect(css).toMatch(/html\.casco-comercial \.text-lone-caption,[\s\S]*?\{ font-size: 12px; \}/);
    expect(css).toMatch(/html\.casco-comercial \.text-\\\[9px\\\] \{ font-size: 11px; \}/);
  });
});
