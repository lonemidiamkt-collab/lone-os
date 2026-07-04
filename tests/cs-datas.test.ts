// Teste OFFLINE do calendário de datas comemorativas — algoritmos de datas móveis (vetores
// conhecidos), janela (incl. virada de ano), matching por nicho e formatação. Puro, sem banco/IA.
import { describe, it, expect } from "vitest";
import {
  pascoa, nesimoDomingo, blackFriday, datasMoveis, datasDoAno,
  datasNaJanela, proximasDatas, tagsDoNicho, dataEncaixa, linhaDataBomDia,
} from "@/lib/cs/datas";

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

describe("datas móveis (vetores conhecidos)", () => {
  it("Páscoa 2024/2025/2026", () => {
    expect(ymd(pascoa(2024))).toBe("2024-03-31");
    expect(ymd(pascoa(2025))).toBe("2025-04-20");
    expect(ymd(pascoa(2026))).toBe("2026-04-05");
  });

  it("Carnaval 2026 = 17/02 (Páscoa - 47)", () => {
    const carnaval = datasMoveis(2026).find((d) => d.nome.startsWith("Carnaval"))!;
    expect(ymd(carnaval.data)).toBe("2026-02-17");
  });

  it("Dia das Mães 2026 = 10/05 (2º domingo de maio)", () => {
    expect(ymd(nesimoDomingo(2026, 5, 2))).toBe("2026-05-10");
  });

  it("Dia dos Pais 2026 = 09/08 (2º domingo de agosto)", () => {
    expect(ymd(nesimoDomingo(2026, 8, 2))).toBe("2026-08-09");
  });

  it("Black Friday 2026 = 27/11 · 2025 = 28/11", () => {
    expect(ymd(blackFriday(2026))).toBe("2026-11-27");
    expect(ymd(blackFriday(2025))).toBe("2025-11-28");
  });

  it("Corpus Christi 2026 = 04/06 (Páscoa + 60)", () => {
    const cc = datasMoveis(2026).find((d) => d.nome.startsWith("Corpus"))!;
    expect(ymd(cc.data)).toBe("2026-06-04");
  });
});

describe("janela de datas", () => {
  it("janela cruza a virada do ano (Natal + Ano Novo)", () => {
    const nomes = datasNaJanela(new Date(2026, 11, 20), 0, 15).map((d) => d.nome);
    expect(nomes).toContain("Natal");
    expect(nomes).toContain("Ano Novo");
  });

  it("proximasDatas inclui hoje", () => {
    const nomes = proximasDatas(new Date(2026, 8, 15), 0).map((d) => d.nome); // 15/09
    expect(nomes).toContain("Dia do Cliente");
  });

  it("datasDoAno ordenado e sem data inválida", () => {
    const todas = datasDoAno(2026);
    for (let i = 1; i < todas.length; i++) expect(todas[i].data.getTime()).toBeGreaterThanOrEqual(todas[i - 1].data.getTime());
    for (const d of todas) expect(Number.isNaN(d.data.getTime())).toBe(false);
  });
});

describe("matching por nicho", () => {
  it("deriva tags do texto livre do nicho", () => {
    expect(tagsDoNicho("Energia solar")).toContain("energia");
    expect(tagsDoNicho("Materiais de construção")).toContain("construcao");
    expect(tagsDoNicho("Farmácia de manipulação")).toEqual(expect.arrayContaining(["farmacia", "saude"]));
    expect(tagsDoNicho("Loja de pneus e mecânica")).toContain("auto");
    expect(tagsDoNicho(null)).toEqual([]);
  });

  it("data 'geral' encaixa pra todo mundo; data de nicho só pro nicho", () => {
    const [maes] = datasMoveis(2026).filter((d) => d.nome === "Dia das Mães");
    const pizza = datasDoAno(2026).find((d) => d.nome === "Dia da Pizza")!;
    expect(dataEncaixa(maes, [])).toBe(true);                    // geral → todos
    expect(dataEncaixa(pizza, ["food"])).toBe(true);
    expect(dataEncaixa(pizza, ["construcao"])).toBe(false);
  });
});

describe("linha do bom-dia", () => {
  it("véspera do Dia do Cliente → 'Amanhã é'", () => {
    const linha = linhaDataBomDia(new Date(2026, 8, 14)); // 14/09
    expect(linha).toContain("Amanhã é");
    expect(linha).toContain("Dia do Cliente");
  });

  it("no próprio dia → 'HOJE é'", () => {
    expect(linhaDataBomDia(new Date(2026, 8, 15))).toContain("HOJE é");
  });

  it("semana sem data relevante → vazio", () => {
    expect(linhaDataBomDia(new Date(2026, 1, 3))).toBe(""); // 03/02/2026
  });
});
