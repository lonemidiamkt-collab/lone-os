// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  dentroDaJanela, diaEmSP, formatarBRLCompacto, formatarEixo, formatarMetrica, formatarPct, inicioDaJanela,
  melhorDia, ordenarFaixas, rotuloDia, rotuloDiaLongo, taxaEngajamento,
} from "@/lib/portal/formatos";

// A dica do gráfico diário mostrava a chave crua ("messages : 29"). Estes formatos são o que o
// cliente lê no lugar: número em pt-BR com a unidade por extenso.

describe("formatarMetrica — valor da dica e dos totais", () => {
  it("cada aba com a sua unidade, nunca a chave em inglês", () => {
    expect(formatarMetrica("messages", 29)).toBe("29 conversas");
    expect(formatarMetrica("messages", 1)).toBe("1 conversa");
    expect(formatarMetrica("clicks", 1234)).toBe("1.234 cliques");
    expect(formatarMetrica("clicks", 1)).toBe("1 clique");
    expect(formatarMetrica("reach", 15320)).toBe("15.320 pessoas");
    expect(formatarMetrica("spend", 1234.5)).toMatch(/^R\$\s1\.234,50$/);
    for (const m of ["messages", "clicks", "spend", "reach"] as const) {
      expect(formatarMetrica(m, 29)).not.toMatch(/messages|clicks|spend|reach/);
    }
  });

  it("alcance médio quebrado arredonda (não existe 812,4 pessoas)", () => {
    expect(formatarMetrica("reach", 812.4)).toBe("812 pessoas");
  });
});

describe("formatarEixo — rótulos do eixo Y", () => {
  it("compacto em pt-BR; R$ só no investimento", () => {
    // O Intl separa "1,2" de "mil" com espaço não-quebrável: \s cobre os dois.
    expect(formatarEixo("messages", 40)).toBe("40");
    expect(formatarEixo("reach", 1200)).toMatch(/^1,2\smil$/);
    expect(formatarEixo("spend", 850)).toBe("R$ 850");
    expect(formatarEixo("spend", 12500)).toMatch(/^R\$ 12,5\smil$/);
    expect(formatarBRLCompacto(1_500_000)).toMatch(/^R\$ 1,5\smi$/);
  });
});

describe("formatarPct", () => {
  it("uma casa abaixo de 10%, nenhuma acima", () => {
    expect(formatarPct(4.25)).toBe("4,3%");
    expect(formatarPct(34)).toBe("34%");
    expect(formatarPct(33.6)).toBe("34%");
    expect(formatarPct(0)).toBe("0%");
  });
});

describe("datas curtas", () => {
  it("dia e mês abreviado sem ponto nem 'de'", () => {
    expect(rotuloDia("2026-09-22")).toBe("22 set");
    expect(rotuloDia("2026-03-01")).toBe("1 mar");
    expect(rotuloDiaLongo("2026-09-22")).toBe("ter, 22 set");
  });

  it("timestamp vira o dia de São Paulo (23h em SP ainda é o mesmo dia)", () => {
    expect(diaEmSP("2026-09-23T02:30:00Z")).toBe("2026-09-22");
    expect(diaEmSP("2026-09-22")).toBe("2026-09-22");
  });
});

describe("dentroDaJanela — 'Conteúdo entregue' respeita o período", () => {
  const agora = new Date("2026-09-24T15:00:00Z"); // 24/09 12h em SP

  it("7 dias = hoje e os 6 anteriores", () => {
    expect(inicioDaJanela(7, agora)).toBe("2026-09-18");
    expect(dentroDaJanela("2026-09-18", 7, agora)).toBe(true);
    expect(dentroDaJanela("2026-09-24T10:00:00Z", 7, agora)).toBe(true);
    expect(dentroDaJanela("2026-09-17", 7, agora)).toBe(false);
  });

  it("a arte de 29/jul não entra na visão de 7 dias (o caso do print do CEO)", () => {
    expect(dentroDaJanela("2026-07-29", 7, agora)).toBe(false);
    expect(dentroDaJanela("2026-07-29", 30, agora)).toBe(false);
  });

  it("data futura (post agendado) e ausente não contam como entregue no período", () => {
    expect(dentroDaJanela("2026-09-30", 7, agora)).toBe(false);
    expect(dentroDaJanela(null, 7, agora)).toBe(false);
  });
});

describe("melhorDia", () => {
  it("o maior valor positivo; sem nada acima de zero → null", () => {
    expect(melhorDia(["2026-09-20", "2026-09-21", "2026-09-22"], [3, 9, 9])).toEqual({ dia: "2026-09-21", valor: 9 });
    expect(melhorDia(["2026-09-20"], [0])).toBeNull();
    expect(melhorDia([], [])).toBeNull();
  });
});

describe("taxaEngajamento — 'Engajamento 22' ao lado de 'Curtidas 22' não dizia nada", () => {
  it("com alcance por post: interações ÷ alcance dos mesmos posts", () => {
    const t = taxaEngajamento([
      { curtidas: 20, comentarios: 2, alcance: 400 },
      { curtidas: 10, comentarios: 0, alcance: 100 },
      { curtidas: 50, comentarios: 5, alcance: null }, // sem alcance: fora da conta, não distorce
    ], 1000);
    expect(t).toEqual({ pct: (32 / 500) * 100, base: "alcance" });
  });

  it("sem alcance (leitura pública): média por post ÷ seguidores", () => {
    const t = taxaEngajamento([
      { curtidas: 20, comentarios: 2, alcance: null },
      { curtidas: 10, comentarios: 0, alcance: null },
    ], 1000);
    expect(t?.base).toBe("seguidores");
    expect(t?.pct).toBeCloseTo(1.6);
  });

  it("sem post no período, ou sem base pra dividir → null (o cartão mostra '—')", () => {
    expect(taxaEngajamento([], 1000)).toBeNull();
    expect(taxaEngajamento([{ curtidas: 5, comentarios: 0, alcance: null }], null)).toBeNull();
  });

  it("é taxa, não a soma de curtidas: 22 curtidas para 440 pessoas alcançadas = 5%, não '22'", () => {
    const t = taxaEngajamento([{ curtidas: 22, comentarios: 0, alcance: 440 }], 900);
    expect(formatarPct(t!.pct)).toBe("5,0%");
  });
});

describe("ordenarFaixas", () => {
  it("em ordem de idade, não de tamanho", () => {
    const f = ordenarFaixas([{ faixa: "35-44", pct: 40 }, { faixa: "65+", pct: 2 }, { faixa: "18-24", pct: 20 }, { faixa: "25-34", pct: 38 }]);
    expect(f.map((x) => x.faixa)).toEqual(["18-24", "25-34", "35-44", "65+"]);
  });
});
