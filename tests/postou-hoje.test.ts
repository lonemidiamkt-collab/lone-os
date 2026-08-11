// tests/postou-hoje.test.ts — o resumo que vai pro grupo de Artes.
//
// O risco não é errar a conta: é o time PARAR DE LER. Relatório longo pra dizer "está tudo bem"
// treina todo mundo a passar o olho — e aí o dia em que falta alguém passa junto.

import { describe, it, expect } from "vitest";
import { textoResumo } from "@/lib/cs/postou-hoje";
import type { ResumoPostagem } from "@/lib/cs/postou-hoje";

const st = (cliente: string, social: string | null, dias: number | null, hoje = false) => ({
  cliente, social, postouHoje: hoje,
  ultimoPost: dias === null ? null : "2026-08-04",
  diasParado: dias,
});

const base = (p: Partial<ResumoPostagem>): ResumoPostagem => ({
  dia: "2026-08-10", postaram: [], faltaram: [], semInstagram: [], comErro: [], ...p,
});

describe("dia limpo", () => {
  it("diz que está tudo certo em UMA linha", () => {
    const t = textoResumo(base({ postaram: [st("A", "Carlos", 0, true), st("B", "Thiago", 0, true)] }));
    expect(t).toContain("todos os 2 clientes postaram");
    expect(t.split("\n")).toHaveLength(1);
  });

  it("mas avisa se há cliente que ele não consegue ver", () => {
    const t = textoResumo(base({
      postaram: [st("A", "Carlos", 0, true)],
      semInstagram: [st("C", "Thiago", null)],
    }));
    expect(t).toContain("1 sem Instagram vinculado");
  });
});

describe("dia com falta", () => {
  const r = base({
    postaram: [st("Quero Tintas", "Carlos", 0, true)],
    faltaram: [st("Bazar Ribeiro", "Carlos", 34), st("Nova União", "Thiago", 2)],
  });

  it("agrupa por dono — cobrança sem dono ninguém age", () => {
    const t = textoResumo(r);
    expect(t).toContain("*Carlos*");
    expect(t).toContain("*Thiago*");
    expect(t.indexOf("Bazar Ribeiro")).toBeGreaterThan(t.indexOf("*Carlos*"));
  });

  it("marca em vermelho só quem passou de uma semana", () => {
    const t = textoResumo(r);
    expect(t).toMatch(/🔴 34 dias/);
    expect(t).toContain("Nova União — último há 2d");
    expect(t).not.toMatch(/🔴 2 dias/);
  });

  it("mostra a proporção logo no começo", () => {
    expect(textoResumo(r)).toContain("1 de 3 postaram");
  });

  it("quem nunca postou é o caso mais grave", () => {
    const t = textoResumo(base({ faltaram: [st("Armazém", "Carlos", null)] }));
    expect(t).toContain("🔴 nunca postou");
  });
});

describe("sem dado nenhum", () => {
  it("não finge que está tudo bem", () => {
    const t = textoResumo(base({}));
    expect(t).toContain("Não consegui conferir");
    expect(t).not.toContain("✅");
  });
});
