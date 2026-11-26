// @vitest-environment node
// tests/arte-modelo-imagem.test.ts — leva 1-M (26/11/2026). gpt-image-1 saiu da API em 23/10/2026:
// "Variações por IA" e "Prévia (IA)" passaram a dar erro. Confere o que vai para a OpenAI (modelo
// novo, sem input_fidelity, que esta família não aceita) e que o custo sai do `usage`. Nomes inventados.

import { beforeEach, describe, expect, it, vi } from "vitest";

const recibos = vi.hoisted(() => [] as Record<string, unknown>[]);
vi.mock("@/lib/obs/llm", () => ({ registrarChamadaLlm: (c: Record<string, unknown>) => recibos.push(c) }));
vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: { from: () => { throw new Error("não devia consultar"); } } }));
vi.mock("@/lib/ai/openai", () => ({ chatJson: async () => { throw new Error("não devia ler texto"); } }));

const { gerarArteDoCliente, usoParaRecibo } = await import("@/lib/ia/arte-do-cliente");
const { MODELO_IMAGEM } = await import("@/lib/ai/modelos");
const { custoUsd } = await import("@/lib/obs/preco-llm");

const kit = { clientId: "c-teste", nome: "Loja Exemplo", logoUrl: "https://exemplo.test/logo.png", estilo: null, artesRecentes: ["https://exemplo.test/a1.png"], instrucoes: null, contato: null };
const png = () => new Response(new Uint8Array([137, 80, 78, 71]), { headers: { "content-type": "image/png" } });

let enviado: FormData | null;
beforeEach(() => {
  recibos.length = 0; enviado = null;
  vi.stubEnv("OPENAI_API_KEY", "sk-teste");
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    if (!String(url).includes("api.openai.com")) return png();
    enviado = init?.body as FormData;
    return new Response(JSON.stringify({ data: [{ b64_json: Buffer.from("img").toString("base64") }], usage: { input_tokens: 3000, output_tokens: 6000 } }), { headers: { "content-type": "application/json" } });
  });
});

describe("arte por IA no modelo novo", () => {
  it("manda o modelo novo, sem input_fidelity, com referência + logo + estilo, e devolve a imagem", async () => {
    const r = await gerarArteDoCliente({ kit, referenciaUrl: "https://exemplo.test/ref.png", textos: ["Oferta da semana"], mantem: "produto", muda: "fundo", n: 2, qualidade: "medium", origem: "design:variacoes-ia" });
    expect(r.ok).toBe(true);
    expect(enviado?.get("model")).toBe(MODELO_IMAGEM);
    expect(enviado?.get("model")).not.toBe("gpt-image-1");
    expect(enviado?.has("input_fidelity")).toBe(false);
    expect(enviado?.getAll("image[]")).toHaveLength(3);
    expect(enviado?.get("size")).toBe("1024x1536");
    expect(enviado?.get("quality")).toBe("medium");
  });

  it("o recibo leva o modelo novo e o usage — custo por token, não zero", async () => {
    await gerarArteDoCliente({ kit, referenciaUrl: "https://exemplo.test/ref.png", textos: ["Oferta"], mantem: "", muda: "", origem: "trafego:previa" });
    expect(recibos).toHaveLength(1);
    expect(recibos[0]).toMatchObject({ modelo: MODELO_IMAGEM, ok: true, tipo: "image", usage: { prompt_tokens: 3000, completion_tokens: 6000 } });
    expect(custoUsd(MODELO_IMAGEM, recibos[0].usage as never)).toBeCloseTo((3000 * 8 + 6000 * 30) / 1e6, 6);
  });

  it("usage ausente vira null (custo incompleto), nunca tokens inventados", () => {
    expect(usoParaRecibo(undefined)).toBeNull();
    expect(usoParaRecibo({})).toBeNull();
    expect(usoParaRecibo({ output_tokens: 10 })).toEqual({ prompt_tokens: 0, completion_tokens: 10 });
  });
});
