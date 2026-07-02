// Teste OFFLINE do calendário/fuso da vigilância — businessHoursSince e proximoDiaFirme.
// Regressão do bug de fuso: passar spNow() (Date deslocado) como `now` subcontava ~3h em todos
// os thresholds; a aritmética deve usar o relógio REAL e o calendário SP é resolvido internamente.
import { describe, it, expect } from "vitest";
import { businessHoursSince, proximoDiaFirme } from "@/lib/cs/vigilancia";

describe("businessHoursSince", () => {
  it("conta horas úteis com timestamps reais (terça 10h→12h SP = 2h)", () => {
    // 2026-06-30 é terça; 13:00Z = 10:00 SP, 15:00Z = 12:00 SP.
    expect(businessHoursSince("2026-06-30T13:00:00Z", new Date("2026-06-30T15:00:00Z"))).toBe(2);
  });

  it("não conta noite nem fim de semana (sex 18h SP → seg 9h SP = 1h)", () => {
    // 2026-06-26 é sexta; 21:00Z = 18:00 SP (fora do expediente) → seg 29/jun 12:00Z = 09:00 SP.
    // Só conta 8h–9h de segunda = 1h útil.
    expect(businessHoursSince("2026-06-26T21:00:00Z", new Date("2026-06-29T12:00:00Z"))).toBe(1);
  });

  it("nulo → Infinity; futuro → 0", () => {
    expect(businessHoursSince(null)).toBe(Infinity);
    expect(businessHoursSince("2099-01-01T00:00:00Z", new Date("2026-06-30T15:00:00Z"))).toBe(0);
  });
});

describe("proximoDiaFirme", () => {
  it("sexta → segunda (a véspera de segunda existe)", () => {
    expect(proximoDiaFirme(new Date("2026-06-26T12:00:00")).getDay()).toBe(1);
  });
  it("quinta → sexta", () => {
    expect(proximoDiaFirme(new Date("2026-06-25T12:00:00")).getDay()).toBe(5);
  });
});
