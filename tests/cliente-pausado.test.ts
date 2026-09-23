import { describe, it, expect } from "vitest";
import { estaPausado, podeReceber, apareceParaEquipe, rotuloPausa } from "@/lib/clients/pausa";

// Pausado = não recebe nada, mas continua na carteira do time (Roberto, 23/09).
const agora = new Date("2026-09-23T15:00:00-03:00");
const ativo = { active: true, churned_at: null, paused_at: null, paused_until: null };

describe("cliente pausado", () => {
  it("ativo comum: recebe e aparece", () => {
    expect(podeReceber(ativo, agora)).toBe(true);
    expect(apareceParaEquipe(ativo)).toBe(true);
    expect(estaPausado(ativo, agora)).toBe(false);
  });
  it("pausado sem data: não recebe, MAS continua na carteira", () => {
    const c = { ...ativo, paused_at: "2026-09-20T10:00:00Z" };
    expect(podeReceber(c, agora)).toBe(false);
    expect(apareceParaEquipe(c)).toBe(true);
  });
  it("pausa com data futura vale; vencida volta sozinha (ninguém precisa despausar)", () => {
    expect(podeReceber({ ...ativo, paused_at: "2026-09-20T10:00:00Z", paused_until: "2026-10-15" }, agora)).toBe(false);
    expect(podeReceber({ ...ativo, paused_at: "2026-09-01T10:00:00Z", paused_until: "2026-09-22" }, agora)).toBe(true);
    expect(podeReceber({ ...ativo, paused_at: "2026-09-01T10:00:00Z", paused_until: "2026-09-23" }, agora)).toBe(false); // o último dia ainda conta como pausado
  });
  it("ex-cliente: não recebe e SOME da carteira (diferente de pausado)", () => {
    expect(podeReceber({ ...ativo, active: false }, agora)).toBe(false);
    expect(apareceParaEquipe({ ...ativo, active: false })).toBe(false);
    expect(apareceParaEquipe({ ...ativo, churned_at: "2026-08-01" })).toBe(false);
  });
  it("rótulo diz até quando e por quê", () => {
    expect(rotuloPausa({ ...ativo, paused_at: "2026-09-20T10:00:00Z", paused_until: "2026-10-15", paused_reason: "férias do cliente" }))
      .toBe("Pausado até 15/10/2026 — férias do cliente");
    expect(rotuloPausa(ativo)).toBeNull();
  });
});
