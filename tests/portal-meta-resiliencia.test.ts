import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { metaJson, MetaApiError } from "@/lib/meta/fetch";

// Regressão dos apagões de 19/07 e 10/08: a Meta recusou em rajada, o portal tratou a recusa como
// "o cliente não gastou nada" e gravou zero por cima do dado bom de 22 e 25 clientes.

function respostaOk(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}
function respostaErro(status: number, code?: number) {
  return {
    ok: false,
    status,
    json: async () => (code ? { error: { code, message: "erro da meta" } } : {}),
  } as Response;
}

describe("metaJson", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Backoff real deixaria o teste em segundos — adianta o relógio automaticamente.
    vi.spyOn(global, "setTimeout").mockImplementation(((fn: () => void) => {
      fn();
      return 0 as unknown as NodeJS.Timeout;
    }) as typeof setTimeout);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("devolve o JSON quando a Meta responde", async () => {
    global.fetch = vi.fn().mockResolvedValue(respostaOk({ data: [{ spend: "10" }] }));
    await expect(metaJson("https://x", { label: "teste" })).resolves.toEqual({ data: [{ spend: "10" }] });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("insiste quando é estouro de limite (code 17) e aproveita a resposta boa", async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(respostaErro(400, 17))
      .mockResolvedValueOnce(respostaOk({ data: ["ok"] }));
    global.fetch = f;

    await expect(metaJson("https://x", { label: "teste" })).resolves.toEqual({ data: ["ok"] });
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("insiste em 429 e em 5xx", async () => {
    for (const status of [429, 500, 503]) {
      const f = vi.fn()
        .mockResolvedValueOnce(respostaErro(status))
        .mockResolvedValueOnce(respostaOk({ data: [] }));
      global.fetch = f;
      await expect(metaJson("https://x", { label: "t" })).resolves.toEqual({ data: [] });
      expect(f).toHaveBeenCalledTimes(2);
    }
  });

  it("insiste quando estoura o timeout", async () => {
    const f = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error("timeout"), { name: "TimeoutError" }))
      .mockResolvedValueOnce(respostaOk({ data: [1] }));
    global.fetch = f;
    await expect(metaJson("https://x", { label: "t" })).resolves.toEqual({ data: [1] });
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("NÃO insiste em erro definitivo (token inválido, code 190)", async () => {
    const f = vi.fn().mockResolvedValue(respostaErro(400, 190));
    global.fetch = f;
    await expect(metaJson("https://x", { label: "t" })).rejects.toBeInstanceOf(MetaApiError);
    expect(f).toHaveBeenCalledTimes(1); // insistir só queimaria o tempo do cliente
  });

  it("LANÇA depois de esgotar as tentativas — nunca devolve vazio disfarçado de sucesso", async () => {
    const f = vi.fn().mockResolvedValue(respostaErro(429));
    global.fetch = f;
    await expect(metaJson("https://x", { label: "t" })).rejects.toBeInstanceOf(MetaApiError);
    expect(f).toHaveBeenCalledTimes(3);
  });

  it("passa o timeout pro fetch (sem ele a página do cliente ficava pendurada)", async () => {
    const f = vi.fn().mockResolvedValue(respostaOk({}));
    global.fetch = f;
    await metaJson("https://x", { label: "t" });
    expect(f.mock.calls[0][1]).toHaveProperty("signal");
  });
});
