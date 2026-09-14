import { describe, it, expect, vi, afterEach } from "vitest";
import { imagemInline } from "@/lib/ai/openai";

// O CDN da Meta devolve 403 ao buscador da OpenAI (a URL assinada só serve a quem ela conhece).
// Toda imagem vai inline (base64) — e falha de download NÃO derruba a chamada.
afterEach(() => vi.unstubAllGlobals());

describe("imagem inline para a visão", () => {
  it("baixa e converte em data URL com o content-type real", async () => {
    vi.stubGlobal("fetch", async () => new Response(new Uint8Array([0xff, 0xd8, 0xff]), { status: 200, headers: { "content-type": "image/jpeg; charset=binary" } }));
    const r = await imagemInline("https://scontent.xx.fbcdn.net/x.jpg?oh=1");
    expect(r).toBe("data:image/jpeg;base64,/9j/");
  });
  it("403, não-imagem ou erro de rede → devolve a URL original (a chamada segue)", async () => {
    vi.stubGlobal("fetch", async () => new Response("nope", { status: 403 }));
    expect(await imagemInline("https://a/b.jpg")).toBe("https://a/b.jpg");
    vi.stubGlobal("fetch", async () => new Response("<html>", { status: 200, headers: { "content-type": "text/html" } }));
    expect(await imagemInline("https://a/b.jpg")).toBe("https://a/b.jpg");
    vi.stubGlobal("fetch", async () => { throw new Error("rede"); });
    expect(await imagemInline("https://a/b.jpg")).toBe("https://a/b.jpg");
  });
  it("data URL já pronta passa direto, sem rede", async () => {
    const f = vi.fn(); vi.stubGlobal("fetch", f);
    expect(await imagemInline("data:image/png;base64,AAA")).toBe("data:image/png;base64,AAA");
    expect(f).not.toHaveBeenCalled();
  });
});
