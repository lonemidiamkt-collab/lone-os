// tests/checklist-onboarding-falha.test.ts — 24/10/2026, auditoria de erro recuperável (item 3.15).
// Checklist de onboarding: quando a gravação falhava, o item voltava ao estado anterior sem dizer nada
// (parecia que o clique não pegou). E a rota respondia ok mesmo com o banco recusando.

import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

const espias = vi.hoisted(() => ({ chamar: vi.fn(), erro: vi.fn() }));
vi.mock("@/lib/api/chamar", () => ({ chamar: espias.chamar }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: espias.erro, success: vi.fn(), warning: vi.fn() }) }));
vi.mock("@/lib/supabase/client", () => ({ supabase: {}, REALTIME_ENABLED: false }));
vi.mock("@/lib/supabase/authed-fetch", () => ({ authedFetch: vi.fn() }));

const { useOperationalStore } = await import("@/stores/useOperationalStore");

beforeEach(() => {
  espias.chamar.mockReset(); espias.erro.mockReset();
  useOperationalStore.setState({ onboarding: { c1: [{ id: "i1", label: "Criar conta de anúncio", completed: false }] } });
});
const item = () => useOperationalStore.getState().onboarding.c1[0];

describe("marcar item do checklist", () => {
  it("falhou: o item volta como estava E a pessoa é avisada de qual item não salvou", async () => {
    espias.chamar.mockResolvedValue({ ok: false, data: null, erro: "Sem conexão com o servidor. Tenta de novo?", status: 0 });
    await useOperationalStore.getState().toggleOnboardingItem("c1", "i1", "Roberto");
    expect(item().completed).toBe(false);
    expect(espias.erro).toHaveBeenCalledTimes(1);
    expect(espias.erro.mock.calls[0][0]).toBe('Não salvei "Criar conta de anúncio" como feito: Sem conexão com o servidor. Tenta de novo. O item voltou como estava.');
  });

  it("deu certo: fica marcado e ninguém é incomodado", async () => {
    espias.chamar.mockResolvedValue({ ok: true, data: { ok: true }, erro: null, status: 200 });
    await useOperationalStore.getState().toggleOnboardingItem("c1", "i1", "Roberto");
    expect(item().completed).toBe(true);
    expect(espias.erro).not.toHaveBeenCalled();
  });

  it("no servidor, erro do banco deixa de virar ok", () => {
    expect(readFileSync("lib/supabase/queries.ts", "utf8")).toMatch(/\[DB\] updateOnboardingItem:", error\); throw error;/);
    expect(readFileSync("app/api/data/operational/mutations/route.ts", "utf8")).toMatch(/o banco não gravou/);
  });
});
