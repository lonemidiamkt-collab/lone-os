// Teste OFFLINE do detector de lacuna semanal — clientesSemPostNaSemana + inicioDaSemana. Puro.
import { describe, it, expect } from "vitest";
import { clientesSemPostNaSemana, inicioDaSemana } from "@/lib/cs/lacunas";

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

describe("inicioDaSemana", () => {
  it("qualquer dia da semana → segunda daquela semana", () => {
    expect(ymd(inicioDaSemana(new Date(2026, 6, 3)))).toBe("2026-06-29");  // sex 03/07 → seg 29/06
    expect(ymd(inicioDaSemana(new Date(2026, 5, 29)))).toBe("2026-06-29"); // a própria segunda
    expect(ymd(inicioDaSemana(new Date(2026, 6, 5)))).toBe("2026-06-29");  // domingo ainda é a mesma semana
  });
});

describe("clientesSemPostNaSemana", () => {
  const clientes = [
    { id: "a", nome: "Contele", social: "Pedro" },
    { id: "b", nome: "Madeirão", social: "Carlos" },
    { id: "c", nome: "Farmácia", social: "Pedro" },
  ];
  const hoje = new Date(2026, 6, 1); // qua 01/07 → semana 29/06 a 05/07

  it("cliente com card na semana está coberto; sem card entra na lacuna", () => {
    const cards = [
      { clientId: "a", dueDate: "2026-07-01" },  // Contele coberto
      { clientId: "b", dueDate: "2026-07-10" },  // Madeirão: card fora da semana → lacuna
      { clientId: "c", dueDate: null },          // sem data → não cobre
    ];
    const lacuna = clientesSemPostNaSemana(clientes, cards, hoje).map((c) => c.nome);
    expect(lacuna).toEqual(["Madeirão", "Farmácia"]);
  });

  it("borda da semana: segunda e domingo contam como dentro", () => {
    const cards = [
      { clientId: "a", dueDate: "2026-06-29" },  // segunda
      { clientId: "b", dueDate: "2026-07-05" },  // domingo
    ];
    const lacuna = clientesSemPostNaSemana(clientes, cards, hoje).map((c) => c.nome);
    expect(lacuna).toEqual(["Farmácia"]);
  });

  it("ninguém com card → todos na lacuna", () => {
    expect(clientesSemPostNaSemana(clientes, [], hoje)).toHaveLength(3);
  });
});
