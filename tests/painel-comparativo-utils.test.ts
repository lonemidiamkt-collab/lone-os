import { describe, it, expect } from "vitest";
import {
  variacao, tomDaVariacao, formatarVariacao, somaMeses, serieMensalComparada,
} from "@/components/ui/painel-comparativo-utils";

describe("variacao", () => {
  it("calcula a % de anterior para atual", () => {
    expect(variacao(124, 100)).toBeCloseTo(24);
    expect(variacao(80, 100)).toBeCloseTo(-20);
    expect(variacao(100, 100)).toBe(0);
  });

  it("devolve null sem base honesta (nulo, zero, não finito)", () => {
    expect(variacao(null, 100)).toBeNull();
    expect(variacao(100, null)).toBeNull();
    expect(variacao(undefined, 100)).toBeNull();
    expect(variacao(100, 0)).toBeNull();
    expect(variacao(Number.NaN, 100)).toBeNull();
    expect(variacao(100, Number.POSITIVE_INFINITY)).toBeNull();
  });

  it("atual zero com base positiva é queda de 100%", () => {
    expect(variacao(0, 50)).toBe(-100);
  });

  it("base negativa não inverte o sinal (melhorou = positivo)", () => {
    expect(variacao(-10, -20)).toBeCloseTo(50);
    expect(variacao(-30, -20)).toBeCloseTo(-50);
  });
});

describe("tomDaVariacao", () => {
  it("métrica direta: subir é bom, cair é ruim", () => {
    expect(tomDaVariacao(12, "direta")).toBe("bom");
    expect(tomDaVariacao(-12, "direta")).toBe("ruim");
  });

  it("métrica inversa (custo por conversa): cair é bom", () => {
    expect(tomDaVariacao(-15, "inversa")).toBe("bom");
    expect(tomDaVariacao(15, "inversa")).toBe("ruim");
  });

  it("natureza padrão é direta", () => {
    expect(tomDaVariacao(5)).toBe("bom");
  });

  it("métrica neutra nunca é boa nem ruim", () => {
    expect(tomDaVariacao(40, "neutra")).toBe("neutro");
    expect(tomDaVariacao(-40, "neutra")).toBe("neutro");
  });

  it("até o limiar ou sem dado é neutro", () => {
    expect(tomDaVariacao(0.5, "direta")).toBe("neutro");
    expect(tomDaVariacao(4, "inversa", 5)).toBe("neutro");
    expect(tomDaVariacao(-5, "direta", 5)).toBe("neutro");
    expect(tomDaVariacao(6, "inversa", 5)).toBe("ruim");
    expect(tomDaVariacao(null, "direta")).toBe("neutro");
    expect(tomDaVariacao(Number.NaN, "direta")).toBe("neutro");
  });
});

describe("formatarVariacao", () => {
  it("sinal explícito e vírgula decimal", () => {
    expect(formatarVariacao(24)).toBe("+24%");
    expect(formatarVariacao(-8.5)).toBe("−8,5%");
    expect(formatarVariacao(4)).toBe("+4%");
    expect(formatarVariacao(123.4)).toBe("+123%");
  });

  it("quase zero vira 0% sem sinal", () => {
    expect(formatarVariacao(0)).toBe("0%");
    expect(formatarVariacao(0.02)).toBe("0%");
  });
});

describe("somaMeses", () => {
  it("atravessa a virada de ano nos dois sentidos", () => {
    expect(somaMeses("2026-01", -1)).toBe("2025-12");
    expect(somaMeses("2025-12", 1)).toBe("2026-01");
    expect(somaMeses("2026-03", -12)).toBe("2025-03");
    expect(somaMeses("2026-03", 0)).toBe("2026-03");
  });
});

describe("serieMensalComparada", () => {
  it("compara com o mesmo mês do ano anterior quando há histórico", () => {
    const v = new Map([
      ["2025-02", 80], ["2025-03", 90],
      ["2026-02", 100], ["2026-03", 120],
    ]);
    const { base, serie } = serieMensalComparada(v, "2026-03", 3);
    expect(base).toBe("ano_anterior");
    expect(serie.map((p) => p.mes)).toEqual(["2026-01", "2026-02", "2026-03"]);
    expect(serie[0]).toMatchObject({ atual: null, anterior: null });
    expect(serie[1]).toMatchObject({ atual: 100, anterior: 80 });
    expect(serie[2]).toMatchObject({ atual: 120, anterior: 90 });
  });

  it("sem ano anterior, compara com o mês anterior (série deslocada)", () => {
    const v = new Map([["2026-01", 50], ["2026-02", 100], ["2026-03", 120]]);
    const { base, serie } = serieMensalComparada(v, "2026-03", 3);
    expect(base).toBe("mes_anterior");
    expect(serie.map((p) => p.anterior)).toEqual([null, 50, 100]);
    expect(serie.map((p) => p.atual)).toEqual([50, 100, 120]);
  });

  it("mês faltando é buraco (null), nunca zero", () => {
    const v = new Map([["2026-01", 50], ["2026-03", 120]]);
    const { serie } = serieMensalComparada(v, "2026-03", 3);
    expect(serie[1].atual).toBeNull();
    expect(serie[2].anterior).toBeNull();
  });

  it("usa o rotulador informado", () => {
    const v = new Map([["2026-03", 1]]);
    const { serie } = serieMensalComparada(v, "2026-03", 1, (ym) => `m${ym.slice(5)}`);
    expect(serie).toEqual([{ mes: "2026-03", rotulo: "m03", atual: 1, anterior: null }]);
  });
});
