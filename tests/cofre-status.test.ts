// tests/cofre-status.test.ts — o cofre de acessos com status (Leva 7C, N24).

import { describe, it, expect } from "vitest";
import { estadoDoAcesso, podeMexer, tokenValido, validarCredencial } from "@/lib/clients/cofre";

const AGORA = new Date("2026-09-24T15:00:00Z");

describe("estado de cada acesso", () => {
  it("sem conferência: sem login é pendente; com login é 'nunca conferido'", () => {
    expect(estadoDoAcesso({ temLogin: false, gravado: null, pedido: null, agora: AGORA })).toMatchObject({ status: "pendente", motivo: "Sem login no cofre" });
    expect(estadoDoAcesso({ temLogin: true, gravado: null, pedido: null, agora: AGORA })).toMatchObject({ status: "pendente", motivo: "Tem login, nunca conferido" });
  });

  it("conferência gravada vale", () => {
    expect(estadoDoAcesso({ temLogin: true, gravado: { status: "ok", atualizadoEm: "2026-09-20T10:00:00Z" }, pedido: null, agora: AGORA }).status).toBe("ok");
    expect(estadoDoAcesso({ temLogin: true, gravado: { status: "invalido", atualizadoEm: "2026-09-20T10:00:00Z" }, pedido: null, agora: AGORA }).status).toBe("invalido");
  });

  it("credencial nova pelo link DEPOIS da conferência: volta a pendente, falta testar", () => {
    const e = estadoDoAcesso({
      temLogin: true, gravado: { status: "invalido", atualizadoEm: "2026-09-20T10:00:00Z" },
      pedido: { status: "recebido", criadoEm: "2026-09-21T10:00:00Z", expiraEm: "2026-10-05T10:00:00Z", recebidoEm: "2026-09-22T10:00:00Z" },
      agora: AGORA,
    });
    expect(e).toMatchObject({ status: "pendente", recebidoSemConferir: true, motivo: "Recebido pelo link — falta testar" });
  });

  it("recebido e depois conferido: vale a conferência", () => {
    const e = estadoDoAcesso({
      temLogin: true, gravado: { status: "ok", atualizadoEm: "2026-09-23T10:00:00Z" },
      pedido: { status: "recebido", criadoEm: "2026-09-21T10:00:00Z", expiraEm: "2026-10-05T10:00:00Z", recebidoEm: "2026-09-22T10:00:00Z" },
      agora: AGORA,
    });
    expect(e).toMatchObject({ status: "ok", recebidoSemConferir: false });
  });

  it("pedido aberto e vencido", () => {
    const aberto = estadoDoAcesso({ temLogin: false, gravado: null, pedido: { status: "aberto", criadoEm: "2026-09-21T10:00:00Z", expiraEm: "2026-10-05T10:00:00Z", recebidoEm: null }, agora: AGORA });
    expect(aberto).toMatchObject({ pedidoAberto: true, motivo: "Pedido enviado ao cliente — esperando" });
    const vencido = estadoDoAcesso({ temLogin: false, gravado: null, pedido: { status: "aberto", criadoEm: "2026-09-01T10:00:00Z", expiraEm: "2026-09-15T10:00:00Z", recebidoEm: null }, agora: AGORA });
    expect(vencido.pedidoAberto).toBe(false);
  });
});

describe("quem mexe em qual acesso", () => {
  it("gestão em tudo; tráfego no Meta e Google; social no Instagram; designer e comercial em nada", () => {
    expect(podeMexer("admin", "instagram")).toBe(true);
    expect(podeMexer("manager", "google")).toBe(true);
    expect(podeMexer("traffic", "meta")).toBe(true);
    expect(podeMexer("traffic", "instagram")).toBe(false);
    expect(podeMexer("social", "instagram")).toBe(true);
    expect(podeMexer("social", "meta")).toBe(false);
    expect(podeMexer("designer", "instagram")).toBe(false);
    expect(podeMexer("comercial", "meta")).toBe(false);
    expect(podeMexer(null, "meta")).toBe(false);
  });
});

describe("página do link", () => {
  it("token só no formato forte", () => {
    expect(tokenValido(`ac-${"a".repeat(32)}`)).toBe(true);
    expect(tokenValido("ac-123")).toBe(false);
    expect(tokenValido(`ob-${"a".repeat(32)}`)).toBe(false);
    expect(tokenValido(null)).toBe(false);
  });
  it("login e senha obrigatórios, com teto", () => {
    expect(validarCredencial("  loja@x.com ", "s3nha")).toEqual({ ok: true, login: "loja@x.com", senha: "s3nha" });
    expect(validarCredencial("", "x")).toMatchObject({ ok: false });
    expect(validarCredencial("a", "   ")).toMatchObject({ ok: false });
    expect(validarCredencial("a".repeat(201), "x")).toMatchObject({ ok: false });
  });
});
