// tests/inatividade.test.tsx — 25/10/2026, onda 6 da auditoria de erro recuperável, item 8.3.
// A inatividade de 4 h era contada POR ABA, o aviso de 30 min ia só para o console e o logout era global:
// uma aba esquecida derrubava a aba onde a pessoa estava digitando, as outras abas e os outros aparelhos.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import {
  AVISO_ANTES_MS, CHAVE_ATIVIDADE, LIMITE_INATIVIDADE_MS, faseDaInatividade, gravarAtividadeCompartilhada,
  lerAtividadeCompartilhada, maisRecente,
} from "@/lib/auth/inatividade";

const papel = vi.hoisted(() => ({ isAuthenticated: true, encerrarPorInatividade: vi.fn(async () => {}) }));
vi.mock("@/lib/context/RoleContext", () => ({ useRole: () => papel }));
const { default: SessionTimeout } = await import("@/components/SessionTimeout");

const H = 60 * 60 * 1000;

describe("regra (pura)", () => {
  it("ativo até 3h30, aviso até 4 h, sair a partir de 4 h", () => {
    const t0 = 1_000_000;
    expect(faseDaInatividade(t0 + 3 * H, t0).fase).toBe("ativo");
    expect(faseDaInatividade(t0 + LIMITE_INATIVIDADE_MS - AVISO_ANTES_MS + 1, t0)).toMatchObject({ fase: "aviso" });
    expect(faseDaInatividade(t0 + 4 * H, t0)).toEqual({ fase: "sair", restanteMs: 0 });
  });

  it("vale o uso mais recente de QUALQUER aba; relógio 'no futuro' não segura a sessão para sempre", () => {
    expect(maisRecente(100, 10, 50, null, undefined, NaN)).toBe(50);
    expect(maisRecente(100, 10, 9_999)).toBe(100);
  });

  it("sem localStorage (aba privada, bloqueado) não quebra", () => {
    const quebrado = () => ({ getItem: () => { throw new Error("SecurityError"); }, setItem: () => { throw new Error("QuotaExceeded"); } });
    expect(lerAtividadeCompartilhada(quebrado)).toBeNull();
    expect(gravarAtividadeCompartilhada(quebrado, 5)).toBe(false);
    expect(lerAtividadeCompartilhada(() => { throw new Error("negado"); })).toBeNull();
  });
});

describe("SessionTimeout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-25T12:00:00Z"));
    papel.encerrarPorInatividade.mockClear();
    try { localStorage.clear(); } catch { /* ok */ }
  });
  afterEach(() => { vi.useRealTimers(); });

  it("a aba esquecida NÃO derruba a sessão enquanto outra aba está em uso", async () => {
    render(<SessionTimeout />);
    for (let i = 0; i < 5 * 4; i++) {
      // outra aba usando o painel a cada 15 min (grava o instante compartilhado)
      act(() => { vi.advanceTimersByTime(15 * 60 * 1000); });
      localStorage.setItem(CHAVE_ATIVIDADE, String(Date.now()));
    }
    act(() => { vi.advanceTimersByTime(20_000); });
    expect(papel.encerrarPorInatividade).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("3h30 sem uso em nenhuma aba: aviso VISÍVEL com 'Continuar conectado', que zera a contagem", () => {
    render(<SessionTimeout />);
    act(() => { vi.advanceTimersByTime(3.5 * H + 20_000); });
    const aviso = screen.getByRole("alert");
    expect(aviso).toHaveTextContent(/a sessão fecha aqui em \d+ min/);
    expect(aviso).toHaveTextContent(/A página fica guardada/);
    fireEvent.click(screen.getByRole("button", { name: /continuar conectado/i }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(1 * H); });
    expect(papel.encerrarPorInatividade).not.toHaveBeenCalled();
  });

  it("4 h sem uso em nenhuma aba: encerra (só neste navegador — o RoleContext usa signOut local)", () => {
    render(<SessionTimeout />);
    act(() => { vi.advanceTimersByTime(4 * H + 20_000); });
    expect(papel.encerrarPorInatividade).toHaveBeenCalledTimes(1);
  });
});
