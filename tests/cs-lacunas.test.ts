// Teste OFFLINE do detector de lacuna semanal — clientesSemPostNaSemana + inicioDaSemana + semanaAlvo. Puro.
import { describe, it, expect } from "vitest";
import { clientesSemPostNaSemana, inicioDaSemana, semanaAlvo } from "@/lib/cs/lacunas";

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

describe("inicioDaSemana", () => {
  it("qualquer dia da semana → segunda daquela semana", () => {
    expect(ymd(inicioDaSemana(new Date(2026, 6, 3)))).toBe("2026-06-29");  // sex 03/07 → seg 29/06
    expect(ymd(inicioDaSemana(new Date(2026, 5, 29)))).toBe("2026-06-29"); // a própria segunda
    expect(ymd(inicioDaSemana(new Date(2026, 6, 5)))).toBe("2026-06-29");  // domingo ainda é a mesma semana
  });
});

describe("semanaAlvo", () => {
  it("seg-qua → semana corrente ('essa semana')", () => {
    for (const d of [new Date(2026, 5, 29), new Date(2026, 5, 30), new Date(2026, 6, 1)]) { // seg/ter/qua
      const s = semanaAlvo(d);
      expect(s.proxima).toBe(false);
      expect(ymd(s.segunda)).toBe("2026-06-29");
      expect(s.label).toBe("essa semana");
    }
  });
  it("qui-dom → próxima semana ('semana que vem')", () => {
    for (const d of [new Date(2026, 6, 2), new Date(2026, 6, 3), new Date(2026, 6, 4), new Date(2026, 6, 5)]) { // qui/sex/sáb/dom
      const s = semanaAlvo(d);
      expect(s.proxima).toBe(true);
      expect(ymd(s.segunda)).toBe("2026-07-06");
      expect(s.label).toBe("semana que vem");
    }
  });
});

describe("clientesSemPostNaSemana", () => {
  const clientes = [
    { id: "a", nome: "Contele", social: "Pedro" },
    { id: "b", nome: "Madeirão", social: "Carlos" },
    { id: "c", nome: "Farmácia", social: "Pedro" },
  ];
  const seg = new Date(2026, 5, 29); // semana 29/06 a 05/07

  it("cliente com card na semana está coberto; sem card entra na lacuna", () => {
    const cards = [
      { clientId: "a", dueDate: "2026-07-01" },  // Contele coberto
      { clientId: "b", dueDate: "2026-07-10" },  // Madeirão: card fora da semana → lacuna
      { clientId: "c", dueDate: null },          // sem data → não cobre
    ];
    const lacuna = clientesSemPostNaSemana(clientes, cards, seg).map((c) => c.nome);
    expect(lacuna).toEqual(["Madeirão", "Farmácia"]);
  });

  it("borda da semana: segunda e domingo contam como dentro", () => {
    const cards = [
      { clientId: "a", dueDate: "2026-06-29" },  // segunda
      { clientId: "b", dueDate: "2026-07-05" },  // domingo
    ];
    const lacuna = clientesSemPostNaSemana(clientes, cards, seg).map((c) => c.nome);
    expect(lacuna).toEqual(["Farmácia"]);
  });

  it("aceita qualquer dia da semana-alvo (normaliza pra segunda)", () => {
    const cards = [{ clientId: "a", dueDate: "2026-07-01" }];
    const lacuna = clientesSemPostNaSemana(clientes, cards, new Date(2026, 6, 3)).map((c) => c.nome); // passa sexta
    expect(lacuna).toEqual(["Madeirão", "Farmácia"]);
  });

  it("ninguém com card → todos na lacuna", () => {
    expect(clientesSemPostNaSemana(clientes, [], seg)).toHaveLength(3);
  });
});
