/**
 * QA: movimentação livre de cards entre colunas (sem state-machine bloqueando).
 * Simula a lógica do reducer de updateContentCard quando bypassWorkflow=true.
 */

import { describe, it, expect } from "vitest";

// Simula o state-machine VALID_TRANSITIONS de lib/context/AppStateContext
const VALID_TRANSITIONS: Record<string, string[]> = {
  ideas: ["script", "in_production", "blocked"],
  script: ["ideas", "in_production", "blocked"],
  in_production: ["script", "approval", "blocked"],
  blocked: ["ideas", "script", "in_production"],
  approval: ["in_production", "client_approval", "scheduled", "blocked"],
  client_approval: ["approval", "scheduled", "in_production", "blocked"],
  scheduled: ["published", "client_approval"],
  published: [],
};

function moveCard(
  fromStatus: string,
  toStatus: string,
  options?: { bypassWorkflow?: boolean },
): { ok: boolean; reason?: string } {
  if (fromStatus === toStatus) return { ok: true };
  if (options?.bypassWorkflow) return { ok: true };

  const allowed = VALID_TRANSITIONS[fromStatus] ?? [];
  if (allowed.length > 0 && !allowed.includes(toStatus)) {
    return { ok: false, reason: `Transição bloqueada: ${fromStatus} → ${toStatus}` };
  }
  return { ok: true };
}

describe("Kanban move — sem bypassWorkflow (modo strict legacy)", () => {
  it("permite ideas → in_production (allowed)", () => {
    expect(moveCard("ideas", "in_production")).toEqual({ ok: true });
  });

  it("BLOQUEIA ideas → approval (não está em allowed[])", () => {
    const r = moveCard("ideas", "approval");
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("Transição bloqueada");
  });

  it("BLOQUEIA in_production → scheduled (designer não pode pular aprovação)", () => {
    expect(moveCard("in_production", "scheduled").ok).toBe(false);
  });

  it("permite published → qualquer coisa (allowed=[] significa sem restrição)", () => {
    // Comportamento histórico: array vazio em VALID_TRANSITIONS desliga o
    // gating (permite mover livremente). Documentado aqui pra evitar
    // regressões caso alguém mude pra "[] = bloquear tudo".
    expect(moveCard("published", "ideas").ok).toBe(true);
    expect(moveCard("published", "scheduled").ok).toBe(true);
  });
});

describe("Kanban move — com bypassWorkflow (modo livre — designer/admin)", () => {
  it("permite ideas → approval (transição arbitrária)", () => {
    expect(moveCard("ideas", "approval", { bypassWorkflow: true })).toEqual({ ok: true });
  });

  it("permite in_production → scheduled (skip aprovação)", () => {
    expect(moveCard("in_production", "scheduled", { bypassWorkflow: true }).ok).toBe(true);
  });

  it("permite published → ideas (revert pra refazer)", () => {
    expect(moveCard("published", "ideas", { bypassWorkflow: true }).ok).toBe(true);
  });

  it("permite movimento entre 3 colunas distintas em sequência", () => {
    expect(moveCard("ideas", "approval", { bypassWorkflow: true }).ok).toBe(true);
    expect(moveCard("approval", "in_production", { bypassWorkflow: true }).ok).toBe(true);
    expect(moveCard("in_production", "scheduled", { bypassWorkflow: true }).ok).toBe(true);
  });

  it("noop quando from === to (mesmo bypass)", () => {
    expect(moveCard("approval", "approval", { bypassWorkflow: true })).toEqual({ ok: true });
  });
});
