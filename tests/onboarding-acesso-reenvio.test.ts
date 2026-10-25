// @vitest-environment node
// tests/onboarding-acesso-reenvio.test.ts — pedido de acesso por link (24/10/2026, item 1.12).
// O link fechava no 1º envio: o cliente que errou a senha não tinha como corrigir sem pedir outro
// link. Agora aceita reenvio até o time marcar o acesso como "ok" depois do último envio.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { randomBytes } from "node:crypto";
import { NextRequest } from "next/server";
import { bancoEmMemoria } from "./helpers/banco-em-memoria";

process.env.VAULT_KEY = randomBytes(32).toString("base64");
const banco = bancoEmMemoria();
vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: banco.supabaseAdmin }));

const { GET, POST } = await import("@/app/api/onboarding/acesso/route");
const { situacaoDoPedido, pedidoAceitaEnvio } = await import("@/lib/clients/cofre");
const { decryptVault } = await import("@/lib/crypto/vault");

const TOKEN = `ac-${"a".repeat(32)}`;
const FUTURO = "2099-01-01T00:00:00Z";
const enviar = (login: string, senha: string) =>
  POST(new NextRequest("http://x/api/onboarding/acesso", { method: "POST", body: JSON.stringify({ token: TOKEN, login, senha }) }));
const abrir = () => GET(new NextRequest(`http://x/api/onboarding/acesso?token=${TOKEN}`));

function pedido(p: Record<string, unknown> = {}) {
  banco.db.client_access_requests = [{
    id: "p1", token: TOKEN, client_id: "c1", plataforma: "instagram", status: "aberto",
    expira_em: FUTURO, recebido_em: null, recebido_ip: null, ...p,
  }];
}

beforeEach(() => {
  banco.limpar();
  banco.db.clients = [{ id: "c1", name: "Padaria" }];
});

describe("regra do link", () => {
  const recebido = { status: "recebido", expiraEm: FUTURO, recebidoEm: "2026-10-20T10:00:00Z" };
  it("recebido e ainda não testado: aceita reenvio", () => {
    expect(situacaoDoPedido(recebido, null)).toBe("recebido");
    expect(pedidoAceitaEnvio("recebido")).toBe(true);
  });
  it("time marcou 'inválido' depois: aceita (é quando o cliente precisa mandar de novo)", () => {
    expect(situacaoDoPedido(recebido, { status: "invalido", atualizadoEm: "2026-10-21T10:00:00Z" })).toBe("recebido");
  });
  it("time marcou 'ok' depois do último envio: fecha como testado", () => {
    expect(situacaoDoPedido(recebido, { status: "ok", atualizadoEm: "2026-10-21T10:00:00Z" })).toBe("testado");
    expect(pedidoAceitaEnvio("testado")).toBe(false);
  });
  it("'ok' ANTERIOR ao envio não vale para a senha nova", () => {
    expect(situacaoDoPedido(recebido, { status: "ok", atualizadoEm: "2026-10-19T10:00:00Z" })).toBe("recebido");
  });
  it("cancelado e vencido continuam fechados", () => {
    expect(situacaoDoPedido({ ...recebido, status: "cancelado" }, null)).toBe("cancelado");
    expect(situacaoDoPedido({ ...recebido, expiraEm: "2020-01-01T00:00:00Z" }, null)).toBe("vencido");
  });
});

describe("POST pelo mesmo link", () => {
  it("o erro original: 2º envio (senha corrigida) era recusado; agora substitui a anterior", async () => {
    pedido();
    expect((await enviar("padaria_ig", "errada")).status).toBe(200);
    // O time testa e marca inválido.
    banco.db.client_access_status = [{ client_id: "c1", plataforma: "instagram", status: "invalido", atualizado_em: new Date(Date.now() + 1000).toISOString() }];
    const r = await enviar("padaria_ig", "certa-123");
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, reenvio: true });
    expect(decryptVault(banco.db.clients[0].instagram_password as string)).toBe("certa-123");
    expect(banco.db.notifications.at(-1)).toMatchObject({ title: "Acesso reenviado: Instagram" });
  });

  it("depois que o time marcou 'ok', o link não aceita mais (e diz por quê)", async () => {
    pedido({ status: "recebido", recebido_em: "2026-10-20T10:00:00Z" });
    banco.db.client_access_status = [{ client_id: "c1", plataforma: "instagram", status: "ok", atualizado_em: "2026-10-21T10:00:00Z" }];
    const r = await enviar("padaria_ig", "outra");
    expect(r.status).toBe(410);
    expect((await r.json()).error).toMatch(/já recebeu e testou/);
    expect(banco.db.clients[0].instagram_password).toBeUndefined();
  });

  it("GET diz à página que o link aceita e que já recebeu antes", async () => {
    pedido({ status: "recebido", recebido_em: "2026-10-20T10:00:00Z" });
    expect(await (await abrir()).json()).toMatchObject({ situacao: "recebido", aceitaEnvio: true, jaRecebido: true, fechado: null });
  });

  it("cancelado no meio: não grava", async () => {
    pedido({ status: "cancelado" });
    expect((await enviar("x", "y")).status).toBe(410);
    expect(banco.db.clients[0].instagram_password).toBeUndefined();
  });
});
