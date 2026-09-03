import { describe, it, expect } from "vitest";
import { lerHorario, lerHora, porExtenso, horarioPlausivel } from "@/lib/cs/parse-horario";

// Quarta-feira, 02/09/2026, 10:00 em São Paulo.
const AGORA = new Date("2026-09-02T13:00:00Z");
const dia = (iso: string) => iso.slice(0, 10);
const hora = (iso: string) => iso.slice(11, 16);

describe("hora do jeito que as pessoas escrevem", () => {
  for (const [txt, esperado] of [
    ["pode ser 15h", "15:00"], ["às 15:30", "15:30"], ["15h30 pra você?", "15:30"],
    ["as 9 da manha", "09:00"], ["2 da tarde", "14:00"], ["7 da noite", "19:00"],
    ["3h da tarde", "15:00"],
  ] as [string, string][]) {
    it(`"${txt}" → ${esperado}`, () => {
      const h = lerHora(txt)!;
      expect(`${String(h.hora).padStart(2, "0")}:${String(h.minuto).padStart(2, "0")}`).toBe(esperado);
      expect(h.explicita).toBe(true);
    });
  }

  it("'de manhã' não é horário — assume 10h mas marca como NÃO explícito", () => {
    const h = lerHora("pode ser de manha")!;
    expect(h.hora).toBe(10);
    expect(h.explicita).toBe(false);   // quem chama tem que confirmar
  });

  it("sem hora nenhuma devolve null", () => {
    expect(lerHora("pode ser quinta")).toBeNull();
  });
});

describe("data relativa à conversa", () => {
  it("'dia 18 às 14h' → 18 do mês corrente", () => {
    const r = lerHorario("fechado, dia 18 às 14h", AGORA)!;
    expect(dia(r.iso)).toBe("2026-09-18");
    expect(hora(r.iso)).toBe("14:00");
  });

  it("'18/09 às 10h' entende a barra", () => {
    expect(dia(lerHorario("18/09 às 10h", AGORA)!.iso)).toBe("2026-09-18");
  });

  it("'dia 3' quando hoje é 2 continua neste mês", () => {
    expect(dia(lerHorario("dia 3 às 9h", AGORA)!.iso)).toBe("2026-09-03");
  });

  it("'dia 1' quando hoje é 2 vai para o mês que vem — ninguém marca para trás", () => {
    expect(dia(lerHorario("dia 1 às 9h", AGORA)!.iso)).toBe("2026-10-01");
  });

  it("'amanhã 14h' e 'hoje 16h'", () => {
    expect(dia(lerHorario("amanha as 14h", AGORA)!.iso)).toBe("2026-09-03");
    expect(dia(lerHorario("hoje 16h", AGORA)!.iso)).toBe("2026-09-02");
  });

  it("'quinta 15h' pega a próxima quinta", () => {
    // 02/09/2026 é quarta; a quinta seguinte é dia 3.
    expect(dia(lerHorario("quinta 15h pra você?", AGORA)!.iso)).toBe("2026-09-03");
  });

  it("dia da semana igual ao de hoje significa a PRÓXIMA semana", () => {
    // Pedir "quarta" numa quarta é a de daqui a 7 dias, não hoje.
    expect(dia(lerHorario("quarta as 10h", AGORA)!.iso)).toBe("2026-09-09");
  });

  it("'que vem' empurra mais uma semana", () => {
    expect(dia(lerHorario("quinta que vem as 15h", AGORA)!.iso)).toBe("2026-09-10");
  });

  it("'dia 18 de outubro' respeita o mês dito", () => {
    expect(dia(lerHorario("dia 18 de outubro as 11h", AGORA)!.iso)).toBe("2026-10-18");
  });
});

describe("na dúvida, recusa", () => {
  it("data sem hora não vira reunião", () => {
    // Reunião marcada no horário errado é pior que reunião não marcada.
    expect(lerHorario("pode ser quinta", AGORA)).toBeNull();
    expect(lerHorario("dia 18 tá bom", AGORA)).toBeNull();
  });

  it("frase sem data nem hora", () => {
    expect(lerHorario("beleza, combinado", AGORA)).toBeNull();
  });
});

describe("horário plausível para trabalho", () => {
  it("recusa passado, madrugada, domingo e futuro distante", () => {
    expect(horarioPlausivel("2026-09-01T14:00:00-03:00", AGORA).ok).toBe(false);
    expect(horarioPlausivel("2026-09-10T03:00:00-03:00", AGORA).motivo).toMatch(/comercial/);
    expect(horarioPlausivel("2026-09-06T14:00:00-03:00", AGORA).motivo).toBe("domingo");
    expect(horarioPlausivel("2027-06-01T14:00:00-03:00", AGORA).ok).toBe(false);
  });

  it("aceita horário comercial em dia útil", () => {
    expect(horarioPlausivel("2026-09-18T14:00:00-03:00", AGORA).ok).toBe(true);
  });
});

describe("confirmação em português", () => {
  it("escreve como uma pessoa diria", () => {
    const s = porExtenso("2026-09-18T14:00:00-03:00");
    expect(s).toMatch(/sexta-feira/);
    expect(s).toMatch(/18 de setembro/);
    expect(s).toMatch(/14:00/);
  });
});
