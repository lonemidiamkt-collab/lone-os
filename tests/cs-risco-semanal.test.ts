// tests/cs-risco-semanal.test.ts — o aviso semanal de risco, uma seção por dono.
//
// O que protege: só entra quem o modelo único marcou (risco/atenção) ou quem parou de falar; cada
// cliente aparece UMA vez, no dono dele; "sem dono" não some; o porquê vem do breakdown do score.

import { describe, it, expect } from "vitest";
import {
  agruparSemana, entraNaSemana, motivosDoCliente, textoRiscoSemanal, resumoRiscoSemanal, contar,
  POR_DONO, DIAS_ESFRIANDO, type ClienteSemana,
} from "@/lib/cs/risco-semanal";

const c = (p: Partial<ClienteSemana> & { cliente: string }): ClienteSemana => ({
  dono: "Carlos", nivel: "saudavel", score: 85, motivos: [], diasQuieto: 1, ...p,
});

describe("quem entra", () => {
  it("risco e atenção entram; saudável e sem dado não", () => {
    expect(entraNaSemana(c({ cliente: "A", nivel: "risco", score: 50 }))).toBe(true);
    expect(entraNaSemana(c({ cliente: "B", nivel: "atencao", score: 65 }))).toBe(true);
    expect(entraNaSemana(c({ cliente: "C", nivel: "saudavel" }))).toBe(false);
    expect(entraNaSemana(c({ cliente: "D", nivel: "sem_dado", score: null }))).toBe(false);
  });

  it("saudável que parou de falar há 7+ dias entra como esfriando; quem nunca falou não", () => {
    expect(entraNaSemana(c({ cliente: "E", diasQuieto: DIAS_ESFRIANDO }))).toBe(true);
    expect(entraNaSemana(c({ cliente: "F", diasQuieto: DIAS_ESFRIANDO - 1 }))).toBe(false);
    expect(entraNaSemana(c({ cliente: "G", nivel: "sem_dado", diasQuieto: null }))).toBe(false);
  });
});

describe("agrupamento por dono", () => {
  const lista = [
    c({ cliente: "Atlas", dono: "Thiago", nivel: "atencao", score: 70 }),
    c({ cliente: "Paradise", dono: "Carlos", nivel: "risco", score: 54 }),
    c({ cliente: "Varejão", dono: "Carlos", nivel: "atencao", score: 62 }),
    c({ cliente: "UNAFER", dono: "Carlos", diasQuieto: 12 }),
    c({ cliente: "Órfão", dono: null, nivel: "risco", score: 40 }),
    c({ cliente: "Saudável", dono: "Thiago" }),
  ];

  it("uma seção por dono; quem tem cliente em risco abre, 'sem dono' fecha", () => {
    const b = agruparSemana(lista);
    expect(b.map((x) => x.dono)).toEqual(["Carlos", "Thiago", "sem dono"]);
  });

  it("dentro do dono: risco, depois atenção, depois só-esfriando", () => {
    const carlos = agruparSemana(lista)[0];
    expect(carlos.clientes.map((x) => x.cliente)).toEqual(["Paradise", "Varejão", "UNAFER"]);
  });

  it("cada cliente aparece uma vez e o saudável fica de fora", () => {
    const nomes = agruparSemana(lista).flatMap((b) => b.clientes.map((x) => x.cliente));
    expect(nomes).toHaveLength(5);
    expect(nomes).not.toContain("Saudável");
  });

  it("corta em POR_DONO e conta o resto", () => {
    const muitos = Array.from({ length: POR_DONO + 3 }, (_, i) => c({ cliente: `C${i}`, nivel: "atencao", score: 60 + i }));
    const [b] = agruparSemana(muitos);
    expect(b.clientes).toHaveLength(POR_DONO);
    expect(b.resto).toBe(3);
    expect(textoRiscoSemanal(muitos, "21/09")).toContain("_+3 na lista de saúde_");
  });
});

describe("o porquê", () => {
  it("vem do breakdown do score, no máximo três", () => {
    const m = motivosDoCliente(c({ cliente: "A", nivel: "risco", score: 50, motivos: ["2 reclamações nos últimos 30 dias", "Relacionamento em 40", "Sentimento em 45", "Pendências em 30"] }));
    expect(m).toEqual(["2 reclamações nos últimos 30 dias", "Relacionamento em 40", "Sentimento em 45"]);
  });

  it("esfriando vem primeiro e não repete o 'sem contato' que o score já dizia", () => {
    const m = motivosDoCliente(c({ cliente: "A", nivel: "atencao", score: 66, diasQuieto: 20, motivos: ["22 dias sem contato no grupo", "Engajamento do cliente em 30"] }));
    expect(m).toEqual(["sem falar no grupo há 20 dias", "Engajamento do cliente em 30"]);
  });
});

describe("texto", () => {
  it("ninguém pedindo atenção = mensagem nenhuma", () => {
    expect(textoRiscoSemanal([c({ cliente: "Ok" })], "21/09")).toBe("");
  });

  it("cabeçalho com contagem, seção por dono, nota e motivo por cliente", () => {
    const t = textoRiscoSemanal([
      c({ cliente: "Paradise", nivel: "risco", score: 54.4, motivos: ["Relacionamento em 40"] }),
      c({ cliente: "UNAFER", diasQuieto: 9 }),
      c({ cliente: "Órfão", dono: null, nivel: "atencao", score: 70 }),
    ], "21/09");
    expect(t).toContain("🩺 *Clientes pedindo atenção* — semana de 21/09");
    expect(t).toContain("🔴 1 em risco · 🟡 1 em atenção · 👀 1 esfriando");
    expect(t).toContain("👤 *Carlos* — 2");
    expect(t).toContain("• 🔴 *Paradise* (54) — Relacionamento em 40");
    expect(t).toContain("• 👀 *UNAFER* — sem falar no grupo há 9 dias");
    expect(t).toContain("👤 _sem dono_ — 1");
  });

  it("com rótulo o dono vira menção; a legenda do PDF traz contagem e donos", () => {
    const lista = [c({ cliente: "Paradise", nivel: "risco", score: 54 }), c({ cliente: "X", dono: null, nivel: "atencao", score: 70 })];
    expect(textoRiscoSemanal(lista, "21/09", () => "@5522999999999")).toContain("👤 @5522999999999 — 1");
    expect(resumoRiscoSemanal(lista, () => "@5522999999999")).toBe("🔴 1 em risco · 🟡 1 em atenção\n👤 @5522999999999 (1) · _sem dono_ (1)");
  });

  it("a contagem conta TODOS, não só os que couberam no corte", () => {
    const muitos = Array.from({ length: POR_DONO + 2 }, (_, i) => c({ cliente: `C${i}`, nivel: "risco", score: 40 }));
    expect(contar(muitos).risco).toBe(POR_DONO + 2);
  });
});
