import { describe, it, expect } from "vitest";
import { statusPacing, diasEntre, segundaDaSemana, diaDaSemana, diasAntes } from "@/components/traffic/investimento";

describe("statusPacing", () => {
  const base = { verba: 3000, dia: 10, diasNoMes: 30 };
  it("gasto zero depois do dia 2 é Parado, não 'no ritmo'", () => {
    expect(statusPacing({ ...base, gasto: 0 })).toBe("parado");
    expect(statusPacing({ ...base, dia: 2, gasto: 0 })).toBe("ok");
  });
  it("gasto desconhecido é sem_dados", () => {
    expect(statusPacing({ ...base, gasto: null })).toBe("sem_dados");
  });
  it("ritmo linear é ok; muito acima é critical; muito abaixo é slow", () => {
    expect(statusPacing({ ...base, gasto: 1000 })).toBe("ok");
    expect(statusPacing({ ...base, gasto: 1500 })).toBe("critical");
    expect(statusPacing({ ...base, gasto: 500 })).toBe("slow");
  });
});

describe("datas de calendário", () => {
  it("diasEntre não depende de fuso", () => {
    expect(diasEntre("2026-09-23", "2026-09-28")).toBe(5);
    expect(diasEntre("2026-09-23", "2026-09-23")).toBe(0);
    expect(diasEntre("2026-09-23", "2026-09-20")).toBe(-3);
    expect(diasEntre("2026-09-23", "")).toBeNull();
  });
  it("segunda da semana — domingo fica na semana que termina nele", () => {
    expect(segundaDaSemana("2026-09-23")).toBe("2026-09-21"); // quarta
    expect(segundaDaSemana("2026-09-21")).toBe("2026-09-21"); // segunda
    expect(segundaDaSemana("2026-09-27")).toBe("2026-09-21"); // domingo
    expect(diaDaSemana("2026-09-23")).toBe(3);
    expect(diasAntes("2026-09-03", 7)).toBe("2026-08-27");
  });
});
