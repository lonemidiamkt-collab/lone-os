import { describe, it, expect } from "vitest";
import { janelaSemana } from "@/lib/reports/desempenho";

// Regressão: o primeiro teste do relatório rodou numa segunda de manhã e a janela deu "31/08 a
// 06/09" — a semana que ACABAVA de começar. O PDF saiu com zero pessoas porque não havia nada
// medido ainda. O relatório é de sexta, mas precisa fazer sentido em qualquer dia que se rode.
describe("janela do relatório semanal", () => {
  it("na sexta, olha a semana corrente (que está fechando)", () => {
    const sexta = new Date("2026-09-04T18:00:00-03:00");
    expect(janelaSemana(sexta).rotulo).toBe("31/08 a 06/09");
  });

  it("na segunda, olha a semana PASSADA — a atual mal começou", () => {
    const segunda = new Date("2026-08-31T09:00:00-03:00");
    expect(janelaSemana(segunda).rotulo).toBe("24/08 a 30/08");
  });

  it("no domingo, também a semana passada", () => {
    const domingo = new Date("2026-08-30T22:00:00-03:00");
    expect(janelaSemana(domingo).rotulo).toBe("17/08 a 23/08");
  });

  it("a janela cobre 7 dias e começa à meia-noite de Brasília", () => {
    for (const d of ["2026-09-04T18:00:00-03:00", "2026-08-31T09:00:00-03:00"]) {
      const j = janelaSemana(new Date(d));
      const dias = (new Date(j.ate).getTime() - new Date(j.de).getTime()) / 864e5;
      expect(dias).toBeGreaterThan(6.9);
      expect(dias).toBeLessThan(7);
      // 00:00 em BRT é 03:00Z. O bug anterior gravava 00:00Z — 21h do dia ANTERIOR em Brasília.
      expect(j.de).toMatch(/T03:00:00/);
    }
  });

  // A máquina de dev roda em America/Santiago, que troca o relógio no começo de setembro; a versão
  // com `- 864e5` devolvia "31/08 a 05/09" nessa fronteira. A janela não pode depender do fuso de
  // quem roda — o VPS está em UTC, este Mac não.
  it("não depende do fuso da máquina", () => {
    const tz = process.env.TZ;
    const rotulos = new Set<string>();
    for (const z of ["America/Santiago", "UTC", "America/Sao_Paulo", "Asia/Tokyo"]) {
      process.env.TZ = z;
      rotulos.add(janelaSemana(new Date("2026-09-04T18:00:00-03:00")).rotulo);
    }
    process.env.TZ = tz;
    expect([...rotulos]).toEqual(["31/08 a 06/09"]);
  });
});
