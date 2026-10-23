// @vitest-environment node
// tests/whatsapp-desfecho-envio.test.ts — timeout não é "não saiu" (auditoria 21/10/2026, item 5.2).
//
// O erro original: a Evolution entregava, demorava a responder, o envio estourava o tempo e a rotina
// (1) repetia o envio e (2) mandava de novo pelo número do gestor. O cliente recebia o relatório, o
// suporte e o calendário em dobro. Estes testes reproduzem as duas repetições e provam que a
// redundância entre números continua valendo quando é CERTO que nada saiu.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: { from: () => ({ insert: () => Promise.resolve({ error: null }) }) },
}));

import {
  falhaDeExcecao, falhaDeResposta, podeTrocarDeNumero, erroParaLog, ehIncerto, bloqueiaReenvio,
  textoEnviosIncertos, MARCA_INCERTO,
} from "@/lib/whatsapp/desfecho-envio";
import { sendText, sendMediaDocument } from "@/lib/whatsapp/evolution";
import { csSendGroupText, csSendGroupDocument } from "@/lib/cs/notify";

const erroDeRede = (code: string) => Object.assign(new TypeError("fetch failed"), { cause: { code } });
const nomeado = (name: string) => Object.assign(new Error(name), { name });

describe("falhaDeExcecao — exceção do fetch", () => {
  it("timeout (AbortController) é INCERTO: a mensagem pode ter chegado", () => {
    const f = falhaDeExcecao(nomeado("AbortError"), 60_000);
    expect(f.incerto).toBe(true);
    expect(f.erro).toContain("60 s");
  });

  it("timeout (AbortSignal.timeout) também", () => {
    expect(falhaDeExcecao(nomeado("TimeoutError"), 10_000).incerto).toBe(true);
  });

  it("conexão recusada / DNS: a requisição nem saiu — falha CERTA", () => {
    for (const code of ["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "UND_ERR_CONNECT_TIMEOUT"]) {
      expect(falhaDeExcecao(erroDeRede(code)).incerto, code).toBe(false);
    }
  });

  it("conexão que caiu no meio (ECONNRESET, socket) ou erro desconhecido: incerto", () => {
    expect(falhaDeExcecao(erroDeRede("ECONNRESET")).incerto).toBe(true);
    expect(falhaDeExcecao(erroDeRede("UND_ERR_SOCKET")).incerto).toBe(true);
    expect(falhaDeExcecao(new Error("algo estranho")).incerto).toBe(true);
  });
});

describe("falhaDeResposta — HTTP de erro", () => {
  it("4xx é recusa da Evolution: nada saiu", () => {
    expect(falhaDeResposta(400, '{"message":"Bad Request"}').incerto).toBe(false);
    expect(falhaDeResposta(404, "").incerto).toBe(false);
  });

  it("'Connection Closed' (o 500 de 27/07) é número caído: nada saiu, pode ir pelo outro número", () => {
    expect(falhaDeResposta(500, "Internal Server Error: Connection Closed").incerto).toBe(false);
  });

  it("502/504 do proxy e 500 genérico: pode ter saído", () => {
    expect(falhaDeResposta(502, "<html>Bad Gateway</html>").incerto).toBe(true);
    expect(falhaDeResposta(504, "").incerto).toBe(true);
    expect(falhaDeResposta(500, '{"message":"prisma error"}').incerto).toBe(true);
  });
});

describe("podeTrocarDeNumero", () => {
  it("só quando é certo que nada saiu", () => {
    expect(podeTrocarDeNumero({ ok: false, incerto: false })).toBe(true);
    expect(podeTrocarDeNumero({ ok: false })).toBe(true);
    expect(podeTrocarDeNumero({ ok: false, incerto: true })).toBe(false);
    expect(podeTrocarDeNumero({ ok: true })).toBe(false);
  });
});

describe("registro do incerto", () => {
  it("vai marcado no erro e bloqueia o reenvio automático", () => {
    const erro = erroParaLog({ ok: false, error: "sem resposta", incerto: true } as never);
    expect(erro?.startsWith(MARCA_INCERTO)).toBe(true);
    expect(ehIncerto(erro)).toBe(true);
    expect(bloqueiaReenvio({ status: "failed", error: erro })).toBe(true);
  });

  it("falha certa NÃO bloqueia: é quem rodar de novo deve receber", () => {
    expect(erroParaLog({ error: "HTTP 400" })).toBe("HTTP 400");
    expect(bloqueiaReenvio({ status: "failed", error: "HTTP 400" })).toBe(false);
    expect(bloqueiaReenvio({ status: "skipped", error: null })).toBe(false);
    expect(bloqueiaReenvio({ status: "sent", error: null })).toBe(true);
  });

  it("aviso ao time diz que não reenviou e como reenviar", () => {
    const t = textoEnviosIncertos("o relatório", [{ cliente: "Bazar Ribeiro" }], "peça o reenvio só para ele");
    expect(t).toContain("Não sei se o relatório chegou em 1 grupo");
    expect(t).toContain("Bazar Ribeiro");
    expect(t).toContain("Não reenviei");
    expect(t).toContain("peça o reenvio só para ele");
    expect(textoEnviosIncertos("o relatório", [])).toBe("");
  });
});

// ─── O erro original, nos clientes da Evolution ──────────────────────────────

describe("envio pelo número do gestor (lib/whatsapp/evolution.ts)", () => {
  const fetchOriginal = globalThis.fetch;
  beforeEach(() => {
    process.env.EVOLUTION_API_URL = "https://evo.teste";
    process.env.EVOLUTION_API_KEY = "k";
    process.env.EVOLUTION_INSTANCE = "gestor";
  });
  afterEach(() => { globalThis.fetch = fetchOriginal; });

  it("timeout NÃO repete o envio (antes: 2 chamadas = PDF em dobro)", async () => {
    const f = vi.fn().mockRejectedValue(nomeado("AbortError"));
    globalThis.fetch = f as never;
    const r = await sendMediaDocument("123@g.us", "UERG", "relatorio.pdf", "bom dia");
    expect(f).toHaveBeenCalledTimes(1);
    expect(r).toMatchObject({ ok: false, incerto: true });
  });

  it("502 do proxy NÃO repete o envio", async () => {
    const f = vi.fn().mockResolvedValue(new Response("<html>Bad Gateway</html>", { status: 502 }));
    globalThis.fetch = f as never;
    const r = await sendText("123@g.us", "oi");
    expect(f).toHaveBeenCalledTimes(1);
    expect(r).toMatchObject({ ok: false, incerto: true });
  });

  it("conexão recusada ainda ganha a segunda tentativa — nada tinha saído", async () => {
    const f = vi.fn()
      .mockRejectedValueOnce(erroDeRede("ECONNREFUSED"))
      .mockResolvedValueOnce(new Response('{"key":{"id":"1"}}', { status: 201 }));
    globalThis.fetch = f as never;
    const r = await sendText("123@g.us", "oi");
    expect(f).toHaveBeenCalledTimes(2);
    expect(r.ok).toBe(true);
  });
});

describe("envio pelo número do agente (lib/cs/notify.ts)", () => {
  const fetchOriginal = globalThis.fetch;
  beforeEach(() => {
    process.env.EVOLUTION_API_URL = "https://evo.teste";
    process.env.EVOLUTION_API_KEY_NEW = "k2";
    process.env.EVOLUTION_INSTANCE_NEW = "agente";
  });
  afterEach(() => { globalThis.fetch = fetchOriginal; });

  it("timeout do texto volta INCERTO — e por isso não pode cair pro número do gestor", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(nomeado("TimeoutError")) as never;
    const r = await csSendGroupText("123@g.us", "Oi, pessoal!");
    expect(r).toMatchObject({ ok: false, incerto: true });
    expect(podeTrocarDeNumero(r)).toBe(false);
  });

  it("agente fora do grupo (4xx) é falha certa: o gestor pode mandar", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('{"message":"not-authorized"}', { status: 400 })) as never;
    const r = await csSendGroupText("123@g.us", "Oi, pessoal!");
    expect(r.ok).toBe(false);
    expect(podeTrocarDeNumero(r)).toBe(true);
  });

  it("PDF que estoura os 60 s volta incerto", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(nomeado("TimeoutError")) as never;
    const r = await csSendGroupDocument("123@g.us", "UERG", "calendario.pdf", "Oi!");
    expect(r).toMatchObject({ ok: false, incerto: true });
  });
});
