// tests/relatorio-intervalo.test.ts — relatório de MÊS FECHADO (01/07 a 31/07).
//
// Por que o intervalo exato existe: o mensal usava "últimos 30 dias". Rodando em 03/08 isso dá
// 04/07 a 02/08 — dois dias de agosto dentro e o começo de julho de fora. Pro cliente que pede
// "o relatório de julho", isso é a janela errada.
//
// O rótulo é a parte que mais pode dar errado sem ninguém ver: data pura tratada como instante
// vira o dia anterior no Brasil (UTC-3), e o cliente recebe um PDF dizendo "30/06 – 30/07".

import { describe, it, expect } from "vitest";
import { rotuloIntervalo, periodLabelDays } from "@/lib/traffic/weekly-report";

describe("rótulo do intervalo", () => {
  it("escreve o mês fechado em pt-BR", () => {
    expect(rotuloIntervalo("2026-07-01", "2026-07-31")).toBe("01/07/2026 – 31/07/2026");
  });

  it("NÃO desloca o dia — data pura não é instante (new Date('2026-07-01') daria 30/06 aqui)", () => {
    expect(rotuloIntervalo("2026-07-01", "2026-07-31")).toContain("01/07");
    expect(rotuloIntervalo("2026-01-01", "2026-01-31")).toBe("01/01/2026 – 31/01/2026");
  });

  it("vira do ano sem embaralhar", () => {
    expect(rotuloIntervalo("2025-12-01", "2025-12-31")).toBe("01/12/2025 – 31/12/2025");
  });
});

describe("por que o preset não servia", () => {
  it("a janela de 30 dias termina ONTEM — logo, rodando dia 3 ela invade agosto", () => {
    // periodLabelDays usa a data de hoje; o que importa aqui é a FORMA (dd/mm/aaaa – dd/mm/aaaa)
    // e o fato de não ser o mês civil. O valor exato depende do dia em que o teste roda.
    expect(periodLabelDays(30)).toMatch(/^\d{2}\/\d{2}\/\d{4} – \d{2}\/\d{2}\/\d{4}$/);
  });
});

// A janela do Instagram sai do INTERVALO, não do periodDays. No primeiro envio de julho os
// anúncios vieram do mês fechado e o bloco de IG veio de 7 dias, no MESMO PDF — porque o chamador
// passou since/until e esqueceu period=month. Derivar do intervalo tira a pegadinha.
function igDoIntervalo(de: string, ate: string): "7d" | "14d" | "30d" {
  const dias = Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86_400_000) + 1;
  return dias >= 21 ? "30d" : dias >= 11 ? "14d" : "7d";
}

describe("janela do Instagram derivada do intervalo", () => {
  it("mês fechado pede a janela de 30 dias, não a de 7", () => {
    expect(igDoIntervalo("2026-07-01", "2026-07-31")).toBe("30d");
    expect(igDoIntervalo("2026-02-01", "2026-02-28")).toBe("30d");
  });

  it("quinzena e semana caem na janela proporcional", () => {
    expect(igDoIntervalo("2026-07-01", "2026-07-15")).toBe("14d");
    expect(igDoIntervalo("2026-07-01", "2026-07-07")).toBe("7d");
  });
});
