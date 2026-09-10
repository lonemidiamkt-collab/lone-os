import { describe, it, expect } from "vitest";
import { escolherFrase, supportMessageFor, socialMessageFor } from "@/lib/traffic/support-message";

describe("as frases não se repetem no mesmo grupo", () => {
  it("evita o que o grupo acabou de receber", () => {
    const pool = ["A", "B", "C"];
    expect(escolherFrase(pool, ["A", "B"])).toBe("C");
  });

  it("se TODAS já foram usadas, manda mesmo assim — repetir é melhor que calar", () => {
    const pool = ["A", "B"];
    expect(["A", "B"]).toContain(escolherFrase(pool, ["A", "B"]));
  });

  it("ignora espaço em volta ao comparar", () => {
    expect(escolherFrase(["A", "B"], ["  A  "])).toBe("B");
  });

  it("sem histórico, sorteia normal", () => {
    expect(["A", "B"]).toContain(escolherFrase(["A", "B"]));
  });
});

describe("variedade do banco de frases", () => {
  for (const [nome, fn] of [
    ["tráfego quarta", () => supportMessageFor("wed")],
    ["tráfego sexta", () => supportMessageFor("fri")],
    ["social quarta", () => socialMessageFor("wed")],
    ["social sexta", () => socialMessageFor("fri")],
  ] as const) {
    it(`${nome}: ao menos 10 textos diferentes`, () => {
      const vistos = new Set<string>();
      for (let i = 0; i < 400; i++) vistos.add(fn());
      expect(vistos.size).toBeGreaterThanOrEqual(10);
    });

    it(`${nome}: nem toda frase começa com saudação — era o que soava a carimbo`, () => {
      const vistos = new Set<string>();
      for (let i = 0; i < 400; i++) vistos.add(fn());
      const comSaudacao = [...vistos].filter((t) => /^(oi|bom dia|e a[ií])/i.test(t));
      expect(comSaudacao.length).toBeLessThan(vistos.size);
    });
  }
});
